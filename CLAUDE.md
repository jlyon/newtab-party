# CLAUDE.md — newtab.party

## What this project is

A Chrome extension (MV3) + Cloudflare Worker. The extension replaces the new tab page with an arcade game that rotates daily (same game for everyone, like Wordle). Games are static assets served from Cloudflare's edge. Scores are stored in Cloudflare D1 (SQLite) and shown on a per-game, per-day leaderboard that locks at midnight UTC.

## Key files

| File | Purpose |
|---|---|
| `extension/manifest.json` | MV3 manifest. `frame-src` allows iframing games from the worker URL. |
| `extension/newtab.js` | `SERVER_URL` const at top. Fetches `games.json`, computes today's game, loads it in an iframe, listens for `postMessage({highScore})`. |
| `worker/games.json` | Source of truth for the game library. Bundled into the worker at deploy time; also served at `GET /games.json`. |
| `worker/public/games/*.html` | Self-contained game files. Served as Cloudflare edge assets at `/games/*`. |
| `worker/src/index.ts` | Fetch handler + all routes. Intercepts `/games/*` to strip `X-Frame-Options`. |
| `worker/src/db.ts` | All D1 query logic (async). |
| `worker/src/render.ts` | `renderArcade()`, `renderLeaderboard()`, `renderReplay()` — server-rendered HTML. Start screen overlay, topbar tooltip, name prompt, recent-games about section. |
| `worker/src/types.ts` | `Game`, `Play`, `DailyEntry`, `Env` interfaces. |
| `worker/schema.sql` | D1 table + index definitions. Run once to initialize. |
| `worker/wrangler.toml` | Worker name, D1 binding, assets directory, custom domain route. |

## Daily game algorithm

Both the extension (`newtab.js`) and worker (`index.ts`) use the exact same algorithm — they must stay in sync. The pick is driven by an explicit **`schedule`** array in `games.json` (a list of game ids in air order) anchored at **`scheduleEpoch`** (a `YYYY-MM-DD` date):

```
DAY_EPOCH = Date.UTC(2026, 4, 1)              // fixed reference for day numbers
dayNumber(date) = floor((Date.UTC(date) - DAY_EPOCH) / 86_400_000)
offset    = dayNumber(today) - dayNumber(scheduleEpoch)
id        = schedule[((offset % L) + L) % L]   // L = schedule.length
game      = games.find(g => g.id === id)
```

If `schedule` is absent, both clients fall back to the legacy `index = ((dayNumber % games.length) + games.length) % games.length`.

**Why a schedule instead of `day % games.length`?** With plain modulo, changing the game count re-maps *every* day at once (adding a game reshuffled the whole rotation). Indexing an explicit, append-only `schedule` means appending a game only adds a slot at the end — the days already scheduled for the current cycle never move. The double-modulo still handles negative offsets (pre-epoch replay dates) safely. Scores are date-scoped using D1's `date(played_at)` in UTC.

## Adding a game

1. Build with the `game-builder` Claude Code skill (`/game-builder`)
2. Copy `.html` to `worker/public/games/`
3. Add entry to the `games` array in `worker/games.json` (order there is just the registry — it no longer drives rotation)
4. **Append the new game's id to the end of the `schedule` array** in `worker/games.json` — this is what schedules it. Appending means it debuts at the end of the current cycle and nothing already scheduled shifts.
5. `npm run deploy` from `worker/` — live immediately, no extension update needed

Games with `controls` automatically get a pre-game info card in both the web player and extension.

### Rotation rules — read before touching games.json

Rotation is driven by the `schedule` array (game ids in air order), anchored at `scheduleEpoch`. The pick for a date is `schedule[(offset % L) + L) % L]` where `offset = dayNumber(date) - dayNumber(scheduleEpoch)`.

**Critical constraints:**
- **Append schedule entries to the end only.** Appending adds a future slot, so the current cycle stays frozen — that's the whole point. Inserting/reordering earlier entries WILL shift upcoming days.
- Every id in `schedule` must exist in the `games` array. A game listed in `games` but absent from `schedule` simply never airs; an id in `schedule` with no matching game falls through to the legacy modulo pick.
- **Deploy at midnight UTC.** Appending to `schedule` doesn't move the current cycle, but still deploy at the boundary as a habit so nothing changes mid-session.
- Don't move `scheduleEpoch` — it's the anchor. Changing it shifts everything.
- Past leaderboard records are stored in D1 by `game_id` and are unaffected — only the computed date→game mapping changes.

To retire a game, remove its id from `schedule` (keep the entry in `games` and the file in `public/games/` so past replays/records still resolve).

### postHi() protocol

Every game must signal high scores to the parent frame. Add this inside the IIFE:

```js
let _hi = 0;
function postHi(n) {
  n = Math.floor(n) || 0;
  if (n > _hi) { _hi = n; window.parent.postMessage({ highScore: n }, '*'); }
}
```

Call `postHi(score)` whenever the player reaches a new personal best. The newtab wrapper listens and forwards it to `POST /api/plays`.

## Database

Cloudflare D1 (SQLite-compatible, async API). Schema in `worker/schema.sql`:

```sql
CREATE TABLE plays (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     TEXT    NOT NULL,
  game_name   TEXT    NOT NULL,
  score       INTEGER NOT NULL,
  player_name TEXT,
  played_at   DATETIME DEFAULT CURRENT_TIMESTAMP  -- UTC
);
```

All queries are in `worker/src/db.ts`. D1 uses `db.prepare(sql).bind(...).run/first/all()` — everything is async. Key functions:
- `recordPlay(db, gameId, gameName, score)` → `{ id, rank }`
- `getDailyScores(db, gameId, date)` → `Play[]`
- `getDailyCount(db, gameId, date)` → `number`
- `getPreviousDays(db, limit)` → `DailyEntry[]`
- `setPlayerName(db, id, name)` → `boolean` (false if play is from a past day)

## URLs

- Production: `https://newtab.party`
- GitHub: `https://github.com/jlyon/newtab-party`
- Local dev: `http://localhost:8787` (wrangler dev default)
- Extension `SERVER_URL` const: top of `extension/newtab.js`
- Extension `frame-src`: `extension/manifest.json` → `content_security_policy`

## Running locally

```bash
cd worker
npm install
npm run db:init:local          # create local D1 SQLite (first time only)
npm run dev                    # wrangler dev → http://localhost:8787
```

For extension dev, set `SERVER_URL = 'http://localhost:8787'` in `newtab.js` and reload the extension in `chrome://extensions`.

## Deploying

```bash
cd worker
npx wrangler d1 create newtab-party   # first time only — paste database_id into wrangler.toml
npm run db:init:remote                 # first time only — runs schema.sql against prod D1
npm run deploy                         # wrangler deploy
```

## Common tasks

**Check today's game and scores:**
```bash
curl https://newtab.party/api/daily | jq .
```

**Inspect the D1 database (local):**
```bash
cd worker && npx wrangler d1 execute newtab-party --local \
  --command "SELECT game_id, score, played_at FROM plays ORDER BY played_at DESC LIMIT 10"
```

**Inspect the D1 database (production):**
```bash
cd worker && npx wrangler d1 execute newtab-party \
  --command "SELECT game_id, score, played_at FROM plays ORDER BY played_at DESC LIMIT 10"
```

**Type-check the worker:**
```bash
cd worker && npx tsc --noEmit
```
