// capture.mjs — Chrome Web Store listing asset capture for newtab.party
// ---------------------------------------------------------------------------
// Generates every store screenshot + promo banner from the live arcade app.
//
// PREREQUISITES (run once, in this directory):
//   npm install
//   npx playwright install chromium
//
// RUN (worker must be serving the app — `cd worker && npm run dev`):
//   npm run capture                       # uses http://localhost:8787
//   SITE_URL=https://newtab.party npm run capture
//
// OUTPUT (written next to this script, in extension/store-assets/):
//   screenshot-1-1280x800.png  — arcade home `/` with a game playing
//   screenshot-2-1280x800.png  — `/leaderboard`
//   screenshot-3-1280x800.png  — a DIFFERENT game (replay player for variety)
//   marquee-1400x560.png       — promo banner (inline-composed template)
//   small-promo-440x280.png    — small promo (inline-composed template)
//
// The store icon (store-icon-128.png) is NOT touched — it's hand-made art.
//
// DESIGN NOTES
// - Web Store dimensions are exact. We set the viewport to the target WxH at
//   deviceScaleFactor: 1 and screenshot the viewport with an explicit clip, so
//   every PNG comes out at precisely the dimensions in its filename.
// - Game variety: we read /games.json and pick a hand-curated set of visually
//   distinct games (different genres/palettes). Screenshot 1 shows today's
//   actual arcade home; screenshot 3 uses the replay player (/play/<date>) for
//   a guaranteed-different game; the promo banners pull thumbnails captured
//   from several /games/<file>.html standalone pages.
// - Promo banners aren't a single app screen, so we build them from a small
//   inline HTML template (dark #080810 bg, gold #ffd700 accent, the 🥳
//   wordmark + tagline) and inject real game thumbnails as a thumbnail row,
//   then screenshot the composed page. Eyeball the result and tweak PROMO_HTML
//   / the thumbnail picks below if you want a different vibe.
// - Resilient: each shot is wrapped in try/catch so one failure doesn't abort
//   the run, and overlays/start-buttons are dismissed best-effort.
// ---------------------------------------------------------------------------

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname; // write PNGs alongside this script
const SITE_URL = (process.env.SITE_URL || 'http://localhost:8787').replace(/\/$/, '');

// Brand
const BG = '#080810';
const GOLD = '#ffd700';

// Web Store target dimensions (width x height, exact)
const DIMS = {
  screenshot: { w: 1280, h: 800 },
  marquee: { w: 1400, h: 560 },
  smallPromo: { w: 440, h: 280 },
};

// Curated, visually-distinct games for the promo thumbnail row (by id). These
// span genres/palettes; the script falls back gracefully if any id is missing
// from games.json.
const PROMO_GAME_IDS = [
  'build-the-boardwalk', // tycoon — bright beach
  'penalty-panic',       // soccer — green pitch
  'hognose',             // snake — grid
  'burnin-glory',        // racing — jungle road
  'yarrmada',            // battleship — naval grid
  'blouncerroozal',      // brick-breaker — casino chips
];

// Common selectors for "start / play / dismiss overlay" buttons across the
// game library. We try each in order, best-effort, to get past start screens.
const START_SELECTORS = [
  '#start-btn', '#startBtn', '#playBtn', '#kickoff', '#setsail',
  '#start', '#play', 'button.btn-go', 'button.primary',
  '#how-play', // arcade home "how to play" card play button
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(...args) {
  console.log('[capture]', ...args);
}

// Try to dismiss a start overlay / "how to play" card so the game is visibly
// running. Best-effort — clicks the first matching, visible selector, then a
// center-canvas fallback. `root` may be a Page or a Frame.
async function dismissOverlays(root) {
  for (const sel of START_SELECTORS) {
    try {
      const el = root.locator(sel).first();
      if ((await el.count()) && (await el.isVisible())) {
        await el.click({ timeout: 1500, force: true }).catch(() => {});
        await sleep(400);
      }
    } catch { /* ignore */ }
  }
  // Fallback: many games "start" on a click/keypress anywhere on the canvas.
  try {
    const canvas = root.locator('canvas').first();
    if ((await canvas.count()) && (await canvas.isVisible())) {
      await canvas.click({ timeout: 1500, force: true }).catch(() => {});
    }
  } catch { /* ignore */ }
}

async function newViewportPage(browser, { w, h }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  return { ctx, page };
}

// Screenshot the current viewport, clipped to exact WxH.
async function shootViewport(page, { w, h }, outName) {
  const out = join(OUT_DIR, outName);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
  log('wrote', out);
}

async function fetchGames() {
  try {
    const res = await fetch(`${SITE_URL}/games.json`);
    const data = await res.json();
    return Array.isArray(data) ? data : data.games || [];
  } catch (err) {
    log('WARN could not fetch /games.json:', err.message);
    return [];
  }
}

// --- Shot 1: arcade home with a game playing -------------------------------
async function shotArcadeHome(browser) {
  log('shot 1: arcade home /');
  const { ctx, page } = await newViewportPage(browser, DIMS.screenshot);
  try {
    await page.goto(`${SITE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1500); // let games.json load + iframe mount
    // Dismiss the "how to play" card on the parent page if present.
    await dismissOverlays(page);
    // The game itself lives in #game-frame — start it inside the iframe too.
    try {
      const frame = page.frameLocator('#game-frame');
      // frameLocator has no count(); guard the inner clicks individually.
      for (const sel of START_SELECTORS) {
        const el = frame.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
          await el.click({ timeout: 1500, force: true }).catch(() => {});
          await sleep(300);
        }
      }
      await frame.locator('canvas').first().click({ timeout: 1500, force: true }).catch(() => {});
    } catch { /* iframe may not expose these — fine */ }
    await sleep(1800); // let canvas animate to a lively frame
    await shootViewport(page, DIMS.screenshot, 'screenshot-1-1280x800.png');
  } catch (err) {
    log('ERROR shot 1:', err.message);
  } finally {
    await ctx.close();
  }
}

// --- Shot 2: leaderboard ---------------------------------------------------
async function shotLeaderboard(browser) {
  log('shot 2: /leaderboard');
  const { ctx, page } = await newViewportPage(browser, DIMS.screenshot);
  try {
    await page.goto(`${SITE_URL}/leaderboard`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(800);
    await shootViewport(page, DIMS.screenshot, 'screenshot-2-1280x800.png');
  } catch (err) {
    log('ERROR shot 2:', err.message);
  } finally {
    await ctx.close();
  }
}

// --- Shot 3: a DIFFERENT game (replay player for guaranteed variety) -------
// Today's arcade game (shot 1) rotates daily, so to guarantee shot 3 shows a
// different game we render the replay player for a fixed past date whose game
// differs from "today". We compute the rotation locally and pick a date that
// maps to a different game than today's.
async function shotDifferentGame(browser, games) {
  log('shot 3: a different game');
  const { ctx, page } = await newViewportPage(browser, DIMS.screenshot);
  try {
    // Rotation algorithm mirrored from the app (CLAUDE.md / render.ts).
    const DAY_EPOCH = Date.UTC(2026, 4, 1); // May 1 2026 UTC
    const dayIndex = (d) => Math.floor((d - DAY_EPOCH) / 86400000);
    const gameForDay = (day) =>
      games.length ? games[((day % games.length) + games.length) % games.length] : null;

    const today = dayIndex(Date.now());
    const todayGame = gameForDay(today);

    // Walk back day-by-day until we find a past date with a different game.
    let target = null;
    for (let back = 1; back <= games.length; back++) {
      const day = today - back;
      const g = gameForDay(day);
      if (g && (!todayGame || g.id !== todayGame.id)) {
        const ms = DAY_EPOCH + day * 86400000;
        target = { date: new Date(ms).toISOString().slice(0, 10), game: g };
        break;
      }
    }

    if (target) {
      log('  replaying', target.game.id, 'on', target.date);
      await page.goto(`${SITE_URL}/play/${target.date}`, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      await sleep(1500);
      try {
        const frame = page.frameLocator('#game-frame');
        for (const sel of START_SELECTORS) {
          const el = frame.locator(sel).first();
          if (await el.isVisible().catch(() => false)) {
            await el.click({ timeout: 1500, force: true }).catch(() => {});
            await sleep(300);
          }
        }
        await frame.locator('canvas').first().click({ timeout: 1500, force: true }).catch(() => {});
      } catch { /* fine */ }
      await sleep(1800);
    } else {
      // Fallback: load a known standalone game file directly.
      log('  no distinct replay found; loading a standalone game file');
      const pick = games.find((g) => g.id === 'penalty-panic') || games[0];
      const file = pick?.file || 'games/penalty-panic.html';
      await page.goto(`${SITE_URL}/${file}`, { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(1200);
      await dismissOverlays(page);
      await sleep(1800);
    }
    await shootViewport(page, DIMS.screenshot, 'screenshot-3-1280x800.png');
  } catch (err) {
    log('ERROR shot 3:', err.message);
  } finally {
    await ctx.close();
  }
}

// --- Capture a single game's standalone page as a thumbnail data URL --------
// Returns a base64 PNG data URL of the game frame, or null on failure.
async function captureGameThumb(browser, game, { w, h }) {
  const { ctx, page } = await newViewportPage(browser, { w, h });
  try {
    await page.goto(`${SITE_URL}/${game.file}`, { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(900);
    await dismissOverlays(page);
    await sleep(1200); // let canvas render a frame
    const buf = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } });
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch (err) {
    log('  WARN thumb failed for', game.id, '-', err.message);
    return null;
  } finally {
    await ctx.close();
  }
}

// --- Promo banner template -------------------------------------------------
// Builds the inline HTML for a promo banner. `thumbs` is an array of data URLs.
// `variant` controls layout density (marquee = wide, small = compact).
function promoHTML({ w, h, thumbs, variant }) {
  const isSmall = variant === 'small';
  const wordmarkSize = isSmall ? 30 : 64;
  const taglineSize = isSmall ? 13 : 26;
  const thumbCount = isSmall ? Math.min(3, thumbs.length) : thumbs.length;
  const used = thumbs.slice(0, thumbCount);
  const thumbW = isSmall ? 96 : 168;
  const thumbH = Math.round(thumbW * 0.625); // 16:10-ish tiles

  const thumbTiles = used
    .map(
      (src) => `
      <div class="thumb"><img src="${src}" alt=""></div>`
    )
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${w}px; height: ${h}px; overflow: hidden; }
  body {
    background:
      radial-gradient(circle at 22% 18%, rgba(255,215,0,0.14), transparent 42%),
      radial-gradient(circle at 82% 88%, rgba(120,90,255,0.16), transparent 46%),
      linear-gradient(155deg, #11111e 0%, ${BG} 60%, #05050b 100%);
    color: #e5e7eb;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: ${isSmall ? 16 : 36}px;
    padding: ${isSmall ? 18 : 40}px;
    text-align: center;
  }
  .wordmark {
    font-size: ${wordmarkSize}px; font-weight: 800; letter-spacing: 1px;
    line-height: 1; white-space: nowrap;
  }
  .wordmark .party { color: ${GOLD}; }
  .tagline {
    font-size: ${taglineSize}px; font-weight: 500;
    color: rgba(255,255,255,0.7); letter-spacing: 0.4px;
  }
  .thumbs { display: flex; gap: ${isSmall ? 8 : 18}px; align-items: center; }
  .thumb {
    width: ${thumbW}px; height: ${thumbH}px;
    border-radius: ${isSmall ? 7 : 11}px; overflow: hidden;
    border: 1px solid rgba(255,255,255,0.12);
    box-shadow: 0 8px 28px rgba(0,0,0,0.45);
    background: ${BG};
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style></head>
<body>
  <div class="wordmark">🥳 newtab<span class="party">.party</span></div>
  <div class="tagline">A new arcade game every day</div>
  ${used.length ? `<div class="thumbs">${thumbTiles}</div>` : ''}
</body></html>`;
}

async function shotPromo(browser, dims, thumbs, variant, outName) {
  log(`promo: ${outName}`);
  const { ctx, page } = await newViewportPage(browser, dims);
  try {
    await page.setContent(promoHTML({ w: dims.w, h: dims.h, thumbs, variant }), {
      waitUntil: 'networkidle',
    });
    await sleep(400);
    await shootViewport(page, dims, outName);
  } catch (err) {
    log(`ERROR ${outName}:`, err.message);
  } finally {
    await ctx.close();
  }
}

// --- main ------------------------------------------------------------------
async function main() {
  log('SITE_URL =', SITE_URL);
  log('output dir =', OUT_DIR);

  const browser = await chromium.launch();
  try {
    const games = await fetchGames();
    log('loaded', games.length, 'games from /games.json');

    // App screenshots.
    await shotArcadeHome(browser);
    await shotLeaderboard(browser);
    await shotDifferentGame(browser, games);

    // Capture thumbnails for the promo banners from curated, distinct games.
    const picks = PROMO_GAME_IDS
      .map((id) => games.find((g) => g.id === id))
      .filter(Boolean);
    // Top up from the rest of the library if some curated ids are missing.
    if (picks.length < 4) {
      for (const g of games) {
        if (picks.length >= 6) break;
        if (!picks.includes(g)) picks.push(g);
      }
    }
    log('promo thumbnail games:', picks.map((g) => g.id).join(', ') || '(none)');

    const thumbs = [];
    for (const g of picks) {
      const t = await captureGameThumb(browser, g, { w: 480, h: 300 });
      if (t) thumbs.push(t);
    }
    log('captured', thumbs.length, 'thumbnails');

    await shotPromo(browser, DIMS.marquee, thumbs, 'marquee', 'marquee-1400x560.png');
    await shotPromo(browser, DIMS.smallPromo, thumbs, 'small', 'small-promo-440x280.png');

    log('done. Review the PNGs in', OUT_DIR);
    log('Tip: eyeball the marquee/promo composition and tweak PROMO_HTML or PROMO_GAME_IDS if desired.');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[capture] fatal:', err);
  process.exit(1);
});
