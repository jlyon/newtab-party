import type { Env, Game, GamesData, ScheduleEra } from './types';
import * as db from './db';
import { renderArcade, renderLeaderboard, renderReplay, renderGamesCalendar, esc } from './render';
import gamesData from '../games.json';

// Day 0 = 2026-05-01 UTC — must match the extension's DAY_EPOCH exactly.
const DAY_EPOCH = Date.UTC(2026, 4, 1);

// A score qualifies for the name prompt if it lands in the day's top N
// (global, across all of today's plays for the game).
const LEADERBOARD_SIZE = 10;

const DATA = gamesData as GamesData;

function getGames(): Game[] {
  return DATA.games ?? [];
}

// The schedule era in effect on a given date: the latest era whose epoch is on
// or before the date (the earliest era for dates before any epoch). Retiring a
// game (scripts/retire_game.mjs) starts a new era, so past dates keep the
// mapping they aired under.
function eraFor(dateStr: string): ScheduleEra | null {
  const eras: ScheduleEra[] = [...(DATA.scheduleHistory ?? [])];
  if (DATA.schedule?.length && DATA.scheduleEpoch) eras.push({ scheduleEpoch: DATA.scheduleEpoch, schedule: DATA.schedule });
  const valid = eras.filter((e) => e.schedule?.length && e.scheduleEpoch).sort((a, b) => a.scheduleEpoch.localeCompare(b.scheduleEpoch));
  if (!valid.length) return null;
  let era = valid[0];
  for (const e of valid) if (e.scheduleEpoch <= dateStr) era = e;
  return era;
}

function isRetired(id: string, dateStr: string): boolean {
  const since = DATA.retired?.[id];
  return !!since && since <= dateStr;
}

// Day number since DAY_EPOCH (May 1 2026 UTC) for a YYYY-MM-DD string.
function dayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - DAY_EPOCH) / 86400000);
}

// The daily pick. Uses the explicit `schedule` list in games.json (anchored at
// `scheduleEpoch`) so that APPENDING a game only adds a future slot — the games
// already scheduled for the current cycle never move. Falls back to a plain
// modulo over the games array if no schedule is configured. For past dates the
// worker uses the era that was in effect then (`scheduleHistory`); for today
// the current era is used, which is exactly what extension/newtab.js and the
// inline script in render.ts compute. The per-era math MUST stay in sync.
function getDailyGame(games: Game[], dateStr: string): Game | null {
  if (!games.length) return null;
  const era = eraFor(dateStr);
  if (era) {
    const off = dayNumber(dateStr) - dayNumber(era.scheduleEpoch);
    const L = era.schedule.length;
    const id = era.schedule[((off % L) + L) % L];
    const g = games.find((x) => x.id === id);
    if (g) return g;
  }
  const day = dayNumber(dateStr);
  return games[((day % games.length) + games.length) % games.length];
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── Static-ish: serve bundled games.json for extension ──
    if (pathname === '/games.json' && method === 'GET') {
      return new Response(JSON.stringify(gamesData), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // ── API ──────────────────────────────────────────────────

    if (pathname === '/api/daily' && method === 'GET') {
      const games = getGames();
      const today = todayUTC();
      const game = getDailyGame(games, today);
      if (!game) return json({ error: 'No games configured' }, 503);
      const [scores, count] = await Promise.all([
        db.getDailyScores(env.DB, game.id, today),
        db.getDailyCount(env.DB, game.id, today),
      ]);
      const t = new Date();
      t.setUTCHours(24, 0, 0, 0);
      return json({ date: today, game, scores, totalPlays: count, nextAt: t.toISOString() });
    }

    if (pathname === '/api/plays' && method === 'POST') {
      let body: Record<string, unknown>;
      try { body = await request.json() as Record<string, unknown>; }
      catch { return json({ error: 'Invalid JSON' }, 400); }

      const { gameId, gameName, score } = body;
      if (typeof gameId !== 'string' || !gameId.trim())
        return json({ error: 'gameId is required' }, 400);
      if (typeof score !== 'number' || !Number.isFinite(score))
        return json({ error: 'score must be a number' }, 400);

      const todayGame = getDailyGame(getGames(), todayUTC());
      if (!todayGame || todayGame.id !== gameId.trim())
        return json({ error: "Scores can only be submitted for today's game" }, 403);

      const name = typeof gameName === 'string' ? gameName.trim() || gameId : gameId;
      const result = await db.recordPlay(env.DB, gameId.trim(), name as string, Math.floor(score as number));
      return json(result);
    }

    // Would this score make today's top-N board? (no insert — just a check)
    if (pathname === '/api/qualify' && method === 'GET') {
      const gameId = (url.searchParams.get('gameId') || '').trim();
      const score = Number(url.searchParams.get('score'));
      if (!gameId || !Number.isFinite(score))
        return json({ error: 'gameId and numeric score are required' }, 400);
      const today = todayUTC();
      const todayGame = getDailyGame(getGames(), today);
      if (!todayGame || todayGame.id !== gameId)
        return json({ qualifies: false, rank: 0, size: LEADERBOARD_SIZE });
      const rank = await db.getDailyRank(env.DB, gameId, Math.floor(score), today);
      return json({ rank, qualifies: rank <= LEADERBOARD_SIZE, size: LEADERBOARD_SIZE });
    }

    const patchMatch = pathname.match(/^\/api\/plays\/(\d+)$/);
    if (patchMatch && method === 'PATCH') {
      const id = parseInt(patchMatch[1], 10);
      let body: Record<string, unknown>;
      try { body = await request.json() as Record<string, unknown>; }
      catch { return json({ error: 'Invalid JSON' }, 400); }

      const { playerName } = body;
      if (typeof playerName !== 'string' || !playerName.trim())
        return json({ error: 'playerName is required' }, 400);

      const updated = await db.setPlayerName(env.DB, id, playerName);
      if (!updated)
        return json({ error: 'Cannot update — play not found or leaderboard is locked' }, 403);
      return json({ ok: true });
    }

    if (patchMatch && method === 'DELETE') {
      const id = parseInt(patchMatch[1], 10);
      const deleted = await db.deletePlay(env.DB, id);
      if (!deleted)
        return json({ error: 'Cannot delete — play not found or leaderboard is locked' }, 403);
      return json({ ok: true });
    }

    const scoresMatch = pathname.match(/^\/api\/scores\/(.+)$/);
    if (scoresMatch && method === 'GET') {
      const scores = await db.getDailyScores(env.DB, scoresMatch[1], todayUTC());
      return json(scores);
    }

    if (pathname === '/api/recent' && method === 'GET') {
      const plays = await db.getRecentPlays(env.DB);
      return json(plays);
    }

    // ── Game files — strip X-Frame-Options so iframes work from the extension ──
    if (pathname.startsWith('/games/') && method === 'GET') {
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      headers.delete('X-Frame-Options');
      headers.set('Content-Security-Policy', "frame-ancestors *");
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    }

    if (pathname === '/api/recent-days' && method === 'GET') {
      const games = getGames();
      const result = [];
      for (let i = 0; i < 4; i++) {
        const t = new Date();
        t.setUTCDate(t.getUTCDate() - i);
        const dateStr = t.toISOString().slice(0, 10);
        const game = getDailyGame(games, dateStr);
        if (game) result.push({ date: dateStr, game });
      }
      return json(result);
    }

    // ── Web UI ───────────────────────────────────────────────

    if (pathname === '/' && method === 'GET') {
      return html(renderArcade());
    }

    if (pathname === '/leaderboard' && method === 'GET') {
      const games = getGames();
      const today = todayUTC();
      const game = getDailyGame(games, today);
      const [scores, count, prev] = await Promise.all([
        game ? db.getDailyScores(env.DB, game.id, today) : Promise.resolve([]),
        game ? db.getDailyCount(env.DB, game.id, today) : Promise.resolve(0),
        db.getPreviousDays(env.DB, 7),
      ]);
      return html(renderLeaderboard({ today, game, scores, totalToday: count, previousDays: prev }));
    }

    // ── /games — the (unlinked) practice room: every game on a calendar ──
    if (pathname === '/games' && method === 'GET') {
      const games = getGames();
      const today = todayUTC();
      const DAY = 86400000;
      const L = eraFor(today)?.schedule.length || games.length || 1;
      const span = Math.max(L, 28); // cover at least one full rotation so every game appears
      const todayMs = Date.UTC(
        Number(today.slice(0, 4)),
        Number(today.slice(5, 7)) - 1,
        Number(today.slice(8, 10)),
      );
      // Window ends today; start `span-1` days back, then pad out to whole weeks (Sun–Sat).
      let startMs = todayMs - (span - 1) * DAY;
      startMs -= new Date(startMs).getUTCDay() * DAY;
      let endMs = todayMs + (6 - new Date(todayMs).getUTCDay()) * DAY;
      const cells = [];
      for (let ms = startMs; ms <= endMs; ms += DAY) {
        const date = new Date(ms).toISOString().slice(0, 10);
        cells.push({ date, game: getDailyGame(games, date), isToday: date === today, isFuture: date > today });
      }
      // Retired games keep a spot in the library: link each to its last airing (a past-day replay).
      const retired: { game: Game; lastAired: string | null }[] = [];
      for (const g of games) {
        if (!isRetired(g.id, today)) continue;
        let lastAired: string | null = null;
        for (let ms = todayMs - DAY, n = 0; n < 730; ms -= DAY, n++) {
          const date = new Date(ms).toISOString().slice(0, 10);
          if (getDailyGame(games, date)?.id === g.id) { lastAired = date; break; }
        }
        retired.push({ game: g, lastAired });
      }
      return html(renderGamesCalendar({ today, cells, retired }));
    }

    const playMatch = pathname.match(/^\/play\/(\d{4}-\d{2}-\d{2})$/);
    if (playMatch && method === 'GET') {
      const dateStr = playMatch[1];
      if (dateStr >= todayUTC()) {
        return new Response(null, { status: 302, headers: { Location: '/' } });
      }
      const game = getDailyGame(getGames(), dateStr);
      if (!game) return html('<p>No games configured</p>', 503);
      const [scores, count] = await Promise.all([
        db.getDailyScores(env.DB, game.id, dateStr),
        db.getDailyCount(env.DB, game.id, dateStr),
      ]);
      return html(renderReplay(game, dateStr, scores, count, url.searchParams.has('scores')));
    }

    return env.ASSETS.fetch(request);
  },
};
