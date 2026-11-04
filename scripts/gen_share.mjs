#!/usr/bin/env node
// Build the 1200x630 link-preview card for each game from its logo
// (worker/public/games/logos/<id>.png -> worker/public/games/share/<id>.jpg).
// `npm run logos` already does this for every logo it saves; run this for older logos.
//
// Usage
//   npm run share                    # every game with a logo but no card yet
//   npm run share -- <id> [<id> ...] # specific games (overwrites)
//   npm run share -- --force         # rebuild every card
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { makeShareCard, shareDir, sharePath } from './lib/share_card.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LOGO_DIR = path.join(ROOT, 'worker', 'public', 'games', 'logos');
const argv = process.argv.slice(2);
const force = argv.includes('--force');
const ids = argv.filter((a) => !a.startsWith('--'));

let sharp;
try { sharp = createRequire(path.join(ROOT, 'package.json'))('sharp'); }
catch (e) { console.error(`could not load sharp: ${e.message.split('\n')[0]}\nRun \`npm install\` at the repo root.`); process.exit(2); }

const { games } = JSON.parse(fs.readFileSync(path.join(ROOT, 'worker', 'games.json'), 'utf8'));
const targets = ids.length ? ids : games.map((g) => g.id);
fs.mkdirSync(shareDir(ROOT), { recursive: true });
let made = 0, missing = [];
for (const id of targets) {
  const logo = path.join(LOGO_DIR, `${id}.png`);
  if (!fs.existsSync(logo)) { missing.push(id); continue; }
  const dest = sharePath(ROOT, id);
  if (fs.existsSync(dest) && !force && !ids.length) continue;
  fs.writeFileSync(dest, await makeShareCard(sharp, fs.readFileSync(logo)));
  console.log(`saved ${path.relative(ROOT, dest)}`);
  made++;
}
if (missing.length) console.warn(`no logo yet (run \`npm run logos\`): ${missing.join(', ')}`);
console.log(made ? `${made} card(s) written` : 'all cards up to date');
