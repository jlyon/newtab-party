# newtab.party

A Chrome extension that replaces your new tab page with a different arcade game every day — like Wordle, but instead of a word puzzle you get a game. Everyone plays the same game, scores appear on a shared daily leaderboard, and the leaderboard locks at midnight UTC.

## How it works

- **Daily rotation** — the game changes every day at midnight UTC. Both the extension and the server independently compute today's game from the same deterministic algorithm, so they always agree without a round-trip.
- **Hosted games** — game files are static assets on Cloudflare's edge. The extension is a thin client that loads today's game in an iframe. Adding a game is a deploy, not an extension update.
- **Score tracking** — games call `postMessage({ highScore: int })` to the parent frame. The extension (or web player) forwards this to the API, which stores it in Cloudflare D1 (SQLite) and returns the player's rank.

## Stack

| Layer | Tech |
|---|---|
| Chrome extension | Manifest V3, vanilla JS |
| Backend | [Cloudflare Workers](https://workers.cloudflare.com/) + TypeScript |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) |
| Static assets | Cloudflare edge (game HTML files) |
| Games | Self-contained single-file HTML, built with the `game-builder` Claude Code skill |

---

## Production deploy

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) — installed as a dev dependency

### 1 — Create the D1 database

```bash
cd worker
npm install
npx wrangler d1 create newtab-party
```

Copy the `database_id` from the output and paste it into `worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "newtab-party"
database_id = "paste-id-here"
```

### 2 — Initialize the schema

```bash
npx wrangler d1 execute newtab-party --remote --file=schema.sql
```

### 3 — Deploy the worker

```bash
npm run deploy
```

Wrangler prints your worker URL (e.g. `https://newtab-party.your-subdomain.workers.dev`). If you have a custom domain, add a route in `wrangler.toml`:

```toml
[[routes]]
pattern = "yourdomain.com"
custom_domain = true
```

### 4 — Point the extension at the live URL

Edit `extension/newtab.js`:

```js
const SERVER_URL = 'https://your-worker-url';
```

And update `extension/manifest.json` to allow framing from that origin:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; frame-src https://your-worker-url;"
},
"host_permissions": ["https://your-worker-url/*"]
```

### 5 — Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `extension/` folder
4. Open a new tab — today's game loads automatically

---

## Local development

```bash
cd worker
npm install

# Initialize the local D1 database
npm run db:init:local

# Start the dev server (http://localhost:8787)
npm run dev
```

For local extension testing, set `SERVER_URL = 'http://localhost:8787'` in `extension/newtab.js` and update `manifest.json` accordingly.

---

## Adding a game

1. Run `/game-builder` in a Claude Code session and design your game
2. Copy the generated `.html` file into `worker/public/games/`
3. Add an entry to `worker/games.json`:

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

4. Deploy: `npm run deploy` from `worker/`
5. Submit a PR to share it

### `postHi()` contract

Every game must call this when the player sets a new personal best:

```js
let _hi = 0;
function postHi(n) {
  n = Math.floor(n) || 0;
  if (n > _hi) { _hi = n; window.parent.postMessage({ highScore: n }, '*'); }
}
```

Call `postHi(score)` from the game's end-state or whenever the score increases past the previous best.

---

## API

| Endpoint | Description |
|---|---|
| `GET /` | Web arcade player (today's daily game) |
| `GET /leaderboard` | Daily leaderboard with previous games |
| `GET /play/:date` | Replay a past game (read-only, scores not saved) |
| `GET /games.json` | Game library index |
| `GET /games/:file` | Static game HTML |
| `GET /api/daily` | Today's game + scores as JSON |
| `POST /api/plays` | Record a score `{ gameId, gameName, score }` |
| `PATCH /api/plays/:id` | Set player name `{ playerName }` (today only) |
| `GET /api/scores/:gameId` | Today's scores for a game |
| `GET /api/recent` | 20 most recent plays |
| `GET /api/recent-days` | Last 4 days' games (deterministic, no DB) |

---

## Project structure

```
newtab.party/
├── extension/
│   ├── manifest.json         # MV3 manifest
│   ├── newtab.html / .js     # New tab UI (thin client)
│   └── icons/                # 🥳 extension icons
└── worker/
    ├── src/
    │   ├── index.ts          # Fetch handler + all routes
    │   ├── db.ts             # D1 async queries
    │   ├── render.ts         # HTML page renderers
    │   └── types.ts          # Shared interfaces
    ├── public/
    │   └── games/            # Game HTML files (Cloudflare edge assets)
    ├── games.json            # Game library index (bundled into worker)
    ├── schema.sql            # D1 table schema
    ├── wrangler.toml         # Worker + D1 + assets config
    ├── package.json
    └── tsconfig.json
```
