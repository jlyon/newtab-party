import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const sqlite = new Database(path.join(DATA_DIR, 'arcade.db'));

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS plays (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id     TEXT    NOT NULL,
    game_name   TEXT    NOT NULL,
    score       INTEGER NOT NULL,
    played_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_plays_game ON plays(game_id);
  CREATE INDEX IF NOT EXISTS idx_plays_date ON plays(date(played_at));
  CREATE INDEX IF NOT EXISTS idx_plays_score ON plays(score DESC);
`);

// Migration: add player_name to existing databases
try { sqlite.exec('ALTER TABLE plays ADD COLUMN player_name TEXT'); } catch {}

export interface Play {
  id: number;
  game_id: string;
  game_name: string;
  score: number;
  player_name?: string;
  played_at: string;
}

export interface DailyEntry {
  play_date: string;
  game_id: string;
  game_name: string;
  top_score: number;
  total_plays: number;
}

export const db = {
  // Returns the new record's id and the player's rank among TODAY's scores for that game.
  recordPlay(gameId: string, gameName: string, score: number): { id: number | bigint; rank: number } {
    const result = sqlite.prepare(
      'INSERT INTO plays (game_id, game_name, score) VALUES (?, ?, ?)'
    ).run(gameId, gameName, score);

    const { count } = sqlite.prepare(
      "SELECT COUNT(*) as count FROM plays WHERE game_id = ? AND date(played_at) = date('now') AND score > ?"
    ).get(gameId, score) as { count: number };

    return { id: result.lastInsertRowid, rank: count + 1 };
  },

  // All scores for a specific game on a specific UTC date (YYYY-MM-DD), best first.
  getDailyScores(gameId: string, date: string): Play[] {
    return sqlite.prepare(
      'SELECT * FROM plays WHERE game_id = ? AND date(played_at) = ? ORDER BY score DESC LIMIT 10'
    ).all(gameId, date) as Play[];
  },

  // Total play count for a game on a date.
  getDailyCount(gameId: string, date: string): number {
    const { count } = sqlite.prepare(
      'SELECT COUNT(*) as count FROM plays WHERE game_id = ? AND date(played_at) = ?'
    ).get(gameId, date) as { count: number };
    return count;
  },

  // One row per past day: the daily game + top score + play count.
  getPreviousDays(limit = 7): DailyEntry[] {
    return sqlite.prepare(`
      SELECT
        date(played_at)  AS play_date,
        game_id,
        game_name,
        MAX(score)       AS top_score,
        COUNT(*)         AS total_plays
      FROM plays
      WHERE date(played_at) < date('now')
      GROUP BY date(played_at)
      ORDER BY play_date DESC
      LIMIT ?
    `).all(limit) as DailyEntry[];
  },

  // Only updates plays from today — returns false if the record is from a past day.
  setPlayerName(id: number, name: string): boolean {
    const r = sqlite.prepare(
      "UPDATE plays SET player_name = ? WHERE id = ? AND date(played_at) = date('now')"
    ).run(name.trim().slice(0, 30), id);
    return (r.changes as number) > 0;
  },

  getRecentPlays(limit = 20): Play[] {
    return sqlite.prepare(
      'SELECT * FROM plays ORDER BY played_at DESC LIMIT ?'
    ).all(limit) as Play[];
  },
};
