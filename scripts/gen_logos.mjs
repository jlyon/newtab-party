#!/usr/bin/env node
// Generate transparent game logos for newtab.party with the Gemini image API.
//
// Reads GEMINI_API_KEY from .env (repo root or worker/.env) or the environment,
// asks Gemini for a minor-league-crest style logo on a flat magenta background,
// chroma-keys the magenta out, and writes worker/public/games/logos/<slug>.png.
//
// Usage
//   node scripts/gen_logos.mjs                       # every game without a logo yet (same as --missing)
//   node scripts/gen_logos.mjs <slug> [<slug> ...]   # specific games from games.json
//   node scripts/gen_logos.mjs --all --force         # regenerate everything
//   node scripts/gen_logos.mjs <slug> --hint "a grumpy goose in a tuxedo"
//   node scripts/gen_logos.mjs <slug> --from-file raw.png   # just key an image you already have
//   node scripts/gen_logos.mjs --dry-run --all       # print the prompts, call nothing
//   node scripts/gen_logos.mjs --check               # flag logos that look bad on the dark square tiles
//
// Each new logo is checked for the dark square tiles (/games, about modal): too wide or tall,
// a dark outline that melts into the tile, or too sparse. Flagged attempts are retried
// (--retries, default 3) and the best one is kept.
//
// Needs: sharp (already in node_modules via wrangler; otherwise `npm i sharp` at the repo root).
// Optional games.json field per game: "logo": "prompt hint about the mascot / scene".

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';
import { makeShareCard, shareDir, sharePath } from './lib/share_card.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GAMES_JSON = path.join(ROOT, 'worker', 'games.json');
const LOGO_DIR = path.join(ROOT, 'worker', 'public', 'games', 'logos');
const RAW_DIR = path.join(ROOT, 'scripts', '.logo-raw');          // kept only with --keep-raw (gitignored)
const DEFAULT_MODEL = 'gemini-2.5-flash-image';
const API = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent';

// sharp is pulled in by wrangler, so the root node_modules has it after `npm install`.
// Loaded lazily so --dry-run works without it.
let sharp;
function loadSharp() {
  if (sharp) return sharp;
  try { return (sharp = createRequire(path.join(ROOT, 'package.json'))('sharp')); }
  catch (e) {
    console.error(`could not load sharp: ${e.message.split('\n')[0]}`);
    console.error('Run `npm install` at the repo root (or `npm i sharp`).');
    process.exit(2);
  }
}

const EMBLEMS = [
  'circle roundel with the team name arched around the top',
  'simple shield',
  'baseball-diamond (rotated square) badge',
  'home-plate pentagon',
  'mascot head breaking out above a bold script wordmark with a swoosh tail underline',
  'oval with a banner across the middle',
  'shield with the wordmark on a ribbon across the bottom',
];

const PROMPT = (
  'Create ONE single centered primary logo (one design only, not a set) for a fictional minor league ' +
  'baseball team, in the style of real modern minor-league-baseball primary logos: a flat vector ' +
  'graphic you could screen-print on a cap. Rules: 3 or 4 solid spot colors plus white, no gradients, ' +
  'no shading or highlights (at most one flat darker tone), no texture, no fine lines, no tiny ' +
  'details, no illustration or painterly rendering. Bold, simple shapes with thick, even outlines and ' +
  'a strong silhouette that still reads at 64 pixels wide. ' +
  'Mascot: ONE simple iconic character or object (head or bust preferred), drawn with as few shapes as ' +
  'possible, confident and a little cheeky, not a busy scene. Mascot idea, simplified to a single ' +
  'icon: {scene} ' +
  'Wordmark: big bold athletic lettering (block letters arched over the mark, or a sweeping baseball ' +
  "script with a tail underline), text exactly: '{name}'{spelled}. Spell it exactly; no extra words. " +
  'Layout: {emblem}. Compact and roughly SQUARE overall (about 1:1), never a wide horizontal lockup. ' +
  'Every letter and element touches or sits inside one connected shape: no floating letters or pieces. ' +
  'It will be shown on a very dark navy background, so wrap the whole logo in a thick white or cream ' +
  'outer outline and avoid dark colors around the outside edge. ' +
  'Center it on a completely solid, flat, uniform pure MAGENTA background hex #FF00FF: no gradient, ' +
  'no texture, no glow, no drop shadow, nothing else in the image.'
);

const COMMON_WORDS = new Set(`the a an of and or on in it like to vs up run attack panic room party bombs glory
build boardwalk sweep strait deja loop wild card dilemma seat pants frosty fall freefall yeti chop till you drop
cleanup isle signal sunken toes rack rock em sock wrecking ball shootin crackin smithereens penalty
weiners tubs tippity stump grandpa bend maxi conga chaos prompter payday speedway abominable`.split(/\s+/));

// ── .env ──────────────────────────────────────────────────────────────────
/** GEMINI_API_KEY from the environment, else from .env / worker/.env. Never printed. */
function loadEnvKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  for (const p of [path.join(ROOT, '.env'), path.join(ROOT, 'worker', '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (let line of fs.readFileSync(p, 'utf8').split('\n')) {
      line = line.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      if (line.slice(0, i).trim() === 'GEMINI_API_KEY') return line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

// ── games.json ────────────────────────────────────────────────────────────
function loadGames() {
  return JSON.parse(fs.readFileSync(GAMES_JSON, 'utf8')).games || [];
}

function buildPrompt(game, hint) {
  const name = game.name;
  const digest = crypto.createHash('sha1').update(game.id).digest('hex');
  const emblem = EMBLEMS[Number(BigInt('0x' + digest) % BigInt(EMBLEMS.length))];
  let scene = (hint || game.logo || game.description || '').trim();
  if (scene && !scene.endsWith('.')) scene += '.';
  // Nano Banana fumbles long or invented words; spell them out letter by letter.
  let spelled = '';
  const words = name.replace(/'/g, '').split(/\s+/).filter(w => /^[A-Za-z]+$/.test(w));
  const odd = words.filter(w => w.length >= 5 || !COMMON_WORDS.has(w.toLowerCase()));
  if (odd.length) spelled = ' (spelled ' + odd.slice(0, 4).map(w => `${w}: ${w.toUpperCase().split('').join('-')}`).join(', ') + ')';
  return PROMPT.replaceAll('{name}', name).replace('{emblem}', emblem).replace('{scene}', scene).replace('{spelled}', spelled);
}

// ── Gemini ────────────────────────────────────────────────────────────────
async function geminiImage(prompt, key, model, timeoutMs = 120_000) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'] },
  };
  const res = await fetch(API.replace('{model}', model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 600)}`);
  const data = await res.json();
  for (const cand of data.candidates || []) {
    for (const part of cand.content?.parts || []) {
      const inline = part.inlineData || part.inline_data;
      if (inline?.data) return { bytes: Buffer.from(inline.data, 'base64'), mime: inline.mimeType || inline.mime_type || 'image/png' };
    }
  }
  throw new Error('Gemini returned no image: ' + JSON.stringify(data).slice(0, 400));
}

// ── Chroma key (sharp for decode/blur/resize/encode, pixel work in plain JS) ──
/** Flood-fill `mask` (Uint8Array, 1 = fillable) from `seeds`, writing `label` into `out`. Returns count. */
function floodFill(mask, out, w, h, seeds, label) {
  const stack = []; let n = 0;
  for (const s of seeds) if (mask[s] && !out[s]) { out[s] = label; stack.push(s); }
  while (stack.length) {
    const i = stack.pop(); n++;
    const x = i % w;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
    for (const j of nb) if (j >= 0 && j < w * h && mask[j] && !out[j]) { out[j] = label; stack.push(j); }
  }
  return n;
}

/** Turn a logo on #FF00FF into a clean RGBA cutout. Returns { png, width, height, coverage }. */
async function keyMagenta(raw) {
  const sharp = loadSharp();
  const { data, info } = await sharp(raw).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, N = w * h;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), m = new Float32Array(N);
  const magenta = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    R[i] = data[i * 3]; G[i] = data[i * 3 + 1]; B[i] = data[i * 3 + 2];
    m[i] = Math.min(R[i], B[i]) - G[i];            // "magenta-ness": ~255 on #FF00FF, <=0 on most art
    magenta[i] = m[i] > 30 ? 1 : 0;
  }

  // Background = magenta connected to the image border (flood fill from every border pixel).
  const bg = new Uint8Array(N);
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  floodFill(magenta, bg, w, h, border, 1);
  const subject = new Uint8Array(N);
  let subjectN = 0;
  for (let i = 0; i < N; i++) if (!bg[i]) { subject[i] = 1; subjectN++; }   // holes already filled

  // Keep every blob bigger than a speck: detached wordmark letters are separate blobs and
  // must survive (keeping only the largest blob used to delete whole team names).
  const labels = new Int32Array(N), sizes = [0];
  for (let i = 0, stack = []; i < N; i++) {
    if (!subject[i] || labels[i]) continue;
    const id = sizes.length; let n = 0;
    labels[i] = id; stack.push(i);
    while (stack.length) {
      const k = stack.pop(); n++;
      const x = k % w;
      for (const j of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k - w, k + w])
        if (j >= 0 && j < N && subject[j] && !labels[j]) { labels[j] = id; stack.push(j); }
    }
    sizes.push(n);
  }
  const minBlob = Math.max(150, subjectN * 0.002);
  const subj = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (labels[i] && sizes[labels[i]] >= minBlob) subj[i] = 1;

  // Feathered alpha + magenta despill on the fringe.
  const maskBuf = Buffer.alloc(N);
  for (let i = 0; i < N; i++) maskBuf[i] = subj[i] ? 255 : 0;
  const blurred = await sharp(maskBuf, { raw: { width: w, height: h, channels: 1 } }).blur(0.7).toColourspace('b-w').raw().toBuffer();
  const stride = blurred.length / N;   // sharp may widen a 1-channel buffer to 3; read the first channel either way
  const out = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    const alpha = Math.min(1, Math.max(0, (blurred[i * stride] / 255 - 0.35) / 0.4));
    const spill = Math.max(0, m[i]);
    const a = Math.round(alpha * 255);
    // Fully transparent pixels get RGB 0 too, so trim() (which compares every channel) crops to the real subject.
    out[i * 4] = a ? Math.max(0, Math.min(255, R[i] - spill)) : 0;
    out[i * 4 + 1] = a ? G[i] : 0;
    out[i * 4 + 2] = a ? Math.max(0, Math.min(255, B[i] - spill)) : 0;
    out[i * 4 + 3] = a;
  }

  // Crop to the alpha bounding box, cap the long side at 1024, encode PNG.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < N; i++) {
    if (!out[i * 4 + 3]) continue;
    const x = i % w, y = (i - x) / w;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) throw new Error('nothing left after keying (image was all magenta?)');
  let width = x1 - x0 + 1, height = y1 - y0 + 1;
  let img = sharp(out, { raw: { width: w, height: h, channels: 4 } }).extract({ left: x0, top: y0, width, height });
  if (Math.max(width, height) > 1024) {
    img = sharp(await img.png().toBuffer()).resize(1024, 1024, { fit: 'inside', kernel: 'lanczos3' });
    const scale = 1024 / Math.max(width, height);
    width = Math.round(width * scale); height = Math.round(height * scale);
  }
  const png = await img.png({ compressionLevel: 9 }).toBuffer();
  return { png, width, height, coverage: subjectN / N };
}

// ── Quality check: how the logo reads on the dark square tiles (/games, about modal) ──
const TILE_BG = [20, 20, 31];   // #14141f
/** Returns a list of problems (empty = looks fine on a dark square tile). */
async function assessLogo(png) {
  const sharp = loadSharp();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, issues = [];
  const ratio = w / h;
  if (ratio > 1.4) issues.push(`too wide for a square tile (${ratio.toFixed(2)}:1)`);
  if (ratio < 0.72) issues.push(`too tall for a square tile (1:${(1 / ratio).toFixed(2)})`);
  // Share of the logo that's close to the tile color (navy/black). Above ~60% it melts into the tile.
  let opaque = 0, nearTile = 0;
  for (let i = 0; i < w * h * 4; i += 4) {
    if (data[i + 3] < 128) continue;
    opaque++;
    const dr = data[i] - TILE_BG[0], dg = data[i + 1] - TILE_BG[1], db = data[i + 2] - TILE_BG[2];
    if (dr * dr + dg * dg + db * db < 75 * 75) nearTile++;
  }
  if (opaque && nearTile / opaque > 0.6) issues.push(`mostly dark (${Math.round((100 * nearTile) / opaque)}% near-black/navy), it blends into the dark tiles`);
  if (opaque / (w * h) < 0.3) issues.push(`sparse (${Math.round((100 * opaque) / (w * h))}% filled), will look small or scattered`);
  return issues;
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  const { values: args, positionals: slugs } = parseArgs({
    allowPositionals: true,
    options: {
      missing: { type: 'boolean', default: false },   // the default when no slugs are given
      all: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      hint: { type: 'string' },
      'from-file': { type: 'string' },
      model: { type: 'string', default: process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL },
      retries: { type: 'string', default: '3' },
      'keep-raw': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      check: { type: 'boolean', default: false },     // report logos that look bad on the dark square tiles
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (args.help) {
    const src = fs.readFileSync(new URL(import.meta.url), 'utf8');
    console.log(src.split('\n').slice(1).filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n'));
    return 0;
  }
  const retries = Number(args.retries) || 3;
  const fromFile = args['from-file'];

  const games = Object.fromEntries(loadGames().map(g => [g.id, g]));
  if (args.check) {
    const ids = slugs.length ? slugs : Object.keys(games);
    const bad = [];
    for (const slug of ids) {
      const f = path.join(LOGO_DIR, `${slug}.png`);
      if (!fs.existsSync(f)) { console.log(`✗ ${slug}: no logo`); bad.push(slug); continue; }
      const issues = await assessLogo(fs.readFileSync(f));
      if (issues.length) { console.log(`✗ ${slug}: ${issues.join('; ')}`); bad.push(slug); }
    }
    console.log(`\n${ids.length - bad.length}/${ids.length} look fine on the dark tiles.`);
    if (bad.length) console.log(`Fix with:\n  npm run logos -- ${bad.join(' ')} --force\nAlso eyeball every logo: this can't catch misspelled wordmarks.`);
    return 0;
  }
  let targets;
  if (args.all) targets = Object.keys(games);
  else if (args.missing || !slugs.length) targets = Object.keys(games).filter(s => !fs.existsSync(path.join(LOGO_DIR, `${s}.png`)));
  else targets = slugs;
  if (!targets.length) { console.log('nothing to do: every game in games.json already has a logo (use --force or --all to regenerate)'); return 0; }
  const unknown = targets.filter(s => !games[s]);
  if (unknown.length) { console.error('not in games.json:', unknown.join(', ')); return 2; }
  if (fromFile && targets.length !== 1) { console.error('--from-file takes exactly one slug'); return 2; }

  const key = (args['dry-run'] || fromFile) ? null : loadEnvKey();
  if (!args['dry-run'] && !fromFile && !key) {
    console.error('GEMINI_API_KEY not set. Put GEMINI_API_KEY=... in .env (repo root) or export it.');
    return 2;
  }

  fs.mkdirSync(LOGO_DIR, { recursive: true });
  const failed = [];
  for (const slug of targets) {
    const dest = path.join(LOGO_DIR, `${slug}.png`);
    const prompt = buildPrompt(games[slug], args.hint);
    if (args['dry-run']) { console.log(`\n[${slug}]\n${prompt}`); continue; }
    if (fs.existsSync(dest) && !args.force && !fromFile) { console.log(`skip  ${slug} (exists; use --force)`); continue; }
    let ok = false, best = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        let raw;
        if (fromFile) {
          raw = fs.readFileSync(fromFile);
        } else {
          console.log(`gen   ${slug} (attempt ${attempt}) …`);
          const r = await geminiImage(prompt, key, args.model);
          raw = r.bytes;
          if (args['keep-raw']) {
            fs.mkdirSync(RAW_DIR, { recursive: true });
            const ext = r.mime.includes('jpeg') ? 'jpg' : r.mime.split('/')[1] || 'png';
            fs.writeFileSync(path.join(RAW_DIR, `${slug}-${attempt}.${ext}`), raw);
          }
        }
        const { png, width, height, coverage } = await keyMagenta(raw);
        if (!fromFile && !(coverage >= 0.08 && coverage <= 0.92)) {
          throw new Error(`keyed subject covers ${Math.round(coverage * 100)}% of the frame; background probably wasn't flat magenta`);
        }
        const issues = await assessLogo(png);
        if (!best || issues.length < best.issues.length) best = { png, width, height, coverage, issues };
        if (issues.length && !fromFile && attempt < retries) { console.log(`      ${slug}: ${issues.join('; ')}; trying again`); continue; }
        fs.writeFileSync(dest, best.png);
        console.log(`saved ${path.relative(ROOT, dest)}  ${best.width}x${best.height}  subject ${Math.round(best.coverage * 100)}%`);
        fs.mkdirSync(shareDir(ROOT), { recursive: true });
        fs.writeFileSync(sharePath(ROOT, slug), await makeShareCard(loadSharp(), best.png));   // link-preview card
        if (best.issues.length) console.log(`      warning: ${best.issues.join('; ')}`);
        ok = true;
        break;
      } catch (e) {
        console.error(`      ${slug}: ${e.message || e}`);
        if (fromFile) break;
        await sleep(2000 * attempt);
      }
    }
    if (!ok) failed.push(slug);
  }
  if (failed.length) { console.error('\nfailed:', failed.join(', ')); return 1; }
  return 0;
}

process.exit(await main());
