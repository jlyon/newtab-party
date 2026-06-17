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

const FAVICON = `<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🥳</text></svg>">`;

// ── renderArcade ─────────────────────────────────────

export function renderArcade(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Arcade</title>
${FAVICON}
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: #080810; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; overflow: hidden; }
  #app { display: flex; flex-direction: column; height: 100%; }
  #topbar { display: flex; align-items: baseline; justify-content: space-between; padding: 0 16px; height: 40px; line-height: 40px; flex-shrink: 0; background: rgba(8,8,16,0.9); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(255,255,255,0.07); gap: 12px; z-index: 10; overflow: visible; }
  #game-title-wrap { position: relative; line-height: normal; }
  #game-title { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.55); white-space: nowrap; cursor: help; }
  #game-tooltip { display: none; position: absolute; top: calc(100% + 6px); left: 0; background: #1a1a28; border: 1px solid rgba(255,255,255,0.12); border-radius: 7px; padding: 12px 14px; min-width: 200px; max-width: 320px; z-index: 50; pointer-events: none; white-space: normal; }
  #game-title-wrap.has-tip:hover #game-tooltip { display: block; }
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
    #game-title-wrap { flex: 1; min-width: 0; overflow: hidden; }
    #game-title { overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
    #game-date { display: none; }
    #high-score { display: none; }
    .btn-install { display: none; }
  }
  #game-frame-wrap { flex: 1; position: relative; overflow: hidden; }
  #game-frame { width: 100%; height: 100%; border: none; display: block; }
  #loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #080810; color: rgba(255,255,255,0.25); font-size: 12px; letter-spacing: 2px; text-transform: uppercase; transition: opacity 0.3s; }
  #loading.hidden { opacity: 0; pointer-events: none; }
  #how-panel { position: absolute; top: 10px; left: 10px; z-index: 5; max-width: 280px; background: rgba(8,8,16,0.88); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 14px 16px; backdrop-filter: blur(4px); }
  #how-panel.hidden { display: none; }
  #how-close { position: absolute; top: 6px; right: 8px; background: none; border: none; color: rgba(255,255,255,0.3); cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 4px; transition: color 0.12s; line-height: 1; font-family: inherit; }
  #how-close:hover { color: rgba(255,255,255,0.7); }
  #how-desc { font-size: 12px; color: rgba(255,255,255,0.5); line-height: 1.55; margin-bottom: 10px; }
  #how-how { font-size: 9px; text-transform: uppercase; letter-spacing: 2.5px; color: rgba(255,255,255,0.3); margin-bottom: 6px; }
  #how-controls { font-size: 12px; color: rgba(255,255,255,0.3); margin-bottom: 14px; }
  #how-play { background: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.18); color: rgba(255,255,255,0.9); font-size: 13px; font-family: inherit; padding: 7px 20px; border-radius: 6px; cursor: pointer; letter-spacing: 1px; transition: background 0.12s; }
  #how-play:hover { background: rgba(255,255,255,0.16); }
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
  #about-game-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap: 10px; margin: 4px 0; }
  .recent-game-link { text-decoration: none; color: inherit; display: block; }
  .recent-game-link:hover .about-game-card { border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.07); }
  .about-game-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 7px; padding: 14px 16px; transition: background 0.12s, border-color 0.12s; }
  .about-game-date { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,0.25); margin-bottom: 4px; }
  .about-game-name { font-size: 13px; font-weight: 700; margin-bottom: 5px; color: #fff; }
  .about-game-type { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,0.3); margin-bottom: 6px; }
  .about-game-desc { font-size: 12px; color: rgba(255,255,255,0.5); line-height: 1.45; }
  .about-game-controls { font-size: 11px; color: rgba(255,255,255,0.3); margin-top: 6px; font-style: italic; }
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
</style>
</head>
<body>
<div id="app">
  <div id="topbar">
    <span>🥳 </span>
    <div id="game-title-wrap">
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
      <a class="btn-link" id="lb-link" href="/leaderboard">Leaderboard</a>
      <button class="btn-link" onclick="openAbout()">About</button>
    </div>
  </div>
  <div id="game-frame-wrap">
    <div id="loading">Loading…</div>
    <div id="how-panel" class="hidden">
      <button id="how-close">×</button>
      <div id="how-desc"></div>
      <div id="how-how">Okay, but how???</div>
      <div id="how-controls"></div>
      <button id="how-play">▶ Play</button>
    </div>
    <iframe id="game-frame" title="Game" tabindex="0"></iframe>
  </div>
</div>

<div id="name-overlay">
  <div id="name-modal">
    <div class="name-rank">You're #<span id="name-rank-val"></span> today!</div>
    <p>Add your name to the leaderboard</p>
    <input id="name-input" type="text" placeholder="Your name" maxlength="30" autocomplete="off">
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
      <button id="about-open-lb">Leaderboard →</button>
    </div>
  </div>
</div>

<script>
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
    if (e.key==='Escape') { closeAbout(); skipName(); return; }
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
  document.getElementById('how-close').addEventListener('click', () => {
    document.getElementById('how-panel').classList.add('hidden');
  });
  document.getElementById('how-play').addEventListener('click', () => {
    document.getElementById('how-panel').classList.add('hidden');
    focusGame();
  });
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
      link.innerHTML = '<div class="about-game-card">' +
        '<div class="about-game-date">' + esc(dateLabel) + '</div>' +
        '<div class="about-game-name">' + esc(g.name) + '</div>' +
        '<div class="about-game-type">' + esc(g.type||'') + '</div>' +
        '<div class="about-game-desc">' + esc(g.description||'') + '</div>' +
        (g.controls ? '<div class="about-game-controls">' + esc(g.controls) + '</div>' : '') +
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
  if (game.description || game.controls) {
    document.getElementById('game-tooltip-desc').textContent = game.description || '';
    document.getElementById('game-tooltip-controls').textContent = game.controls || '';
    wrap.classList.add('has-tip');
  } else {
    wrap.classList.remove('has-tip');
  }
  const frame = document.getElementById('game-frame');
  const loading = document.getElementById('loading');
  if (game.controls) {
    document.getElementById('how-desc').textContent = game.description || '';
    document.getElementById('how-controls').textContent = game.controls;
    document.getElementById('how-panel').classList.remove('hidden');
    loading.classList.add('hidden');
    frame.onload = () => { focusGame(); };
    frame.src = '/' + game.file;
  } else {
    document.getElementById('how-panel').classList.add('hidden');
    loading.classList.remove('hidden'); loading.textContent = 'Loading…';
    frame.onload = () => { loading.classList.add('hidden'); focusGame(); };
    frame.src = '/' + game.file;
  }
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
  closeNamePrompt();
  const id = sessionPlayId;
  sessionPlayId = null;
  localStorage.setItem('playerName', name);
  fetch('/api/plays/' + id, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ playerName: name }) }).catch(()=>{});
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
          <td class="player-name">${s.player_name ? esc(s.player_name) : '<span class="anon">—</span>'}</td>
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
</style>
</head>
<body>
<div class="wrap">
  <div class="top-row">
    <a class="back" href="/">← Play today's game</a>
    <a class="btn-install" href="https://chromewebstore.google.com/detail/newtabparty/hhledeikahmmaakcgcapeklbajaganbm" target="_blank" rel="noopener">+ Add to Chrome</a>
  </div>

  <div class="daily-label">Today · ${fmtDate(today)}</div>
  <div class="daily-game">${esc(game?.name ?? 'No game configured')}</div>
  <div class="daily-date">${esc(game?.type ?? '')}</div>
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

</div>
<script>
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
          <td class="player-name">${s.player_name ? esc(s.player_name) : '<span class="anon">—</span>'}</td>
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
  html, body { height: 100%; background: #080810; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; overflow: hidden; }
  #app { display: flex; flex-direction: column; height: 100%; }
  #topbar { display: flex; align-items: baseline; padding: 0 16px; height: 40px; line-height: 40px; flex-shrink: 0; background: rgba(8,8,16,0.9); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(255,255,255,0.07); gap: 12px; z-index: 10; overflow: visible; }
  #game-title-wrap { position: relative; line-height: normal; }
  #game-title { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.55); white-space: nowrap; cursor: help; }
  #game-tooltip { display: none; position: absolute; top: calc(100% + 6px); left: 0; background: #1a1a28; border: 1px solid rgba(255,255,255,0.12); border-radius: 7px; padding: 12px 14px; min-width: 200px; max-width: 320px; z-index: 50; pointer-events: none; white-space: normal; }
  #game-title-wrap.has-tip:hover #game-tooltip { display: block; }
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
  @media (max-width: 600px) { #game-date { display: none; } #high-score { display: none; } .btn-install { padding: 4px 8px; font-size: 10px; letter-spacing: 0.5px; } }
</style>
</head>
<body>
<div id="app">
  <div id="topbar">
    <span>🥳 </span>
    <div id="game-title-wrap"${game.description || game.controls ? ' class="has-tip"' : ''}>
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
    <div class="modal-label">${esc(dateLabel)}</div>
    <div class="modal-title">${esc(game.name)}</div>
    <div class="modal-subtitle">${esc(game.type ?? '')}</div>
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

<script>
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
