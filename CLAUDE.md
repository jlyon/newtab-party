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

Both the extension (`newtab.js`) and worker (`index.ts`) use the exact same algorithm — they must stay in sync:

```
DAY_EPOCH = Date.UTC(2026, 4, 1)   // May 1 2026 UTC
day       = floor((Date.now() - DAY_EPOCH) / 86_400_000)
index     = ((day % games.length) + games.length) % games.length
```

The double-modulo handles negative days (before epoch) safely. Scores are date-scoped using D1's `date(played_at)` in UTC.

## Adding a game

1. Build with the `game-builder` Claude Code skill (`/game-builder`)
2. Copy `.html` to `worker/public/games/`
3. Add entry to `worker/games.json` — **append to the end only** (see rotation rules below)
4. `npm run deploy` from `worker/` — live immediately, no extension update needed

Games with `controls` automatically get a pre-game info card in both the web player and extension.

### Rotation rules — read before touching games.json

Games are served in the order they appear in `games.json`. The index for day D is:

```
index = ((day % games.length) + games.length) % games.length
```

**Critical constraints:**
- **Always append** new games to the end of the `games` array. Never insert in the middle, never reorder, never remove.
- **Deploy at midnight UTC** when adding games. Because changing `games.length` shifts `day % N` for all days, deploying mid-day would change the current day's game for everyone mid-session.
- Past leaderboard records are stored in D1 by `game_id` and are unaffected by rotation changes — only the live computed mapping changes.

If you need to retire a game, keep it in the array (it will cycle back naturally) rather than removing it.

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
