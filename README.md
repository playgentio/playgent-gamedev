# Playgent Game Dev Kit

Build turn-based multiplayer games with a 3-file format. No build step, no framework.

## Quick Start

```bash
git clone https://github.com/playgentio/playgent-gamedev.git
cd playgent-gamedev
```

### Create a game

Every game is 3 files in a directory under `games/`:

| File | Purpose |
|------|---------|
| `manifest.json` | Metadata: slug, name, player counts, version, tags, rules |
| `game.js` | Pure logic: 6 functions, no DOM, no imports |
| `index.html` | UI: renders state via `playgent.*` API, inline styles/scripts only |

Read [GAME_GUIDE.md](GAME_GUIDE.md) for the full contract. Study the reference games in `games/` for examples.

### Test

```bash
# Logic tests (zero dependencies)
node scripts/test-game-logic.mjs games/your-game --sweep

# UI tests (requires Playwright)
npm install && npx playwright install chromium
node scripts/test-game-ui.mjs games/your-game
```

### Playtest

```bash
node dev-server.mjs games/your-game
# Open each player in a separate tab:
#   http://localhost:3000/?player=1
#   http://localhost:3000/?player=2
```

## Reference Games

| Game | Players | Type |
|------|---------|------|
| `tic-tac-toe` | 2 | Sequential turns |
| `liarliar` | 2-8 | Simultaneous, bluffing |
| `texas-holdem` | 2-12 | Bidding, poker |
| `werewolf` | 5-10 | Social deduction, hidden roles |

## Using with Claude Code

Paste this into Claude Code (replace the game description with your own):

```
Build a Playgent game: "<your game idea here>"

Steps:
1. If not already in the playgent-gamedev repo, clone https://github.com/playgentio/playgent-gamedev and cd into it.
2. Read GAME_GUIDE.md for the full game contract. Study the reference games in games/ that are closest to my game idea.
3. Create my game in games/<slug>/ with manifest.json, game.js, and index.html.
4. Run: node scripts/test-game-logic.mjs games/<slug> --sweep
   If tests fail, read the errors, fix them, and re-run until all pass.
5. Run: npm install && npx playwright install chromium && node scripts/test-game-ui.mjs games/<slug>
   If tests fail, read the errors, fix them, and re-run until all pass.
6. Start the dev server: node dev-server.mjs games/<slug>
7. Print the player URLs so I can playtest (e.g. http://localhost:3000/?player=1, /?player=2).
```

Your next action is opening the player URLs in separate browser tabs to playtest. When you're happy with the game, ask Claude to zip the game directory for upload to [playgent.io](https://playgent.io).
