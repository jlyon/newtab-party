#!/usr/bin/env python3
"""Generate transparent game logos for newtab.party with the Gemini image API.

Reads GEMINI_API_KEY from .env (repo root or worker/.env) or the environment,
asks Gemini for a minor-league-crest style logo on a flat magenta background,
chroma-keys the magenta out, and writes worker/public/games/logos/<slug>.png.

Usage
  python3 scripts/gen_logos.py <slug> [<slug> ...]   # specific games from games.json
  python3 scripts/gen_logos.py --missing              # every game without a logo yet
  python3 scripts/gen_logos.py --all --force          # regenerate everything
  python3 scripts/gen_logos.py <slug> --hint "a grumpy goose in a tuxedo"
  python3 scripts/gen_logos.py <slug> --from-file raw.png   # just key an image you already have
  python3 scripts/gen_logos.py --dry-run --all        # print the prompts, call nothing

Needs: pip install pillow numpy   (no other dependencies)
Optional games.json field per game: "logo": "prompt hint about the mascot / scene".
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAMES_JSON = ROOT / "worker" / "games.json"
LOGO_DIR = ROOT / "worker" / "public" / "games" / "logos"
RAW_DIR = ROOT / "scripts" / ".logo-raw"          # kept only with --keep-raw (gitignored)
DEFAULT_MODEL = "gemini-2.5-flash-image"
API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

EMBLEMS = [
    "round badge", "heater shield", "banner with a ribbon", "pennant", "playing-card frame",
    "oval cameo", "hexagonal patch", "diamond crest", "circular seal with a laurel", "varsity shield with a scroll",
]

PROMPT = (
    "Create ONE single centered logo (one design only, not a set), refined modern "
    "minor-league-baseball-team crest style: a polished, characterful cartoon mascot plus a bold "
    "athletic wordmark, cohesive limited palette, clean thick outline, die-cut sticker look, "
    "emblem shape: {emblem}. Game: '{name}'. {scene} Wordmark text exactly: '{name}'{spelled}. "
    "Center it on a completely solid, flat, uniform pure MAGENTA background hex #FF00FF: no gradient, "
    "no texture, no glow, no drop shadow, nothing else in the image."
)


# ── .env ──────────────────────────────────────────────────────────────────
def load_env_key() -> str | None:
    """GEMINI_API_KEY from the environment, else from .env / worker/.env. Never printed."""
    if os.environ.get("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"].strip()
    for p in (ROOT / ".env", ROOT / "worker" / ".env"):
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() == "GEMINI_API_KEY":
                return v.strip().strip('"').strip("'")
    return None


# ── games.json ────────────────────────────────────────────────────────────
def load_games() -> list[dict]:
    return json.loads(GAMES_JSON.read_text()).get("games", [])


def build_prompt(game: dict, hint: str | None) -> str:
    name = game["name"]
    emblem = EMBLEMS[int(hashlib.sha1(game["id"].encode()).hexdigest(), 16) % len(EMBLEMS)]
    scene = (hint or game.get("logo") or game.get("description") or "").strip()
    if scene and not scene.endswith("."):
        scene += "."
    # Nano Banana fumbles long or invented words; spell them out letter by letter.
    spelled = ""
    words = [w for w in name.replace("'", "").split() if w.isalpha()]
    odd = [w for w in words if len(w) >= 9 or w.lower() not in COMMON_WORDS]
    if odd:
        spelled = " (spelled " + ", ".join(f"{w}: " + "-".join(w.upper()) for w in odd[:3]) + ")"
    return PROMPT.format(name=name, emblem=emblem, scene=scene, spelled=spelled)


COMMON_WORDS = set("""the a an of and or on in it like to vs up run attack panic room party bombs glory
build boardwalk sweep strait wild card dilemma seat pants frosty fall freefall yeti chop till you drop
cleanup isle signal sunken toes rack rock em sock wrecking ball shootin crackin smithereens penalty
weiners tubs tippity stump grandpa bend maxi conga chaos prompter payday speedway abominable""".split())


# ── Gemini ────────────────────────────────────────────────────────────────
def gemini_image(prompt: str, key: str, model: str, timeout: int = 120) -> bytes:
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    req = urllib.request.Request(
        API.format(model=model),
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors="replace")[:600]
        raise RuntimeError(f"Gemini HTTP {e.code}: {msg}") from None
    for cand in data.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"])
    raise RuntimeError("Gemini returned no image: " + json.dumps(data)[:400])


# ── Chroma key (pillow + numpy only) ──────────────────────────────────────
def key_magenta(raw: bytes | Path):
    """Turn a logo on #FF00FF into a clean RGBA cutout. Returns (PIL.Image, coverage)."""
    import io
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter

    src = Image.open(io.BytesIO(raw) if isinstance(raw, (bytes, bytearray)) else raw).convert("RGB")
    rgb = np.asarray(src).astype(np.float32)
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    m = np.minimum(R, B) - G                       # "magenta-ness": ~255 on #FF00FF, <=0 on most art
    magenta = (m > 30).astype(np.uint8) * 255
    h, w = magenta.shape

    # Background = magenta connected to the image border (flood fill from every border run).
    mask = Image.fromarray(magenta, "L").copy()   # .copy(): fromarray images are read-only
    draw_seed = ImageDraw.floodfill
    px = mask.load()
    border = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    for x, y in border:
        if px[x, y] == 255:
            draw_seed(mask, (x, y), 128)
    bg = np.asarray(mask) == 128
    subject = ~bg                                   # everything not reachable from outside: holes already filled

    # Keep only the largest blob (drops watermarks / specks).
    lab = Image.fromarray(subject.astype(np.uint8) * 255, "L").copy()
    lp = lab.load()
    best, best_n = None, 0
    ys, xs = np.nonzero(subject)
    for x, y in zip(xs.tolist(), ys.tolist()):
        if lp[x, y] != 255:
            continue
        draw_seed(lab, (x, y), 1)
        arr = np.asarray(lab)
        n = int((arr == 1).sum())
        if n > best_n:
            best, best_n = arr == 1, n
        lab.paste(2, None, Image.fromarray((arr == 1).astype(np.uint8) * 255, "L"))  # mark visited
        lp = lab.load()
        if best_n > subject.sum() * 0.6:
            break
    subject = best if best is not None else subject

    # Feathered alpha + magenta despill on the fringe.
    alpha_img = Image.fromarray(subject.astype(np.uint8) * 255, "L").filter(ImageFilter.GaussianBlur(0.7))
    alpha = np.clip((np.asarray(alpha_img).astype(np.float32) / 255 - 0.35) / 0.4, 0, 1)
    spill = np.clip(m, 0, None)
    out = np.dstack([np.clip(R - spill, 0, 255), G, np.clip(B - spill, 0, 255), alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    if max(img.size) > 1024:
        img.thumbnail((1024, 1024), Image.LANCZOS)
    return img, float(subject.mean())


# ── main ──────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slugs", nargs="*", help="game ids from worker/games.json")
    ap.add_argument("--missing", action="store_true", help="every game that has no logo yet")
    ap.add_argument("--all", action="store_true", help="every game in games.json")
    ap.add_argument("--force", action="store_true", help="overwrite existing logos")
    ap.add_argument("--hint", help="extra scene / mascot description added to the prompt")
    ap.add_argument("--from-file", help="skip Gemini: chroma-key this image for the (single) slug")
    ap.add_argument("--model", default=os.environ.get("GEMINI_IMAGE_MODEL", DEFAULT_MODEL))
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--keep-raw", action="store_true", help=f"save the raw magenta render under {RAW_DIR.relative_to(ROOT)}/")
    ap.add_argument("--dry-run", action="store_true", help="print prompts only")
    args = ap.parse_args()

    games = {g["id"]: g for g in load_games()}
    if args.all:
        targets = list(games)
    elif args.missing:
        targets = [s for s in games if not (LOGO_DIR / f"{s}.png").exists()]
    else:
        targets = args.slugs
    if not targets:
        print("nothing to do (pass slugs, --missing or --all)")
        return 0
    unknown = [s for s in targets if s not in games]
    if unknown:
        print("not in games.json:", ", ".join(unknown), file=sys.stderr)
        return 2
    if args.from_file and len(targets) != 1:
        print("--from-file takes exactly one slug", file=sys.stderr)
        return 2

    key = None if (args.dry_run or args.from_file) else load_env_key()
    if not args.dry_run and not args.from_file and not key:
        print("GEMINI_API_KEY not set. Put GEMINI_API_KEY=... in .env (repo root) or export it.", file=sys.stderr)
        return 2

    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    failed = []
    for slug in targets:
        dest = LOGO_DIR / f"{slug}.png"
        prompt = build_prompt(games[slug], args.hint)
        if args.dry_run:
            print(f"\n[{slug}]\n{prompt}")
            continue
        if dest.exists() and not args.force and not args.from_file:
            print(f"skip  {slug} (exists; use --force)")
            continue
        ok = False
        for attempt in range(1, args.retries + 1):
            try:
                if args.from_file:
                    raw = Path(args.from_file).read_bytes()
                else:
                    print(f"gen   {slug} (attempt {attempt}) …", flush=True)
                    raw = gemini_image(prompt, key, args.model)
                    if args.keep_raw:
                        RAW_DIR.mkdir(exist_ok=True)
                        (RAW_DIR / f"{slug}-{attempt}.png").write_bytes(raw)
                img, coverage = key_magenta(raw)
                if not args.from_file and not (0.08 <= coverage <= 0.92):
                    raise RuntimeError(f"keyed subject covers {coverage:.0%} of the frame; background probably wasn't flat magenta")
                img.save(dest, optimize=True)
                print(f"saved {dest.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}  subject {coverage:.0%}")
                ok = True
                break
            except Exception as e:  # noqa: BLE001
                print(f"      {slug}: {e}", file=sys.stderr)
                if args.from_file:
                    break
                time.sleep(2 * attempt)
        if not ok:
            failed.append(slug)
    if failed:
        print("\nfailed:", ", ".join(failed), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
