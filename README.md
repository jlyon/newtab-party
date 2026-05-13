# newtab.party

A Chrome extension that replaces your new tab page with an arcade game — like Wordle, but instead of a word puzzle you get a different game each day. Everyone on the server plays the same game, and scores appear on a shared daily leaderboard.

## How it works

- **Daily rotation** — the game changes every day at midnight UTC. The rotation is deterministic: both the extension and the server independently compute today's game from the same date-based algorithm, so they always agree.
- **Server-hosted games** — game files live in `extension/games/` and are served by the local server over HTTP. The extension is a thin client that loads games as iframes. Adding a new game only requires dropping a file and restarting the server — no extension update needed.
- **Score tracking** — every high score is sent to the server via `window.parent.postMessage({ highScore: int }, '*')` from the game iframe. The server stores scores in SQLite and shows them on the leaderboard.

## Stack

| Layer | Tech |
|---|---|
| Chrome extension | Manifest V3, vanilla JS |
| Server | Node.js + Express + TypeScript |
| Database | **SQLite** via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) |
| Games | Self-contained single-file HTML, built with the [`game-builder`](https://github.com/shoppad/newtab.party) Claude Code skill |

The SQLite database is stored at `server/data/arcade.db` and is created automatically on first run.

## Setup

### 1 — Start the server

```bash
cd server
npm install
npm start
# → http://localhost:3742
```

### 2 — Load the Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `extension/` folder
4. Open a new tab — today's game loads automatically

## Adding a new game

1. Install the `game-builder` Claude Code skill from the repo
2. Run `/game-builder` in any Claude Code session and design your game
3. Copy the generated `.html` file into `server/games/`
4. Add an entry to `server/games.json`:

```json
{
  "id": "my-game",
  "name": "My Game",
  "file": "games/my-game.html",
  "description": "One sentence description.",
  "controls": "Arrow keys to move · Space to action",
  "type": "spaceship-shooter"
}
```

5. Restart the server — the game is immediately available in both the web player and the extension
6. Submit a PR to share it

### `postHi()` contract

Every game must call this when the player sets a new personal best:

```js
window.parent.postMessage({ highScore: <integer> }, '*');
```

The standard pattern (add inside the game's IIFE):

```js
let _hi = 0;
function postHi(n) {
  n = Math.floor(n) || 0;
  if (n > _hi) { _hi = n; window.parent.postMessage({ highScore: n }, '*'); }
}
```

Call `postHi(score)` from the game's end-state or whenever the score increases past the previous best.

## API

| Endpoint | Description |
|---|---|
| `GET /` | Web arcade player (today's daily game) |
| `GET /leaderboard` | Daily leaderboard with previous games |
| `GET /games.json` | Game library index |
| `GET /games/:file` | Static game HTML |
| `GET /api/daily` | Today's game + scores as JSON |
| `POST /api/plays` | Record a score `{ gameId, gameName, score }` |
| `GET /api/scores/:gameId` | Today's scores for a game |
| `GET /api/recent` | 20 most recent plays |

## Project structure

```
newtab/
├── extension/
│   ├── manifest.json       # Chrome extension manifest (MV3)
│   └── newtab.html / .js   # New tab UI (thin client — no game files bundled)
└── server/
    ├── src/
    │   ├── index.ts        # Express server + HTML renderers
    │   └── db.ts           # SQLite queries (better-sqlite3)
    ├── games/              # Game HTML files (served over HTTP)
    │   ├── blouncerroozal.html
    │   ├── shootin-n-crackin.html
    │   ├── asshole.html
    │   └── stump-grandpa.html
    ├── games.json          # Game library index
    ├── data/               # arcade.db lives here (git-ignored)
    ├── package.json
    └── tsconfig.json
```
