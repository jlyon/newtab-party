import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { db, Play, DailyEntry } from "./db";

const app = express();
const PORT = 3742;
const GAMES_DIR = path.resolve(__dirname, "../games");
const GAMES_JSON = path.resolve(__dirname, "../games.json");

app.use(cors());
app.use(express.json());

// Serve game HTML files and games.json from server/games/.
// Drop a new .html into server/games/ + add it to server/games.json → live immediately.
app.use("/games", express.static(GAMES_DIR));
app.get("/games.json", (_req, res) => res.sendFile(GAMES_JSON));

// ── Daily game helpers ────────────────────────────────

interface Game {
  id: string;
  name: string;
  file: string;
  description?: string;
  controls?: string;
  type?: string;
}

// Day 0 = 2026-05-01 UTC — must match the extension's DAY_EPOCH exactly.
const DAY_EPOCH = Date.UTC(2026, 4, 1);

function readGames(): Game[] {
  try {
    const raw = fs.readFileSync(GAMES_JSON, "utf-8");
    return (JSON.parse(raw).games as Game[]) || [];
  } catch {
    return [];
  }
}

function getDailyGame(games: Game[], dateStr: string): Game | null {
  if (!games.length) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  // Date.UTC months are 0-indexed, so subtract 1 from the parsed month
  const day = Math.floor((Date.UTC(y, m - 1, d) - DAY_EPOCH) / 86400000);
  return games[((day % games.length) + games.length) % games.length];
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
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

// ── API ──────────────────────────────────────────────

app.get("/api/daily", (_req: Request, res: Response) => {
  const games = readGames();
  const today = todayUTC();
  const game = getDailyGame(games, today);
  if (!game) {
    res.status(503).json({ error: "No games configured" });
    return;
  }
  const scores = db.getDailyScores(game.id, today);
  const count = db.getDailyCount(game.id, today);
  const nextAt = new Date(Date.now() + msUntilMidnightUTC()).toISOString();
  res.json({ date: today, game, scores, totalPlays: count, nextAt });
});

app.post("/api/plays", (req: Request, res: Response) => {
  const { gameId, gameName, score } = req.body as Record<string, unknown>;
  if (typeof gameId !== "string" || !gameId.trim()) {
    res.status(400).json({ error: "gameId is required" });
    return;
  }
  if (typeof score !== "number" || !Number.isFinite(score)) {
    res.status(400).json({ error: "score must be a number" });
    return;
  }
  // Reject scores for past games — leaderboard is locked once the day ends.
  const todayGame = getDailyGame(readGames(), todayUTC());
  if (!todayGame || todayGame.id !== gameId.trim()) {
    res
      .status(403)
      .json({ error: "Scores can only be submitted for today's game" });
    return;
  }
  const name =
    typeof gameName === "string" ? gameName.trim() || gameId : gameId;
  const result = db.recordPlay(gameId.trim(), name, Math.floor(score));
  res.json(result);
});

app.get("/api/scores/:gameId", (req: Request, res: Response) => {
  const today = todayUTC();
  res.json(db.getDailyScores(req.params.gameId, today));
});

app.get("/api/recent", (_req: Request, res: Response) => {
  res.json(db.getRecentPlays());
});

app.patch("/api/plays/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { playerName } = req.body as Record<string, unknown>;
  if (typeof playerName !== "string" || !playerName.trim()) {
    res.status(400).json({ error: "playerName is required" });
    return;
  }
  const updated = db.setPlayerName(id, playerName as string);
  if (!updated) {
    res.status(403).json({
      error: "Cannot update — play not found or leaderboard is locked",
    });
    return;
  }
  res.json({ ok: true });
});

// ── Web UI ───────────────────────────────────────────

app.get("/", (_req: Request, res: Response) => {
  res.send(renderArcade());
});

app.get("/play/:date", (req: Request, res: Response) => {
  const dateStr = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    res.status(400).send("Invalid date");
    return;
  }
  if (dateStr >= todayUTC()) {
    res.redirect("/");
    return;
  }
  const game = getDailyGame(readGames(), dateStr);
  if (!game) {
    res.status(503).send("No games configured");
    return;
  }
  const scores = db.getDailyScores(game.id, dateStr);
  const count = db.getDailyCount(game.id, dateStr);
  res.send(renderReplay(game, dateStr, scores, count));
});

app.get("/leaderboard", (_req: Request, res: Response) => {
  const games = readGames();
  const today = todayUTC();
  const game = getDailyGame(games, today);
  const scores = game ? db.getDailyScores(game.id, today) : [];
  const count = game ? db.getDailyCount(game.id, today) : 0;
  const prev = db.getPreviousDays(7);
  res.send(
    renderLeaderboard({
      today,
      game,
      scores,
      totalToday: count,
      previousDays: prev,
    }),
  );
});

// ── Error handler ────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(
    `\n  🕹  newtab.party server running at http://localhost:${PORT}\n`,
  );
});

// ── HTML helpers ─────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(s: string): string {
  try {
    return new Date(s.length === 10 ? s + "T00:00:00Z" : s).toLocaleDateString(
      "en-US",
      { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" },
    );
  } catch {
    return s;
  }
}

function fmtTime(s: string): string {
  try {
    return (
      new Date(s + "Z").toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        hour12: true,
      }) + " UTC"
    );
  } catch {
    return "";
  }
}

// ── renderArcade ─────────────────────────────────────

function renderArcade(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>newtab.party</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🥳</text></svg>">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: #080810; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; overflow: hidden; }
  #app { display: flex; flex-direction: column; height: 100%; }
  #topbar { display: flex; align-items: center; justify-content: space-between; padding: 0 16px; height: 40px; flex-shrink: 0; background: rgba(8,8,16,0.9); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(255,255,255,0.07); gap: 12px; z-index: 10; }
  #game-title { font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.85); white-space: nowrap; }
  #game-date { font-size: 10px; color: rgba(255,255,255,0.25); white-space: nowrap; letter-spacing: 1px; text-transform: uppercase; flex: 1; }
  #high-score { font-size: 11px; color: rgba(255,255,255,0.4); white-space: nowrap; transition: color 0.3s; min-width: 80px; text-align: center; }
  #high-score.new-best { color: #ffd700; animation: scorePop 0.35s ease; }
  @keyframes scorePop { 0%,100%{transform:scale(1)} 50%{transform:scale(1.18)} }
  .topbar-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
  .btn-link { background: none; border: none; color: rgba(255,255,255,0.4); font-size: 11px; cursor: pointer; padding: 4px 6px; font-family: inherit; transition: color 0.12s; text-decoration: none; }
  .btn-link:hover { color: rgba(255,255,255,0.75); }
  #game-frame-wrap { flex: 1; position: relative; overflow: hidden; }
  #game-frame { width: 100%; height: 100%; border: none; display: block; }
  #loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #080810; color: rgba(255,255,255,0.25); font-size: 12px; letter-spacing: 2px; text-transform: uppercase; transition: opacity 0.3s; }
  #loading.hidden { opacity: 0; pointer-events: none; }
  #about-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.72); z-index: 100; align-items: center; justify-content: center; padding: 20px; }
  #about-overlay.open { display: flex; }
  #about-modal { background: #111118; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; max-width: 700px; width: 100%; max-height: 88vh; overflow-y: auto; padding: 44px 48px 40px; position: relative; }
  #about-modal::-webkit-scrollbar { width: 6px; }
  #about-modal::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
  #about-close { position: absolute; top: 14px; right: 16px; background: none; border: none; color: rgba(255,255,255,0.3); cursor: pointer; font-size: 22px; padding: 4px 8px; border-radius: 4px; transition: color 0.12s; line-height: 1; font-family: inherit; }
  #about-close:hover { color: rgba(255,255,255,0.7); }
  #about-modal h2 { font-size: 30px; font-weight: 700; margin-bottom: 6px; }
  #about-modal .tagline { color: rgba(255,255,255,0.4); font-size: 14px; margin-bottom: 32px; }
  #about-modal h3 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2.5px; color: rgba(255,255,255,0.3); margin: 28px 0 10px; }
  #about-modal p, #about-modal li { color: rgba(255,255,255,0.7); font-size: 14px; line-height: 1.65; margin-bottom: 6px; }
  #about-modal ol { padding-left: 18px; }
  #about-modal code { background: rgba(255,255,255,0.09); padding: 2px 7px; border-radius: 4px; font-family: 'SF Mono','Monaco',monospace; font-size: 12px; color: #e2e8f0; }
  #about-game-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap: 10px; margin: 4px 0; }
  .about-game-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 7px; padding: 14px 16px; }
  .about-game-name { font-size: 13px; font-weight: 700; margin-bottom: 5px; color: #fff; }
  .about-game-type { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,0.3); margin-bottom: 6px; }
  .about-game-desc { font-size: 12px; color: rgba(255,255,255,0.5); line-height: 1.45; }
  .about-game-controls { font-size: 11px; color: rgba(255,255,255,0.3); margin-top: 6px; font-style: italic; }
  .modal-links { margin-top: 32px; display: flex; gap: 10px; flex-wrap: wrap; }
  .modal-links a { color: #e5e7eb; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); border-radius: 5px; padding: 9px 16px; text-decoration: none; font-size: 13px; font-weight: 500; transition: background 0.12s; }
  .modal-links a:hover { background: rgba(255,255,255,0.16); }
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
    <span id="game-title">Loading…</span>
    <span id="game-date"></span>
    <span id="high-score"></span>
    <div class="topbar-actions">
      <a class="btn-link" href="/leaderboard">Leaderboard</a>
      <button class="btn-link" onclick="openAbout()">About</button>
    </div>
  </div>
  <div id="game-frame-wrap">
    <div id="loading">Loading…</div>
    <iframe id="game-frame" title="Game"></iframe>
  </div>
</div>

<div id="name-overlay">
  <div id="name-modal">
    <div class="name-rank">You're #<span id="name-rank-val"></span> today!</div>
    <p>Add your name to the leaderboard</p>
    <input id="name-input" type="text" placeholder="Your name" maxlength="30" autocomplete="off">
    <div class="name-btns">
      <button id="name-submit-btn" onclick="submitName()">Save to leaderboard</button>
      <button id="name-skip-btn" onclick="closeNamePrompt()">Skip</button>
    </div>
  </div>
</div>

<div id="about-overlay">
  <div id="about-modal">
    <button id="about-close" onclick="closeAbout()">×</button>
    <h2>🥳 newtab.party</h2>
    <p class="tagline">A new arcade game every day. Built by AI. Played by humans. Judged by the leaderboard.</p>
    <h3>What is this?</h3>
    <p>Every day at midnight UTC, a brand-new arcade game drops — same one for everyone, 24 hours to post your best score. After that the leaderboard locks and you're just playing for your own ego. Install the Chrome extension and every new tab becomes a perfectly justifiable distraction.</p>
    <h3>Games in the library</h3>
    <div id="about-game-list"></div>
    <h3>Build and share!</h3>
    <ol>
      <li>Clone the repo and install the <code>game-builder</code> Claude Code skill (link below)</li>
      <li>Run <code>/game-builder</code> in a Claude Code or Co-work session</li>
      <li>Try playing your game</li>
      <li>If it meets the mark, drop the generated <code>.html</code> into <code>extension/games/</code> and add an entry to <code>extension/games.json</code></li>
      <li>Submit a pull request to share it with everyone</li>
    </ol>
    <div class="modal-links">
      <a href="https://github.com/jlyon/newtab.party" target="_blank">GitHub →</a>
      <a href="/leaderboard">Leaderboard →</a>
    </div>
  </div>
</div>

<script>
const DAY_EPOCH = Date.UTC(2026, 4, 1);
let games = [], currentGame = null, sessionHighScore = 0;
let sessionPlayId = null, sessionNameDone = false;

function dailyGame(gs) {
  if (!gs.length) return null;
  const day = Math.floor((Date.now() - DAY_EPOCH) / 86400000);
  return gs[((day % gs.length) + gs.length) % gs.length];
}
function todayLabel() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

async function init() {
  const data = await fetch('/games.json').then(r => r.json());
  games = data.games || [];
  const listEl = document.getElementById('about-game-list');
  for (const g of games) {
    const card = document.createElement('div');
    card.className = 'about-game-card';
    card.innerHTML = '<div class="about-game-name">' + esc(g.name) + '</div>' +
      '<div class="about-game-type">' + esc(g.type||'') + '</div>' +
      '<div class="about-game-desc">' + esc(g.description||'') + '</div>' +
      (g.controls ? '<div class="about-game-controls">' + esc(g.controls) + '</div>' : '');
    listEl.appendChild(card);
  }
  loadGame(dailyGame(games));
  window.addEventListener('message', handleMessage);
  document.addEventListener('keydown', e => { if (e.key==='Escape') { closeAbout(); closeNamePrompt(); } });
  document.getElementById('about-overlay').addEventListener('click', e => { if (e.target===e.currentTarget) closeAbout(); });
  document.getElementById('name-overlay').addEventListener('click', e => { if (e.target===e.currentTarget) closeNamePrompt(); });
  document.getElementById('name-input').addEventListener('keydown', e => { if (e.key==='Enter') submitName(); if (e.key==='Escape') closeNamePrompt(); });
}

function loadGame(game) {
  if (!game) return;
  currentGame = game; sessionHighScore = 0; sessionPlayId = null; sessionNameDone = false;
  document.getElementById('game-title').textContent = game.name;
  document.getElementById('game-date').textContent = todayLabel();
  document.getElementById('high-score').textContent = '';
  document.getElementById('high-score').classList.remove('new-best');
  const loading = document.getElementById('loading');
  loading.classList.remove('hidden'); loading.textContent = 'Loading…';
  const frame = document.getElementById('game-frame');
  frame.onload = () => loading.classList.add('hidden');
  frame.src = '/' + game.file;
}

function handleMessage(event) {
  const d = event.data;
  if (!d || typeof d.highScore !== 'number') return;
  const score = Math.floor(d.highScore);
  if (score <= sessionHighScore) return;
  sessionHighScore = score;
  const el = document.getElementById('high-score');
  el.textContent = 'Best: ' + score.toLocaleString();
  el.classList.remove('new-best'); void el.offsetWidth; el.classList.add('new-best');
  if (currentGame) reportScore(currentGame.id, currentGame.name, score);
}

async function reportScore(gameId, gameName, score) {
  try {
    const r = await fetch('/api/plays', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ gameId, gameName, score }) });
    if (!r.ok) return;
    const { id, rank } = await r.json();
    sessionPlayId = id;
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
      fetch('/api/plays/' + id, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ playerName: savedName }) }).catch(()=>{});
    } else if (!sessionNameDone && rank <= 10) {
      showNamePrompt(rank);
    }
  } catch {}
}

function showNamePrompt(rank) {
  document.getElementById('name-rank-val').textContent = rank;
  document.getElementById('name-overlay').classList.add('open');
  document.getElementById('name-input').focus();
}
function closeNamePrompt() {
  document.getElementById('name-overlay').classList.remove('open');
  sessionNameDone = true;
}
function submitName() {
  const name = document.getElementById('name-input').value.trim();
  closeNamePrompt();
  if (!name || !sessionPlayId) return;
  localStorage.setItem('playerName', name);
  fetch('/api/plays/' + sessionPlayId, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ playerName: name }) }).catch(()=>{});
}

function openAbout() { document.getElementById('about-overlay').classList.add('open'); }
function closeAbout() { document.getElementById('about-overlay').classList.remove('open'); }
function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

init();
</script>
</body>
</html>`;
}

// ── renderLeaderboard ────────────────────────────────

function renderLeaderboard({
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
  const footerNote = `${totalToday} ${totalToday === 1 ? "play" : "plays"} today`;

  const scoreRows = scores.length
    ? scores
        .slice(0, 20)
        .map(
          (s, i) => `
        <tr>
          <td class="rank">${i + 1}</td>
          <td class="player-name">${s.player_name ? esc(s.player_name) : '<span class="anon">—</span>'}</td>
          <td class="score-val">${s.score.toLocaleString()}</td>
          <td class="time-val">${fmtTime(s.played_at)}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="empty-row">No scores yet today — be the first</td></tr>`;

  const prevRows = previousDays.length
    ? previousDays
        .map(
          (d) => `
        <tr>
          <td class="prev-date">${fmtDate(d.play_date)}</td>
          <td class="prev-game"><a href="/play/${d.play_date}" class="prev-play-link">${esc(d.game_name)}</a></td>
          <td class="prev-top">${d.top_score.toLocaleString()}</td>
          <td class="prev-plays">${d.total_plays} plays</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="empty-row">No previous games yet</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>newtab.party — leaderboard</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🥳</text></svg>">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #080810; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; min-height: 100vh; padding: 48px 24px 80px; }
  .back { display: inline-block; font-size: 12px; color: rgba(255,255,255,0.3); text-decoration: none; margin-bottom: 32px; letter-spacing: 0.3px; transition: color 0.12s; }
  .back:hover { color: rgba(255,255,255,0.65); }
  .wrap { max-width: 600px; margin: 0 auto; }

  /* Daily header */
  .daily-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; color: rgba(255,255,255,0.25); margin-bottom: 6px; }
  .daily-game { font-size: 32px; font-weight: 800; letter-spacing: 1px; margin-bottom: 4px; }
  .daily-date { font-size: 13px; color: rgba(255,255,255,0.35); margin-bottom: 28px; }
  .daily-desc { font-size: 13px; color: rgba(255,255,255,0.4); margin-bottom: 28px; line-height: 1.5; max-width: 480px; }

  /* Score table */
  .score-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  .score-table thead th { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.25); font-weight: 600; padding: 0 0 10px; text-align: left; }
  .score-table thead th.score-val, .score-table thead th.time-val { text-align: right; }
  .player-name { font-size: 13px; color: rgba(255,255,255,0.6); padding-right: 12px; }
  .score-table tbody tr:first-child .player-name { color: #ffd700; }
  .anon { color: rgba(255,255,255,0.2); }
  .score-table tbody tr { border-top: 1px solid rgba(255,255,255,0.05); }
  .score-table tbody tr:first-child { border-top: 1px solid rgba(255,255,255,0.1); }
  .rank { font-size: 12px; color: rgba(255,255,255,0.2); padding: 11px 16px 11px 0; width: 32px; }
  .score-table tbody tr:first-child .rank { color: #ffd700; font-weight: 700; }
  .score-val { font-size: 18px; font-weight: 700; color: #fff; text-align: right; letter-spacing: -0.5px; }
  .score-table tbody tr:first-child .score-val { color: #ffd700; font-size: 22px; }
  .time-val { font-size: 11px; color: rgba(255,255,255,0.25); text-align: right; padding-left: 16px; white-space: nowrap; }
  .empty-row { font-size: 13px; color: rgba(255,255,255,0.25); padding: 20px 0; text-align: center; }

  .footer-note { font-size: 12px; color: rgba(255,255,255,0.25); padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); }

  /* Countdown */
  #countdown { font-variant-numeric: tabular-nums; }

  /* Previous days */
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; color: rgba(255,255,255,0.2); margin: 48px 0 14px; }
  .prev-table { width: 100%; border-collapse: collapse; }
  .prev-table tbody tr { border-top: 1px solid rgba(255,255,255,0.05); }
  .prev-date { font-size: 12px; color: rgba(255,255,255,0.3); padding: 9px 16px 9px 0; white-space: nowrap; }
  .prev-game { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.7); flex: 1; }
  .prev-play-link { color: inherit; text-decoration: none; }
  .prev-play-link:hover { color: #fff; text-decoration: underline; text-underline-offset: 3px; }
  .prev-top { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.6); text-align: right; padding: 9px 16px; }
  .prev-plays { font-size: 11px; color: rgba(255,255,255,0.2); text-align: right; white-space: nowrap; }

  footer { margin-top: 64px; font-size: 11px; color: rgba(255,255,255,0.15); }
  footer a { color: rgba(255,255,255,0.25); text-decoration: none; }
  footer a:hover { color: rgba(255,255,255,0.5); }
</style>
</head>
<body>
<div class="wrap">
  <a class="back" href="/">← Play today's game</a>

  <div class="daily-label">Today · ${fmtDate(today)}</div>
  <div class="daily-game">${esc(game?.name ?? "No game configured")}</div>
  <div class="daily-date">${esc(game?.type ?? "")}</div>
  ${game?.description ? `<div class="daily-desc">${esc(game.description)}</div>` : ""}

  <table class="score-table">
    <thead>
      <tr>
        <th></th>
        <th>Player</th>
        <th class="score-val">Score</th>
        <th class="time-val">Time (UTC)</th>
      </tr>
    </thead>
    <tbody>${scoreRows}</tbody>
  </table>

  <div class="footer-note">${footerNote} · next game in <span id="countdown">${countdown}</span></div>

  <div class="section-title">Previous games</div>
  <table class="prev-table">
    <tbody>${prevRows}</tbody>
  </table>

  <footer>
    <a href="https://github.com/shoppad/newtab.party">github.com/shoppad/newtab.party</a>
  </footer>
</div>
<script>
// Live countdown to midnight UTC
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

function renderReplay(
  game: Game,
  date: string,
  scores: Play[],
  totalPlays: number,
): string {
  const dateLabel = fmtDate(date);

  const scoreRows = scores.length
    ? scores
        .slice(0, 20)
        .map(
          (s, i) => `
        <tr>
          <td class="rank">${i + 1}</td>
          <td class="player-name">${s.player_name ? esc(s.player_name) : '<span class="anon">—</span>'}</td>
          <td class="score-val">${s.score.toLocaleString()}</td>
          <td class="time-val">${fmtTime(s.played_at)}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="empty-row">No scores were recorded for this day</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(game.name)} — ${esc(dateLabel)} — newtab.party</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🥳</text></svg>">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: #080810; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; overflow: hidden; }
  #app { display: flex; flex-direction: column; height: 100%; }
  #topbar { display: flex; align-items: center; padding: 0 16px; height: 40px; flex-shrink: 0; background: rgba(8,8,16,0.9); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(255,255,255,0.07); gap: 12px; z-index: 10; }
  #game-title { font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.85); white-space: nowrap; }
  #game-date { font-size: 10px; color: rgba(255,255,255,0.25); white-space: nowrap; letter-spacing: 1px; text-transform: uppercase; }
  #high-score { font-size: 11px; color: rgba(255,255,255,0.4); white-space: nowrap; transition: color 0.3s; min-width: 80px; text-align: center; }
  #high-score.new-best { color: #ffd700; animation: scorePop 0.35s ease; }
  @keyframes scorePop { 0%,100%{transform:scale(1)} 50%{transform:scale(1.18)} }
  .replay-badge { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,200,0,0.5); background: rgba(255,200,0,0.08); border: 1px solid rgba(255,200,0,0.2); border-radius: 3px; padding: 2px 6px; white-space: nowrap; flex: 1; }
  .topbar-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
  .btn-link { background: none; border: none; color: rgba(255,255,255,0.4); font-size: 11px; cursor: pointer; padding: 4px 6px; font-family: inherit; transition: color 0.12s; text-decoration: none; }
  .btn-link:hover { color: rgba(255,255,255,0.75); }
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
  .time-val { font-size: 11px; color: rgba(255,255,255,0.25); text-align: right; padding-left: 16px; white-space: nowrap; }
  .empty-row { font-size: 13px; color: rgba(255,255,255,0.25); padding: 20px 0; text-align: center; }
  .footer-note { font-size: 12px; color: rgba(255,255,255,0.25); padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); }
  .locked-note { font-size: 11px; color: rgba(255,200,0,0.35); margin-top: 6px; }
</style>
</head>
<body>
<div id="app">
  <div id="topbar">
    <span>🥳 </span>
    <span id="game-title">${esc(game.name)}</span>
    <span id="game-date">${esc(dateLabel)}</span>
    <span id="high-score"></span>
    <span class="replay-badge">Replay · scores not saved</span>
    <div class="topbar-actions">
      <button class="btn-link" id="btn-scores">Scores</button>
      <a class="btn-link" href="/leaderboard">← Leaderboard</a>
    </div>
  </div>
  <div id="game-frame-wrap">
    <div id="loading">Loading…</div>
    <iframe id="game-frame" title="Game"></iframe>
  </div>
</div>

<div id="scores-overlay">
  <div id="scores-modal">
    <button class="modal-close" id="scores-close">×</button>
    <div class="modal-label">${esc(dateLabel)}</div>
    <div class="modal-title">${esc(game.name)}</div>
    <div class="modal-subtitle">${esc(game.type ?? "")}</div>
    <table class="score-table">
      <thead>
        <tr><th></th><th>Player</th><th class="r">Score</th><th class="r">Time (UTC)</th></tr>
      </thead>
      <tbody>${scoreRows}</tbody>
    </table>
    <div class="footer-note">${totalPlays} ${totalPlays === 1 ? "play" : "plays"} on this day</div>
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
frame.onload = () => document.getElementById('loading').classList.add('hidden');
frame.src = '/${game.file}';
document.getElementById('btn-scores').addEventListener('click', () => document.getElementById('scores-overlay').classList.add('open'));
document.getElementById('scores-close').addEventListener('click', () => document.getElementById('scores-overlay').classList.remove('open'));
document.getElementById('scores-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.getElementById('scores-overlay').classList.remove('open'); });
</script>
</body>
</html>`;
}
