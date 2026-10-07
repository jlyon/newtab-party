#!/usr/bin/env node
// Retire games from the newtab.party daily rotation without reshuffling it.
//
// Usage
//   node scripts/retire_game.mjs <slug> [<slug> ...]
//   node scripts/retire_game.mjs --dry-run <slug>      # show the resulting schedule, write nothing
//
// What it does to worker/games.json
//   1. Moves the current { scheduleEpoch, schedule } into `scheduleHistory` (the worker
//      keeps using it for the dates it covered, so past replays and leaderboards stay put).
//   2. Starts a new era anchored at today (UTC): the old cycle rotated so today's game
//      stays today's game, minus the retired ids. Tomorrow continues from where the
//      cycle was, with the retired games skipped — nothing else moves.
//   3. Records `retired[<slug>] = <date>` so the /games library can still list them.
//
// The game stays in `games` and its .html stays in worker/public/games/, so old
// replays keep working. Deploy the same UTC day you run this (the new era's epoch
// is today). If a slug is TODAY's game, the new era is anchored at tomorrow
// instead, and you must deploy after 00:00 UTC.

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
const slugs = argv.filter((a) => !a.startsWith('--'));
if (!slugs.length) { console.error('usage: node scripts/retire_game.mjs [--dry-run] <slug> [<slug> ...]'); process.exit(2); }

const data = JSON.parse(fs.readFileSync(GAMES_JSON, 'utf8'));
const known = new Set((data.games || []).map((g) => g.id));
const unknown = slugs.filter((s) => !known.has(s));
if (unknown.length) { console.error('not in games.json:', unknown.join(', ')); process.exit(2); }
if (!data.schedule?.length || !data.scheduleEpoch) { console.error('games.json has no schedule/scheduleEpoch to retire from'); process.exit(2); }
const notScheduled = slugs.filter((s) => !data.schedule.includes(s));
if (notScheduled.length) console.log('already out of the rotation:', notScheduled.join(', '));
const toRetire = slugs.filter((s) => data.schedule.includes(s));
if (!toRetire.length) { console.log('nothing to do'); process.exit(0); }

const current = { scheduleEpoch: data.scheduleEpoch, schedule: data.schedule };
const todayMs = Date.now() - (Date.now() % DAY);
let anchorMs = todayMs;
const todayId = pick(current, isoDay(todayMs));
if (toRetire.includes(todayId)) {
  anchorMs = todayMs + DAY;
  console.log(`note: ${todayId} is today's game; the new era starts tomorrow (${isoDay(anchorMs)}). Deploy after 00:00 UTC.`);
}
const anchor = isoDay(anchorMs);
if (data.scheduleEpoch >= anchor) { console.error(`current era already starts on ${data.scheduleEpoch}; retire again tomorrow`); process.exit(2); }

// Rotate the current cycle so the anchor day's game comes first, then drop the retired ids.
const L = current.schedule.length;
const off = dayNumber(anchor) - dayNumber(current.scheduleEpoch);
const p = ((off % L) + L) % L;
const rotated = [...current.schedule.slice(p), ...current.schedule.slice(0, p)];
const next = rotated.filter((id) => !toRetire.includes(id));
if (!next.length) { console.error('that would empty the rotation'); process.exit(2); }

const out = {
  ...data,
  scheduleEpoch: anchor,
  schedule: next,
  scheduleHistory: [...(data.scheduleHistory || []), current],
  retired: { ...(data.retired || {}), ...Object.fromEntries(toRetire.map((id) => [id, anchor])) },
};
// Keep key order readable: meta, current era, history, retired, games.
const ordered = { version: out.version, scheduleEpoch: out.scheduleEpoch, schedule: out.schedule, scheduleHistory: out.scheduleHistory, retired: out.retired, games: out.games };
for (const k of Object.keys(ordered)) if (ordered[k] === undefined) delete ordered[k];

console.log(`retiring: ${toRetire.join(', ')}`);
console.log(`new era from ${anchor}: ${next.length} games (was ${L})`);
const nextEra = { scheduleEpoch: anchor, schedule: next };
for (let i = 0; i < 7; i++) { const d = isoDay(todayMs + i * DAY); console.log(`  ${d}  ${pick(d < anchor ? current : nextEra, d)}`); }
if (dryRun) { console.log('(dry run, games.json untouched)'); process.exit(0); }
fs.writeFileSync(GAMES_JSON, JSON.stringify(ordered, null, 2) + '\n');
console.log(`wrote ${path.relative(ROOT, GAMES_JSON)} — deploy from worker/ today (UTC).`);
