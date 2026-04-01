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

Paste this prompt into Claude Code:

> Build a Playgent game: "your game idea here". Clone https://github.com/playgentio/playgent-gamedev if not already nearby, then follow the CLAUDE.md instructions to create, test, and serve the game.

Claude will:

1. Clone the repo and read [GAME_GUIDE.md](GAME_GUIDE.md)
2. Create your game from your description (3 files in `games/your-slug/`)
3. Run logic and UI tests, fixing any errors
4. Start the dev server and give you player URLs to open in separate tabs (e.g. `/?player=1`, `/?player=2`) so you can playtest multiplayer in your browser
5. When you're happy, zip up the game directory ready for upload to [playgent.io](https://playgent.io)
