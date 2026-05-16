export interface Game {
  id: string;
  name: string;
  file: string;
  description?: string;
  controls?: string;
  type?: string;
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
