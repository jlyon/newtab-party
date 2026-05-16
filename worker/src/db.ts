import type { Play, DailyEntry } from './types';

export async function recordPlay(
  db: D1Database,
  gameId: string,
  gameName: string,
  score: number,
): Promise<{ id: number; rank: number }> {
  const insert = await db
    .prepare('INSERT INTO plays (game_id, game_name, score) VALUES (?, ?, ?)')
    .bind(gameId, gameName, score)
    .run();

  const row = await db
    .prepare(
      "SELECT COUNT(*) as count FROM plays WHERE game_id = ? AND date(played_at) = date('now') AND score > ?",
    )
    .bind(gameId, score)
    .first<{ count: number }>();

  return { id: insert.meta.last_row_id as number, rank: (row?.count ?? 0) + 1 };
}

export async function getDailyScores(
  db: D1Database,
  gameId: string,
  date: string,
): Promise<Play[]> {
  const { results } = await db
    .prepare(
      'SELECT * FROM plays WHERE game_id = ? AND date(played_at) = ? ORDER BY score DESC LIMIT 100',
    )
    .bind(gameId, date)
    .all<Play>();
  return results;
}

export async function getDailyCount(
  db: D1Database,
  gameId: string,
  date: string,
): Promise<number> {
  const row = await db
    .prepare(
      'SELECT COUNT(*) as count FROM plays WHERE game_id = ? AND date(played_at) = ?',
    )
    .bind(gameId, date)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getPreviousDays(
  db: D1Database,
  limit = 7,
): Promise<DailyEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT
        date(played_at)  AS play_date,
        game_id,
        game_name,
        MAX(score)       AS top_score,
        COUNT(*)         AS total_plays
      FROM plays
      WHERE date(played_at) < date('now')
      GROUP BY date(played_at)
      ORDER BY play_date DESC
      LIMIT ?`,
    )
    .bind(limit)
    .all<DailyEntry>();
  return results;
}

export async function setPlayerName(
  db: D1Database,
  id: number,
  name: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      "UPDATE plays SET player_name = ? WHERE id = ? AND date(played_at) = date('now')",
    )
    .bind(name.trim().slice(0, 30), id)
    .run();
  return (result.meta.changes as number) > 0;
}

export async function getRecentPlays(
  db: D1Database,
  limit = 20,
): Promise<Play[]> {
  const { results } = await db
    .prepare('SELECT * FROM plays ORDER BY played_at DESC LIMIT ?')
    .bind(limit)
    .all<Play>();
  return results;
}
