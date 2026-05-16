import type { Env, Game } from './types';
import * as db from './db';
import { renderArcade, renderLeaderboard, renderReplay, esc } from './render';
import gamesData from '../games.json';

// Day 0 = 2026-05-01 UTC — must match the extension's DAY_EPOCH exactly.
const DAY_EPOCH = Date.UTC(2026, 4, 1);

function getGames(): Game[] {
  return (gamesData as { games: Game[] }).games ?? [];
}

function getDailyGame(games: Game[], dateStr: string): Game | null {
  if (!games.length) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = Math.floor((Date.UTC(y, m - 1, d) - DAY_EPOCH) / 86400000);
  return games[((day % games.length) + games.length) % games.length];
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
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
      return html(renderReplay(game, dateStr, scores, count));
    }

    return env.ASSETS.fetch(request);
  },
};
