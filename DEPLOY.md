# Running and deploying newtab.party

This covers the website, the Chrome extension and the backend. If you only want to build games, the [README](README.md) is all you need.

The canonical instance lives at [newtab.party](https://newtab.party). You only need the deploy steps if you're hosting your own copy.

## How it fits together

Two pieces: a thin Chrome extension that loads today's game in an iframe, and a Cloudflare Worker that serves the games, renders the web UI and stores scores.

| Layer | Tech |
|---|---|
| Chrome extension | Manifest V3, vanilla JS, no build step |
| Backend | [Cloudflare Workers](https://workers.cloudflare.com/) with TypeScript |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite, async) |
| Static assets | Cloudflare edge (game HTML, logos, backgrounds) |
| Games | Self-contained single-file HTML, built with the `game-builder` skill |

**Score flow.** A game posts `postMessage({ highScore })` at the end of each run. The extension or web player asks `/api/qualify` whether that score makes today's top 10. If it does, it records it with `POST /api/plays` and prompts for a name. Scores are stored exactly as the game shows them, with no normalization.

**Daily rotation.** The extension (`extension/newtab.js`) and the worker (`worker/src/index.ts`) compute today's game with the same algorithm, so they always agree without a round trip. The pick comes from the `schedule` array in `worker/games.json`, anchored at `scheduleEpoch`:

```
DAY_EPOCH = Date.UTC(2026, 4, 1)
dayNumber(date) = floor((Date.UTC(date) - DAY_EPOCH) / 86_400_000)
offset = dayNumber(today) - dayNumber(scheduleEpoch)
id     = schedule[((offset % L) + L) % L]      // L = schedule.length
```

### Layout

```
newtab-party/
├── .claude-plugin/
│   ├── plugin.json            # Plugin manifest
│   └── marketplace.json       # Lets `/plugin marketplace add jlyon/newtab-party` work
├── skills/game-builder/       # The skill: SKILL.md + assets/scaffold.html
├── extension/
│   ├── manifest.json          # MV3 manifest; frame-src allows iframing games
│   ├── newtab.html / .js      # New tab UI (thin client)
│   └── icons/
├── ios/                       # Thin WKWebView wrapper around newtab.party
├── package.json               # npm scripts for everything (run from the root)
├── scripts/
│   ├── qa/lint.mjs            # Static rules every game must pass
│   ├── qa/smoke.mjs           # Playwright run on desktop, iPhone and iPad
│   ├── gen_logos.mjs          # Batch logo generator (Gemini API)
│   └── retire_game.mjs        # Retire games from the rotation
└── worker/
    ├── src/
    │   ├── index.ts           # Fetch handler and all routes
    │   ├── db.ts              # D1 queries
    │   ├── render.ts          # Arcade, leaderboard, replay and /games pages
    │   └── types.ts
    ├── public/games/          # Game HTML, plus logos/ and backgrounds/
    ├── games.json             # Game registry and air schedule (source of truth)
    ├── schema.sql
    └── wrangler.toml
```

## Run it locally

```bash
npm install                    # at the repo root
npm run db:init:local          # first time only: create the local D1 database
npm run dev                    # http://localhost:8787
```

To test the extension against your local worker, set `SERVER_URL = 'http://localhost:8787'` at the top of `extension/newtab.js`, add the same origin to `frame-src` in `extension/manifest.json`, then load it from `chrome://extensions` with **Load unpacked** and pick the `extension/` folder.

Type-check the worker:

```bash
npm run typecheck
```

## Deploy your own copy

You need a [Cloudflare account](https://dash.cloudflare.com/sign-up) (the free tier works). Wrangler is already a dev dependency in the root `package.json`; every npm script runs from the repo root and passes `--cwd worker` to wrangler.

### 1. Create the database

```bash
npm install
npx wrangler d1 create newtab-party --cwd worker
```

Paste the printed `database_id` into `worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "newtab-party"
database_id = "paste-id-here"
```

### 2. Create the tables

```bash
npm run db:init:remote
```

### 3. Deploy the worker

```bash
npm run deploy
```

Wrangler prints your worker URL. For a custom domain, add this to `wrangler.toml`:

```toml
[[routes]]
pattern = "yourdomain.com"
custom_domain = true
```

### 4. Point the extension at your worker

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

Then reload the extension in `chrome://extensions`.

## Adding a game to the rotation

1. Put the file in `worker/public/games/<id>.html`.
2. Run the QA gate: `npm run qa:lint -- <id>` and `SHOTS=1 npm run qa:smoke -- <id>`.
3. Add an entry to the `games` array in `worker/games.json`.
4. Append the id to the **end** of the `schedule` array.
5. Generate its logo (see below).
6. `npm run deploy`. No extension update is needed.

### Rotation rules

- **Append to `schedule` only.** Appending adds a slot at the end of the cycle, so days already scheduled never move. Inserting or reordering earlier entries shifts every upcoming day.
- **Don't change `scheduleEpoch`.** It's the anchor; moving it shifts everything.
- **Every id in `schedule` must exist in `games`.** A game in `games` but not in `schedule` never airs.
- **Retire a game** by removing its id from `schedule`. Keep its `games` entry and its file so past replays still work.
- **Deploy at midnight UTC** as a habit, so nothing changes mid-day.
- Past leaderboards are stored by `game_id` and are never affected by schedule changes.

## Logos

Each game has a transparent crest logo at `worker/public/games/logos/<id>.png`. It's used on the title screen, the `/games` calendar and the recent-games cards. Generate them in batches with the Gemini image API:

```bash
cp .env.example .env            # once, then set GEMINI_API_KEY (https://aistudio.google.com/apikey)
pip install pillow numpy        # once

npm run logos                                         # every game without a logo (default)
npm run logos -- my-game                              # one or more specific games
npm run logos -- my-game --force --hint "a smug goose in a tuxedo"
npm run logos -- my-game --from-file raw.png          # key an image you made elsewhere
npm run logos -- --dry-run --all                      # print prompts, call nothing
```

The script reads each game's name and description from `games.json`, or an optional `"logo"` hint field. It renders the crest on flat magenta and chroma-keys it to real transparency. Set `GEMINI_IMAGE_MODEL` in `.env` to override the default model.

## QA harness

```bash
npm run qa:lint -- [id ...]                 # every game when no ids are given
SHOTS=1 npm run qa:smoke -- [id ...]        # screenshots go to scripts/qa/shots/
MODES=desktop,mobile npm run qa:smoke -- my-game
```

The lint checks for score scaling, a fixed-step game loop, the viewport meta tag, touch-gated controls and `100vh`. The smoke test serves the games locally, clicks Play, feeds keyboard and touch input, and flags page errors, overflow, clipped canvases, off-screen or tiny buttons, and content that can't be scrolled by touch. It runs on desktop, iPhone 13, iPhone SE, and iPad in both orientations.

It needs Playwright. Run `npm i -D playwright` in `scripts/qa`, or set `CHROMIUM_PATH` to an existing Chromium.

## API

| Endpoint | Description |
|---|---|
| `GET /` | Web arcade player (today's game) |
| `GET /leaderboard` | Today's leaderboard and the previous 7 days |
| `GET /play/:date` | Replay a past game (practice, scores not saved) |
| `GET /games` | Practice room calendar of every game |
| `GET /games.json` | Game registry and schedule |
| `GET /games/:file` | Static game files |
| `GET /api/daily` | Today's game and scores as JSON |
| `GET /api/qualify?gameId=&score=` | Whether a score would make today's top 10 |
| `POST /api/plays` | Record a score `{ gameId, gameName, score }`, returns `{ id, rank }` |
| `PATCH /api/plays/:id` | Set the player name `{ playerName }` (today only) |
| `DELETE /api/plays/:id` | Remove a play (today only) |
| `GET /api/scores/:gameId` | Today's scores for a game |
| `GET /api/recent` | 20 most recent plays |
| `GET /api/recent-days` | The last 4 days' games (computed, no database) |

## Useful commands

```bash
curl https://newtab.party/api/daily | jq .

npx wrangler d1 execute newtab-party --cwd worker --remote \
  --command "SELECT game_id, score, played_at FROM plays ORDER BY played_at DESC LIMIT 10"
```
