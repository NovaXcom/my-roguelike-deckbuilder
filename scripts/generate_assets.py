#!/usr/bin/env python3
"""Stable Diffusion (SD WebUI API) asset pipeline.

manifest -> txt2img -> (rembg transparency) -> Pillow resize -> src/assets/...

Usage:
    python scripts/generate_assets.py                 # generate only missing assets
    python scripts/generate_assets.py --force         # regenerate everything
    python scripts/generate_assets.py --only char_knight bg_dungeon
    python scripts/generate_assets.py --category enemy --dry-run

SD WebUI must be started with the API enabled (`--api`), default 127.0.0.1:7860.
"""
from __future__ import annotations

import argparse
import base64
import importlib
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST = ROOT / "scripts" / "assets-manifest.json"
DEFAULT_STYLE = (
    "Dark fantasy RPG game asset, stylized 2D digital painting, "
    "dark slate tones, cinematic lighting"
)
TRANSPARENT_HINT = "isolated on a plain flat light background, clean silhouette, no ground shadow"

REQUIRED = {
    "requests": "requests",
    "PIL": "Pillow",
    "rembg": "rembg[cpu]  (GPU: rembg[gpu]; also needs onnxruntime)",
}


def check_dependencies() -> dict:
    """Import required libs; print install guidance and exit if any are missing."""
    mods, missing = {}, []
    for mod, pkg in REQUIRED.items():
        try:
            mods[mod] = importlib.import_module(mod)
        except Exception as e:  # ImportError, or onnxruntime load failures
            missing.append((mod, pkg, e))
    if missing:
        print("[ERROR] 必要なPythonライブラリが不足しています / Missing dependencies:", file=sys.stderr)
        for mod, pkg, e in missing:
            print(f"  - {mod}: {e}", file=sys.stderr)
        pkgs = " ".join(f'"{p.split()[0]}"' for _, p, _ in missing)
        print("\nインストール方法:", file=sys.stderr)
        print(f"  python -m pip install {pkgs}", file=sys.stderr)
        print("  (推奨: python -m venv .venv && source .venv/bin/activate の後に実行)", file=sys.stderr)
        sys.exit(1)
    return mods


def load_manifest(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"[ERROR] マニフェストを読み込めません: {path}\n  {e}", file=sys.stderr)
        sys.exit(1)
    if not isinstance(data.get("assets"), list):
        print("[ERROR] マニフェストに 'assets' 配列がありません", file=sys.stderr)
        sys.exit(1)
    return data


def merge_prompt(common: str, prompt: str, transparent: bool) -> str:
    parts = [prompt.strip(), common.strip()]
    if transparent:
        parts.append(TRANSPARENT_HINT)
    return ", ".join(p for p in parts if p)


def merge_negative(common: str, negative: str) -> str:
    """Append common negative tags, skipping tags the asset already lists."""
    own = [t.strip() for t in negative.split(",") if t.strip()]
    seen = {t.lower() for t in own}
    extra = [t.strip() for t in common.split(",") if t.strip() and t.strip().lower() not in seen]
    return ", ".join(own + extra)


def generation_size(width: int, height: int, max_side: int, min_side: int = 512) -> tuple[int, int]:
    """Aspect-preserving size, long side clamped to [min_side, max_side], multiples of 8.

    Small targets (48px icons) are generated at min_side and downscaled: SD produces
    garbage below ~512px.
    """
    long_side = max(width, height)
    scale = min(max_side, max(min_side, long_side)) / long_side
    w = max(64, round(width * scale / 8) * 8)
    h = max(64, round(height * scale / 8) * 8)
    return w, h


def resize_fill(img, width: int, height: int):
    """Resize to exactly width x height (center-crop to fill, LANCZOS)."""
    from PIL import Image

    src_w, src_h = img.size
    if (src_w, src_h) == (width, height):
        return img
    scale = max(width / src_w, height / src_h)
    new_w, new_h = max(width, round(src_w * scale)), max(height, round(src_h * scale))
    img = img.resize((new_w, new_h), Image.LANCZOS)
    left, top = (new_w - width) // 2, (new_h - height) // 2
    return img.crop((left, top, left + width, top + height))


def resize_fit_transparent(img, width: int, height: int, anchor: str = "bottom"):
    """Resize RGBA sprite to fit inside width x height without cropping (transparent padding).

    anchor="bottom": feet at bottom-center (characters/enemies/buildings); "center": icons/props.
    """
    from PIL import Image

    bbox = img.getbbox()  # trim empty margins left by background removal
    if bbox:
        img = img.crop(bbox)
    scale = min(width / img.width, height / img.height)
    new = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    top = height - new.height if anchor == "bottom" else (height - new.height) // 2
    canvas.paste(new, ((width - new.width) // 2, top), new)
    return canvas


def check_server(requests, base_url: str, timeout: float) -> None:
    try:
        r = requests.get(f"{base_url}/sdapi/v1/options", timeout=timeout)
        r.raise_for_status()
    except requests.exceptions.ConnectionError:
        print(
            f"[ERROR] SD WebUI API ({base_url}) に接続できません。\n"
            "  - Stable Diffusion WebUI (AUTOMATIC1111 / Forge) を --api オプション付きで起動してください\n"
            "      例: ./webui.sh --api   /   webui-user.bat の COMMANDLINE_ARGS に --api を追加\n"
            "  - ホスト/ポートが異なる場合は --host http://127.0.0.1:7860 で指定できます",
            file=sys.stderr,
        )
        sys.exit(2)
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] SD WebUI API が想定外の応答を返しました: {e}", file=sys.stderr)
        sys.exit(2)


def txt2img(requests, base_url: str, payload: dict, timeout: float) -> bytes:
    r = requests.post(f"{base_url}/sdapi/v1/txt2img", json=payload, timeout=timeout)
    r.raise_for_status()
    images = r.json().get("images") or []
    if not images:
        raise RuntimeError("APIレスポンスに images が含まれていません")
    return base64.b64decode(images[0].split(",", 1)[-1])


def process_asset(asset, mods, common_style, common_neg, args, base_url) -> None:
    from PIL import Image

    requests = mods["requests"]
    transparent = bool(asset.get("transparent", False))
    width, height = int(asset["width"]), int(asset["height"])
    gw, gh = generation_size(width, height, args.max_side, args.min_side)
    payload = {
        "prompt": merge_prompt(common_style, asset["prompt"], transparent),
        "negative_prompt": merge_negative(common_neg, asset.get("negative_prompt", "")),
        "width": gw,
        "height": gh,
        "steps": args.steps,
        "cfg_scale": args.cfg,
        "sampler_name": args.sampler,
        "batch_size": 1,
        "n_iter": 1,
    }
    if args.seed is not None:
        payload["seed"] = args.seed
    raw = txt2img(requests, base_url, payload, args.timeout)
    img = Image.open(io.BytesIO(raw)).convert("RGB")

    if transparent:
        img = mods["rembg"].remove(img).convert("RGBA")
        img = resize_fit_transparent(img, width, height, asset.get("anchor", "bottom"))
    else:
        img = resize_fill(img, width, height)

    out = ROOT / asset["path"]
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(out.suffix + ".tmp")
    img.save(tmp, format="PNG", optimize=True)
    tmp.replace(out)  # atomic: never leave a half-written file that would skip next run


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Generate game assets via Stable Diffusion WebUI API")
    p.add_argument("--force", action="store_true", help="既存ファイルがあっても再生成する")
    p.add_argument("--only", nargs="+", metavar="ID", help="指定IDのみ対象")
    p.add_argument("--category", help="カテゴリで絞り込み (bg/character/enemy/cutin/icon/keyart/facility/prop)")
    p.add_argument("--dry-run", action="store_true", help="生成せず対象一覧だけ表示")
    p.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    p.add_argument("--host", default="http://127.0.0.1:7860", help="SD WebUI のベースURL")
    p.add_argument("--steps", type=int, default=28)
    p.add_argument("--cfg", type=float, default=7.0)
    p.add_argument("--sampler", default="DPM++ 2M Karras")
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--max-side", type=int, default=768,
                   help="SD生成時の長辺上限px (SDXLなら1024推奨)。最終サイズはPillowでmanifestのwidth/heightへ")
    p.add_argument("--min-side", type=int, default=512, help="小さいアセットの生成時の長辺下限px")
    p.add_argument("--timeout", type=float, default=600, help="txt2img のタイムアウト秒")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    mods = check_dependencies()
    manifest = load_manifest(args.manifest)
    common_style = manifest.get("common_style", DEFAULT_STYLE)
    common_neg = manifest.get("common_negative", "")
    base_url = args.host.rstrip("/")

    assets = manifest["assets"]
    if args.only:
        unknown = set(args.only) - {a["id"] for a in assets}
        if unknown:
            print(f"[ERROR] 未知のID: {', '.join(sorted(unknown))}", file=sys.stderr)
            return 1
        assets = [a for a in assets if a["id"] in args.only]
    if args.category:
        known = {a["category"] for a in assets}
        if args.category not in known:
            print(f"[ERROR] 未知のカテゴリ: {args.category} (有効: {', '.join(sorted(known))})", file=sys.stderr)
            return 1
        assets = [a for a in assets if a["category"] == args.category]

    todo, skipped = [], []
    for a in assets:
        (skipped if (ROOT / a["path"]).exists() and not args.force else todo).append(a)
    for a in skipped:
        print(f"[skip] {a['id']} (exists: {a['path']})")
    if not todo:
        print("生成対象はありません (--force で再生成)。")
        return 0
    if args.dry_run:
        for a in todo:
            print(f"[dry-run] {a['id']} -> {a['path']}")
        return 0

    check_server(mods["requests"], base_url, timeout=5)

    ok, failed = 0, []
    for i, a in enumerate(todo, 1):
        print(f"[{i}/{len(todo)}] generating {a['id']} ...", flush=True)
        try:
            process_asset(a, mods, common_style, common_neg, args, base_url)
            print(f"      saved {a['path']}")
            ok += 1
        except KeyboardInterrupt:
            print("\n中断しました。", file=sys.stderr)
            return 130
        except mods["requests"].exceptions.ConnectionError:
            print("[ERROR] 生成中にSD WebUIとの接続が切れました。中断します。", file=sys.stderr)
            failed.append(a["id"])
            break
        except Exception as e:
            print(f"      [FAILED] {a['id']}: {e}", file=sys.stderr)
            failed.append(a["id"])
    print(f"\n完了: 成功 {ok} / スキップ {len(skipped)} / 失敗 {len(failed)}")
    if failed:
        print("失敗: " + ", ".join(failed), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
