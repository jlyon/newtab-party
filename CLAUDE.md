# CLAUDE.md — newtab.party

## What this project is

A Chrome extension (MV3) + local Express/TypeScript server. The extension replaces the new tab page with an arcade game that rotates daily (same game for everyone, like Wordle). Games are served over HTTP from the local server — no extension release needed to add new ones. Scores are stored in SQLite and shown on a per-game, per-day leaderboard.

## Key files

| File | Purpose |
|---|---|
| `extension/manifest.json` | MV3 manifest. `frame-src http://localhost:3742` lets the newtab page iframe games from the server. No sandbox needed — games run as regular HTTP pages. |
| `extension/newtab.js` | Fetches `games.json` from server, computes today's game, loads it in an iframe, listens for `postMessage({highScore})`. |
| `server/games.json` | Source of truth for the game library. Server reads this; extension fetches it over HTTP. |
| `server/games/*.html` | Self-contained game files. Served statically by the server at `/games/*`. |
| `server/src/index.ts` | Express routes + inline HTML renderers for the arcade player and leaderboard. Also exports `GET /api/daily`. |
| `server/src/db.ts` | All SQLite logic via `better-sqlite3`. DB is at `server/data/arcade.db` (auto-created). |

## Daily game algorithm

Both the extension (`newtab.js`) and server (`index.ts`) use the exact same algorithm — they must stay in sync:

```
DAY_EPOCH = Date.UTC(2026, 4, 1)   // May 1 2026 UTC
day       = floor((Date.now() - DAY_EPOCH) / 86_400_000)
index     = ((day % games.length) + games.length) % games.length
```

The double-modulo handles negative days (before epoch) safely. Scores are date-scoped using SQLite's `date(played_at)` in UTC, which matches.

## Adding a game

1. Build with the `game-builder` Claude Code skill (`/game-builder`)
2. Copy `.html` to `server/games/`
3. Add entry to `server/games.json` — required fields: `id`, `name`, `file`, `description`, `controls`, `type`
4. Restart the server — the game is live in both web player and extension immediately
5. No changes to `manifest.json` or the extension needed

### postHi() protocol

Every game must signal high scores to the parent frame. Add this inside the IIFE:

```js
let _hi = 0;
function postHi(n) {
  n = Math.floor(n) || 0;
  if (n > _hi) { _hi = n; window.parent.postMessage({ highScore: n }, '*'); }
}
```

Call `postHi(score)` whenever the player reaches a new personal best (on game-over, on score increase, etc.). The newtab wrapper listens for this message and forwards it to `POST /api/plays`.

## Database

SQLite via `better-sqlite3` (synchronous, no async needed). Schema:

```sql
CREATE TABLE plays (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id   TEXT    NOT NULL,
  game_name TEXT    NOT NULL,
  score     INTEGER NOT NULL,
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- UTC
);
```

Key queries live in `db.ts`:
- `recordPlay(gameId, gameName, score)` → returns `{ id, rank }` where rank is position among today's scores for that game
- `getDailyScores(gameId, date)` → all scores for a game on a YYYY-MM-DD date
- `getDailyCount(gameId, date)` → play count
- `getPreviousDays(limit)` → one row per past UTC date with top score + play count

## Server ports / URLs

- Server: `http://localhost:3742`
- Extension frames games from: `http://localhost:3742/games/*.html`
- Extension fetches library from: `http://localhost:3742/games.json`

If the server is not running, the extension shows a friendly error with instructions to start it (`cd server && npm start`).

## Running the server

```bash
cd server && npm install && npm start   # tsx src/index.ts
cd server && npm run dev                # tsx watch (auto-reload)
```

TypeScript is compiled on-the-fly via `tsx`. No build step needed for development.

## Common tasks

**Check today's game and scores:**
```bash
curl http://localhost:3742/api/daily | jq .
```

**Inspect the database:**
```bash
sqlite3 server/data/arcade.db "SELECT game_id, score, played_at FROM plays ORDER BY played_at DESC LIMIT 10;"
```

**Type-check the server:**
```bash
npx tsc --project server/tsconfig.json --noEmit
```
