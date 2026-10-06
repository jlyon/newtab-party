# newtab.party game builder

A Claude Code skill that builds you a playable arcade game in about ten minutes. You answer four quick questions, Claude writes a single self-contained HTML file, and you double-click it to play. No engine, no build step, no game-dev experience needed.

The games it makes are the same ones that run on [newtab.party](https://newtab.party), a daily arcade where everyone plays the same game each day. If you build something good, you can submit it and it gets its own day in the rotation.

**[Play today's game](https://newtab.party)** · **[Chrome extension](https://chromewebstore.google.com/detail/newtabparty/hhledeikahmmaakcgcapeklbajaganbm)**

---

## Install

In Claude Code, add this repo as a plugin marketplace and install the plugin:

```
/plugin marketplace add jlyon/newtab-party
/plugin install newtab-party@newtab-party
```

See the [plugin docs](https://code.claude.com/docs/en/discover-plugins) if you haven't used plugins before.

## Make a game

```
/newtab-party:game-builder
```

You can also just ask: "make me a game".

Claude asks four things, one at a time:

1. **Game type.** You get five random ideas, but you can ask for anything. Mashups are encouraged ("snake, but it's a conga line").
2. **Name.** Whatever you want.
3. **Colors.** Two or three favorites. The first is primary, the second is the accent.
4. **The juicy details.** A few quick questions about your hero, the enemies, the setting and the jokes.

Then it builds the game, checks it on simulated phones, tablets and a desktop, and saves it as `<your-game>.html` in your current folder. Open the file in a browser and play. (The device check needs Playwright; Claude will offer to install it.)

## Make it better

Keep chatting until you love it. Things that work well:

- "Make the enemies faster after 30 seconds."
- "Add a boss that shows up every 1,000 points."
- "The death message should roast me harder."
- "More juice: screen shake, particles, a combo counter."
- "Make the hero a raccoon in a trench coat."

## What you get

Every game the skill produces follows the same house rules, so it works everywhere without extra effort from you:

- **One file.** All HTML, CSS and JavaScript in a single `.html`. It works offline.
- **Phones, tablets and desktop.** Touch controls appear automatically on touch screens, keyboard controls on desktop, and the layout fits portrait phones and iPads.
- **Same speed everywhere.** The game runs at the same pace on a 60 Hz laptop, a 120 Hz iPhone and a 144 Hz monitor.
- **A title screen.** Every game opens with its name, how to play, and a Play button.
- **Honest scores.** The score you see at game over is the exact number that would go on the leaderboard.

## Submit your game to newtab.party

Want everyone to play it? Open a pull request.

1. Fork [the repo](https://github.com/jlyon/newtab-party) and put your game in `worker/public/games/<id>.html`.
2. Add an entry to the `games` array in `worker/games.json`:

   ```json
   {
     "id": "my-game",
     "name": "My Game",
     "file": "games/my-game.html",
     "description": "One sentence about the game.",
     "controls": "Arrow keys to move · Space to shoot · Swipe on mobile",
     "type": "spaceship-shooter"
   }
   ```

3. Append your `id` to the **end** of the `schedule` array in the same file. That's what gives your game a day. Never insert it earlier, since that would move games that are already scheduled.
4. Run the QA checks from the repo root and fix anything they flag:

   ```bash
   node scripts/qa/lint.mjs my-game
   SHOTS=1 node scripts/qa/smoke.mjs my-game
   ```

   The smoke test plays your game on a desktop, two iPhones and an iPad, and saves screenshots to `scripts/qa/shots/`. It needs Playwright (`npm i -D playwright` in `scripts/qa`).
5. Open the PR. A logo gets generated for your game before it airs.

### The one rule games must follow

The arcade learns your score through one message. The skill wires this up for you, but if you edit the game by hand, keep it intact:

```js
let _hi = 0;
function postHi(n) {
  n = Math.max(0, Math.round(Number(n) || 0));
  if (n > _hi) _hi = n;
  try { window.parent.postMessage({ highScore: n }, '*'); } catch (e) {}
}
```

Call `postHi(score)` once every time a run ends, whether the player won or lost. Post the same number you show on screen. Don't scale it, and don't call it every frame.

---

Running or hosting the website itself? See [DEPLOY.md](DEPLOY.md).
