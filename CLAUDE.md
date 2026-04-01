# Playgent Game Dev Kit

## Meta

- No CLAUDE.md file in this repo should exceed 150 lines
- Subfolder CLAUDE.md files exist in: core/, game-patterns/, games/, scripts/

## Project Overview

A framework for building turn-based multiplayer games. Each game is a self-contained 3-file directory (manifest.json, game.js, index.html). No build step, no runtime dependencies. Games run in sandboxed V8 isolates with deterministic replay.

## Creating a Game

1. Read GAME_GUIDE.md for the full 6-function contract
2. Read game-patterns/ for composable pattern guides matching your game type
3. Study reference games in games/ -- start from the closest match
4. Create games/<your-slug>/ with manifest.json, game.js, index.html

## Testing

Run logic tests first (zero dependencies, instant):

    node scripts/test-game-logic.mjs games/<your-slug> --sweep

If logic passes, install Playwright and run UI tests:

    npm install && npx playwright install chromium
    node scripts/test-game-ui.mjs games/<your-slug>

Fix all failures before proceeding.

## Playtesting

    node dev-server.mjs games/<your-slug>

Open each player in a separate tab: http://localhost:3000/?player=1, /?player=2, etc.

## Key Rules

- game.js must use `var GameLogic = {...}` (not export default)
- No Math.random(), fetch(), eval(), or external scripts
- perform() must be pure -- return new state, never mutate
- view() must filter private data per player
- view(null) must return a safe spectator view
- turnConfig(state, null) must return {defaultAction} when no players can act
- Handle `__system__` actions in perform() BEFORE any player-identity guard
- Actions must be JSON-serializable (no functions, no circular refs)
- All randomness via ctx.random in setup(), store seed for PRNG reconstruction

## Architecture

```
core/           Engine runtime, types, validation (see core/CLAUDE.md)
game-patterns/  Composable pattern guides (see game-patterns/CLAUDE.md)
games/          Reference implementations (see games/CLAUDE.md)
scripts/        Test harnesses (see scripts/CLAUDE.md)
dev-server.mjs  Hot-reload local dev server with multi-tab multiplayer
GAME_GUIDE.md   Complete game contract reference (the source of truth)
```

## Limits

- Bundle size: <5 MB (manifest + game.js + index.html)
- Runtime memory: <8 MB per game instance
- CPU per action: 5 second timeout
- Max players: 12 per room
