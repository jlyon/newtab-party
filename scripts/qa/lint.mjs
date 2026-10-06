// Static rules for newtab.party games: no score normalization, fixed-step loops, mobile basics.
import fs from 'node:fs'; import path from 'node:path';
const DIR = process.env.GAMES_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'worker', 'public', 'games');
const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(DIR).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5));
let bad = 0;
for (const id of ids) {
  const s = fs.readFileSync(path.join(DIR, id + '.html'), 'utf8');
  const issues = [];
  const m = s.match(/SCORE_SCALE\s*=\s*([^;]+);/);
  if (m) issues.push(`SCORE_SCALE still defined (${m[1].trim()})`);
  if (/\*\s*SCORE_SCALE|SCORE_SCALE\s*\*/.test(s)) issues.push('score multiplied by SCORE_SCALE');
  if (!/postMessage\(\s*\{\s*highScore/.test(s)) issues.push('no highScore postMessage');
  if (!/maximum-scale=1/.test(s) || !/user-scalable=no/.test(s)) issues.push('viewport meta missing maximum-scale=1 / user-scalable=no');
  if (!/touch-action:\s*none/.test(s)) issues.push('missing touch-action: none');
  const usesRaf = /requestAnimationFrame/.test(s);
  if (usesRaf && !/STEP_MS/.test(s) && !/FRAME_INDEPENDENT_DT/.test(s)) issues.push('rAF loop without fixed-step accumulator (STEP_MS) or FRAME_INDEPENDENT_DT marker');
  if (/100vh/.test(s)) issues.push('uses 100vh (prefer 100dvh / 100%)');
  if (/document\.addEventListener\('touchstart',\s*e\s*=>\s*\{\s*e\.preventDefault/.test(s)) issues.push('document-level touchstart preventDefault (kills button taps)');
  if (/#touch-controls|touch-controls|mobile-controls|class="btn|id="btn-/.test(s) && !/body\.touch/.test(s)) issues.push('on-screen buttons without body.touch gating');
  console.log(`${issues.length ? '✗' : '✓'} ${id}`); for (const i of issues) console.log('    ' + i);
  if (issues.length) bad++;
}
console.log(`\n${ids.length - bad}/${ids.length} clean`);
