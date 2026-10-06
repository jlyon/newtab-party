// Smoke-test newtab.party games on desktop, iPhone 13, iPhone SE, iPad portrait and iPad landscape.
// Loads each game, clicks Play, feeds generic keyboard/touch input and reports page errors,
// layout overflow, clipped canvases, off-screen or tiny buttons and non-scrollable content.
// usage: node scripts/qa/smoke.mjs [game-id ...]        (no args = every game)
// env:   SHOTS=1 saves screenshots into scripts/qa/shots/ ; MODES=desktop,mobile limits the modes
// Playwright: `npm i -D playwright` in scripts/qa, or a global install (falls back to the cloud-session path).
let pw;
try { pw = await import('playwright'); }
catch { pw = await import('/opt/node-tools/node_modules/playwright/index.mjs'); }
const { chromium, devices } = pw;
const EXECUTABLE = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const GAMES_DIR = process.env.GAMES_DIR || path.join(ROOT, 'worker', 'public', 'games');
const OUT = process.env.SHOTS_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), 'shots');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const p = path.join(GAMES_DIR, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(GAMES_DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const ids = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(GAMES_DIR).filter(f => f.endsWith('.html')).map(f => f.replace(/\.html$/, ''));

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--autoplay-policy=no-user-gesture-required'] });

// Seeded Math.random + report collection in-page
const INIT = `
  window.__errs = [];
  window.addEventListener('error', e => window.__errs.push('error: ' + e.message));
  window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
  window.__posted = [];
  const _pm = window.parent.postMessage.bind(window.parent);
  window.parent.postMessage = function(m){ try { if (m && typeof m.highScore !== 'undefined') window.__posted.push(m.highScore); } catch(e){} return _pm.apply(this, arguments); };
`;

function visibleFilter() {
  return (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
}

async function clickStart(page) {
  // Click the Play button on the start overlay, handling team pickers etc.
  for (let round = 0; round < 6; round++) {
    const did = await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' && r.bottom > 0 && r.top < innerHeight; };
      const topmost = (el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); return t && (t === el || el.contains(t)); };
      const visB = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
      const start = [...document.querySelectorAll('[id*="start"], [id*="Start"], [id*="picker"], [id*="title"], [id*="intro"], [id*="landing"]')].filter(vis);
      let btns = [];
      for (const s of start) btns.push(...[...s.querySelectorAll('button, .btn, [role=button]')].filter(visB));
      if (!btns.length) btns = [...document.querySelectorAll('button')].filter(vis).filter(topmost);
      const enabled = btns.filter(b => !b.disabled);
      if (enabled.length) { enabled[0].scrollIntoView({ block: 'center' }); enabled[0].click(); return 'btn:' + (enabled[0].id || enabled[0].textContent.trim().slice(0, 20)); }
      // pick a team / option if the start button is disabled
      const opts = [...document.querySelectorAll('.flag, [class*="team"], [class*="nation"], [class*="opt"], [class*="choice"], #grid > *, select')].filter(vis);
      if (opts.length) {
        if (opts[0].tagName === 'SELECT') { for (const sel of opts) { sel.selectedIndex = Math.min(1, sel.options.length - 1); sel.dispatchEvent(new Event('change', { bubbles: true })); } return 'select'; }
        window.__optN = (window.__optN || 0) + 1; const o = opts[Math.min(window.__optN, opts.length - 1)]; o.scrollIntoView(); o.click(); return 'opt:' + (o.className || '').toString().slice(0, 20); }
      return null;
    });
    if (!did) break;
    await page.waitForTimeout(250);
    // if the first click only picked an option, loop again to find the enabled start button
    const stillStart = await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
      return [...document.querySelectorAll('[id*="start"], [id*="Start"], [id*="picker"]')].some(vis);
    });
    if (!stillStart) return did;
  }
  return 'none';
}

async function feedInput(page, mobile) {
  const cv = await page.$('canvas');
  if (mobile) {
    // tap/hold the touch buttons if present, then swipe/tap canvas
    const btns = await page.$$('#touch-controls button, #touch-controls .btn, .touch-controls button, .mobile-controls button, .controls button, .btn');
    for (const b of btns.slice(0, 4)) { try { if (await b.isVisible()) { const bb = await b.boundingBox(); if (bb) { await page.touchscreen.tap(bb.x + bb.width/2, bb.y + bb.height/2); await page.waitForTimeout(120); } } } catch {} }
    if (cv) { const bb = await cv.boundingBox(); if (bb) {
      await page.touchscreen.tap(bb.x + bb.width/2, bb.y + bb.height/2); await page.waitForTimeout(200);
      // swipe right
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb.x + bb.width*0.3, y: bb.y + bb.height*0.6 }] });
      for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bb.x + bb.width*(0.3 + i*0.07), y: bb.y + bb.height*0.6 }] }); await page.waitForTimeout(30); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } }
  } else {
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(400); await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Space'); await page.waitForTimeout(150);
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(300); await page.keyboard.up('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    if (cv) { const bb = await cv.boundingBox(); if (bb) { await page.mouse.move(bb.x + bb.width*0.4, bb.y + bb.height*0.5); await page.mouse.down(); await page.mouse.move(bb.x + bb.width*0.7, bb.y + bb.height*0.5, { steps: 8 }); await page.mouse.up(); } }
  }
}

async function layoutReport(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const out = { innerW: innerWidth, innerH: innerHeight, scrollW: de.scrollWidth, scrollH: de.scrollHeight, bodyScrollH: document.body.scrollHeight, touchClass: document.body.classList.contains('touch'), issues: [] };
    if (de.scrollWidth > innerWidth + 1) out.issues.push(`horizontal overflow ${de.scrollWidth}>${innerWidth}`);
    // Content taller than the viewport must be reachable by touch: some ancestor with overflow auto/scroll whose touch-action allows pan-y.
    const tallest = [...document.querySelectorAll('body *')].filter(vis).filter(el => el.getBoundingClientRect().bottom > innerHeight + 4 && getComputedStyle(el).position !== 'fixed');
    for (const el of tallest.slice(0, 40)) {
      let p = el, ok = false;
      while (p && p !== document.documentElement) { const cs = getComputedStyle(p); if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && p.scrollHeight > p.clientHeight + 2 && cs.touchAction !== 'none') { ok = true; break; } p = p.parentElement; }
      if (!ok) { const cs = getComputedStyle(document.documentElement), bs = getComputedStyle(document.body); const pageScrolls = (cs.overflowY !== 'hidden' && bs.overflowY !== 'hidden' && cs.touchAction !== 'none' && bs.touchAction !== 'none'); if (!pageScrolls) { out.issues.push(`content below the fold is not touch-scrollable: <${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}> bottom ${Math.round(el.getBoundingClientRect().bottom)} > ${innerHeight}`); break; } }
    }
    const cv = document.querySelector('canvas');
    if (cv && vis(cv)) { const r = cv.getBoundingClientRect(); out.canvas = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
      if (r.right > innerWidth + 1 || r.left < -1) out.issues.push('canvas clipped horizontally');
      if (r.bottom > innerHeight + 1 || r.top < -1) out.issues.push(`canvas clipped vertically (top ${Math.round(r.top)} bottom ${Math.round(r.bottom)} vs ${innerHeight})`);
    }
    const small = [];
    for (const b of document.querySelectorAll('button, .btn, [role=button]')) {
      if (!vis(b)) continue; const r = b.getBoundingClientRect();
      const scrollable = (() => { let p = b.parentElement; while (p && p !== document.body) { const o = getComputedStyle(p).overflowY; if (o === 'auto' || o === 'scroll') return true; p = p.parentElement; } return false; })();
      if (!scrollable && (r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.top < -1)) out.issues.push(`button "${(b.id || b.textContent.trim()).slice(0, 18)}" outside viewport`);
      if (r.height < 36 || r.width < 36) small.push(`${(b.id || b.textContent.trim()).slice(0, 14)}:${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    if (small.length) out.smallButtons = small.slice(0, 8);
    return out;
  });
}

const results = [];
for (const id of ids) {
  const url = `http://127.0.0.1:${PORT}/${id}.html`;
  for (const mode of (process.env.MODES ? process.env.MODES.split(',') : ['desktop', 'mobile', 'mobile-se', 'tablet', 'tablet-land'])) {
    const mobile = mode.startsWith('mobile') || mode.startsWith('tablet');
    const ctx = await browser.newContext(mode === 'mobile'
      ? { ...devices['iPhone 13'], deviceScaleFactor: 2 }
      : mode === 'mobile-se' ? { ...devices['iPhone SE'], deviceScaleFactor: 2 }
      : mode === 'tablet' ? { ...devices['iPad (gen 7)'], deviceScaleFactor: 1 }
      : mode === 'tablet-land' ? { ...devices['iPad (gen 7) landscape'], deviceScaleFactor: 1 }
      : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/font|ERR_|net::|favicon|Failed to load resource/i.test(m.text())) errs.push('console: ' + m.text()); });
    await page.addInitScript(INIT);
    const r = { id, mode, errs };
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(600);
      if (process.env.SHOTS) await page.screenshot({ path: path.join(OUT, `${id}-${mode}-0title.png`) });
      r.title = await layoutReport(page);
      if (mobile) { // emulate the first real touch (reveals touch controls)
        await page.touchscreen.tap(5, 5).catch(() => {});
      }
      r.start = await clickStart(page);
      await page.waitForTimeout(900);
      if (process.env.SHOTS) await page.screenshot({ path: path.join(OUT, `${id}-${mode}-1play.png`) });
      await feedInput(page, mobile);
      await page.waitForTimeout(1500);
      r.play = await layoutReport(page);
      if (process.env.SHOTS) await page.screenshot({ path: path.join(OUT, `${id}-${mode}-2input.png`) });
      r.pageErrs = await page.evaluate(() => window.__errs);
      r.posted = await page.evaluate(() => window.__posted);
    } catch (e) { r.fatal = e.message.split('\n')[0]; }
    await ctx.close();
    results.push(r);
    const flags = [...(r.errs || []), ...(r.pageErrs || []), ...((r.title && r.title.issues) || []).map(s => 'title: ' + s), ...((r.play && r.play.issues) || []).map(s => 'play: ' + s)];
    console.log(`${flags.length ? '✗' : '✓'} ${id} [${mode}] start=${r.start} touch=${r.play && r.play.touchClass} canvas=${r.play && r.play.canvas ? r.play.canvas.w + 'x' + r.play.canvas.h + '@' + r.play.canvas.y : '-'}${r.play && r.play.smallButtons ? ' small=' + r.play.smallButtons.join(',') : ''}${r.fatal ? ' FATAL ' + r.fatal : ''}`);
    for (const f of flags) console.log('    ' + f);
  }
}
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
await browser.close(); server.close();
