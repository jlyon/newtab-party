# newtab.party

A Chrome extension that replaces your new tab page with a different arcade game every day — like Wordle, but instead of a word puzzle you get a game. Everyone plays the same game, scores appear on a shared daily leaderboard, and the leaderboard locks at midnight UTC.

**[→ Install the Chrome extension](https://chromewebstore.google.com/detail/newtabparty/hhledeikahmmaakcgcapeklbajaganbm)** · **[→ Play in your browser](https://newtab.party)**

---

## 🎮 Build your own game — get it featured

You don't need to know how to code games. Tell Claude what you want, iterate until it's fun, send a PR. Your game gets its own day on newtab.party — everyone who opens a new tab that day plays it.

1. **Add the newtab.party plugin marketplace to Claude Code:**

   ```
   /plugin marketplace add jlyon/newtab-party
   ```

   ([Plugin marketplace docs](https://code.claude.com/docs/en/discover-plugins))

2. **Run the skill to build your game:**

   ```
   /game-builder
   ```

   Claude walks you through 4 quick questions (game type, name, colors, theme) and generates a complete, single-file HTML game.

3. **Play until your heart's delight.** Chat with the robot to get your game just right — faster enemies, new colors, better juice, a custom win screen, whatever. Iterate until you love it.

4. **Open a PR to get your game featured on its special date.** Fork [the repo](https://github.com/jlyon/newtab-party), drop the `.html` into `worker/public/games/`, add an entry to `worker/games.json`, and submit a pull request. Once merged + deployed, your game joins the daily rotation.

   The `games.json` entry looks like:

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

## Running the website locally

```bash
cd worker
npm install
npm run db:init:local          # one-time: create local D1 SQLite
npm run dev                    # wrangler dev → http://localhost:8787
```

Open [http://localhost:8787](http://localhost:8787) to play today's game in the browser.

For local extension testing, set `SERVER_URL = 'http://localhost:8787'` in `extension/newtab.js` and update `extension/manifest.json`'s `frame-src` accordingly. Then load the extension via `chrome://extensions` → **Load unpacked** → select the `extension/` folder.

---

## Deploying to production

You only need this if you're forking the project and hosting your own copy. The canonical instance lives at [newtab.party](https://newtab.party).

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) — already in `worker/package.json`

### 1 — Create the D1 database

```bash
cd worker
npm install
npx wrangler d1 create newtab-party
```

Paste the printed `database_id` into `worker/wrangler.toml`:

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

Wrangler prints your worker URL (e.g. `https://newtab-party.your-subdomain.workers.dev`). For a custom domain, add to `wrangler.toml`:

```toml
[[routes]]
pattern = "yourdomain.com"
custom_domain = true
```

### 4 — Point the extension at your worker

In `extension/newtab.js`:

```js
const SERVER_URL = 'https://your-worker-url';
```

In `extension/manifest.json`:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; frame-src https://your-worker-url;"
},
"host_permissions": ["https://your-worker-url/*"]
```

Reload the extension in `chrome://extensions`.

---

## App structure

Two pieces: a thin Chrome extension that loads today's game in an iframe, and a Cloudflare Worker that serves the games, renders the web UI, and tracks scores.

**Daily rotation.** Both sides compute today's game from the same deterministic algorithm: index into the explicit `schedule` list in `games.json` (game ids in air order) anchored at `scheduleEpoch` — `schedule[((offset % L) + L) % L]` where `offset = dayNumber(today) - dayNumber(scheduleEpoch)`. An append-only schedule (rather than `day % games.length`) means adding a game only appends a future slot, so the current cycle never reshuffles. No round-trip needed, they always agree.

**Score flow.** Game → `postMessage({ highScore: int })` → extension/web player → `POST /api/plays` → Cloudflare D1. The API returns `{ id, rank }` so the player sees their leaderboard position.

### Layout

```
newtab.party/
├── extension/
│   ├── manifest.json         # MV3 manifest, frame-src allows iframing games
│   ├── newtab.html / .js     # New tab UI (thin client)
│   └── icons/                # 🥳 extension icons
└── worker/
    ├── src/
    │   ├── index.ts          # Fetch handler + all routes
    │   ├── db.ts             # D1 async queries
    │   ├── render.ts         # renderArcade / renderLeaderboard / renderReplay
    │   └── types.ts          # Game, Play, DailyEntry, Env interfaces
    ├── public/games/         # Self-contained game HTML files (edge assets)
    ├── games.json            # Game library index (source of truth)
    ├── schema.sql            # D1 table + index definitions
    ├── wrangler.toml         # Worker + D1 + assets + routes config
    └── package.json
```

### Stack

| Layer | Tech |
|---|---|
| Chrome extension | Manifest V3, vanilla JS, no build step |
| Backend | [Cloudflare Workers](https://workers.cloudflare.com/) + TypeScript |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite, async) |
| Static assets | Cloudflare edge (game HTML files) |
| Games | Self-contained single-file HTML, built with the `game-builder` Claude Code skill |

### API

| Endpoint | Description |
|---|---|
| `GET /` | Web arcade player (today's daily game) |
| `GET /leaderboard` | Daily leaderboard + previous 7 days |
| `GET /play/:date` | Replay a past game (read-only, scores not saved) |
| `GET /games.json` | Game library index |
| `GET /games/:file` | Static game HTML |
| `GET /api/daily` | Today's game + scores as JSON |
| `POST /api/plays` | Record a score `{ gameId, gameName, score }` → `{ id, rank }` |
| `PATCH /api/plays/:id` | Set player name `{ playerName }` (today only) |
| `GET /api/scores/:gameId` | Today's scores for a game |
| `GET /api/recent` | 20 most recent plays |
| `GET /api/recent-days` | Last 4 days' games (deterministic, no DB) |

### Rotation rules

Games are served in `games.json` order. **Always append** new entries to the end — never insert, reorder, or remove. Changing `games.length` shifts `day % N` for every day, so deploys that change game count should land at midnight UTC to avoid swapping the current game mid-session. Past leaderboard records are stored by `game_id` and are unaffected by rotation changes — only the live mapping shifts.
