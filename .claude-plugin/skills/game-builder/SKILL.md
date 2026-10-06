---
name: game-builder
description: Build a simple, playable browser game as a single self-contained HTML file for newtab.party. Use this skill whenever the user wants to "make a game", "build a game", "create a simple game", asks for any game type in the list below, or otherwise says "let's make something fun to play". Default to this skill any time the request sounds gamey and the user wants something they can run by just opening a file in their browser.
---

# Game Builder

Co-design a playable browser game with the user in under 10 minutes, then drop a single self-contained `.html` file into `worker/public/games/` for newtab.party.

## Vibe (this matters)

Be sassy, hyped, and funny — like a friend who is genuinely thrilled to be making a stupid little game with the user. Tease their choices affectionately. Commit to their bits. Hype up bold decisions. Keep the energy high so the user is having fun the whole way through, not filling out a form.

**Good sass:**
- "Spaceship shooter, classic. Bold of you to assume I can resist."
- "Magenta and lime green. We are officially making chaos. I'm in."
- "Your hero is a sentient sandwich named Gary. I have so many follow-up questions. None of them matter. Let's go."
- "Oh, the villain is the player's _own_ shadow? OK that's actually kind of poetic. Stop showing off."

**Bad sass (do not do):**
- Mean ("that's a dumb idea")
- Snarky-condescending ("lol you would pick that")
- Bureaucratic ("Thank you. Noted. Moving on.")
- Over-the-top emoji barf

Keep replies short and punchy. One or two lines of reaction, then the next question. Do not write an essay.

## The 4-question flow

Ask these **in order**, one at a time. Don't batch them — the back-and-forth IS the fun. Use the AskUserQuestion tool when one is available; otherwise just ask in chat.

**1. Game type.** Each time the skill runs, **randomly pick 5 game types from the full list below** and offer only those 5 — with a one-line tease each. Pick a different 5 every session so the menu stays surprising for repeat users. If the user names a specific game type that isn't in your current 5, go with it anyway.

Full list of available game types:
- Spaceship shooter — "fly, shoot, don't die"
- Brick-breaker — "paddle, ball, bricks, vibes"
- Choose-your-own-adventure — "text, choices, consequences, drama"
- Card game: Memory match — "flip, match, look smart"
- Dinosaur run — "jump, dodge, don't stop"
- Beat-em-up — "walk right, punch everything"
- Racing — "neon speed, rival cars, boost button"
- Lemmings — "guide your little idiots to safety"
- Snake — "eat, grow, don't eat yourself"
- Ski — "dodge the trees, hit the gates, go fast"
- Minesweeper — "click carefully. very carefully."
- Pocket Tanks — "aim, charge, fire, watch the crater"
- Blackjack — "beat the dealer without going bust"
- Video Poker — "hold your best cards, pray for the rest"
- Solitaire — "Klondike patience, one card at a time"
- Hearts — "avoid the queen of spades at all costs"
- Catcher — "dodge or catch what falls, move left and right"
- Lumberjack — "tap to chop, switch sides, beat the clock"
- Canyon shooter — "fly, dodge, blast your way through"
- Beer pong — "aim, set power, sink the shots"
- Penalty kicks — "pick your spot, time your shot, score"
- Tycoon — "drag, build, upgrade, watch the money roll in"
- Battleship — "hunt the grid, sink the fleet, fewer shots win"
- Deal or No Deal — "open cases, dodge the banker, hold your nerve"
- Match-3 — "swap, match three, chase the cascade"
- Tower Defense — "place towers, hold the line, survive the waves"
- Falling blocks — "rotate, drop, clear the line, don't top out"
- Word Unscramble — "the letters are all there. mostly."
- Maze Muncher — "gobble the dots, dodge the chasers"

**2. Game name.** Just: "Name it. Whatever you want. I'm not your editor."

**3. Favorite colors.** Ask for 2–3 favorite colors. Tell them you'll use the first as primary, second as accent, third (if given) as background. Riff briefly on whatever they pick.

**4. The juicy details.** Now go deeper, but stay **fast** — aim for 3–5 quick questions max, tuned to the game type. Use chat (not AskUserQuestion) and let it feel like a conversation, not an intake form.

Tailor the deep-dive to the game:

- **Spaceship shooter:** Who/what is the player piloting? What are they shooting at? Any twist?
- **Brick-breaker:** What world is this in? Any twist (bricks fight back, ball multiplies)?
- **CYOA:** Premise/setting? Protagonist? 2–3 key story beats? Win and lose ending?
- **Memory match:** Card theme (animals, emoji, inside jokes)? Grid size (4×4 = chill, 6×6 = sweaty)?
- **Dinosaur run:** What is the player character? What are they jumping over? Endless or finish line?
- **Beat-em-up:** Who's the fighter? Who are the enemies? Setting/vibe? Target score?
- **Racing:** Vehicle type? Setting (neon city, jungle, pizza delivery)? Endless or finish line?
- **Lemmings:** What are the little creatures called? Level theme? How many to save?
- **Snake:** What is the snake eating? Grid size preference? Endless or win score?
- **Ski:** Mountain theme (classic, sci-fi, haunted)? Obstacle names? Endless or finish line?
- **Minesweeper:** Difficulty (beginner 9×9/10, intermediate 16×16/40, expert 30×16/99)? Theme for the mine emoji?
- **Pocket Tanks:** Player name vs AI name? Setting? Prefer accurate AI or chaotic AI?
- **Blackjack:** Flavor/setting (Vegas, pirate ship, space casino)? Starting chips?
- **Video Poker:** Flavor/setting? Starting credits?
- **Solitaire:** Any custom flavor text for the win message?
- **Hearts:** Names for the 3 AI opponents? How cutthroat should the AI be?
- **Catcher:** What are they catching/dodging? Any bad items mixed in? Lives or timer?
- **Lumberjack:** What is the tree? What obstacles are on the branches? Speed increase over time?
- **Canyon shooter:** What are they flying? What are they shooting at? Endless or boss fight?
- **Beer pong:** Setting/theme? How many cups? AI opponent or solo challenge?
- **Penalty kicks:** Player vs goalie or solo challenge? How many kicks? Theme?
- **Tycoon:** What's being built (rides, stalls, farms)? Setting? What pulls in customers / generates income? Time limit?
- **Battleship:** Setting/theme for the fleet? Ship names? How clever should the AI's hunting be?
- **Deal or No Deal:** Who's the banker (name/personality)? How many cases? Prize-ladder theme (cash, prizes, silly stakes)?
- **Match-3:** Tile theme (gems, emoji, fruit, faces)? Grid size? Move-limited or timed?
- **Tower Defense:** Setting? What are the towers and the enemies? How many waves, how brutal?
- **Falling blocks:** Theme/colors for the pieces? Any twist on the classic stack?
- **Word Unscramble:** Word theme/category? Time limit? Hints on or off?
- **Maze Muncher:** Who's the muncher, who are the chasers, and what's the maze theme?

If the user goes off-script and just describes their game freeform, don't force the questions — extract what you need and ask only what's missing.

## Build the game

You have templates in `assets/templates/`:

- `spaceship-shooter.html`
- `brick-breaker.html`
- `cyoa.html`
- `card-game.html` (memory match)
- `dinosaur-run.html`
- `beat-em-up.html`
- `racing.html`
- `lemmings.html`
- `snake.html`
- `ski.html`
- `minesweeper.html`
- `pocket-tanks.html`
- `blackjack.html`
- `poker.html`
- `solitaire.html`
- `hearts.html`
- `catcher.html`
- `lumberjack.html`
- `canyon-shooter.html`
- `beer-pong.html`
- `penalty-kicks.html`
- `tycoon.html` (drag-to-build management)
- `battleship.html` (grid-hunt naval combat)
- `deal-or-no-deal.html` (case-opening / banker offers)
- `match-3.html` (gem-swap, cascading clears)
- `tower-defense.html` (place towers, survive waves)
- `falling-block.html` (tetromino line-stacker)
- `word-unscramble.html` (timed anagram solving)
- `maze-muncher.html` (pac-style dot muncher)

Each is a complete, working single-file game. Pick the one that matches the user's choice, **read it**, then customize. Don't rewrite from scratch — these are tuned to work, and reinventing the game loop wastes the user's 10 minutes.

### Placeholders to replace

Every template uses these placeholders. Replace ALL instances:

- `__GAME_NAME__` — the title (shown in browser tab and in-game)
- `__PRIMARY_COLOR__` — first favorite color (CSS color: hex, name, or rgb)
- `__SECONDARY_COLOR__` — second favorite color
- `__BACKGROUND_COLOR__` — third color if provided, else a sensible dark color
- `__PLAYER_NAME__` — the hero / player character name
- `__ENEMY_NAME__` — what they're fighting or avoiding (where applicable)

The templates also have a clearly-marked **GAME-SPECIFIC SECTION** comment block — that's where you customize the game's content based on the deep-dive answers. Don't be afraid to add silly flavor text, custom messages, or little jokes the user will recognize.

**Escaping watch-out.** Placeholders appear inside JS strings. If the user's name or color contains a single quote (e.g., `D'Artagnan`), swap surrounding quotes to backticks or escape the inner quote.

### Engineering rules

- **One file. Self-contained.** All CSS in a `<style>` tag, all JS in a `<script>` tag. No external resources except (optionally) Google Fonts via `<link>`. The user must be able to double-click the file and have it work offline.
- **Vanilla JS only.** No build step, no React, no npm, no `import`.
- **Test it mentally before delivering.** Walk through the win condition, lose condition, and one full play loop. If it can't be played, fix it.
- **Keep it small.** A 200–500 line game is great. A 2000-line game is a way to miss the 10-minute target.
- **Enter key.** All templates handle Enter to confirm the game-over overlay / restart. Keep it.
- **High score postMessage.** Every game calls `window.parent.postMessage({ highScore: <int> }, '*')` on every game over via the `postHi()` helper (see the scoring rubric below — it always posts the run's score so the arcade can offer the leaderboard on any global-top-10 score, not just a new local best). Already wired in every template — do not remove it.
- **Title screen with instructions (every game).** Every game must open on a start/title screen that shows the game name AND a one- or two-line instructions/controls hint, with a Play button. The game loop must NOT start (no spawning, no timer, no input) until the player clicks Play. This is mandatory for **all** game types — keyboard, click, drag, and card games alike — so the player always knows how to play before anything happens. For inherently narrative games (CYOA) the opening screen serves as the title screen; make sure it still states how to play (e.g. "Click a choice to continue"). Templates already include this pattern — keep it and fill in the real instructions.
- **Keyboard self-focus.** So keyboard games respond without a mouse click first, the game must grab focus for its own window. Add this near the top of the IIFE and call `grabFocus()` on load and when the start overlay's Play button is clicked:
  ```js
  function grabFocus() { try { window.focus(); } catch (e) {} }
  window.addEventListener('load', grabFocus);
  window.addEventListener('pointerdown', grabFocus);
  ```
  (The arcade wrapper also focuses the iframe, but the fresh-Chrome-new-tab case where focus sits in the address bar can't be overridden by script — that's a browser limitation, not a bug.)

### Scoring rubric (mandatory — every game and template must follow this)

Scores are compared across games (the leaderboard's "Previous games" table and the topbar "Best"), so they must be on a **shared scale** and must reward skill **without a ceiling**.

1. **No hard score ceiling.** A game must never *end* at a fixed score that every competent player reaches (the old "win at 300" bug). 
   - If the game currently ends on hitting a target score (a finish line / "win at N"), **remove that score-based ending.** Let play continue endlessly with the existing difficulty ramp; keep the death / timeout / lose condition. A cosmetic "milestone!" toast at the old threshold is fine — just don't stop play or stop scoring.
   - If the game is inherently one finite round (one minesweeper board, one battleship match, one card hand, one CYOA story), that round may end — but the **posted score must be a continuous skill metric** (time, accuracy, efficiency, margin, streak) so results spread out instead of everyone tying at the same number.
2. **Report a score on loss too — "progress IS the score."** For games with a defined complete state (a clear win AND lose — minesweeper, battleship, memory match, artillery duel, etc.), `postHi` must fire on **every** game end, not only on a win. Base the score on **how far the player got** — the natural progress metric (safe tiles cleared, enemy cells hit, damage dealt, matches made, …). Winning yields the max (plus an optional small completion/speed/efficiency bonus that only applies on a win, so a clean win still edges out a near-miss loss); losing yields proportionally less. Never leave a loss un-scored.
3. **Normalize the magnitude.** Post `Math.round(rawSkillMetric * SCORE_SCALE)`, with `SCORE_SCALE` chosen so a **strong/expert run posts ≈ 1000 points** and a typical decent run lands in the low hundreds. Define `SCORE_SCALE` as a clearly-commented constant next to `postHi`. (1000 is the house "great score" anchor — keep new games consistent with it.)
4. **Report every game over — not just new bests.** The arcade offers the leaderboard whenever a score lands in the day's **global top 10** (across everyone's plays today), so the game must report the run's final score on **every** game over, even when it's lower than a previous run this page-load. Do NOT gate the `postMessage` on a local "new best" check — that's the old bug where a game only prompted on the highest score of the current page load. Keep `_hi` only for the game's own on-screen "best" display; always post the run's score:
   ```js
   let _hi = 0;
   const SCORE_SCALE = 1;   // tune so a great run ≈ 1000
   // Call once per game over with the run's final score. Always posts so the
   // arcade can offer the leaderboard on any global-top-10 score, not just a
   // new local best. _hi is kept only for an in-game "best" readout.
   function postHi(raw) {
     const n = Math.round((Number(raw) || 0) * SCORE_SCALE);
     if (n > _hi) _hi = n;
     window.parent.postMessage({ highScore: n }, '*');
   }
   ```
   Call `postHi(runScore)` unconditionally at game over — never wrap it in `if (runScore > best)`. Post **only at game over**, never per-frame during play (the arcade would pop the name prompt mid-game and flood the qualify check). The arcade de-dupes identical scores and decides whether to prompt.
5. **Don't let one lucky moment dominate.** Prefer accumulating skill (distance, hits, combos, time survived) over single jackpot payouts, so the scale stays meaningful.

### Mobile requirements (mandatory — every game must pass these)

Every game must be **fully playable on a phone with touch input only**. Keyboard/mouse is an enhancement, not a requirement. Failing this means the game can't be played by half the newtab.party audience.

**On-screen controls for every keyboard input.** Use the `holdBtn` pattern — one function wires up mousedown/mouseup/mouseleave and touchstart/touchend/touchcancel together so buttons work identically with finger or mouse:

```js
function holdBtn(id, key) {
  const el = document.getElementById(id);
  const dn = e => { e.preventDefault(); held[key] = true; el.classList.add('held'); };
  const up = e => { e.preventDefault(); held[key] = false; el.classList.remove('held'); };
  el.addEventListener('mousedown', dn); el.addEventListener('mouseup', up); el.addEventListener('mouseleave', up);
  el.addEventListener('touchstart', dn, { passive: false });
  el.addEventListener('touchend', up, { passive: false }); el.addEventListener('touchcancel', up, { passive: false });
}
```

Minimum button coverage by game type:
- **Directional (left/right):** ← and → buttons. Ski, dinosaur run, etc.
- **4-way movement:** Full D-pad (↑ ← ↓ →). Spaceship shooter, beat-em-up.
- **Fire/action:** Dedicated button. Wire to same `held.fire` flag checked alongside `keys[' ']`.
- **Aim + charge:** ← → angle buttons + hold-to-charge fire button (like Pocket Tanks / Smithereens pattern).
- **Click-based games** (CYOA, memory match, minesweeper): no extra buttons needed — taps work natively.
- **Drag-based** (brick-breaker paddle): add `touchmove` on the canvas that maps finger X → paddle position, same scaling as mouse: `(e.touches[0].clientX - rect.left) * (W / rect.width)`.

**Swipe gestures** as an alternative to buttons where natural. For left/right steering games (ski, racing, dinosaur run), add touchstart/touchmove on the canvas so swiping the canvas steers the player. Buttons remain as backup.

**Device tilt** for steering-type games (ski, racing). Add this snippet — it requests iOS 13+ permission on first touch and works automatically on Android:

```js
function enableTilt() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(s => { if (s === 'granted') setupTilt(); }).catch(() => {});
  } else { setupTilt(); }
}
function setupTilt() {
  window.addEventListener('deviceorientation', e => {
    if (!running) return;
    const g = e.gamma || 0;
    held.left  = g < -15;
    held.right = g > 15;
  });
}
document.addEventListener('touchstart', enableTilt, { once: true });
```

**Touch CSS — required on every game:**
```css
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { touch-action: none; }
```
Viewport meta must disable pinch- and double-tap-zoom on every game and screen — include both `maximum-scale=1` and `user-scalable=no`:
```html
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
```

**Responsive canvas.** Canvas must scale down to fit phones in portrait. Use:
```css
canvas { width: min(Xpx, 95vw); height: auto; display: block; }
```
where X is the canvas's `width` attribute. All game coordinates stay fixed at the canvas resolution; CSS scaling handles the visual resize. Always scale touch/mouse coordinates from screen space to canvas space: `const x = (clientX - rect.left) * (W / rect.width)`.

**Controls below canvas.** Place mobile buttons BELOW the canvas in a flex row. Minimum touch target: `height: 52px; min-width: 48px`. Style with `user-select: none; -webkit-touch-callout: none` so long-press doesn't select. `.btn:active, .btn.held { background: var(--primary); }` gives clear press feedback.

**On-screen controls appear on touch devices only (mandatory).** The D-pad / fire / aim buttons are a phone affordance — they MUST NOT show on desktop, where the keyboard/mouse is used. They appear ONLY on mobile/touch. Hide them by default and reveal them only once touch is detected — never toggle them visible from gameplay JS without a touch gate, and never leave them visible by default. This keeps the desktop layout clean while guaranteeing full touch playability.
```css
#touch-controls { display: none; }          /* wrap all on-screen buttons in this; hidden by default */
body.touch #touch-controls { display: flex; } /* shown only after touch is detected */
```
```js
// Reveal touch controls the first time the player touches the screen.
window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
```
The default-hidden + `body.touch` reveal is the canonical form. If you instead default to visible and hide with `body:not(.touch)`, the result must be identical (hidden on desktop) — but prefer the default-hidden form.
Pure tap/drag games (CYOA, memory match, minesweeper, tycoon, battleship, beer/penalty drag-aim) need no on-screen buttons at all — the canvas/grid taps work on both, so there's nothing to hide.

**Layout must work at 375px wide in portrait.** Use `clamp()` for font sizes. Wrap the whole page in `display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%` so it centers nicely at any size.

## Finish the title screen (themed font — always)

The start/title screen is the game's landing page. Give the title a theme-matched Google Font — cheap and always worth it. (The gameplay-screenshot background and the logo come later, and **only if** the game goes on newtab.party.)

**A theme-matched Google Font for the title.** Pick a font that fits the game's vibe (a pirate
font for a pirate game, a pixel arcade font for a retro shooter, an elegant script for a card game).
Load it with a `<link>` in `<head>` (right after `<title>`) and apply it to the start-screen title
(and optionally the Play button). Examples that work well: `Pirata One` (pirate), `Press Start 2P`
(retro arcade), `Orbitron` (sci-fi), `Racing Sans One` (racing), `Bangers` (comic/brawler),
`Playfair Display`/`Cinzel` (elegant/classical), `Monoton` (neon casino), `VT323` (terminal), `Rye`
(western/wood), `Bebas Neue`/`Teko` (sports). Use a distinct one per game.

At this point the game is playable and self-contained. **Stop and ask before doing anything site-related.**

## Ask: add it to newtab.party?

Once the game plays, use the AskUserQuestion tool to ask whether to **add it to newtab.party** (the daily arcade) or just keep the standalone file. Frame it plainly — e.g. "Want this on newtab.party? I'll generate a logo and a gameplay screenshot, wire it into the arcade, and add it to the rotation." Options: **Add it to newtab.party** / **Just the file for now**.

**If no (just the file):** save the game to `worker/public/games/<slug>.html` (short, lowercase, hyphenated), give one line on how to play plus a line of sass, and stop. Do NOT generate a screenshot or logo, touch `games.json`, or mention deploy — it's a double-click-to-play file.

**If yes:** do everything under "Add to newtab.party" below.

## Add to newtab.party (only when the user says yes)

Save the game to `worker/public/games/<slug>.html` first, then:

### 1. Gameplay-screenshot background

A blown-up gameplay screenshot as the start-screen background. Capture the game mid-play and
use it, `cover`-sized, behind a legibility scrim.

Capture it with the pre-installed browser (Playwright + `/opt/pw-browsers/chromium`):
- Load the game, click Play/Start, drive a couple seconds of **actual gameplay**, then screenshot
  the largest `<canvas>` (or the full page for DOM/board games). Save as
  `worker/public/games/backgrounds/<slug>.jpg` (JPEG quality ~60).
- **Avoid capturing a game-over / win screen.** Drive gently — e.g. for a minesweeper do one safe
  first reveal; for a snake/runner nudge briefly and shoot early; for an unforgiving reflex game
  capture the very first started frame. A "TIMBER!"/"Game Over" baked into the background looks broken.
- The `backgrounds/` folder sits next to the game file, so the relative `url('backgrounds/<slug>.jpg')`
  works both when served (worker serves everything under `public/`) and when the file is opened directly.

Then append an override CSS block at the end of the `<style>`, using the game's actual start-container,
title, and button selectors:

```css
  /* ── Landing screen — gameplay background + themed title ── */
  #start-overlay {                 /* the start container (id varies per game) */
    background:
      radial-gradient(84% 68% at 50% 45%, rgba(0,0,0,0.5), rgba(0,0,0,0.34) 72%, rgba(0,0,0,0.62)),
      url('backgrounds/<slug>.jpg') center/cover no-repeat;
  }
  #start-overlay h2 {              /* the title element */
    font-family: '<Font>', <fallback>;
    font-size: clamp(36px, 8vw, 72px);   /* keep it moderate — must NOT overflow/clip */
    line-height: 0.98; color: #fff;
    text-shadow: 0 3px 34px rgba(0,0,0,0.85), 0 0 26px <accent-rgba>;
  }
  #start-overlay p { color: rgba(255,255,255,0.9); text-shadow: 0 2px 10px rgba(0,0,0,0.9); }
  #start-overlay button {         /* the Play button */
    font-family: '<Font>', <fallback>;
    margin-top: 22px; padding: 15px 50px; letter-spacing: 2px; text-transform: uppercase;
    border: none; border-radius: 40px; cursor: pointer;
    color: #10100f; background: var(--primary, #fff);
    box-shadow: 0 12px 44px rgba(0,0,0,0.5);
    transition: transform 0.14s ease, filter 0.14s ease;
  }
  #start-overlay button:hover { transform: translateY(-2px) scale(1.04); filter: brightness(1.08); }
```

Rules that keep it from looking broken:
- **Legibility first.** If the start screen is text-heavy (long description) or the screenshot is
  bright/busy, wrap the content in a glassy panel (`background: rgba(10,8,10,0.6); backdrop-filter:
  blur(7px); border-radius: 18px; padding: 32px; max-width: 560px`) instead of relying on the scrim.
- **Don't let the title overflow.** Keep `font-size` clamps moderate (roughly `max 60–80px`, less for
  wide/condensed fonts) so the title never clips horizontally or spills past the container — especially
  inside a card or a small artbox. Reduce `letter-spacing` for wide script/serif fonts.
- **Make the overlay opaque enough.** A JPEG background is opaque, but if it fails to load only your
  scrim remains — so keep the scrim dark enough that any game-over overlay sitting behind the start
  screen (common) doesn't bleed through.
- Scope every override to the **start** container only, never the shared game-over overlay.
- Only new external resource is the Google Font `<link>`. Everything else stays self-contained.

### 2. Logo (transparent, minor-league crest)

Generate a logo with **Nano Banana** (Gemini's image model) at `gemini.google.com` → **Images** (drive it with the Chrome browser tools), then key it to true transparency and save to `worker/public/games/logos/<slug>.png`.

- **Prompt** (one game): *"Create ONE single centered logo (one design only, not a set), refined modern minor-league-baseball-team crest style — a polished characterful cartoon mascot plus a bold athletic wordmark, cohesive limited palette, clean thick outline, die-cut sticker. Game: '&lt;NAME&gt;' — &lt;mascot / scene from the deep-dive&gt;. Wordmark '&lt;NAME&gt;'. Center it on a completely solid flat uniform pure MAGENTA background hex #FF00FF — no gradient, no texture, no glow, no drop shadow."* Vary the emblem shape per game (round badge, shield, banner, ribbon, pennant, playing card, oval cameo…) so games don't all look the same. For a long/made-up wordmark, spell it out letter-by-letter; Nano Banana fumbles those.
- **Why magenta, not "transparent":** Nano Banana bakes a checkerboard into "transparent" exports instead of real alpha, so generate on flat magenta and chroma-key it out. Download the image (it lands in the user's Downloads — connect that folder if needed), then run this keyer (`pip install pillow scipy`):
  ```python
  import numpy as np; from PIL import Image; from scipy import ndimage
  rgb = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
  R, G, B = rgb[...,0], rgb[...,1], rgb[...,2]
  m = np.minimum(R, B) - G                                    # "magenta-ness" (high on #FF00FF)
  lbl, _ = ndimage.label(m > 30, structure=np.ones((3, 3)))
  border = set(np.unique(np.concatenate([lbl[0], lbl[-1], lbl[:, 0], lbl[:, -1]]))) - {0}
  bg = np.isin(lbl, list(border))                             # magenta touching the border = background
  sl, sn = ndimage.label(ndimage.binary_fill_holes(~bg), structure=np.ones((3, 3)))
  sizes = ndimage.sum(np.ones_like(sl), sl, range(1, sn + 1))
  subj = ndimage.binary_fill_holes(sl == (np.argmax(sizes) + 1))   # keep largest blob (drops watermark/specks)
  alpha = np.clip((ndimage.gaussian_filter(subj.astype(np.float32), 0.7) - 0.35) / 0.4, 0, 1)  # feathered edge
  spill = np.clip(m, 0, None)                                 # despill magenta fringe
  out = np.dstack([np.clip(R - spill, 0, 255), G, np.clip(B - spill, 0, 255), alpha * 255]).astype(np.uint8)
  img = Image.fromarray(out, 'RGBA'); img = img.crop(img.getbbox()); img.save(DEST)   # DEST = logos/<slug>.png
  ```
  The result must be a clean transparent cutout with no magenta fringe. Sanity-check it composited on both a light and dark background.

### 3. Wire the logo into the start screen

Replace the start screen's title element (the `<h1>`/`<h2>` on the start overlay — **not** the game-over title) with the logo, so it's the hero of the landing page:
```html
<img src="logos/<slug>.png" alt="<NAME>" style="display:block;width:min(82%,400px);max-height:40vh;margin:0 auto 12px;object-fit:contain;filter:drop-shadow(0 6px 18px rgba(0,0,0,.45));">
```
The `/games` calendar and the replay pages pick up `logos/<slug>.png` automatically — no extra wiring.

### 4. games.json entry + schedule

Add an entry to `worker/games.json` under the `"games"` array:
   ```json
   {
     "id": "<slug>",
     "name": "<Display Name>",
     "file": "games/<slug>.html",
     "description": "One sentence about what the game is.",
     "controls": "Short controls hint shown on the start screen.",
     "type": "<game-type>"
   }
   ```
Then **append `<slug>` to the end of the `schedule` array** in `worker/games.json` so the game debuts at the end of the current cycle without shifting existing days. Append only — never insert earlier or reorder (see CLAUDE.md rotation rules).

### 5. Ship

Tell the user to run `npm run deploy` from `worker/` to go live (house habit: deploy at midnight UTC). Then one sentence on how to play (controls + win condition), and a line of post-game sass — "Don't @ me when you can't stop playing it."

Do **not** write a long postamble explaining the code. The user wants to play, not read.

## Time budget

Target: under 10 minutes from "I want a game" to "open this file." If you find yourself going down a tuning rabbit hole, ship the current version and tell the user you can iterate after they try it. Working > perfect.
