export interface Game {
  id: string;
  name: string;
  file: string;
  description?: string;
  controls?: string;
  type?: string;
}

// One rotation era: `schedule` (game ids in air order) anchored at `scheduleEpoch`.
export interface ScheduleEra {
  scheduleEpoch: string;   // YYYY-MM-DD this era took effect
  schedule: string[];
}

// Shape of worker/games.json. `scheduleEpoch` + `schedule` are the NEWEST era,
// which may be queued to start tomorrow (scripts/schedule_game.mjs, retire_game.mjs);
// `scheduleHistory` holds earlier eras so past dates resolve exactly as they aired.
// GET /games.json serves the era in effect today as the top-level one.
export interface GamesData extends ScheduleEra {
  version?: number;
  scheduleHistory?: ScheduleEra[];     // previous eras, oldest first
  retired?: Record<string, string>;    // game id → YYYY-MM-DD it left the rotation (still in `games`)
  games: Game[];
}

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

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}
