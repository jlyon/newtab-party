// For local dev: change to 'http://localhost:8787'
const SERVER_URL = "https://newtab.party";

// Deterministic daily rotation — must match server's algorithm exactly.
// Day 0 = 2026-05-01 UTC. Cycles through games in order.
const DAY_EPOCH = Date.UTC(2026, 4, 1); // May 1 2026

// Day number since DAY_EPOCH for a given epoch-ms instant.
function dayNumber(utcMs) {
  return Math.floor((utcMs - DAY_EPOCH) / 86400000);
}
function dayNumberFromStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return dayNumber(Date.UTC(y, m - 1, d));
}

// The daily pick. Uses the explicit `schedule` list from games.json (anchored at
// `scheduleEpoch`) so appending a game only adds a future slot — the current
// cycle never moves. Falls back to plain modulo. MUST match worker/src/index.ts.
function getDailyGame(games) {
  if (!games.length) return null;
  if (schedule.length && scheduleEpoch) {
    const off = dayNumber(Date.now()) - dayNumberFromStr(scheduleEpoch);
    const L = schedule.length;
    const id = schedule[((off % L) + L) % L];
    const g = games.find((x) => x.id === id);
    if (g) return g;
  }
  const day = dayNumber(Date.now());
  return games[((day % games.length) + games.length) % games.length];
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fmtCountdown(ms) {
  const h = Math.floor(ms / 3600000),
    m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

let games = [],
  schedule = [],
  scheduleEpoch = null,
  currentGame = null,
  sessionHighScore = 0;
let sessionPlayId = null;
let lastEvaluatedScore = -1;

function fmtDate(s) {
  try {
    return new Date(s + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return s;
  }
}

async function init() {
  try {
    const data = await fetch(`${SERVER_URL}/games.json`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    games = data.games || [];
    schedule = data.schedule || [];
    scheduleEpoch = data.scheduleEpoch || null;
    loadGame(getDailyGame(games));
  } catch {
    showServerError();
  }

  loadRecentGames();

  window.addEventListener("message", handleMessage);
  // Keep keyboard focus on the game frame so games respond without a click first.
  window.addEventListener("focus", focusGame);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) focusGame(); });
  document.addEventListener("pointerdown", () => { setTimeout(focusGame, 0); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAbout();
      closeLeaderboard();
      skipName();
      document.getElementById("game-title-wrap").classList.remove("show");
    } else {
      const anyModalOpen =
        document.getElementById("lb-overlay").classList.contains("open") ||
        document.getElementById("about-overlay").classList.contains("open") ||
        document.getElementById("name-overlay").classList.contains("open");
      if (!anyModalOpen) focusGame();
    }
  });

  // About modal
  document.getElementById("about-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeAbout();
  });
  document.getElementById("about-close").addEventListener("click", closeAbout);
  document.getElementById("btn-about").addEventListener("click", openAbout);
  document.getElementById("about-open-lb").addEventListener("click", () => {
    closeAbout();
    openLeaderboard();
  });

  // Leaderboard modal
  document.getElementById("lb-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeLeaderboard();
  });
  document
    .getElementById("lb-close")
    .addEventListener("click", closeLeaderboard);
  document
    .getElementById("btn-leaderboard")
    .addEventListener("click", openLeaderboard);
  document.getElementById("lb-full-link").href = `${SERVER_URL}/leaderboard`;

  // Name prompt
  document.getElementById("name-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) skipName();
  });
  document
    .getElementById("name-submit-btn")
    .addEventListener("click", submitName);
  document
    .getElementById("name-skip-btn")
    .addEventListener("click", skipName);
  document.getElementById("name-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitName();
    if (e.key === "Escape") skipName();
  });

  // How-to-play tooltip: tapping the title/icon toggles it on touch devices
  // (desktop gets it on hover via CSS).
  const titleWrap = document.getElementById("game-title-wrap");
  titleWrap.addEventListener("click", (e) => {
    if (!titleWrap.classList.contains("has-tip")) return;
    e.stopPropagation();
    titleWrap.classList.toggle("show");
  });
  document.addEventListener("click", () => titleWrap.classList.remove("show"));
}

// Focus the game frame (and its inner window, for the cross-origin iframe) so
// keyboard input reaches the game without a mouse click first.
function focusGame() {
  if (
    document.getElementById("lb-overlay").classList.contains("open") ||
    document.getElementById("about-overlay").classList.contains("open") ||
    document.getElementById("name-overlay").classList.contains("open")
  ) return;
  const frame = document.getElementById("game-frame");
  if (!frame) return;
  try { frame.focus(); } catch (e) {}
  try { frame.contentWindow.focus(); } catch (e) {}
}

async function loadRecentGames() {
  try {
    const recentDays = await fetch(`${SERVER_URL}/api/recent-days`).then((r) =>
      r.json(),
    );
    const listEl = document.getElementById("about-game-list");
    listEl.innerHTML = "";
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const { date, game: g } of recentDays) {
      const isToday = date === todayStr;
      const href = isToday
        ? `${SERVER_URL}/leaderboard`
        : `${SERVER_URL}/play/${date}`;
      const dateLabel = isToday ? "Today" : fmtDate(date);
      const link = document.createElement("a");
      link.className = "recent-game-link";
      link.href = href;
      link.target = "_blank";
      link.innerHTML =
        `<div class="about-game-card">` +
        `<div class="about-game-date">${esc(dateLabel)}</div>` +
        `<div class="about-game-name">${esc(g.name)}</div>` +
        `<div class="about-game-type">${esc(g.type || "")}</div>` +
        `<div class="about-game-desc">${esc(g.description || "")}</div>` +
        (g.controls
          ? `<div class="about-game-controls">${esc(g.controls)}</div>`
          : "") +
        `</div>`;
      listEl.appendChild(link);
    }
  } catch {}
}

function showServerError() {
  document.getElementById("game-title").textContent = "Offline";
  document.getElementById("game-date").textContent = "";
  document.getElementById("loading").innerHTML = `
    <div class="server-error">
      <p>Couldn't reach newtab.party.<br>Check your connection and try again.</p>
      <button id="retry-btn">RETRY</button>
    </div>
  `;
  document
    .getElementById("retry-btn")
    .addEventListener("click", () => location.reload());
}

function loadGame(game) {
  if (!game) return;
  currentGame = game;
  sessionHighScore = 0;
  sessionPlayId = null;

  document.getElementById("game-title").textContent = game.name;
  document.getElementById("game-date").textContent = todayLabel();
  document.getElementById("high-score").textContent = "";
  document.getElementById("high-score").classList.remove("new-best");

  const wrap = document.getElementById("game-title-wrap");
  wrap.classList.remove("show");
  if (game.description || game.controls) {
    document.getElementById("game-tooltip-desc").textContent =
      game.description || "";
    document.getElementById("game-tooltip-controls").textContent =
      game.controls || "";
    wrap.classList.add("has-tip");
  } else {
    wrap.classList.remove("has-tip");
  }

  // Games carry their own title screen with instructions now, so just load the
  // frame behind the loading shimmer — no pre-game how-to overlay here.
  const frame = document.getElementById("game-frame");
  const loading = document.getElementById("loading");
  loading.classList.remove("hidden");
  loading.textContent = "Loading…";
  frame.onload = () => { loading.classList.add("hidden"); focusGame(); };
  frame.src = `${SERVER_URL}/${game.file}`;
}

function handleMessage(event) {
  const d = event.data;
  if (!d || typeof d.highScore !== "number") return;

  const score = Math.floor(d.highScore);
  if (score <= 0) return;

  // Topbar "Best" reflects the best score of this local session.
  if (score > sessionHighScore) {
    sessionHighScore = score;
    const el = document.getElementById("high-score");
    el.textContent = `Best: ${score.toLocaleString()}`;
    el.classList.remove("new-best");
    void el.offsetWidth;
    el.classList.add("new-best");
  }

  if (!currentGame) return;
  // Offer the leaderboard whenever the score makes the day's top board — not
  // only when it beats the local session best. Dedupe identical scores and
  // don't stack prompts.
  if (score === lastEvaluatedScore) return;
  lastEvaluatedScore = score;
  if (document.getElementById("name-overlay").classList.contains("open")) return;
  maybePromptForScore(currentGame.id, currentGame.name, score);
}

async function maybePromptForScore(gameId, gameName, score) {
  try {
    const q = await fetch(
      `${SERVER_URL}/api/qualify?gameId=${encodeURIComponent(gameId)}&score=${score}`,
    ).then((r) => (r.ok ? r.json() : null));
    if (!q || !q.qualifies) return; // not in today's top scores — don't pester
    const r = await fetch(`${SERVER_URL}/api/plays`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, gameName, score }),
    });
    if (!r.ok) return;
    const { id, rank } = await r.json();
    sessionPlayId = id;
    showNamePrompt(rank);
  } catch {
    // Server not reachable — score silently dropped
  }
}

// ── Leaderboard modal ─────────────────────────────

async function openLeaderboard() {
  document.getElementById("lb-overlay").classList.add("open");
  document.getElementById("lb-loading").style.display = "block";
  document.getElementById("lb-table").style.display = "none";
  document.getElementById("lb-footer").style.display = "none";

  try {
    const data = await fetch(`${SERVER_URL}/api/daily`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });

    document.getElementById("lb-label").textContent =
      `Today · ${new Date(data.date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
    document.getElementById("lb-game-name").textContent =
      data.game?.name ?? "—";
    document.getElementById("lb-game-type").textContent = data.game?.type ?? "";

    const tbody = document.getElementById("lb-rows");
    tbody.innerHTML = "";
    if (data.scores && data.scores.length) {
      data.scores.slice(0, 20).forEach((s, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML =
          `<td class="lb-rank">${i + 1}</td>` +
          `<td class="lb-player">${s.player_name ? esc(s.player_name) : '<span class="lb-anon">—</span>'}</td>` +
          `<td class="lb-score">${s.score.toLocaleString()}</td>`;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML =
        '<tr><td colspan="3" class="lb-empty">No scores yet today — be the first</td></tr>';
    }

    const msLeft = new Date(data.nextAt).getTime() - Date.now();
    document.getElementById("lb-footer").textContent =
      `${data.totalPlays} ${data.totalPlays === 1 ? "play" : "plays"} today · next game in ${fmtCountdown(msLeft)}`;

    document.getElementById("lb-loading").style.display = "none";
    document.getElementById("lb-table").style.display = "table";
    document.getElementById("lb-footer").style.display = "block";
  } catch {
    document.getElementById("lb-loading").textContent =
      "Could not load scores — is the server running?";
  }
}

function closeLeaderboard() {
  document.getElementById("lb-overlay").classList.remove("open");
}

// ── About modal ───────────────────────────────────

function openAbout() {
  document.getElementById("about-overlay").classList.add("open");
}
function closeAbout() {
  document.getElementById("about-overlay").classList.remove("open");
}

// ── Name prompt ───────────────────────────────────

function showNamePrompt(rank) {
  const saved = localStorage.getItem("playerName");
  document.getElementById("name-rank-val").textContent = rank;
  document.getElementById("name-input").value = saved || "";
  document.getElementById("name-overlay").classList.add("open");
  document.getElementById("name-input").focus();
  if (saved) document.getElementById("name-input").select();
}

function closeNamePrompt() {
  document.getElementById("name-overlay").classList.remove("open");
}

// Skipping means "don't put me on the leaderboard" — delete the pending play.
function skipName() {
  closeNamePrompt();
  discardPlay();
}

function discardPlay() {
  const id = sessionPlayId;
  sessionPlayId = null;
  if (!id) return;
  fetch(`${SERVER_URL}/api/plays/${id}`, { method: "DELETE" }).catch(() => {});
}

function submitName() {
  const name = document.getElementById("name-input").value.trim();
  if (!name || !sessionPlayId) {
    skipName();
    return;
  }
  closeNamePrompt();
  const id = sessionPlayId;
  sessionPlayId = null;
  localStorage.setItem("playerName", name);
  fetch(`${SERVER_URL}/api/plays/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerName: name }),
  }).catch(() => {});
}

// ── Utilities ─────────────────────────────────────

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

init();
