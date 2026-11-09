import type { Game, Play, DailyEntry } from './types';

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(s: string): string {
  try {
    return new Date(s.length === 10 ? s + 'T00:00:00Z' : s).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
  } catch { return s; }
}


function msUntilMidnightUTC(): number {
  const t = new Date();
  t.setUTCHours(24, 0, 0, 0);
  return t.getTime() - Date.now();
}

function formatCountdown(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

// Real image files (worker/public), not a data: URI, so link unfurlers (Slack, iMessage…)
// can show the site icon next to "newtab.party". Generated from extension/icons/icon128.png.
const FAVICON = `<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" href="/favicon.png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">`;

// ── Leaderboard name reporting (App Store guideline 1.2) ──
// Every named score gets a small flag. First tap arms it ("Report?"), second tap
// sends POST /api/plays/:id/report and hides that name for this viewer right away
// (localStorage 'blockedNames'). The server hides it for everyone once enough
// different people report it (src/moderation.ts). The extension mirrors this in
// newtab.js / newtab.html.

function nameCell(s: Play): string {
  if (!s.player_name) return '<span class="anon">—</span>';
  return `<span class="pn">${esc(s.player_name)}</span><button type="button" class="report-btn" data-play="${s.id}" title="Report this name" aria-label="Report this name">⚑</button>`;
}

const REPORT_CSS = `
  .player-name .report-btn { margin-left: 8px; background: none; border: 0; color: rgba(255,255,255,0.18); font-size: 11px; cursor: pointer; padding: 2px 5px; border-radius: 4px; font-family: inherit; vertical-align: 1px; }
  .player-name .report-btn:hover, .player-name .report-btn:focus-visible { color: rgba(255,255,255,0.6); }
  .player-name .report-btn.confirm { color: #ff9a9a; background: rgba(255,90,90,0.14); }
  .player-name .report-btn.done { color: rgba(255,255,255,0.3); cursor: default; }`;

const REPORT_JS = `
(function () {
  var KEY = 'blockedNames';
  function blocked() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function hideBlocked() {
    var b = blocked().map(function (n) { return String(n).toLowerCase(); });
    document.querySelectorAll('.player-name .pn').forEach(function (el) {
      if (b.indexOf(el.textContent.toLowerCase()) >= 0) el.parentNode.innerHTML = '<span class="anon">Hidden</span>';
    });
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.report-btn');
    if (!btn || btn.classList.contains('done')) return;
    if (!btn.classList.contains('confirm')) {
      btn.classList.add('confirm'); btn.textContent = 'Report?';
      setTimeout(function () { if (!btn.classList.contains('done')) { btn.classList.remove('confirm'); btn.textContent = '⚑'; } }, 4000);
      return;
    }
    btn.classList.remove('confirm'); btn.classList.add('done'); btn.textContent = 'Reported';
    var pn = btn.parentNode.querySelector('.pn'), name = pn ? pn.textContent : '';
    fetch('/api/plays/' + btn.getAttribute('data-play') + '/report', { method: 'POST' }).catch(function () {});
    if (name) {
      var b = blocked();
      if (b.indexOf(name) < 0) { b.push(name); try { localStorage.setItem(KEY, JSON.stringify(b.slice(-200))); } catch (e) {} }
    }
    setTimeout(hideBlocked, 900);
  });
  hideBlocked();
})();`;

// ── renderArcade ─────────────────────────────────────

// Link-preview (Slack, Facebook, iMessage, X…) tags for the arcade page:
// "Today's game is <name>" plus today's 1200x630 share card (the logo centered on the
// dark background, built by scripts/gen_share.mjs so unfurlers don't crop it).
function shareMeta(game: Game | null, origin: string): string {
  const title = game ? `Today's game is ${game.name}` : 'newtab.party';
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="newtab.party">`,
    `<meta property="og:url" content="${esc(origin)}/">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
  ];
  if (game) {
    const img = `${origin}/games/share/${encodeURIComponent(game.id)}.jpg`;
    tags.push(
      `<meta property="og:image" content="${esc(img)}">`,
      `<meta property="og:image:type" content="image/jpeg">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta property="og:image:alt" content="${esc(game.name)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:image" content="${esc(img)}">`,
      `<meta name="twitter:image:alt" content="${esc(game.name)}">`,
    );
  } else {
    tags.push(`<meta name="twitter:card" content="summary">`);
  }
  return tags.join('\n');
}

export function renderArcade({ game = null, origin = 'https://newtab.party' }: { game?: Game | null; origin?: string } = {}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Arcade</title>
${shareMeta(game, origin)}
${FAVICON}
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: #080810; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; overflow: hidden; overscroll-behavior: none; }
  #app { display: flex; flex-direction: column; height: 100%; }
  #topbar { display: flex; align-items: baseline; justify-content: space-between; padding: 0 16px; height: 40px; line-height: 40px; flex-shrink: 0; background: rgba(8,8,16,0.9); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(255,255,255,0.07); gap: 12px; z-index: 10; overflow: visible; }
  #game-title-wrap { position: relative; line-height: normal; display: flex; align-items: baseline; gap: 6px; min-width: 0; }
  #game-title-wrap.has-tip { cursor: help; }
  #game-brand { font-size: 13px; flex-shrink: 0; }
  #game-title { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.55); white-space: nowrap; }
  #game-tooltip { display: none; position: absolute; top: calc(100% + 6px); left: 0; background: #1a1a28; border: 1px solid rgba(255,255,255,0.12); border-radius: 7px; padding: 12px 14px; min-width: 200px; max-width: 320px; z-index: 50; pointer-events: none; white-space: normal; }
  #game-title-wrap.has-tip:hover #game-tooltip, #game-title-wrap.has-tip.show #game-tooltip { display: block; }
  #game-tooltip-desc { font-size: 12px; color: rgba(255,255,255,0.6); line-height: 1.5; margin-bottom: 6px; }
  #game-tooltip-controls { font-size: 11px; color: rgba(255,255,255,0.35); font-style: italic; }
  #game-date { font-size: 10px; color: rgba(255,255,255,0.25); white-space: nowrap; letter-spacing: 1px; text-transform: uppercase; flex: 1; }
  #high-score { font-size: 11px; color: rgba(255,255,255,0.4); white-space: nowrap; transition: color 0.3s; min-width: 80px; text-align: center; }
  #high-score.new-best { color: #ffd700; animation: scorePop 0.35s ease; }
  @keyframes scorePop { 0%,100%{transform:scale(1)} 50%{transform:scale(1.18)} }
  .topbar-actions { display: flex; gap: 6px; align-items: baseline; flex-shrink: 0; line-height: normal; }
  .btn-link { background: none; border: none; color: rgba(255,255,255,0.4); font-size: 11px; cursor: pointer; padding: 4px 6px; font-family: inherit; transition: color 0.12s; text-decoration: none; }
  .btn-link:hover { color: rgba(255,255,255,0.75); }
  .btn-install { background: rgba(255,215,0,0.14); border: 1px solid rgba(255,215,0,0.38); color: #ffd700; font-size: 11px; font-weight: 700; cursor: pointer; padding: 5px 11px; border-radius: 5px; letter-spacing: 1px; transition: background 0.12s, transform 0.12s; text-decoration: none; text-transform: uppercase; font-family: inherit; white-space: nowrap; }
  .btn-install:hover { background: rgba(255,215,0,0.26); transform: translateY(-1px); }
  @media (max-width: 600px) {
    #game-title-wrap { flex: 1; min-width: 0; }
    #game-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    #game-date { display: none; }
    #high-score { display: none; }
    .btn-install { display: none; }
  }
  #game-frame-wrap { flex: 1; position: relative; overflow: hidden; }
  #game-frame { width: 100%; height: 100%; border: none; display: block; }
  #loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #080810; color: rgba(255,255,255,0.25); font-size: 12px; letter-spacing: 2px; text-transform: uppercase; transition: opacity 0.3s; }
  #loading.hidden { opacity: 0; pointer-events: none; }
  #about-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.72); z-index: 100; align-items: center; justify-content: center; padding: 20px; }
  #about-overlay.open { display: flex; }
  #about-modal { background: #111118; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; max-width: 700px; width: 100%; max-height: 88vh; overflow-y: auto; padding: 44px 48px 40px; position: relative; }
  @media (max-width: 600px) { #about-overlay { align-items: flex-start; overflow-y: auto; padding: 10px; } #about-modal { max-height: none; padding: 24px 16px 24px; } }
  #about-modal::-webkit-scrollbar { width: 6px; }
  #about-modal::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
  #about-close { position: absolute; top: 14px; right: 16px; background: none; border: none; color: rgba(255,255,255,0.3); cursor: pointer; font-size: 22px; padding: 4px 8px; border-radius: 4px; transition: color 0.12s; line-height: 1; font-family: inherit; }
  #about-close:hover { color: rgba(255,255,255,0.7); }
  #about-modal .modal-section { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2.5px; color: rgba(255,255,255,0.3); margin: 28px 0 10px; }
  #about-modal p, #about-modal li { color: rgba(255,255,255,0.7); font-size: 14px; line-height: 1.65; margin-bottom: 6px; }
  .about-link { color: rgba(255,255,255,0.55); text-decoration: underline; text-decoration-color: rgba(255,255,255,0.2); text-underline-offset: 2px; transition: color 0.12s, text-decoration-color 0.12s; }
  .about-link:hover { color: rgba(255,255,255,0.85); text-decoration-color: rgba(255,255,255,0.5); }
  #about-modal ol { padding-left: 18px; }
  #about-modal code { background: rgba(255,255,255,0.09); padding: 2px 7px; border-radius: 4px; font-family: 'SF Mono','Monaco',monospace; font-size: 12px; color: #e2e8f0; }
  #about-game-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px,1fr)); gap: 8px; margin: 4px 0; }
  .recent-game-link { text-decoration: none; color: inherit; display: block; }
  .about-game-card { position: relative; aspect-ratio: 1 / 1; background: #14141f; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; overflow: hidden; transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease; }
  .recent-game-link:hover .about-game-card { transform: translateY(-3px) scale(1.02); border-color: rgba(255,255,255,0.3); box-shadow: 0 10px 30px rgba(0,0,0,0.55); }
  .about-game-card.is-today { border-color: #ffd700; box-shadow: 0 0 0 1px #ffd700, 0 8px 30px rgba(255,215,0,0.18); }
  .about-game-logo { position: absolute; inset: 0; margin: auto; max-width: 82%; max-height: 82%; object-fit: contain; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.45)); }
  .about-game-date { position: absolute; top: 6px; left: 8px; z-index: 2; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.55); text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
  .modal-links { margin-top: 32px; display: flex; gap: 10px; flex-wrap: wrap; }
  .modal-links a, .modal-links button { color: #e5e7eb; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); border-radius: 5px; padding: 9px 16px; text-decoration: none; font-size: 13px; font-weight: 500; transition: background 0.12s; cursor: pointer; font-family: inherit; }
  .modal-links a:hover, .modal-links button:hover { background: rgba(255,255,255,0.16); }
  #name-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 200; align-items: flex-end; justify-content: center; padding-bottom: 32px; }
  #name-overlay.open { display: flex; }
  #name-modal { background: #111118; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 24px 28px; width: 340px; }
  #name-modal .name-rank { font-size: 13px; font-weight: 700; color: #ffd700; margin-bottom: 8px; }
  #name-modal p { color: rgba(255,255,255,0.45); font-size: 12px; margin-bottom: 14px; }
  #name-input { width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); border-radius: 5px; color: #e5e7eb; font-size: 13px; font-family: inherit; padding: 8px 11px; margin-bottom: 12px; outline: none; }
  #name-input:focus { border-color: rgba(255,255,255,0.3); }
  .name-btns { display: flex; gap: 8px; }
  #name-submit-btn { flex: 1; background: rgba(255,215,0,0.12); border: 1px solid rgba(255,215,0,0.3); color: #ffd700; font-size: 12px; font-family: inherit; padding: 7px; border-radius: 4px; cursor: pointer; transition: background 0.12s; }
  #name-submit-btn:hover { background: rgba(255,215,0,0.22); }
  #name-skip-btn { background: none; border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.3); font-size: 12px; font-family: inherit; padding: 7px 14px; border-radius: 4px; cursor: pointer; }
  #name-skip-btn:hover { color: rgba(255,255,255,0.6); }
  .name-error { color: #ff9a9a; font-size: 12px; margin: -6px 0 12px; }
</style>
</head>
<body>
<div id="app">
  <div id="topbar">
    <div id="game-title-wrap" role="button" tabindex="0" aria-label="Show how to play">
      <span id="game-brand">🥳</span>
      <span id="game-title"></span>
      <div id="game-tooltip">
        <div id="game-tooltip-desc"></div>
        <div id="game-tooltip-controls"></div>
      </div>
    </div>
    <span id="game-date"></span>
    <span id="high-score"></span>
    <div class="topbar-actions">
      <a class="btn-install" href="https://chromewebstore.google.com/detail/newtabparty/hhledeikahmmaakcgcapeklbajaganbm" target="_blank" rel="noopener">+ Add to Chrome</a>
      <a class="btn-link" href="/games">All games</a>
      <a class="btn-link" id="lb-link" href="/leaderboard">Leaderboard</a>
      <button class="btn-link" onclick="openAbout()">About</button>
    </div>
  </div>
  <div id="game-frame-wrap">
    <div id="loading">Loading…</div>
    <iframe id="game-frame" title="Game" tabindex="0"></iframe>
  </div>
</div>

<div id="name-overlay">
  <div id="name-modal">
    <div class="name-rank">You're #<span id="name-rank-val"></span> today!</div>
    <p>Add your name to the leaderboard</p>
    <input id="name-input" type="text" placeholder="Your name" maxlength="30" autocomplete="off">
    <p id="name-error" class="name-error" hidden></p>
    <div class="name-btns">
      <button id="name-submit-btn" onclick="submitName()">Save to leaderboard</button>
      <button id="name-skip-btn" onclick="skipName()">Skip</button>
    </div>
  </div>
</div>

<div id="about-overlay">
  <div id="about-modal">
    <button id="about-close" onclick="closeAbout()">×</button>
    <div class="modal-title">🥳 newtab.party</div>
    <p class="modal-subtitle" style="text-transform:none;letter-spacing:0;font-size:14px;color:rgba(255,255,255,0.4);margin-bottom:32px;">A new arcade game every day. Built by AI. Played by humans. Judged by the leaderboard.</p>
    <div class="modal-section">What is this?</div>
    <p>Every day at midnight UTC, a brand-new arcade game drops — same one for everyone, 24 hours to post your best score. After that the leaderboard locks and you're just playing for your own ego. You're already here, so you're already winning.</p>
    <div class="modal-section">Recent games</div>
    <div id="about-game-list"></div>
    <p style="margin-top:10px;"><a class="about-link" href="/games">See more in the Practice Room →</a></p>
    <div class="modal-section">Add your own game</div>
    <p style="margin-bottom:14px;">You don't need to know how to code games. Tell Claude what you want, iterate until it's fun, send a PR. Your game gets its own day on the rotation.</p>
    <ol>
      <li>Add the newtab.party plugin marketplace to Claude Code: <code>/plugin marketplace add jlyon/newtab-party</code> (<a href="https://code.claude.com/docs/en/discover-plugins" target="_blank" class="about-link">docs</a>)</li>
      <li>Use the <code>/game-builder</code> skill to build your game</li>
      <li>Play to your heart's delight. Keep the chat going with the robots to get your game just right.</li>
      <li>Open a PR in the <a href="https://github.com/jlyon/newtab-party" target="_blank" class="about-link">GitHub repo</a> to get your game featured on its special date</li>
    </ol>
    <div class="modal-links">
      <a href="https://chromewebstore.google.com/detail/newtabparty/hhledeikahmmaakcgcapeklbajaganbm" target="_blank" rel="noopener" style="background:rgba(255,215,0,0.14);border-color:rgba(255,215,0,0.38);color:#ffd700;font-weight:700;">+ Add to Chrome</a>
      <a href="https://github.com/jlyon/newtab-party" target="_blank">GitHub repo →</a>
      <a href="/games">Practice room →</a>
      <button id="about-open-lb">Leaderboard →</button>
      <a href="/privacy">Privacy</a>
    </div>
  </div>
</div>

<script>
// Back-swipe guard: a stray edge swipe on a phone would leave the arcade mid-game.
// Push one history entry on first touch and re-push whenever the gesture pops it,
// so the swipe lands back on this page instead of navigating away.
window.addEventListener('touchstart', function () {
  try { history.pushState({ arcade: 1 }, '', location.href); } catch (e) {}
  window.addEventListener('popstate', function () { try { history.pushState({ arcade: 1 }, '', location.href); } catch (e) {} });
}, { once: true, passive: true });
const DAY_EPOCH = Date.UTC(2026, 4, 1);
let games = [], schedule = [], scheduleEpoch = null, currentGame = null, sessionHighScore = 0;
let sessionPlayId = null;
let lastEvaluatedScore = -1;

function dayNumber(ms) { return Math.floor((ms - DAY_EPOCH) / 86400000); }
function dayNumberFromStr(s) { const [y, m, d] = s.split('-').map(Number); return dayNumber(Date.UTC(y, m - 1, d)); }
// Daily pick — uses the explicit append-only schedule from games.json (anchored
// at scheduleEpoch); falls back to plain modulo. MUST match worker/src/index.ts
// getDailyGame and extension/newtab.js.
function dailyGame(gs) {
  if (!gs.length) return null;
  if (schedule.length && scheduleEpoch) {
    const off = dayNumber(Date.now()) - dayNumberFromStr(scheduleEpoch);
    const L = schedule.length;
    const id = schedule[((off % L) + L) % L];
    const g = gs.find(x => x.id === id);
    if (g) return g;
  }
  const day = dayNumber(Date.now());
  return gs[((day % gs.length) + gs.length) % gs.length];
}
function todayLabel() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function fmtDate(s) {
  try { return new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
  catch { return s; }
}

async function init() {
  const data = await fetch('/games.json').then(r => r.json());
  games = data.games || [];
  schedule = data.schedule || [];
  scheduleEpoch = data.scheduleEpoch || null;
  loadGame(dailyGame(games));
  loadRecentGames();
  window.addEventListener('message', handleMessage);
  // Keep keyboard focus on the game frame so games respond to keys without a
  // mouse click first. Re-grab focus on the events where the browser is most
  // likely to have parked focus elsewhere (tab shown, window refocused, any tap).
  window.addEventListener('focus', focusGame);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) focusGame(); });
  document.addEventListener('pointerdown', () => { setTimeout(focusGame, 0); });
  document.addEventListener('keydown', e => {
    if (e.key==='Escape') { closeAbout(); skipName(); document.getElementById('game-title-wrap').classList.remove('show'); return; }
    const anyModalOpen = document.getElementById('about-overlay').classList.contains('open') ||
      document.getElementById('name-overlay').classList.contains('open');
    if (anyModalOpen) return;
    const frame = document.getElementById('game-frame');
    if (document.activeElement !== frame) {
      e.preventDefault();
      focusGame();
      try {
        frame.contentWindow.dispatchEvent(new KeyboardEvent('keydown', {
          key: e.key, code: e.code, keyCode: e.keyCode, shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, repeat: e.repeat,
          bubbles: true, cancelable: true
        }));
      } catch(err) {}
    }
  });
  document.getElementById('about-overlay').addEventListener('click', e => { if (e.target===e.currentTarget) closeAbout(); });
  document.getElementById('name-overlay').addEventListener('click', e => { if (e.target===e.currentTarget) skipName(); });
  document.getElementById('name-input').addEventListener('keydown', e => { if (e.key==='Enter') submitName(); if (e.key==='Escape') skipName(); });
  // Tapping the title/icon toggles the how-to-play tooltip (for touch devices,
  // where there's no hover). Desktop still gets it on hover via CSS.
  const titleWrap = document.getElementById('game-title-wrap');
  titleWrap.addEventListener('click', e => {
    if (!titleWrap.classList.contains('has-tip')) return;
    e.stopPropagation();
    titleWrap.classList.toggle('show');
  });
  document.addEventListener('click', () => titleWrap.classList.remove('show'));
}

async function loadRecentGames() {
  try {
    const recentDays = await fetch('/api/recent-days').then(r => r.json());
    const listEl = document.getElementById('about-game-list');
    listEl.innerHTML = '';
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const { date, game: g } of recentDays) {
      const isToday = date === todayStr;
      const href = isToday ? '/leaderboard' : '/play/' + date;
      const dateLabel = isToday ? 'Today' : fmtDate(date);
      const link = document.createElement('a');
      link.className = 'recent-game-link';
      link.href = href;
      link.innerHTML = '<div class="about-game-card' + (isToday ? ' is-today' : '') + '">' +
        (g.id ? '<img class="about-game-logo" src="/games/logos/' + esc(g.id) + '.png" alt="' + esc(g.name) + '" loading="lazy">' : '') +
        '<span class="about-game-date">' + esc(dateLabel) + '</span>' +
        '</div>';
      listEl.appendChild(link);
    }
  } catch {}
}

function focusGame() {
  // Don't steal focus while a modal (about / name prompt) is open.
  if (document.getElementById('about-overlay').classList.contains('open') ||
      document.getElementById('name-overlay').classList.contains('open')) return;
  const frame = document.getElementById('game-frame');
  if (!frame) return;
  try { frame.focus(); } catch (e) {}
  // Also focus the inner window — needed in the extension where the iframe is
  // cross-origin and a synthetic-event bridge isn't possible.
  try { frame.contentWindow.focus(); } catch (e) {}
}

function loadGame(game) {
  if (!game) return;
  currentGame = game; sessionHighScore = 0; sessionPlayId = null;
  document.getElementById('game-title').textContent = game.name;
  document.getElementById('game-date').textContent = todayLabel();
  document.getElementById('high-score').textContent = '';
  document.getElementById('high-score').classList.remove('new-best');
  const wrap = document.getElementById('game-title-wrap');
  wrap.classList.remove('show');
  if (game.description || game.controls) {
    document.getElementById('game-tooltip-desc').textContent = game.description || '';
    document.getElementById('game-tooltip-controls').textContent = game.controls || '';
    wrap.classList.add('has-tip');
  } else {
    wrap.classList.remove('has-tip');
  }
  // Games carry their own title screen with instructions now, so just load the
  // frame behind the loading shimmer — no pre-game how-to overlay here.
  const frame = document.getElementById('game-frame');
  const loading = document.getElementById('loading');
  loading.classList.remove('hidden'); loading.textContent = 'Loading…';
  frame.onload = () => { loading.classList.add('hidden'); focusGame(); };
  frame.src = '/' + game.file;
}

function handleMessage(event) {
  const d = event.data;
  if (!d || typeof d.highScore !== 'number') return;
  const score = Math.floor(d.highScore);
  if (score <= 0) return;
  // Topbar "Best" reflects the best score of this local session.
  if (score > sessionHighScore) {
    sessionHighScore = score;
    const el = document.getElementById('high-score');
    el.textContent = 'Best: ' + score.toLocaleString();
    el.classList.remove('new-best'); void el.offsetWidth; el.classList.add('new-best');
  }
  if (!currentGame) return;
  // Offer the leaderboard whenever the score makes the day's top board —
  // not only when it beats the local session best. Dedupe identical scores
  // and don't stack prompts.
  if (score === lastEvaluatedScore) return;
  lastEvaluatedScore = score;
  if (document.getElementById('name-overlay').classList.contains('open')) return;
  maybePromptForScore(currentGame.id, currentGame.name, score);
}

async function maybePromptForScore(gameId, gameName, score) {
  try {
    const q = await fetch('/api/qualify?gameId=' + encodeURIComponent(gameId) + '&score=' + score).then(r => r.ok ? r.json() : null);
    if (!q || !q.qualifies) return;   // not in today's top scores — don't pester
    const r = await fetch('/api/plays', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ gameId, gameName, score }) });
    if (!r.ok) return;
    const { id, rank } = await r.json();
    sessionPlayId = id;
    showNamePrompt(rank);
  } catch {}
}

function showNamePrompt(rank) {
  const saved = localStorage.getItem('playerName');
  document.getElementById('name-error').hidden = true;
  document.getElementById('name-rank-val').textContent = rank;
  document.getElementById('name-input').value = saved || '';
  document.getElementById('name-overlay').classList.add('open');
  document.getElementById('name-input').focus();
  if (saved) document.getElementById('name-input').select();
}
function closeNamePrompt() {
  document.getElementById('name-overlay').classList.remove('open');
}
// Skipping means "don't put me on the leaderboard" — delete the pending anonymous play.
function skipName() {
  closeNamePrompt();
  discardPlay();
}
function discardPlay() {
  const id = sessionPlayId;
  sessionPlayId = null;
  if (!id) return;
  fetch('/api/plays/' + id, { method: 'DELETE' }).catch(()=>{});
}
function submitName() {
  const name = document.getElementById('name-input').value.trim();
  if (!name || !sessionPlayId) { skipName(); return; }
  const id = sessionPlayId;
  const err = document.getElementById('name-error');
  err.hidden = true;
  fetch('/api/plays/' + id, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ playerName: name }) })
    .then(r => {
      // The name filter said no: keep the prompt open so they can pick another.
      if (r.status === 422) {
        return r.json().catch(() => ({})).then(d => {
          err.textContent = d.message || 'That name is not allowed. Please pick another.';
          err.hidden = false;
          document.getElementById('name-input').focus();
        });
      }
      sessionPlayId = null;
      localStorage.setItem('playerName', name);
      closeNamePrompt();
    })
    .catch(() => { sessionPlayId = null; closeNamePrompt(); });
}

function openAbout() { document.getElementById('about-overlay').classList.add('open'); }
function closeAbout() { document.getElementById('about-overlay').classList.remove('open'); }
document.getElementById('about-open-lb').addEventListener('click', () => { closeAbout(); window.location.href = '/leaderboard'; });
function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

init();
</script>
</body>
</html>`;
}

// ── renderGamesCalendar ──────────────────────────────
// The /games "practice room" (the topbar's "All games" link) — every game laid out
// on a calendar, each cell showing the game's logo. On phones the week grid becomes a
// newest-first tile grid (today first, no weekday columns). Past days replay for
// practice; today is the only one that counts toward the leaderboard.

export interface CalCell {
  date: string;        // YYYY-MM-DD
  game: Game | null;
  isToday: boolean;
  isFuture: boolean;
}

// /games sort views (?sort=...). The calendar is the default when no sort is given.
export const GAME_SORTS = ['plays', 'boards', 'named', 'newest', 'az'] as const;
export type GameSort = (typeof GAME_SORTS)[number];
const SORT_LABELS: Record<GameSort, string> = {
  plays: 'Most played',
  boards: 'Most leaderboards',
  named: 'Most names on the board',
  newest: 'Newest',
  az: 'A–Z',
};

export interface RankedGame {
  game: Game;
  plays: number;
  boards: number;            // days it had a leaderboard
  named: number;             // named scores on its boards
  debut: string;             // YYYY-MM-DD it first aired
  lastAired: string | null;  // most recent airing up to today (null: only legacy plays on record)
  isToday: boolean;
  retired: boolean;
}

export interface RetiredEntry {
  game: Game;
  lastAired: string | null;   // YYYY-MM-DD of its final airing, if one is in range
}

// Shared look for the practice room (/games) and the retired wing (/games/retired).
const PRACTICE_CSS = `  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #080810; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; min-height: 100vh; padding: 44px 20px 80px; }
  .wrap { max-width: 1080px; margin: 0 auto; }
  .kicker { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; color: rgba(255,215,0,0.6); margin-bottom: 10px; }
  h1 { font-size: clamp(28px, 5vw, 44px); font-weight: 800; letter-spacing: -0.5px; margin-bottom: 14px; }
  .blurb { font-size: 15px; line-height: 1.6; color: rgba(255,255,255,0.55); max-width: 640px; margin-bottom: 6px; }
  .blurb b { color: #ffd700; font-weight: 700; }
  .legend { display: flex; gap: 18px; flex-wrap: wrap; font-size: 11px; color: rgba(255,255,255,0.4); margin: 22px 0 18px; }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .dot.today { background: #ffd700; }
  .dot.past { background: rgba(255,255,255,0.35); }
  .dot.future { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); }
  .cal-head { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 8px; }
  .cal-head div { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,0.28); text-align: center; padding-bottom: 2px; }
  .cal-week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 8px; }
  .cal-cell { position: relative; aspect-ratio: 1 / 1; border-radius: 10px; overflow: hidden; background-color: #14141f; border: 1px solid rgba(255,255,255,0.07); display: block; text-decoration: none; color: #fff; transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease; }
  .cal-logo { position: absolute; inset: 0; margin: auto; max-width: 82%; max-height: 82%; object-fit: contain; z-index: 1; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.45)); transition: transform 0.12s ease; }
  a.cal-cell:hover { transform: translateY(-3px) scale(1.02); border-color: rgba(255,255,255,0.3); box-shadow: 0 10px 30px rgba(0,0,0,0.55); z-index: 2; }
  a.cal-cell:hover .cal-logo { transform: scale(1.05); }
  .cal-day { position: absolute; top: 6px; left: 8px; z-index: 2; font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.5); text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
  .cal-badge { position: absolute; bottom: 6px; left: 0; right: 0; text-align: center; z-index: 2; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #ffd700; text-shadow: 0 1px 4px rgba(0,0,0,0.95); }
  .cal-lock { position: absolute; inset: 0; margin: auto; width: 1.4em; height: 1.4em; display: flex; align-items: center; justify-content: center; z-index: 1; font-size: 18px; opacity: 0.4; }
  .cal-cell.is-today { border-color: #ffd700; box-shadow: 0 0 0 1px #ffd700, 0 8px 30px rgba(255,215,0,0.18); }
  .cal-cell.is-future { opacity: 0.5; cursor: default; }
  .cal-cell.is-empty { opacity: 0.3; cursor: default; }
  .retired-kicker { margin-top: 40px; color: rgba(255,255,255,0.35); }
  .retired-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-top: 18px; }
  .cal-cell.is-retired { filter: saturate(0.6); opacity: 0.8; }
  a.cal-cell.is-retired:hover { filter: none; opacity: 1; }
  .foot { margin-top: 30px; font-size: 12px; color: rgba(255,255,255,0.28); }
  .foot a { color: rgba(255,255,255,0.5); }
  .cal-wd { display: none; }
  /* Big screens (desktop, TV): a wider calendar with bigger tiles and labels. */
  @media (min-width: 1400px) { .wrap { max-width: 1240px; } .cal-day { font-size: 14px; } .cal-badge { font-size: 11px; } }
  /* Short landscape (phone sideways, TV): tighter intro so the calendar starts above the fold. */
  @media (max-height: 560px) and (orientation: landscape) {
    body { padding-top: 22px; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    .blurb { font-size: 13px; line-height: 1.5; }
    .legend { margin: 12px 0 12px; }
  }
  /* Phones: drop the weekday columns. Every aired game becomes a tile in one grid,
     newest first (today on top), labelled with its weekday and date. */
  @media (max-width: 600px) {
    body { padding: 28px 16px 60px; }
    .blurb { font-size: 14px; }
    .cal-head { display: none; }
    .cal { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; }
    .cal-week { display: contents; }
    .cal .cal-cell { order: var(--rev); }
    .cal .cal-cell.is-empty, .cal .cal-cell.is-future { display: none; }
    .cal-wd { display: inline; }
    .cal-day { font-size: 11px; color: rgba(255,255,255,0.6); }
    .cal-logo { top: 26px; bottom: 6px; max-height: 70%; }
    .cal-cell.is-today .cal-logo { bottom: 20px; max-height: 60%; }
    .cal-cell { border-radius: 8px; }
    .cal-badge { font-size: 9px; }
    .retired-grid { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); }
    .legend .future-key { display: none; }
  }
  .sort { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 22px 0 18px; }
  .sort-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,0.35); margin-right: 4px; }
  .sort a { padding: 7px 13px; border-radius: 999px; background: #14141f; border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); font-size: 13px; font-weight: 600; text-decoration: none; transition: border-color 0.12s ease, color 0.12s ease; }
  .sort a:hover { border-color: rgba(255,255,255,0.3); color: #fff; }
  .sort a[aria-current] { background: #ffd700; border-color: #ffd700; color: #14141f; }
  .sort + .legend { margin-top: 0; }
  .rank-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 18px; }
  .rank-item { display: flex; flex-direction: column; gap: 8px; text-decoration: none; color: inherit; }
  .rank-item .cal-cell { width: 100%; }
  a.rank-item:hover .cal-cell { transform: translateY(-3px) scale(1.02); border-color: rgba(255,255,255,0.3); box-shadow: 0 10px 30px rgba(0,0,0,0.55); filter: none; opacity: 1; }
  .rank-num { position: absolute; top: 6px; left: 8px; z-index: 2; font-size: 13px; font-weight: 800; color: rgba(255,255,255,0.6); text-shadow: 0 1px 3px rgba(0,0,0,0.9); }
  .rank-item:nth-child(-n+3) .rank-num { color: #ffd700; }
  .rank-tag { position: absolute; bottom: 6px; left: 0; right: 0; text-align: center; z-index: 2; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.55); text-shadow: 0 1px 4px rgba(0,0,0,0.95); }
  .rank-cap { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.85); line-height: 1.3; }
  .rank-cap small { display: block; font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.4); margin-top: 3px; }
  .rank-cap small b { color: rgba(255,255,255,0.8); font-weight: 700; }
  @media (max-width: 600px) {
    .sort { gap: 6px; margin: 18px 0 14px; }
    .sort-label { width: 100%; }
    .sort a { padding: 6px 11px; font-size: 12px; }
    .rank-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; }
  }
  @media (min-width: 1400px) { .rank-grid { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); } }
  .retired-link { display: inline-flex; align-items: center; gap: 10px; margin-top: 32px; padding: 12px 18px; border-radius: 10px; background: #14141f; border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.75); font-size: 14px; font-weight: 600; text-decoration: none; transition: border-color 0.12s ease, color 0.12s ease; }
  .retired-link:hover { border-color: rgba(255,255,255,0.3); color: #fff; }
  .retired-link .count { font-size: 11px; color: rgba(255,255,255,0.4); font-weight: 700; }
  .retired-page .retired-grid { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 18px; margin-top: 26px; }
  .retired-item { display: flex; flex-direction: column; gap: 8px; text-decoration: none; color: inherit; }
  .retired-item .cal-cell { width: 100%; }
  .retired-cap { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.8); line-height: 1.3; }
  .retired-cap small { display: block; font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.4); margin-top: 2px; }
  a.retired-item:hover .cal-cell { transform: translateY(-3px) scale(1.02); border-color: rgba(255,255,255,0.3); box-shadow: 0 10px 30px rgba(0,0,0,0.55); filter: none; opacity: 1; }
  @media (max-width: 560px) { .retired-page .retired-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; } }
`;

export function renderGamesCalendar({ today, cells, retiredCount = 0, sort = null, ranked = [] }: { today: string; cells: CalCell[]; retiredCount?: number; sort?: GameSort | null; ranked?: RankedGame[] }): string {
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const cellHtml = (c: CalCell, i: number): string => {
    const d = new Date(c.date + 'T00:00:00Z');
    // "5" in the week grid; "Thu, Nov 5" in the phone tile grid (the .cal-wd part is phone-only).
    const dayNum = `<span class="cal-wd">${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} </span>${d.getUTCDate()}`;
    const rev = ` style="--rev:${-i}"`;
    // Empty grid padding — no game scheduled on this day.
    if (!c.game) {
      return `<div class="cal-cell is-empty"${rev}><span class="cal-day">${dayNum}</span></div>`;
    }
    const name = esc(c.game.name);
    // Upcoming games stay hidden — locked placeholder, no logo or title revealed.
    if (c.isFuture) {
      return `<div class="cal-cell is-future"${rev}><span class="cal-day">${dayNum}</span><span class="cal-lock">🔒</span></div>`;
    }
    const logo = `<img class="cal-logo" src="/games/logos/${c.game.id}.png" alt="${name}" loading="lazy">`;
    const badge = c.isToday ? `<span class="cal-badge">Today · counts</span>` : '';
    const href = c.isToday ? '/' : `/play/${c.date}`;
    const cls = c.isToday ? 'cal-cell is-today' : 'cal-cell is-past';
    const label = c.isToday ? `Play today's game, ${name}` : `Practice ${name} from ${c.date}`;
    return `<a class="${cls}" href="${href}" aria-label="${esc(label)}"${rev}><span class="cal-day">${dayNum}</span>${logo}${badge}</a>`;
  };

  // Group into weeks of 7 (cells already start on a Sunday and end on a Saturday).
  let weeks = '';
  for (let i = 0; i < cells.length; i += 7) {
    weeks += `<div class="cal-week">${cells.slice(i, i + 7).map((c, j) => cellHtml(c, i + j)).join('')}</div>`;
  }

  const n = (x: number) => x.toLocaleString('en-US');
  const plural = (x: number, one: string, many: string) => `${n(x)} ${x === 1 ? one : many}`;
  // One stat line per game, leading with the number the list is sorted by.
  const statLine = (r: RankedGame): string => {
    const parts: Record<'plays' | 'boards' | 'named', string> = {
      plays: plural(r.plays, 'play', 'plays'),
      boards: plural(r.boards, 'leaderboard', 'leaderboards'),
      named: plural(r.named, 'name', 'names'),
    };
    if (sort === 'newest') return `Debuted ${esc(fmtDate(r.debut))} · ${parts.plays}`;
    const lead = sort === 'boards' || sort === 'named' ? sort : 'plays';
    const rest = (['plays', 'boards', 'named'] as const).filter((k) => k !== lead);
    return `<b>${parts[lead]}</b> · ${rest.map((k) => parts[k]).join(' · ')}`;
  };
  const rankItem = (r: RankedGame, i: number): string => {
    const name = esc(r.game.name);
    const tag = r.isToday ? `<span class="cal-badge">Today · counts</span>` : r.retired ? `<span class="rank-tag">Retired</span>` : '';
    const cls = `cal-cell${r.isToday ? ' is-today' : ''}${r.retired ? ' is-retired' : ''}`;
    const num = sort === 'az' || sort === 'newest' ? '' : `<span class="rank-num">#${i + 1}</span>`;
    const tile = `<div class="${cls}">${num}<img class="cal-logo" src="/games/logos/${r.game.id}.png" alt="" loading="lazy">${tag}</div>`;
    const cap = `<div class="rank-cap">${name}<small>${statLine(r)}</small></div>`;
    const href = r.isToday ? '/' : r.lastAired ? `/play/${r.lastAired}` : '';
    if (!href) return `<div class="rank-item">${tile}${cap}</div>`;
    const label = r.isToday ? `Play today's game, ${name}` : `Practice ${name}`;
    return `<a class="rank-item" href="${href}" aria-label="${esc(label)}">${tile}${cap}</a>`;
  };
  const sortNav = `<nav class="sort" aria-label="Sort games"><span class="sort-label">Sort</span>${
    [`<a href="/games"${sort ? '' : ' aria-current="page"'}>Calendar</a>`,
     ...GAME_SORTS.map((k) => `<a href="/games?sort=${k}"${sort === k ? ' aria-current="page"' : ''}>${SORT_LABELS[k]}</a>`)].join('')
  }</nav>`;
  const legend = `<div class="legend">
    <span><i class="dot today"></i> Today (counts on the leaderboard)</span>
    <span><i class="dot past"></i> Past game (practice, scores not saved)</span>
    <span class="future-key"><i class="dot future"></i> Not aired yet</span>
  </div>`;
  const body = sort
    ? `<div class="rank-grid">${ranked.map(rankItem).join('')}</div>`
    : `${legend}
  <div class="cal-head">${WEEKDAYS.map((d) => `<div>${d}</div>`).join('')}</div>
  <div class="cal">${weeks}</div>`;

  // Retired games live on their own page (/games/retired).
  const retiredHtml = retiredCount
    ? `<a class="retired-link" href="/games/retired">Retired games <span class="count">${retiredCount}</span> →</a>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>newtab.party — the practice room</title>
${FAVICON}
<style>
${PRACTICE_CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="kicker">The Practice Room</div>
  <h1>You found the back room.</h1>
  <p class="blurb">Recent games, all laid out for you to rehearse until your thumbs give out. Warm up, learn the patterns, run the table.</p>
  <p class="blurb">One catch: the leaderboard only remembers <b>today's game</b>. Everything else here is strictly you versus your own ego. No pressure. No glory. Just reps.</p>
  ${sortNav}
  ${body}
  ${retiredHtml}
  <div class="foot"><a href="/">← Back to today's game</a></div>
</div>
</body>
</html>`;
}

// ── /games/retired: games out of the rotation, still playable via their last airing ──
export function renderRetiredGames({ retired }: { retired: RetiredEntry[] }): string {
  const cell = ({ game, lastAired }: RetiredEntry): string => {
    const name = esc(game.name);
    const tile = `<div class="cal-cell is-retired"><img class="cal-logo" src="/games/logos/${game.id}.png" alt="" loading="lazy"></div>`;
    const cap = `<div class="retired-cap">${name}<small>${lastAired ? `Last aired ${esc(fmtDate(lastAired))}` : 'Retired'}</small></div>`;
    if (!lastAired) return `<div class="retired-item">${tile}${cap}</div>`;
    return `<a class="retired-item" href="/play/${lastAired}" aria-label="Practice ${name} (retired)">${tile}${cap}</a>`;
  };
  const body = retired.length
    ? `<div class="retired-grid">${retired.map(cell).join('')}</div>`
    : `<p class="blurb">Nobody has retired yet. Everyone is still on the roster.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>newtab.party · retired games</title>
${FAVICON}
<style>
${PRACTICE_CSS}
</style>
</head>
<body class="retired-page">
<div class="wrap">
  <div class="kicker">The Practice Room</div>
  <h1>The retired wing.</h1>
  <p class="blurb">Out of the daily rotation, never out of the building. Every game here is still open for practice; scores just aren't saved.</p>
  ${body}
  <div class="foot"><a href="/games">← Back to the practice room</a> · <a href="/">Today's game</a></div>
</div>
</body>
</html>`;
}

// ── renderLeaderboard ────────────────────────────────

export function renderLeaderboard({
  today,
  game,
  scores,
  totalToday,
  previousDays,
}: {
  today: string;
  game: Game | null;
  scores: Play[];
  totalToday: number;
  previousDays: DailyEntry[];
}): string {
  const countdown = formatCountdown(msUntilMidnightUTC());
  const footerNote = `${totalToday} ${totalToday === 1 ? 'play' : 'plays'} today`;

  const scoreRows = scores.length
    ? scores.slice(0, 20).map((s, i) => `
        <tr>
          <td class="rank">${i + 1}</td>
          <td class="player-name">${nameCell(s)}</td>
          <td class="score-val">${s.score.toLocaleString()}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" class="empty-row">No scores yet today — be the first</td></tr>`;

  const prevRows = previousDays.length
    ? previousDays.map((d) => {
        const dayLabel = fmtDate(d.play_date);
        const scoresHref = `/play/${d.play_date}?scores`;
        const scoresLabel = `See leaderboard for ${dayLabel}`;
        return `
        <tr>
          <td class="prev-date">${dayLabel}</td>
          <td class="prev-game"><a href="/play/${d.play_date}" class="prev-play-link" aria-label="Play ${esc(d.game_name)}">${esc(d.game_name)}</a></td>
          <td class="prev-top"><a href="${scoresHref}" class="prev-play-link" aria-label="${esc(scoresLabel)}">${d.top_score.toLocaleString()}</a></td>
          <td class="prev-plays"><a href="${scoresHref}" class="prev-play-link" aria-label="${esc(scoresLabel)}">${d.total_plays} plays</a></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="4" class="empty-row">No previous games yet</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>newtab.party — leaderboard</title>
${FAVICON}
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #080810; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; min-height: 100vh; padding: 48px 24px 80px; }
  .back { font-size: 12px; color: rgba(255,255,255,0.3); text-decoration: none; letter-spacing: 0.3px; transition: color 0.12s; }
  .back:hover { color: rgba(255,255,255,0.65); }
  .wrap { max-width: 600px; margin: 0 auto; }
  .top-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 32px; }
  .btn-install { background: rgba(255,215,0,0.14); border: 1px solid rgba(255,215,0,0.38); color: #ffd700; font-size: 11px; font-weight: 700; padding: 7px 14px; border-radius: 5px; letter-spacing: 1px; transition: background 0.12s, transform 0.12s; text-decoration: none; text-transform: uppercase; white-space: nowrap; }
  .btn-install:hover { background: rgba(255,215,0,0.26); transform: translateY(-1px); }
  @media (max-width: 600px) { .btn-install { display: none; } }
  .daily-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; color: rgba(255,255,255,0.25); margin-bottom: 6px; }
  .daily-game { font-size: 32px; font-weight: 800; letter-spacing: 1px; margin-bottom: 4px; }
  .daily-date { font-size: 13px; color: rgba(255,255,255,0.35); margin-bottom: 28px; }
  .title-row { display: flex; align-items: center; gap: 18px; margin-bottom: 28px; }
  .title-row > div { min-width: 0; }
  .title-logo { width: 84px; height: 84px; object-fit: contain; flex-shrink: 0; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.45)); }
  @media (max-width: 480px) { .title-logo { width: 64px; height: 64px; } }
  .title-row .daily-date { margin-bottom: 0; }
  .daily-desc { font-size: 13px; color: rgba(255,255,255,0.4); margin-bottom: 28px; line-height: 1.5; max-width: 480px; }
  .score-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  .score-table thead th { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.25); font-weight: 600; padding: 0 0 10px; text-align: left; }
  .score-table thead th.score-val { text-align: right; }
  .player-name { font-size: 13px; color: rgba(255,255,255,0.6); padding-right: 12px; }
  .score-table tbody tr:first-child .player-name { color: #ffd700; }
  .anon { color: rgba(255,255,255,0.2); }
  .score-table tbody tr { border-top: 1px solid rgba(255,255,255,0.05); }
  .score-table tbody tr:first-child { border-top: 1px solid rgba(255,255,255,0.1); }
  .rank { font-size: 12px; color: rgba(255,255,255,0.2); padding: 11px 16px 11px 0; width: 32px; }
  .score-table tbody tr:first-child .rank { color: #ffd700; font-weight: 700; }
  .score-val { font-size: 18px; font-weight: 700; color: #fff; text-align: right; letter-spacing: -0.5px; }
  .score-table tbody tr:first-child .score-val { color: #ffd700; font-size: 22px; }
  .empty-row { font-size: 13px; color: rgba(255,255,255,0.25); padding: 20px 0; text-align: center; }
  .footer-note { font-size: 12px; color: rgba(255,255,255,0.25); padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); }
  #countdown { font-variant-numeric: tabular-nums; }
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; color: rgba(255,255,255,0.2); margin: 48px 0 14px; }
  .prev-table { width: 100%; border-collapse: collapse; }
  .prev-table tbody tr { border-top: 1px solid rgba(255,255,255,0.05); }
  .prev-date { font-size: 12px; color: rgba(255,255,255,0.3); padding: 9px 16px 9px 0; white-space: nowrap; }
  .prev-game { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.7); flex: 1; }
  .prev-play-link { color: inherit; text-decoration: none; }
  .prev-play-link:hover { color: #fff; text-decoration: underline; text-underline-offset: 3px; }
  .prev-top { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.6); text-align: right; padding: 9px 16px; }
  .prev-plays { font-size: 11px; color: rgba(255,255,255,0.2); text-align: right; white-space: nowrap; }
  .page-foot { margin-top: 40px; font-size: 12px; color: rgba(255,255,255,0.25); }
  .page-foot a { color: rgba(255,255,255,0.45); text-decoration: none; }
  .page-foot a:hover { color: rgba(255,255,255,0.75); }
${REPORT_CSS}
</style>
</head>
<body>
<div class="wrap">
  <div class="top-row">
    <a class="back" href="/">← Play today's game</a>
    <a class="btn-install" href="https://chromewebstore.google.com/detail/newtabparty/hhledeikahmmaakcgcapeklbajaganbm" target="_blank" rel="noopener">+ Add to Chrome</a>
  </div>

  <div class="title-row">
    ${game ? `<img class="title-logo" src="/games/logos/${esc(game.id)}.png" alt="" onerror="this.remove()">` : ''}
    <div>
      <div class="daily-label">Today · ${fmtDate(today)}</div>
      <div class="daily-game">${esc(game?.name ?? 'No game configured')}</div>
      <div class="daily-date">${esc(game?.type ?? '')}</div>
    </div>
  </div>
  ${game?.description ? `<div class="daily-desc">${esc(game.description)}</div>` : ''}

  <table class="score-table">
    <thead>
      <tr>
        <th></th>
        <th>Player</th>
        <th class="score-val">Score</th>
      </tr>
    </thead>
    <tbody>${scoreRows}</tbody>
  </table>

  <div class="footer-note">${footerNote} · next game in <span id="countdown">${countdown}</span></div>

  <div class="section-title">Previous games</div>
  <table class="prev-table">
    <tbody>${prevRows}</tbody>
  </table>

  <div class="page-foot"><a href="/privacy">Privacy</a> · <a href="https://github.com/jlyon/newtab-party/issues" target="_blank" rel="noopener">Report a problem</a></div>
</div>
<script>${REPORT_JS}

function updateCountdown() {
  const t = new Date(); t.setUTCHours(24,0,0,0);
  const ms = t - Date.now();
  const h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000);
  const el = document.getElementById('countdown');
  if (el) el.textContent = h + 'h ' + m + 'm';
}
setInterval(updateCountdown, 30000);
</script>
</body>
</html>`;
}

// ── renderReplay ─────────────────────────────────────

export function renderReplay(
  game: Game,
  date: string,
  scores: Play[],
  totalPlays: number,
  openScores = false,
): string {
  const dateLabel = fmtDate(date);

  const scoreRows = scores.length
    ? scores.slice(0, 20).map((s, i) => `
        <tr>
          <td class="rank">${i + 1}</td>
          <td class="player-name">${nameCell(s)}</td>
          <td class="score-val">${s.score.toLocaleString()}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" class="empty-row">No scores were recorded for this day</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>${esc(game.name)} — ${esc(dateLabel)} — newtab.party</title>
${FAVICON}
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: #080810; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; overflow: hidden; overscroll-behavior: none; }
  #app { display: flex; flex-direction: column; height: 100%; }
  #topbar { display: flex; align-items: baseline; padding: 0 16px; height: 40px; line-height: 40px; flex-shrink: 0; background: rgba(8,8,16,0.9); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(255,255,255,0.07); gap: 12px; z-index: 10; overflow: visible; }
  #game-title-wrap { position: relative; line-height: normal; display: flex; align-items: baseline; gap: 6px; min-width: 0; }
  #game-title-wrap.has-tip { cursor: help; }
  #game-brand { font-size: 13px; flex-shrink: 0; }
  #game-title { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.55); white-space: nowrap; }
  #game-tooltip { display: none; position: absolute; top: calc(100% + 6px); left: 0; background: #1a1a28; border: 1px solid rgba(255,255,255,0.12); border-radius: 7px; padding: 12px 14px; min-width: 200px; max-width: 320px; z-index: 50; pointer-events: none; white-space: normal; }
  #game-title-wrap.has-tip:hover #game-tooltip, #game-title-wrap.has-tip.show #game-tooltip { display: block; }
  #game-tooltip-desc { font-size: 12px; color: rgba(255,255,255,0.6); line-height: 1.5; margin-bottom: 6px; }
  #game-tooltip-controls { font-size: 11px; color: rgba(255,255,255,0.35); font-style: italic; }
  #game-date { font-size: 10px; color: rgba(255,255,255,0.25); white-space: nowrap; letter-spacing: 1px; text-transform: uppercase; }
  #high-score { font-size: 11px; color: rgba(255,255,255,0.4); white-space: nowrap; min-width: 80px; text-align: center; }
  #high-score.new-best { color: #ffd700; animation: scorePop 0.35s ease; }
  @keyframes scorePop { 0%,100%{transform:scale(1)} 50%{transform:scale(1.18)} }
  .replay-badge { font-size: 10px; color: rgba(255,255,255,0.25); white-space: nowrap; letter-spacing: 1px; text-transform: uppercase; flex: 1; }
  .topbar-actions { display: flex; gap: 6px; align-items: baseline; flex-shrink: 0; line-height: normal; }
  .btn-link { background: none; border: none; color: rgba(255,255,255,0.4); font-size: 11px; cursor: pointer; padding: 4px 6px; font-family: inherit; transition: color 0.12s; text-decoration: none; }
  .btn-link:hover { color: rgba(255,255,255,0.75); }
  .btn-install { background: rgba(255,215,0,0.14); border: 1px solid rgba(255,215,0,0.38); color: #ffd700; font-size: 11px; font-weight: 700; cursor: pointer; padding: 5px 11px; border-radius: 5px; letter-spacing: 1px; transition: background 0.12s, transform 0.12s; text-decoration: none; text-transform: uppercase; font-family: inherit; white-space: nowrap; }
  .btn-install:hover { background: rgba(255,215,0,0.26); transform: translateY(-1px); }
  #game-frame-wrap { flex: 1; position: relative; overflow: hidden; }
  #game-frame { width: 100%; height: 100%; border: none; display: block; }
  #loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #080810; color: rgba(255,255,255,0.25); font-size: 12px; letter-spacing: 2px; text-transform: uppercase; transition: opacity 0.3s; }
  #loading.hidden { opacity: 0; pointer-events: none; }
  #scores-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.72); z-index: 100; align-items: center; justify-content: center; padding: 20px; }
  #scores-overlay.open { display: flex; }
  #scores-modal { background: #111118; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; max-width: 520px; width: 100%; max-height: 88vh; overflow-y: auto; padding: 44px 48px 40px; position: relative; }
  #scores-modal::-webkit-scrollbar { width: 6px; }
  #scores-modal::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
  .modal-close { position: absolute; top: 14px; right: 16px; background: none; border: none; color: rgba(255,255,255,0.3); cursor: pointer; font-size: 22px; padding: 4px 8px; border-radius: 4px; transition: color 0.12s; line-height: 1; font-family: inherit; }
  .modal-close:hover { color: rgba(255,255,255,0.7); }
  .modal-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; color: rgba(255,255,255,0.25); margin-bottom: 6px; }
  .modal-title { font-size: 30px; font-weight: 700; margin-bottom: 4px; }
  .modal-subtitle { color: rgba(255,255,255,0.3); font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 28px; }
  .title-row { display: flex; align-items: center; gap: 18px; margin-bottom: 28px; }
  .title-row > div { min-width: 0; }
  .title-logo { width: 84px; height: 84px; object-fit: contain; flex-shrink: 0; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.45)); }
  @media (max-width: 480px) { .title-logo { width: 64px; height: 64px; } }
  .title-row .modal-subtitle { margin-bottom: 0; }
  .score-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  .score-table thead th { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.25); font-weight: 600; padding: 0 0 10px; text-align: left; }
  .score-table thead th.r { text-align: right; }
  .score-table tbody tr { border-top: 1px solid rgba(255,255,255,0.05); }
  .score-table tbody tr:first-child { border-top: 1px solid rgba(255,255,255,0.1); }
  .rank { font-size: 12px; color: rgba(255,255,255,0.2); padding: 11px 16px 11px 0; width: 32px; }
  .score-table tbody tr:first-child .rank { color: #ffd700; font-weight: 700; }
  .player-name { font-size: 13px; color: rgba(255,255,255,0.6); padding-right: 12px; }
  .score-table tbody tr:first-child .player-name { color: #ffd700; }
  .anon { color: rgba(255,255,255,0.2); }
  .score-val { font-size: 18px; font-weight: 700; color: #fff; text-align: right; letter-spacing: -0.5px; }
  .score-table tbody tr:first-child .score-val { color: #ffd700; font-size: 22px; }
  .empty-row { font-size: 13px; color: rgba(255,255,255,0.25); padding: 20px 0; text-align: center; }
  .footer-note { font-size: 12px; color: rgba(255,255,255,0.25); padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); }
  .locked-note { font-size: 11px; color: rgba(255,200,0,0.35); margin-top: 6px; }
${REPORT_CSS}
  @media (max-width: 600px) { #game-title-wrap { flex: 1; min-width: 0; } #game-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; } #game-date { display: none; } #high-score { display: none; } .btn-install { display: none; } }
</style>
</head>
<body>
<div id="app">
  <div id="topbar">
    <div id="game-title-wrap"${game.description || game.controls ? ' class="has-tip" role="button" tabindex="0" aria-label="Show how to play"' : ''}>
      <span id="game-brand">🥳</span>
      <span id="game-title">${esc(game.name)}</span>
      ${game.description || game.controls ? `<div id="game-tooltip">
        <div id="game-tooltip-desc">${esc(game.description || '')}</div>
        <div id="game-tooltip-controls">${esc(game.controls || '')}</div>
      </div>` : ''}
    </div>
    <span id="game-date">${esc(dateLabel)}</span>
    <span id="high-score"></span>
    <span class="replay-badge">Replay · scores not saved</span>
    <div class="topbar-actions">
      <a class="btn-install" href="https://chromewebstore.google.com/detail/newtabparty/hhledeikahmmaakcgcapeklbajaganbm" target="_blank" rel="noopener">+ Add to Chrome</a>
      <button class="btn-link" onclick="document.getElementById('scores-overlay').classList.add('open')">Scores</button>
      <a class="btn-link" href="/games">All games</a>
      <a class="btn-link" href="/leaderboard">← Leaderboard</a>
    </div>
  </div>
  <div id="game-frame-wrap">
    <div id="loading">Loading…</div>
    <iframe id="game-frame" title="Game"></iframe>
  </div>
</div>

<div id="scores-overlay"${openScores ? ' class="open"' : ''}>
  <div id="scores-modal">
    <button class="modal-close" onclick="closeScores()">×</button>
    <div class="title-row">
      <img class="title-logo" src="/games/logos/${esc(game.id)}.png" alt="" onerror="this.remove()">
      <div>
        <div class="modal-label">${esc(dateLabel)}</div>
        <div class="modal-title">${esc(game.name)}</div>
        <div class="modal-subtitle">${esc(game.type ?? '')}</div>
      </div>
    </div>
    <table class="score-table">
      <thead>
        <tr><th></th><th>Player</th><th class="r">Score</th></tr>
      </thead>
      <tbody>${scoreRows}</tbody>
    </table>
    <div class="footer-note">${totalPlays} ${totalPlays === 1 ? 'play' : 'plays'} on this day</div>
    <div class="locked-note">Leaderboard locked — this day has passed.</div>
  </div>
</div>

<script>${REPORT_JS}

// Back-swipe guard: a stray edge swipe on a phone would leave the arcade mid-game.
// Push one history entry on first touch and re-push whenever the gesture pops it,
// so the swipe lands back on this page instead of navigating away.
window.addEventListener('touchstart', function () {
  try { history.pushState({ arcade: 1 }, '', location.href); } catch (e) {}
  window.addEventListener('popstate', function () { try { history.pushState({ arcade: 1 }, '', location.href); } catch (e) {} });
}, { once: true, passive: true });
let hi = 0;
window.addEventListener('message', function(e) {
  const d = e.data;
  if (!d || typeof d.highScore !== 'number') return;
  const score = Math.floor(d.highScore);
  if (score <= hi) return;
  hi = score;
  const el = document.getElementById('high-score');
  el.textContent = 'Best: ' + score.toLocaleString();
  el.classList.remove('new-best'); void el.offsetWidth; el.classList.add('new-best');
});
const frame = document.getElementById('game-frame');
const loadingEl = document.getElementById('loading');
let gameLoaded = false;
function loadGameFrame() {
  if (gameLoaded) return;
  gameLoaded = true;
  loadingEl.classList.remove('hidden');
  frame.onload = () => loadingEl.classList.add('hidden');
  frame.src = '/${game.file}';
}
// Tapping the title/icon toggles the how-to-play tooltip on touch devices
// (desktop gets it on hover via CSS).
const titleWrap = document.getElementById('game-title-wrap');
if (titleWrap) {
  titleWrap.addEventListener('click', e => {
    if (!titleWrap.classList.contains('has-tip')) return;
    e.stopPropagation();
    titleWrap.classList.toggle('show');
  });
  document.addEventListener('click', () => titleWrap.classList.remove('show'));
}
const scoresOverlay = document.getElementById('scores-overlay');
function closeScores() { scoresOverlay.classList.remove('open'); loadGameFrame(); }
scoresOverlay.addEventListener('click', e => { if (e.target === e.currentTarget) closeScores(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeScores(); });
// When arriving via a "see scores" link, show the leaderboard first and only
// load the game once the viewer dismisses it — don't navigate them into the game.
${openScores ? "loadingEl.classList.add('hidden');" : 'loadGameFrame();'}
</script>
</body>
</html>`;
}

// ── renderPrivacy ────────────────────────────────────
// /privacy: linked from the About modal (worker + extension), the leaderboard page
// and the iOS app's settings. App Store review requires one for every app.

export function renderPrivacy(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>newtab.party · privacy policy</title>
${FAVICON}
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #080810; color: #d1d5db; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; line-height: 1.6; padding: 48px 20px 80px; }
  .wrap { max-width: 640px; margin: 0 auto; }
  .back { font-size: 12px; color: rgba(255,255,255,0.35); text-decoration: none; }
  .back:hover { color: rgba(255,255,255,0.7); }
  h1 { font-size: 30px; color: #fff; margin: 28px 0 4px; letter-spacing: -0.5px; }
  .updated { font-size: 13px; color: rgba(255,255,255,0.35); margin-bottom: 28px; }
  h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2.5px; color: rgba(255,255,255,0.35); margin: 34px 0 10px; }
  p, li { font-size: 15px; }
  p + p { margin-top: 10px; }
  ul { padding-left: 20px; }
  li + li { margin-top: 8px; }
  strong { color: #fff; font-weight: 600; }
  a { color: #ffd700; text-underline-offset: 2px; }
</style>
</head>
<body>
<div class="wrap">
  <a class="back" href="/">← Back to today's game</a>
  <h1>Privacy policy</h1>
  <div class="updated">Last updated November 7, 2026</div>

  <p>newtab.party is a daily arcade game you can play on the web, in the Chrome extension, and in the iOS and Google TV apps. There are no accounts, no ads and no tracking. This page lists everything we handle.</p>

  <h2>What we collect</h2>
  <ul>
    <li><strong>Scores.</strong> When a score for today's game is good enough for the top of the board, we store the score, the game and the time. Scores are not tied to an account, a device or an email address.</li>
    <li><strong>The name you choose.</strong> Adding a name to the leaderboard is optional, and the name is shown publicly next to your score. If you skip the name, the score is removed.</li>
    <li><strong>Name reports.</strong> If you report a leaderboard name, we store the report with a one-way hash of your network address. We use it only to count how many different people reported a name.</li>
    <li><strong>Server logs.</strong> Our host, Cloudflare, processes your IP address and request details to serve the site and protect it from abuse.</li>
  </ul>

  <h2>What stays on your device</h2>
  <ul>
    <li>Your last leaderboard name and any names you have hidden, in your browser's local storage.</li>
    <li>In the iOS app: your reminder settings and your best score today, which the home screen widget reads.</li>
  </ul>

  <h2>Game Center (iOS app)</h2>
  <p>If you are signed in to Game Center, the iOS app sends your scores for today's game to Apple's Game Center leaderboard. Apple handles that data under its own privacy policy, and other players can see your Game Center nickname there.</p>

  <h2>Notifications (iOS app)</h2>
  <p>Daily reminders are scheduled on your device. We do not use push notifications and never receive a device token. You can turn reminders off in the app or in iOS Settings.</p>

  <h2>What we do not do</h2>
  <p>We do not sell or share your data, show ads, use analytics or tracking tools, or build profiles of players.</p>

  <h2>Leaderboard rules</h2>
  <p>Names are filtered for profanity, slurs and links. Anyone can report a name with the flag next to it. A reported name is hidden right away for the person who reported it, and for everyone once several people report it. We review reports and remove names that break these rules.</p>

  <h2>Children</h2>
  <p>newtab.party is a general audience game. We do not knowingly collect personal information from children.</p>

  <h2>Removing your data and contacting us</h2>
  <p>Past leaderboards stay viewable, so scores and names are kept. To remove a name you added, or for any other privacy question, <a href="https://github.com/jlyon/newtab-party/issues" target="_blank" rel="noopener">open an issue on GitHub</a> with the date, the game and the name.</p>
</div>
</body>
</html>`;
}
