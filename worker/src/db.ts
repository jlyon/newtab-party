import type { Play, DailyEntry } from './types';
import { isNameAllowed, normalizeName, REPORT_HIDE_THRESHOLD } from './moderation';

// Names reported by REPORT_HIDE_THRESHOLD different people, lowercased. A missing
// name_reports table (schema not migrated yet) just means nothing is hidden.
async function hiddenNames(db: D1Database): Promise<Set<string>> {
  try {
    const { results } = await db
      .prepare(
        `SELECT lower(player_name) AS name FROM name_reports
         WHERE player_name IS NOT NULL
         GROUP BY lower(player_name)
         HAVING COUNT(DISTINCT reporter) >= ?`,
      )
      .bind(REPORT_HIDE_THRESHOLD)
      .all<{ name: string }>();
    return new Set(results.map((r) => r.name));
  } catch {
    return new Set();
  }
}

// Blank out names that fail the filter (including ones saved before it existed)
// or that enough people reported. The score row itself stays.
async function moderate(db: D1Database, plays: Play[]): Promise<Play[]> {
  if (!plays.some((p) => p.player_name)) return plays;
  const hidden = await hiddenNames(db);
  return plays.map((p) =>
    p.player_name && (!isNameAllowed(p.player_name) || hidden.has(p.player_name.toLowerCase()))
      ? { ...p, player_name: undefined }
      : p,
  );
}

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
      'SELECT * FROM plays WHERE game_id = ? AND date(played_at) = ? ORDER BY score DESC LIMIT 20',
    )
    .bind(gameId, date)
    .all<Play>();
  return moderate(db, results);
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
    .bind(normalizeName(name), id)
    .run();
  return (result.meta.changes as number) > 0;
}

// Rank a hypothetical score would take on today's board (1 = top), WITHOUT
// inserting it. Used to decide whether to prompt the player to add their name.
export async function getDailyRank(
  db: D1Database,
  gameId: string,
  score: number,
  date: string,
): Promise<number> {
  const row = await db
    .prepare(
      'SELECT COUNT(*) as count FROM plays WHERE game_id = ? AND date(played_at) = ? AND score > ?',
    )
    .bind(gameId, date, score)
    .first<{ count: number }>();
  return (row?.count ?? 0) + 1;
}

export async function deletePlay(
  db: D1Database,
  id: number,
): Promise<boolean> {
  // Only today's plays can be removed — past leaderboards are locked.
  const result = await db
    .prepare("DELETE FROM plays WHERE id = ? AND date(played_at) = date('now')")
    .bind(id)
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
  return moderate(db, results);
}

// One report per (play, reporter). Returns false if the play has no name to report.
export async function reportPlayName(
  db: D1Database,
  id: number,
  reporter: string,
): Promise<'ok' | 'not_found' | 'no_name'> {
  const play = await db
    .prepare('SELECT player_name FROM plays WHERE id = ?')
    .bind(id)
    .first<{ player_name: string | null }>();
  if (!play) return 'not_found';
  if (!play.player_name) return 'no_name';
  await db
    .prepare('INSERT OR IGNORE INTO name_reports (play_id, player_name, reporter) VALUES (?, ?, ?)')
    .bind(id, play.player_name, reporter)
    .run();
  return 'ok';
}
