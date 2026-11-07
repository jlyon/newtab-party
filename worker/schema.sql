CREATE TABLE IF NOT EXISTS plays (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     TEXT    NOT NULL,
  game_name   TEXT    NOT NULL,
  score       INTEGER NOT NULL,
  player_name TEXT,
  played_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_plays_game ON plays(game_id);
CREATE INDEX IF NOT EXISTS idx_plays_date ON plays(date(played_at));
CREATE INDEX IF NOT EXISTS idx_plays_score ON plays(score DESC);

-- Leaderboard name reports (App Store guideline 1.2). A name reported by
-- REPORT_HIDE_THRESHOLD (src/moderation.ts) different reporters is hidden everywhere.
-- `reporter` is a salted hash of the reporter's IP, only used to count distinct people.
CREATE TABLE IF NOT EXISTS name_reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  play_id     INTEGER NOT NULL,
  player_name TEXT,
  reporter    TEXT    NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (play_id, reporter)
);
CREATE INDEX IF NOT EXISTS idx_reports_name ON name_reports(lower(player_name));
