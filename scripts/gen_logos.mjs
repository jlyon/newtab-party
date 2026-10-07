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
//
// Needs: sharp (already present under worker/node_modules via wrangler; otherwise `npm i sharp` in worker/).
// Optional games.json field per game: "logo": "prompt hint about the mascot / scene".

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GAMES_JSON = path.join(ROOT, 'worker', 'games.json');
const LOGO_DIR = path.join(ROOT, 'worker', 'public', 'games', 'logos');
const RAW_DIR = path.join(ROOT, 'scripts', '.logo-raw');          // kept only with --keep-raw (gitignored)
const DEFAULT_MODEL = 'gemini-2.5-flash-image';
const API = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent';

// sharp lives in worker/node_modules (pulled in by wrangler); resolve it from there first.
let sharp;
for (const base of [path.join(ROOT, 'worker', 'package.json'), import.meta.url]) {
  try { sharp = createRequire(base)('sharp'); break; } catch {}
}
if (!sharp) { console.error('sharp not found. Run `npm install` in worker/ (or `npm i sharp` there).'); process.exit(2); }

const EMBLEMS = [
  'round badge', 'heater shield', 'banner with a ribbon', 'pennant', 'playing-card frame',
  'oval cameo', 'hexagonal patch', 'diamond crest', 'circular seal with a laurel', 'varsity shield with a scroll',
];

const PROMPT = (
  'Create ONE single centered logo (one design only, not a set), refined modern ' +
  'minor-league-baseball-team crest style: a polished, characterful cartoon mascot plus a bold ' +
  'athletic wordmark, cohesive limited palette, clean thick outline, die-cut sticker look, ' +
  "emblem shape: {emblem}. Game: '{name}'. {scene} Wordmark text exactly: '{name}'{spelled}. " +
  'Center it on a completely solid, flat, uniform pure MAGENTA background hex #FF00FF: no gradient, ' +
  'no texture, no glow, no drop shadow, nothing else in the image.'
);

const COMMON_WORDS = new Set(`the a an of and or on in it like to vs up run attack panic room party bombs glory
build boardwalk sweep strait wild card dilemma seat pants frosty fall freefall yeti chop till you drop
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
  const odd = words.filter(w => w.length >= 9 || !COMMON_WORDS.has(w.toLowerCase()));
  if (odd.length) spelled = ' (spelled ' + odd.slice(0, 3).map(w => `${w}: ${w.toUpperCase().split('').join('-')}`).join(', ') + ')';
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

  // Keep only the largest blob (drops watermarks / specks).
  const labels = new Uint8Array(N);
  let best = null, bestN = 0, lbl = 0;
  for (let i = 0; i < N; i++) {
    if (!subject[i] || labels[i]) continue;
    const scratch = new Uint8Array(N);
    const n = floodFill(subject, scratch, w, h, [i], 1);
    lbl++;
    for (let j = 0; j < N; j++) if (scratch[j]) labels[j] = 1;   // mark visited
    if (n > bestN) { best = scratch; bestN = n; }
    if (bestN > subjectN * 0.6) break;
  }
  const subj = best || subject;

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
    let ok = false;
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
        fs.writeFileSync(dest, png);
        console.log(`saved ${path.relative(ROOT, dest)}  ${width}x${height}  subject ${Math.round(coverage * 100)}%`);
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
