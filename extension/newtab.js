// For local dev: 'http://localhost:8787' (wrangler dev default port)
const SERVER_URL = "https://newtab.party";

// Deterministic daily rotation — must match server's algorithm exactly.
// Day 0 = 2026-05-01 UTC. Cycles through games in order.
const DAY_EPOCH = Date.UTC(2026, 4, 1); // May 1 2026

function dailyIndex(count) {
  const day = Math.floor((Date.now() - DAY_EPOCH) / 86400000);
  return ((day % count) + count) % count;
}

function getDailyGame(games) {
  if (!games.length) return null;
  return games[dailyIndex(games.length)];
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fmtTime(iso) {
  try {
    return (
      new Date(iso + "Z").toLocaleTimeString("en-US", {
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

function fmtCountdown(ms) {
  const h = Math.floor(ms / 3600000),
    m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

let games = [],
  currentGame = null,
  sessionHighScore = 0;
let sessionPlayId = null,
  sessionNameDone = false;

async function init() {
  try {
    const data = await fetch(`${SERVER_URL}/games.json`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    games = data.games || [];

    const listEl = document.getElementById("about-game-list");
    for (const g of games) {
      const card = document.createElement("div");
      card.className = "about-game-card";
      card.innerHTML =
        `<div class="about-game-name">${esc(g.name)}</div>` +
        `<div class="about-game-type">${esc(g.type || "")}</div>` +
        `<div class="about-game-desc">${esc(g.description || "")}</div>` +
        (g.controls
          ? `<div class="about-game-controls">${esc(g.controls)}</div>`
          : "");
      listEl.appendChild(card);
    }

    loadGame(getDailyGame(games));
  } catch {
    showServerError();
  }

  window.addEventListener("message", handleMessage);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAbout();
      closeLeaderboard();
      closeNamePrompt();
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
    if (e.target === e.currentTarget) closeNamePrompt();
  });
  document
    .getElementById("name-submit-btn")
    .addEventListener("click", submitName);
  document
    .getElementById("name-skip-btn")
    .addEventListener("click", closeNamePrompt);
  document.getElementById("name-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitName();
    if (e.key === "Escape") closeNamePrompt();
  });
}

function showServerError() {
  document.getElementById("game-title").textContent = "Server offline";
  document.getElementById("game-date").textContent = "";
  document.getElementById("loading").innerHTML = `
    <div class="server-error">
      <p>The newtab.party server isn't running.<br>Start it to play today's game.</p>
      <code>cd server &amp;&amp; npm start</code>
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
  sessionNameDone = false;

  document.getElementById("game-title").textContent = game.name;
  document.getElementById("game-date").textContent = todayLabel();
  document.getElementById("high-score").textContent = "";
  document.getElementById("high-score").classList.remove("new-best");

  const loading = document.getElementById("loading");
  const frame = document.getElementById("game-frame");
  loading.classList.remove("hidden");
  loading.textContent = "Loading…";

  frame.onload = () => loading.classList.add("hidden");
  // Games are served from the server — no extension release needed to add new ones
  frame.src = `${SERVER_URL}/${game.file}`;
}

function handleMessage(event) {
  const d = event.data;
  if (!d || typeof d.highScore !== "number") return;

  const score = Math.floor(d.highScore);
  if (score <= sessionHighScore) return;

  sessionHighScore = score;
  const el = document.getElementById("high-score");
  el.textContent = `Best: ${score.toLocaleString()}`;
  el.classList.remove("new-best");
  void el.offsetWidth;
  el.classList.add("new-best");

  if (currentGame) reportScore(currentGame.id, currentGame.name, score);
}

async function reportScore(gameId, gameName, score) {
  try {
    const r = await fetch(`${SERVER_URL}/api/plays`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, gameName, score }),
    });
    if (!r.ok) return;
    const { id, rank } = await r.json();
    sessionPlayId = id;

    const savedName = localStorage.getItem("playerName");
    if (savedName) {
      fetch(`${SERVER_URL}/api/plays/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: savedName }),
      }).catch(() => {});
    } else if (!sessionNameDone && rank <= 10) {
      showNamePrompt(rank);
    }
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
          `<td class="lb-score">${s.score.toLocaleString()}</td>` +
          `<td class="lb-time">${fmtTime(s.played_at)}</td>`;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML =
        '<tr><td colspan="4" class="lb-empty">No scores yet today — be the first</td></tr>';
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
  document.getElementById("name-rank-val").textContent = rank;
  document.getElementById("name-overlay").classList.add("open");
  document.getElementById("name-input").focus();
}

function closeNamePrompt() {
  document.getElementById("name-overlay").classList.remove("open");
  sessionNameDone = true;
}

function submitName() {
  const name = document.getElementById("name-input").value.trim();
  closeNamePrompt();
  if (!name || !sessionPlayId) return;
  localStorage.setItem("playerName", name);
  fetch(`${SERVER_URL}/api/plays/${sessionPlayId}`, {
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
