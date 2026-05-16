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
