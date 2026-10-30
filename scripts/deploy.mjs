#!/usr/bin/env node
// Safe deploy for newtab.party: run it any time of day.
//
// Usage
//   npm run deploy                              # check, then wrangler deploy
//   npm run deploy -- --check                   # check only, deploy nothing
//   npm run deploy -- --allow-today-change      # after `npm run today`: today's game is meant to change
//   npm run deploy -- --force                   # skip the safety checks entirely
//   (any other args are passed through to `wrangler deploy`)
//
// Before deploying, compares the local worker/games.json against the live one
// (GET <site>/games.json?raw=1) and refuses if the deploy would change the game
// for today or ANY past day, because that would swap today's game mid-session or
// relabel past replays and leaderboards. Changes made with `npm run schedule` and
// `npm run retire` only ever take effect tomorrow or later, so they always pass.
// Site defaults to https://newtab.party; override with NEWTAB_URL.
import { spawnSync } from 'node:child_process';
import { ROOT, readGames, erasOf, dailyId, todayUTC, addDays } from './lib/rotation.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const check = has('--check'), force = has('--force'), allowToday = has('--allow-today-change');
const passThrough = argv.filter((a) => !['--check', '--force', '--allow-today-change'].includes(a));
const SITE = (process.env.NEWTAB_URL || 'https://newtab.party').replace(/\/$/, '');

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  if (!force) { console.error('  Nothing deployed. Re-run with --force to deploy anyway.'); process.exit(1); }
  console.error('  --force: deploying anyway.');
}

async function main() {
  const local = readGames();

  // 1. Every scheduled id (any era) must exist in games.
  const known = new Set((local.games || []).map((g) => g.id));
  const missing = [...new Set(erasOf(local).flatMap((e) => e.schedule).filter((id) => !known.has(id)))];
  if (missing.length) fail(`scheduled ids with no entry in games: ${missing.join(', ')}`);

  // 2. Today and every past day must resolve to the same game as the live site.
  let live = null;
  try {
    const r = await fetch(`${SITE}/games.json?raw=1`, { signal: AbortSignal.timeout(15000), headers: { 'cache-control': 'no-cache' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    live = await r.json();
  } catch (e) { fail(`couldn't fetch the live games.json from ${SITE} (${e.message}), so the schedule can't be verified`); }

  const today = todayUTC();
  if (live) {
    const changed = [];
    for (let d = '2026-05-01'; d <= today; d = addDays(d, 1)) {
      const was = dailyId(live, d), now = dailyId(local, d);
      if (was !== now) changed.push({ d, was, now });
    }
    const past = changed.filter((c) => c.d < today), todays = changed.find((c) => c.d === today);
    const upcoming = [];
    for (let i = 1; i <= 60; i++) { const d = addDays(today, i); const was = dailyId(live, d), now = dailyId(local, d); if (was !== now) upcoming.push({ d, was, now }); }

    console.log(`today (${today}): ${dailyId(local, today)}`);
    if (upcoming.length) {
      console.log(`upcoming days this deploy changes (${upcoming.length} in the next 60):`);
      for (const c of upcoming.slice(0, 10)) console.log(`  ${c.d}  ${c.was} → ${c.now}`);
      if (upcoming.length > 10) console.log('  …');
    } else console.log('no change to the rotation');

    if (past.length) {
      console.error(`\nThis deploy would change the game on ${past.length} day(s) that already aired:`);
      for (const c of past.slice(0, 10)) console.error(`  ${c.d}  ${c.was} → ${c.now}`);
      fail('past days must keep their game. Usual causes: `schedule` was edited by hand after the cycle wrapped, or a change sat undeployed past 00:00 UTC. Restore worker/games.json (git checkout) and redo it with `npm run schedule` / `npm run retire`.');
    }
    if (todays && !allowToday) fail(`this deploy changes TODAY's game (${todays.was} → ${todays.now}). If that's intended (npm run today), re-run with --allow-today-change.`);

    const msToMidnight = Date.parse(addDays(today, 1) + 'T00:00:00Z') - Date.now();
    if (msToMidnight < 15 * 60 * 1000 && upcoming.some((c) => c.d === addDays(today, 1)))
      console.warn(`\n! ${Math.ceil(msToMidnight / 60000)} min to 00:00 UTC and tomorrow's game changes; if the deploy lands after midnight, the first minutes of tomorrow show the old game.`);
  }

  if (check) { console.log('\n✓ check passed (--check: nothing deployed)'); return; }
  console.log('\n✓ schedule check passed, deploying…\n');
  const r = spawnSync('npx', ['wrangler', 'deploy', '--cwd', 'worker', ...passThrough], { cwd: ROOT, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
main();
