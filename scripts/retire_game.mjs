#!/usr/bin/env node
// Retire games from the newtab.party daily rotation without reshuffling it.
//
// Usage
//   npm run retire -- <slug> [<slug> ...]
//   npm run retire -- --dry-run <slug>      # show the resulting schedule, write nothing
//
// What it does to worker/games.json
//   1. Moves the current { scheduleEpoch, schedule } into `scheduleHistory` (the worker
//      keeps using it for the dates it covered, so past replays and leaderboards stay put).
//   2. Starts a new era anchored at TOMORROW (UTC): the old cycle rotated so tomorrow's
//      game comes first, minus the retired ids. Today is untouched, so you can deploy at
//      any time before 00:00 UTC (npm run deploy refuses if that boundary has passed).
//      If a change is already queued for tomorrow, the ids are just removed from it.
//   3. Records `retired[<slug>] = <date it left>` so the /games library can still list them.
//
// The game stays in `games` and its .html stays in worker/public/games/, so old
// replays keep working. Bring one back with `npm run schedule -- <slug>`.
import { readGames, writeGames, todayUTC, addDays, pickIn, dailyId, preview } from './lib/rotation.mjs';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const slugs = argv.filter((a) => !a.startsWith('--'));
if (!slugs.length) { console.error('usage: npm run retire -- [--dry-run] <slug> [<slug> ...]'); process.exit(2); }

const data = readGames();
const known = new Set((data.games || []).map((g) => g.id));
const unknown = slugs.filter((s) => !known.has(s));
if (unknown.length) { console.error('not in games.json:', unknown.join(', ')); process.exit(2); }
if (!data.schedule?.length || !data.scheduleEpoch) { console.error('games.json has no schedule/scheduleEpoch to retire from'); process.exit(2); }
const notScheduled = slugs.filter((s) => !data.schedule.includes(s));
if (notScheduled.length) console.log('already out of the rotation:', notScheduled.join(', '));
const toRetire = slugs.filter((s) => data.schedule.includes(s));
if (!toRetire.length) { console.log('nothing to do'); process.exit(0); }

const today = todayUTC(), tomorrow = addDays(today, 1);
const out = { ...data };
let anchor;
if (data.scheduleEpoch > today) {
  anchor = data.scheduleEpoch;               // a queued change hasn't aired: edit it in place
  out.schedule = data.schedule.filter((id) => !toRetire.includes(id));
} else {
  anchor = tomorrow;
  const cur = { scheduleEpoch: data.scheduleEpoch, schedule: data.schedule };
  const p = data.schedule.indexOf(pickIn(cur, tomorrow));
  const rotated = [...data.schedule.slice(p), ...data.schedule.slice(0, p)];
  out.schedule = rotated.filter((id) => !toRetire.includes(id));
  out.scheduleEpoch = anchor;
  out.scheduleHistory = [...(data.scheduleHistory || []), cur];
}
if (!out.schedule.length) { console.error('that would empty the rotation'); process.exit(2); }
out.retired = { ...(data.retired || {}), ...Object.fromEntries(toRetire.map((id) => [id, anchor])) };

console.log(`retiring: ${toRetire.join(', ')} (from ${anchor}; today's game is unchanged)`);
console.log(`rotation from ${anchor}: ${out.schedule.length} games (was ${data.schedule.length})`);
preview(out, 7, today);
if (dailyId(out, today) !== dailyId(data, today)) { console.error('BUG: this would change today\'s game; nothing written'); process.exit(1); }
if (dryRun) { console.log('(dry run, games.json untouched)'); process.exit(0); }
console.log(`wrote ${writeGames(out)} — npm run deploy any time before 00:00 UTC.`);
