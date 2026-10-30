#!/usr/bin/env node
// Add games to the newtab.party daily rotation without moving today or any aired day.
//
// Usage
//   npm run schedule -- <slug> [<slug> ...]                   # first one airs TOMORROW, the rest the days after
//   npm run schedule -- <slug> --date 2026-11-12               # airs on that date (must be after today)
//   npm run schedule -- <slug> --end                           # old behavior: debut at the end of the cycle
//   add --dry-run to preview without writing
//
// The game must already have an entry in the `games` array of worker/games.json.
// Inserting a game pushes every later day back one slot, so this never edits an era
// that has aired: the current era is frozen into `scheduleHistory` and a new era
// starts TOMORROW, continuing the same order with the new games slotted in. If a
// change is already queued for tomorrow, that queued era is edited instead.
// Ship it with `npm run deploy` any time before 00:00 UTC (the deploy check blocks
// it after that; just re-run this). A retired game passed here is brought back.
import { readGames, writeGames, todayUTC, addDays, dayNumber, pickIn, dailyId, preview } from './lib/rotation.mjs';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const dryRun = flag('--dry-run'), toEnd = flag('--end');
const di = argv.indexOf('--date');
const date = di >= 0 ? argv[di + 1] : null;
const slugs = argv.filter((a, i) => !a.startsWith('--') && !(di >= 0 && i === di + 1));
const usage = 'usage: npm run schedule -- [--dry-run] <slug> [<slug> ...] [--date YYYY-MM-DD | --end]';
if (!slugs.length) { console.error(usage); process.exit(2); }
if (date && toEnd) { console.error('use --date or --end, not both'); process.exit(2); }

const data = readGames();
const known = new Set((data.games || []).map((g) => g.id));
const unknown = slugs.filter((s) => !known.has(s));
if (unknown.length) { console.error(`not in the games array of games.json (add the entry first): ${unknown.join(', ')}`); process.exit(2); }
if (!data.schedule?.length || !data.scheduleEpoch) { console.error('games.json has no schedule/scheduleEpoch'); process.exit(2); }

const already = slugs.filter((s) => data.schedule.includes(s));
if (already.length) console.log(`already scheduled (use npm run today, or retire + schedule, to move it): ${already.join(', ')}`);
const add = [...new Set(slugs.filter((s) => !data.schedule.includes(s)))];
if (!add.length) { console.log('nothing to do'); process.exit(0); }

const today = todayUTC(), tomorrow = addDays(today, 1);
const first = date || tomorrow;
if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || isNaN(Date.parse(first + 'T00:00:00Z'))) { console.error(`bad --date ${date}; use YYYY-MM-DD`); process.exit(2); }
if (first <= today) { console.error(`--date must be after today (${today}): days that have started can't change`); process.exit(2); }

const out = { ...data, retired: { ...(data.retired || {}) } };
// The era to edit: the one queued for the future, or a new one starting tomorrow.
let era;
if (data.scheduleEpoch > today) {
  era = { scheduleEpoch: data.scheduleEpoch, schedule: [...data.schedule] };
  if (first < era.scheduleEpoch) { console.error(`a change is queued for ${era.scheduleEpoch}; pick a --date on or after it`); process.exit(2); }
} else {
  const cur = { scheduleEpoch: data.scheduleEpoch, schedule: data.schedule };
  const p = data.schedule.indexOf(pickIn(cur, tomorrow));
  era = { scheduleEpoch: tomorrow, schedule: [...data.schedule.slice(p), ...data.schedule.slice(0, p)] };
  out.scheduleHistory = [...(data.scheduleHistory || []), cur];
}
if (toEnd) era.schedule.push(...add);
else {
  const k = dayNumber(first) - dayNumber(era.scheduleEpoch);
  if (k > era.schedule.length) console.log(`note: ${first} is past this cycle's end (${addDays(era.scheduleEpoch, era.schedule.length)}); debuting at the end of the cycle instead`);
  era.schedule.splice(Math.min(k, era.schedule.length), 0, ...add);
}
out.scheduleEpoch = era.scheduleEpoch;
out.schedule = era.schedule;
for (const id of add) delete out.retired[id];
if (!Object.keys(out.retired).length) delete out.retired;

console.log(`scheduling: ${add.join(', ')}`);
for (const id of add) {
  let debut = null;
  for (let i = 1; i < 800 && !debut; i++) { const d = addDays(today, i); if (dailyId(out, d) === id) debut = d; }
  console.log(`  ${id} airs ${debut ?? '(not within 800 days?)'}`);
}
preview(out, 7, today);
for (let d = '2026-05-01'; d <= today; d = addDays(d, 1))
  if (dailyId(out, d) !== dailyId(data, d)) { console.error(`BUG: this would change the game on ${d}; nothing written`); process.exit(1); }
if (dryRun) { console.log('(dry run, games.json untouched)'); process.exit(0); }
console.log(`wrote ${writeGames(out)} — npm run deploy before 00:00 UTC so it airs on time.`);
