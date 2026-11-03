#!/usr/bin/env node
// Make a specific game today's game (UTC) without disturbing the rest of the rotation.
//
// Usage
//   node scripts/set_today.mjs <slug>              (npm run today -- <slug>)
//   node scripts/set_today.mjs --dry-run <slug>
//
// Swaps the chosen game into today's slot; the game that was scheduled for today
// takes the chosen game's old slot, so every other day stays exactly as it was.
// If the current era started before today, a new era is started at today first
// (the old one goes to scheduleHistory so past dates still resolve). This changes
// TODAY's game, so deploy the same UTC day with `npm run deploy -- --allow-today-change`
// (prefer right after 00:00 UTC: plays already recorded for the old game leave today's board).

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GAMES_JSON = path.join(ROOT, 'worker', 'games.json');
const DAY_EPOCH = Date.UTC(2026, 4, 1);
const DAY = 86_400_000;
const dayNumber = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.floor((Date.UTC(y, m - 1, d) - DAY_EPOCH) / DAY); };
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const pick = (era, date) => { const L = era.schedule.length; const off = dayNumber(date) - dayNumber(era.scheduleEpoch); return era.schedule[((off % L) + L) % L]; };

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const [slug, ...extra] = argv.filter((a) => !a.startsWith('--'));
if (!slug || extra.length) { console.error('usage: node scripts/set_today.mjs [--dry-run] <slug>'); process.exit(2); }

const data = JSON.parse(fs.readFileSync(GAMES_JSON, 'utf8'));
if (!data.games?.some((g) => g.id === slug)) { console.error(`${slug} is not in games.json`); process.exit(2); }
if (!data.schedule?.length || !data.scheduleEpoch) { console.error('games.json has no schedule/scheduleEpoch'); process.exit(2); }
if (data.retired?.[slug]) { console.error(`${slug} is retired; remove it from "retired" and append it to "schedule" first`); process.exit(2); }
if (!data.schedule.includes(slug)) { console.error(`${slug} is not in the schedule; append it first`); process.exit(2); }

const today = isoDay(Date.now());
const current = { scheduleEpoch: data.scheduleEpoch, schedule: data.schedule };
if (pick(current, today) === slug) { console.log(`${slug} is already today's game (${today})`); process.exit(0); }
if (data.scheduleEpoch > today) { console.error(`a schedule change is queued for ${data.scheduleEpoch}; run this after 00:00 UTC that day (or deploy the queued change first and run it then)`); process.exit(2); }

// Work on an era anchored at today: reuse the current one if it already starts today,
// otherwise rotate it so today's game is first and start a new era.
let era, history = data.scheduleHistory || [];
if (data.scheduleEpoch === today) {
  era = { scheduleEpoch: today, schedule: [...current.schedule] };
} else {
  const L = current.schedule.length;
  const p = (((dayNumber(today) - dayNumber(current.scheduleEpoch)) % L) + L) % L;
  era = { scheduleEpoch: today, schedule: [...current.schedule.slice(p), ...current.schedule.slice(0, p)] };
  history = [...history, current];
}
const was = era.schedule[0];
const j = era.schedule.indexOf(slug);
era.schedule[0] = slug; era.schedule[j] = was;

console.log(`today (${today}): ${was} → ${slug}; ${was} moves to ${slug}'s old slot (${isoDay(Date.parse(today + 'T00:00:00Z') + j * DAY)})`);
for (let i = 0; i < 5; i++) { const d = isoDay(Date.parse(today + 'T00:00:00Z') + i * DAY); console.log(`  ${d}  ${pick(era, d)}`); }
if (dryRun) { console.log('(dry run, games.json untouched)'); process.exit(0); }

const out = { version: data.version, scheduleEpoch: era.scheduleEpoch, schedule: era.schedule, scheduleHistory: history.length ? history : undefined, retired: data.retired, games: data.games };
for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
fs.writeFileSync(GAMES_JSON, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${path.relative(ROOT, GAMES_JSON)} — deploy today (UTC) with: npm run deploy -- --allow-today-change`);
