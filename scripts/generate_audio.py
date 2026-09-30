#!/usr/bin/env python3
"""Generate BGM / SE assets locally (no external API) from scripts/audio-manifest.json.

Backends (--backend, default auto):
  audiocraft    AudioGen (se) + MusicGen (bgm)          pip install audiocraft
  transformers  MusicGen for both (Transformers has no AudioGen)
                                                        pip install transformers scipy

Assets whose id starts with "ui_" are NOT AI-generated: they are synthesised procedurally (numpy, clean 44.1kHz
mono WAV, deterministic). Only numpy is needed for those; GPU/torch are needed only for the AI assets.
AI outputs get an automatic EQ (200Hz cut, high-frequency boost) and peak normalisation (--no-eq to skip EQ).

Usage:
  python3 scripts/generate_audio.py [--force] [--only ID ...] [--backend B] [--device auto|cuda|cpu] [--dry-run]

Requires PyTorch + a CUDA GPU (CPU only with --device cpu; very slow). ffmpeg is needed only for .mp3 output.
"""
import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import wave
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "scripts", "audio-manifest.json")

MAX_SECONDS = 30.0            # MusicGen / AudioGen context limit per generation
LOOP_XFADE_SEC = 0.5
PROC_SR = 44100               # procedural (ui_*) sample rate

# Auto-EQ applied to AI-generated audio (zero-phase, FFT domain)
EQ_CUT_HZ, EQ_CUT_DB, EQ_CUT_OCT = 200.0, -4.0, 0.75      # bell cut around 200Hz, width in octaves (sigma)
EQ_SHELF_HZ, EQ_SHELF_DB, EQ_SHELF_OCT = 5000.0, 3.0, 1.0  # smooth high shelf boost above ~5kHz
PEAK_TARGET = 0.89            # -1 dBFS
MUSICGEN_ID = os.environ.get("MUSICGEN_MODEL", "facebook/musicgen-small")
AUDIOGEN_ID = os.environ.get("AUDIOGEN_MODEL", "facebook/audiogen-medium")


def has(mod):
    return importlib.util.find_spec(mod) is not None


def check_environment(args):
    """Pre-flight check. Returns (ok, backend, device); prints install guidance on problems."""
    ok = True
    missing = [m for m in ("numpy", "torch") if not has(m)]
    if missing:
        print(f"[ERROR] Missing packages: {', '.join(missing)}")
        print("        Install PyTorch (pick your CUDA build at https://pytorch.org/get-started/locally/):")
        print(f"          {sys.executable} -m pip install torch numpy")
        return False, None, None

    backend = args.backend
    if backend == "auto":
        backend = "audiocraft" if has("audiocraft") else "transformers" if has("transformers") else None
    if backend is None or (backend == "audiocraft" and not has("audiocraft")) \
            or (backend == "transformers" and not has("transformers")):
        print("[ERROR] Generation library not found. Install one of:")
        print(f"          {sys.executable} -m pip install audiocraft            # AudioGen + MusicGen (best for SE)")
        print(f"          {sys.executable} -m pip install transformers scipy    # MusicGen only")
        return False, None, None
    if backend == "transformers":
        print("[INFO] transformers backend: SE are also generated with MusicGen (install audiocraft for AudioGen).")

    import torch
    cuda = torch.cuda.is_available()
    device = args.device
    if device == "auto":
        device = "cuda" if cuda else None
    if device == "cuda" and not cuda:
        print("[ERROR] --device cuda requested but no CUDA GPU is visible to PyTorch.")
        ok = False
    elif device is None:
        print("[ERROR] No CUDA GPU detected (torch.cuda.is_available() is False).")
        print("        - Install a CUDA build of PyTorch and up-to-date NVIDIA drivers, or")
        print("        - re-run with --device cpu (works, but a 30s clip can take many minutes).")
        ok = False
    if device == "cuda" and ok:
        print(f"[INFO] GPU: {torch.cuda.get_device_name(0)}")
    if device == "cpu":
        print("[WARN] Running on CPU; this will be slow.")
    if not shutil.which("ffmpeg"):
        print("[WARN] ffmpeg not found: .mp3 outputs will fail (install ffmpeg, or use .wav paths).")
    return ok, backend, device


def load_manifest():
    with open(MANIFEST, encoding="utf-8") as f:
        data = json.load(f)
    style, assets = data.get("style", ""), data["assets"]
    for a in assets:
        for key in ("id", "type", "path", "prompt", "loop", "duration"):
            if key not in a:
                raise ValueError(f"manifest asset {a.get('id', '?')} lacks '{key}'")
        if a["type"] not in ("bgm", "jingle", "se"):
            raise ValueError(f"asset {a['id']}: type must be 'bgm', 'jingle' or 'se'")
        if not a["path"].lower().endswith((".mp3", ".wav")):
            raise ValueError(f"asset {a['id']}: path must end with .mp3 or .wav")
    return style, assets


def build_prompt(style, asset):
    """Merge the shared style with the per-asset prompt."""
    extra = "seamless loop" if asset["loop"] and "loop" not in asset["prompt"].lower() else ""
    kind = {"bgm": "background music", "jingle": "short musical jingle", "se": "sound effect"}[asset["type"]]
    return ", ".join(p for p in (style, kind, asset["prompt"], extra) if p)


class Generator:
    """Loads each model lazily, once. generate() -> (float32 mono numpy array, sample_rate)."""

    def __init__(self, backend, device):
        self.backend, self.device = backend, device
        self.models = {}

    def _audiocraft(self, kind):
        if kind not in self.models:
            from audiocraft.models import AudioGen, MusicGen
            print(f"[LOAD] {'AudioGen ' + AUDIOGEN_ID if kind == 'se' else 'MusicGen ' + MUSICGEN_ID} ...")
            m = AudioGen.get_pretrained(AUDIOGEN_ID, device=self.device) if kind == "se" \
                else MusicGen.get_pretrained(MUSICGEN_ID, device=self.device)
            self.models[kind] = m
        return self.models[kind]

    def _transformers(self):
        if "mg" not in self.models:
            from transformers import AutoProcessor, MusicgenForConditionalGeneration
            print(f"[LOAD] MusicGen {MUSICGEN_ID} ...")
            proc = AutoProcessor.from_pretrained(MUSICGEN_ID)
            model = MusicgenForConditionalGeneration.from_pretrained(MUSICGEN_ID).to(self.device)
            self.models["mg"] = (proc, model)
        return self.models["mg"]

    def generate(self, prompt, kind, seconds):
        import torch
        seconds = min(float(seconds), MAX_SECONDS)
        with torch.no_grad():
            if self.backend == "audiocraft":
                m = self._audiocraft("se" if kind == "se" else "music")
                m.set_generation_params(duration=seconds)
                wav = m.generate([prompt])[0]                      # [channels, samples]
                return wav.mean(dim=0).cpu().float().numpy(), int(m.sample_rate)
            proc, model = self._transformers()
            inputs = proc(text=[prompt], padding=True, return_tensors="pt").to(self.device)
            frame_rate = model.config.audio_encoder.frame_rate
            out = model.generate(**inputs, do_sample=True, guidance_scale=3.0,
                                 max_new_tokens=int(seconds * frame_rate))
            return out[0, 0].cpu().float().numpy(), int(model.config.audio_encoder.sampling_rate)


def is_procedural(asset):
    """UI sounds are generated programmatically, not by the AI models."""
    return asset["id"].startswith("ui_")


def _env(n, sr, attack=0.002, decay=0.04, release=0.004):
    import numpy as np
    t = np.arange(n) / sr
    e = np.exp(-t / decay)
    a = max(1, int(attack * sr))
    e[:a] *= np.linspace(0, 1, a)
    r = max(1, min(n, int(release * sr)))
    e[-r:] *= np.linspace(1, 0, r)
    return e


def _note(freq, dur, sr, decay, harmonics=(1.0, 0.25)):
    import numpy as np
    n = int(dur * sr)
    t = np.arange(n) / sr
    x = sum(w * np.sin(2 * np.pi * freq * (k + 1) * t) for k, w in enumerate(harmonics))
    return (x * _env(n, sr, decay=decay)).astype(np.float32)


def synth_ui(asset_id, sr=PROC_SR):
    """Clean, noise-free UI blips (sfxr-style, pure numpy). Variants (_1.._N) differ by a fixed pitch offset."""
    import numpy as np
    base = asset_id.rsplit("_", 1)[0] if asset_id.rsplit("_", 1)[-1].isdigit() else asset_id
    rng = np.random.RandomState(zlib.crc32(asset_id.encode()))
    detune = 1.0 + rng.uniform(-0.06, 0.06)   # deterministic per id
    if base == "ui_click":
        x = _note(1500 * detune, 0.09, sr, 0.018, (1.0, 0.35, 0.1))
    elif base == "ui_select":
        x = np.concatenate([_note(660 * detune, 0.09, sr, 0.05), _note(990 * detune, 0.16, sr, 0.07)])
    elif base == "ui_cancel":
        x = np.concatenate([_note(520 * detune, 0.09, sr, 0.05), _note(370 * detune, 0.16, sr, 0.07)])
    else:
        x = _note(880 * detune, 0.15, sr, 0.05)
    x = x - x.mean()
    return x * (0.7 / (float(np.abs(x).max()) or 1.0)), sr


def apply_eq(samples, sr):
    """Zero-phase EQ via FFT: bell cut around 200Hz and a smooth high-shelf boost."""
    import numpy as np
    x = np.asarray(samples, dtype=np.float64)
    n = len(x)
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1.0 / sr)
    lf = np.log2(np.maximum(f, 1.0))
    cut_db = EQ_CUT_DB * np.exp(-0.5 * ((lf - np.log2(EQ_CUT_HZ)) / EQ_CUT_OCT) ** 2)
    shelf_db = EQ_SHELF_DB / (1.0 + np.exp(-(lf - np.log2(EQ_SHELF_HZ)) / (EQ_SHELF_OCT * 0.35)))
    spec *= 10 ** ((cut_db + shelf_db) / 20.0)
    return np.fft.irfft(spec, n).astype(np.float32)


def postprocess(samples, sr, loop, eq=True):
    """DC removal, auto-EQ, loop crossfade (loops) and peak normalisation."""
    import numpy as np
    x = np.asarray(samples, dtype=np.float32)
    x = x - x.mean()
    if eq and len(x) > 16:
        x = apply_eq(x, sr)
    if loop:
        n = min(int(LOOP_XFADE_SEC * sr), len(x) // 4)
        if n > 0:
            t = np.linspace(0, np.pi / 2, n, dtype=np.float32)
            head = x[:n] * np.sin(t) + x[-n:] * np.cos(t)
            x = np.concatenate([head, x[n:-n]])
    else:
        n = min(int(0.01 * sr), len(x) // 10)   # tiny fade-out to avoid clicks
        if n > 0:
            x[-n:] *= np.linspace(1, 0, n, dtype=np.float32)
    peak = float(np.abs(x).max()) or 1.0
    return x * (PEAK_TARGET / peak)


def write_wav(path, samples, sr):
    import numpy as np
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def save_audio(samples, sr, out_path):
    """Write .wav directly or .mp3 via ffmpeg."""
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    if out_path.lower().endswith(".wav"):
        write_wav(out_path, samples, sr)
        return
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is required for .mp3 output (install it or change the manifest path to .wav)")
    with tempfile.TemporaryDirectory() as td:
        tmp = os.path.join(td, "t.wav")
        write_wav(tmp, samples, sr)
        r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-ar", "44100",
                            "-b:a", "128k", out_path], capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {r.stderr.strip()[:200]}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="regenerate even if the file exists")
    ap.add_argument("--only", nargs="+", metavar="ID", help="only generate these asset ids")
    ap.add_argument("--backend", choices=["auto", "audiocraft", "transformers"], default="auto")
    ap.add_argument("--device", choices=["auto", "cuda", "cpu"], default="auto")
    ap.add_argument("--no-eq", action="store_true", help="skip the automatic EQ on AI-generated audio")
    ap.add_argument("--dry-run", action="store_true", help="print plan and merged prompts; load no models")
    args = ap.parse_args(argv)

    style, assets = load_manifest()
    if args.only:
        unknown = set(args.only) - {a["id"] for a in assets}
        if unknown:
            print(f"[ERROR] Unknown asset id(s): {', '.join(sorted(unknown))}")
            return 1
        assets = [a for a in assets if a["id"] in args.only]

    todo, skipped = [], 0
    for a in assets:
        out = os.path.join(ROOT, a["path"])
        if os.path.isfile(out) and os.path.getsize(out) > 0 and not args.force:
            print(f"[SKIP] {a['id']}: {a['path']} exists (use --force to regenerate)")
            skipped += 1
        else:
            todo.append(a)
    if not todo:
        print(f"Nothing to generate ({skipped} skipped).")
        return 0

    proc = [a for a in todo if is_procedural(a)]
    ai = [a for a in todo if not is_procedural(a)]

    if args.dry_run:
        for a in proc:
            print(f"[PLAN] {a['id']} (procedural {PROC_SR}Hz) -> {a['path']}")
        for a in ai:
            print(f"[PLAN] {a['id']} ({a['type']}, {min(a['duration'], MAX_SECONDS)}s, loop={a['loop']}) -> {a['path']}\n"
                  f"       {build_prompt(style, a)}")
        return 0

    done, failed = 0, []

    if proc:  # (1) programmatic UI sounds: no GPU / AI model needed
        if not has("numpy"):
            print(f"[ERROR] numpy is required for ui_* sounds: {sys.executable} -m pip install numpy")
            failed += [a["id"] for a in proc]
        else:
            for a in proc:
                try:
                    samples, sr = synth_ui(a["id"])
                    save_audio(samples, sr, os.path.join(ROOT, a["path"]))
                    print(f"[ OK ] {a['path']} (procedural)")
                    done += 1
                except Exception as e:
                    print(f"[FAIL] {a['id']}: {e}")
                    failed.append(a["id"])

    if ai:
        ok, backend, device = check_environment(args)
        if not ok:
            print(f"[STOP] Environment not ready; {len(ai)} AI asset(s) not generated. "
                  "The game still runs with its Web Audio synth fallback.")
            failed += [a["id"] for a in ai]
        else:
            gen = Generator(backend, device)
            for a in ai:
                print(f"[GEN ] {a['id']} ({a['type']}, {min(a['duration'], MAX_SECONDS)}s) ...")
                try:
                    samples, sr = gen.generate(build_prompt(style, a), a["type"], a["duration"])
                    save_audio(postprocess(samples, sr, a["loop"], eq=not args.no_eq), sr,
                               os.path.join(ROOT, a["path"]))
                    print(f"[ OK ] {a['path']}")
                    done += 1
                except Exception as e:  # keep going: one failure should not lose the rest
                    print(f"[FAIL] {a['id']}: {e}")
                    failed.append(a["id"])
    print(f"Done: {done} generated, {skipped} skipped, {len(failed)} failed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
