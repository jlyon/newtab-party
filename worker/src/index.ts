import type { Env, Game } from './types';
import * as db from './db';
import { renderArcade, renderLeaderboard, renderReplay, esc } from './render';
import gamesData from '../games.json';

// Day 0 = 2026-05-01 UTC — must match the extension's DAY_EPOCH exactly.
const DAY_EPOCH = Date.UTC(2026, 4, 1);

// A score qualifies for the name prompt if it lands in the day's top N
// (global, across all of today's plays for the game).
const LEADERBOARD_SIZE = 10;

function getGames(): Game[] {
  return (gamesData as { games: Game[] }).games ?? [];
}

// Day number since DAY_EPOCH (May 1 2026 UTC) for a YYYY-MM-DD string.
function dayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - DAY_EPOCH) / 86400000);
}

// The daily pick. Uses the explicit `schedule` list in games.json (anchored at
// `scheduleEpoch`) so that APPENDING a game only adds a future slot — the games
// already scheduled for the current cycle never move. Falls back to a plain
// modulo over the games array if no schedule is configured. This MUST stay in
// sync with the same logic in extension/newtab.js.
function getDailyGame(games: Game[], dateStr: string): Game | null {
  if (!games.length) return null;
  const data = gamesData as { schedule?: string[]; scheduleEpoch?: string };
  if (data.schedule?.length && data.scheduleEpoch) {
    const off = dayNumber(dateStr) - dayNumber(data.scheduleEpoch);
    const L = data.schedule.length;
    const id = data.schedule[((off % L) + L) % L];
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
