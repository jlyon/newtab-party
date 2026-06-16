# Store assets — capture

Regenerates the Chrome Web Store listing images for **newtab.party** from the
live arcade app using Playwright (headless Chromium).

## What gets generated

| File | What it is | Web Store slot |
|---|---|---|
| `screenshot-1-1280x800.png` | Arcade home `/` with today's game playing | Screenshot (1280×800) |
| `screenshot-2-1280x800.png` | `/leaderboard` page | Screenshot (1280×800) |
| `screenshot-3-1280x800.png` | A *different* game via the replay player `/play/<date>` | Screenshot (1280×800) |
| `marquee-1400x560.png` | Promo banner — 🥳 wordmark, tagline, real game thumbnails | Marquee promo tile (1400×560) |
| `small-promo-440x280.png` | Compact promo banner | Small promo tile (440×280) |

`store-icon-128.png` is **not** generated — it's hand-made art and is left alone.

### Recommended Web Store dimensions
- Screenshots: **1280×800** (or 640×400) — we use 1280×800.
- Marquee promo tile: **1400×560**.
- Small promo tile: **440×280**.
- Store icon: 128×128 (hand-made, untouched).

Every PNG is produced at exactly the dimensions in its filename (viewport set to
the target size, `deviceScaleFactor: 1`, screenshot clipped to exact W×H).

## Prerequisites

1. The worker must be serving the app locally:
   ```bash
   cd ../../worker
   npm install
   npm run db:init:local   # first time only
   npm run dev             # → http://localhost:8787
   ```
2. Install this directory's deps + the Chromium browser (run once):
   ```bash
   cd extension/store-assets
   npm install
   npx playwright install chromium
   ```

## Run

```bash
# against local wrangler dev (default)
npm run capture

# or against another origin (e.g. production)
SITE_URL=https://newtab.party npm run capture
```

PNGs are written into this directory and each path is logged.

## Notes / tweaking

- **Game variety:** Screenshot 1 shows today's rotating arcade game; screenshot 3
  uses the replay player for a past date whose game differs from today's (the
  rotation algorithm is mirrored in the script), so the two screenshots always
  show different games. The promo banners pull live thumbnails from a curated set
  of visually-distinct games.
- **Promo banners** are composed from a small inline HTML template (dark `#080810`
  background, gold `#ffd700` accent) since they aren't a single app screen.
  **Eyeball the marquee/small-promo output** and, if you want a different look,
  edit `PROMO_HTML` (the `promoHTML()` function) or the `PROMO_GAME_IDS` list near
  the top of `capture.mjs`.
- The script is resilient: each shot is wrapped in try/catch and start
  screens / "how to play" cards are dismissed best-effort, so one failure won't
  abort the whole run.
