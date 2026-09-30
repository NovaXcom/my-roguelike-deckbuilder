#!/usr/bin/env python3
"""Generate BGM / SE assets locally (no external API) from scripts/audio-manifest.json.

Backends (--backend, default auto):
  audiocraft    AudioGen (se) + MusicGen (bgm)          pip install audiocraft
  transformers  MusicGen for both (Transformers has no AudioGen)
                                                        pip install transformers scipy

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

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "scripts", "audio-manifest.json")

MAX_SECONDS = 30.0            # MusicGen / AudioGen context limit per generation
LOOP_XFADE_SEC = 0.5
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
        if a["type"] not in ("bgm", "se"):
            raise ValueError(f"asset {a['id']}: type must be 'bgm' or 'se'")
        if not a["path"].lower().endswith((".mp3", ".wav")):
            raise ValueError(f"asset {a['id']}: path must end with .mp3 or .wav")
    return style, assets


def build_prompt(style, asset):
    """Merge the shared style with the per-asset prompt."""
    extra = "seamless loop" if asset["loop"] and "loop" not in asset["prompt"].lower() else ""
    kind = "background music" if asset["type"] == "bgm" else "sound effect"
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
                m = self._audiocraft(kind)
                m.set_generation_params(duration=seconds)
                wav = m.generate([prompt])[0]                      # [channels, samples]
                return wav.mean(dim=0).cpu().float().numpy(), int(m.sample_rate)
            proc, model = self._transformers()
            inputs = proc(text=[prompt], padding=True, return_tensors="pt").to(self.device)
            frame_rate = model.config.audio_encoder.frame_rate
            out = model.generate(**inputs, do_sample=True, guidance_scale=3.0,
                                 max_new_tokens=int(seconds * frame_rate))
            return out[0, 0].cpu().float().numpy(), int(model.config.audio_encoder.sampling_rate)


def postprocess(samples, sr, loop):
    """Normalise; for loops crossfade the tail into the head so the seam is inaudible."""
    import numpy as np
    x = np.asarray(samples, dtype=np.float32)
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
    return x * (0.89 / peak)


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

    if args.dry_run:
        for a in todo:
            print(f"[PLAN] {a['id']} ({a['type']}, {min(a['duration'], MAX_SECONDS)}s, loop={a['loop']}) -> {a['path']}\n"
                  f"       {build_prompt(style, a)}")
        return 0

    ok, backend, device = check_environment(args)
    if not ok:
        print(f"[STOP] Environment not ready; {len(todo)} asset(s) not generated. "
              "The game still runs with its Web Audio synth fallback.")
        return 1

    gen, done, failed = Generator(backend, device), 0, []
    for a in todo:
        print(f"[GEN ] {a['id']} ({a['type']}, {min(a['duration'], MAX_SECONDS)}s) ...")
        try:
            samples, sr = gen.generate(build_prompt(style, a), a["type"], a["duration"])
            save_audio(postprocess(samples, sr, a["loop"]), sr, os.path.join(ROOT, a["path"]))
            print(f"[ OK ] {a['path']}")
            done += 1
        except Exception as e:  # keep going: one failure should not lose the rest
            print(f"[FAIL] {a['id']}: {e}")
            failed.append(a["id"])
    print(f"Done: {done} generated, {skipped} skipped, {len(failed)} failed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
