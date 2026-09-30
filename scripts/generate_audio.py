#!/usr/bin/env python3
"""Generate BGM / SE assets from scripts/audio-manifest.json via a text-to-audio API.

Usage:
  python3 scripts/generate_audio.py [--force] [--only ID ...] [--provider elevenlabs|stability] [--dry-run]

Environment:
  ELEVENLABS_API_KEY  for --provider elevenlabs (default)
  STABILITY_API_KEY   for --provider stability (Stable Audio 2)
  AUDIO_PROVIDER      default provider override
  ffmpeg (optional)   needed only when the API's output format differs from the manifest path extension.
"""
import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "scripts", "audio-manifest.json")

# provider name -> max duration (seconds) the API accepts
MAX_DURATION = {"elevenlabs": 22.0, "stability": 190.0}


def check_dependencies():
    """(1) Verify required libraries; print install guidance and return False if missing."""
    missing = [m for m in ("requests",) if importlib.util.find_spec(m) is None]
    if missing:
        print(f"[ERROR] Missing Python packages: {', '.join(missing)}")
        print(f"        Install with: {sys.executable} -m pip install {' '.join(missing)}")
        return False
    if shutil.which("ffmpeg") is None:
        print("[WARN] ffmpeg not found. Only assets whose API output format already matches "
              "the manifest extension can be saved (install ffmpeg for conversion).")
    return True


def load_manifest():
    with open(MANIFEST, encoding="utf-8") as f:
        data = json.load(f)
    style = data.get("style", "")
    assets = data["assets"]
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


def sniff_format(data):
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "wav"
    if data[:3] == b"ID3" or (len(data) > 1 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0):
        return "mp3"
    return None


class ApiError(Exception):
    pass


def request_audio(provider, prompt, duration, loop, key):
    """(2) POST to the generation API and return raw audio bytes."""
    import requests
    duration = min(float(duration), MAX_DURATION[provider])
    try:
        if provider == "elevenlabs":
            r = requests.post(
                "https://api.elevenlabs.io/v1/sound-generation",
                headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
                json={"text": prompt, "duration_seconds": max(0.5, duration), "prompt_influence": 0.5,
                      **({"loop": True} if loop else {})},
                timeout=180)
        else:
            r = requests.post(
                "https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio",
                headers={"authorization": f"Bearer {key}", "accept": "audio/*"},
                files={"none": ""},
                data={"prompt": prompt, "duration": int(round(duration)), "output_format": "mp3"},
                timeout=300)
    except requests.RequestException as e:
        raise ApiError(f"network error: {e}")
    if r.status_code != 200:
        raise ApiError(f"HTTP {r.status_code}: {r.text[:200]}")
    return r.content


def save_audio(data, out_path, duration):
    """(3) Store bytes at out_path in the requested format, converting via ffmpeg when needed."""
    want = out_path.rsplit(".", 1)[1].lower()
    have = sniff_format(data)
    if have is None:
        raise ApiError("API response is not a recognised mp3/wav stream")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    if have == want:
        with open(out_path, "wb") as f:
            f.write(data)
        return
    if shutil.which("ffmpeg") is None:
        raise ApiError(f"API returned {have} but {want} requested and ffmpeg is unavailable")
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, f"in.{have}")
        with open(src, "wb") as f:
            f.write(data)
        codec = ["-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le"] if want == "wav" else ["-b:a", "128k"]
        res = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, *codec, out_path],
                             capture_output=True, text=True)
        if res.returncode != 0:
            raise ApiError(f"ffmpeg failed: {res.stderr.strip()[:200]}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="regenerate even if the file exists")
    ap.add_argument("--only", nargs="+", metavar="ID", help="only generate these asset ids")
    ap.add_argument("--provider", choices=list(MAX_DURATION),
                    default=os.environ.get("AUDIO_PROVIDER", "elevenlabs"))
    ap.add_argument("--dry-run", action="store_true", help="show the plan and merged prompts, call no API")
    args = ap.parse_args(argv)

    if not check_dependencies():
        return 1
    style, assets = load_manifest()
    if args.only:
        unknown = set(args.only) - {a["id"] for a in assets}
        if unknown:
            print(f"[ERROR] Unknown asset id(s): {', '.join(sorted(unknown))}")
            return 1
        assets = [a for a in assets if a["id"] in args.only]

    # (4) differential mode
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
            print(f"[PLAN] {a['id']} ({a['type']}, {a['duration']}s, loop={a['loop']}) -> {a['path']}\n"
                  f"       {build_prompt(style, a)}")
        return 0

    env_name = "ELEVENLABS_API_KEY" if args.provider == "elevenlabs" else "STABILITY_API_KEY"
    key = os.environ.get(env_name)
    if not key:
        print(f"[INFO] {env_name} is not set; {len(todo)} asset(s) not generated.")
        print(f"       export {env_name}=... and re-run. The game still runs using Web Audio synth fallback.")
        return 0

    ok, failed = 0, []
    for a in todo:
        print(f"[GEN ] {a['id']} via {args.provider} ...")
        try:
            data = request_audio(args.provider, build_prompt(style, a), a["duration"], a["loop"], key)
            save_audio(data, os.path.join(ROOT, a["path"]), a["duration"])
            print(f"[ OK ] {a['path']}")
            ok += 1
        except ApiError as e:
            print(f"[FAIL] {a['id']}: {e}")
            failed.append(a["id"])
            if "HTTP 401" in str(e) or "HTTP 403" in str(e):
                print("[STOP] Authentication rejected; aborting remaining requests.")
                break
    print(f"Done: {ok} generated, {skipped} skipped, {len(failed)} failed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
