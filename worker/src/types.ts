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

// Shape of worker/games.json. `scheduleEpoch` + `schedule` are the CURRENT era
// (what every client uses for today); `scheduleHistory` holds earlier eras so the
// worker can resolve past dates exactly as they aired.
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
