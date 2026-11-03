// Shared rotation math for the scripts. MUST match worker/src/index.ts
// (eraFor + getDailyGame) exactly; scripts/deploy.mjs relies on it to prove a
// deploy leaves today and every past day untouched.
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
export const GAMES_JSON = path.join(ROOT, 'worker', 'games.json');
export const DAY_EPOCH = Date.UTC(2026, 4, 1); // day 0 = 2026-05-01 UTC
export const DAY = 86_400_000;

export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
export const todayUTC = () => isoDay(Date.now());
export const addDays = (s, n) => isoDay(Date.parse(s + 'T00:00:00Z') + n * DAY);
export const dayNumber = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.floor((Date.UTC(y, m - 1, d) - DAY_EPOCH) / DAY); };

// The id an era puts on a date.
export const pickIn = (era, date) => { const L = era.schedule.length; const off = dayNumber(date) - dayNumber(era.scheduleEpoch); return era.schedule[((off % L) + L) % L]; };

// All eras (history + current), oldest first.
export function erasOf(data) {
  const eras = [...(data.scheduleHistory || [])];
  if (data.schedule?.length && data.scheduleEpoch) eras.push({ scheduleEpoch: data.scheduleEpoch, schedule: data.schedule });
  return eras.filter((e) => e.schedule?.length && e.scheduleEpoch).sort((a, b) => a.scheduleEpoch.localeCompare(b.scheduleEpoch));
}

// The era in effect on a date: latest epoch on or before it (earliest era for older dates).
export function eraFor(data, date) {
  const eras = erasOf(data);
  if (!eras.length) return null;
  let era = eras[0];
  for (const e of eras) if (e.scheduleEpoch <= date) era = e;
  return era;
}

// The game id that airs on a date (same fallback as the worker).
export function dailyId(data, date) {
  const games = data.games || [];
  if (!games.length) return null;
  const era = eraFor(data, date);
  if (era) { const id = pickIn(era, date); if (games.some((g) => g.id === id)) return id; }
  const day = dayNumber(date);
  return games[((day % games.length) + games.length) % games.length].id;
}

export const readGames = () => JSON.parse(fs.readFileSync(GAMES_JSON, 'utf8'));

// Write games.json with a readable key order: meta, current era, history, retired, games.
export function writeGames(data) {
  const ordered = Object.assign({ version: undefined, scheduleEpoch: undefined, schedule: undefined, scheduleHistory: undefined, retired: undefined }, data);
  const games = ordered.games; delete ordered.games; ordered.games = games;   // games last
  if (!ordered.scheduleHistory?.length) delete ordered.scheduleHistory;
  for (const k of Object.keys(ordered)) if (ordered[k] === undefined) delete ordered[k];
  fs.writeFileSync(GAMES_JSON, JSON.stringify(ordered, null, 2) + '\n');
  return path.relative(ROOT, GAMES_JSON);
}

// Print the next n days of the rotation.
export function preview(data, n = 7, from = todayUTC()) {
  for (let i = 0; i < n; i++) { const d = addDays(from, i); console.log(`  ${d}  ${dailyId(data, d)}${i === 0 ? '  (today)' : ''}`); }
}
