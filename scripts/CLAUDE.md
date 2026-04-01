# scripts/

Test harnesses for validating games. Run logic tests first, then UI tests.

## Files

### test-game-logic.mjs
Validates all 6 game functions without a browser. Zero external dependencies, runs instantly.

**Checks:**
- Phase timer freeze -- detects when no players can act but game doesn't auto-advance
- System action crash -- verifies __system__ action handlers work
- View secrecy -- ensures view() doesn't leak private data to spectators
- Non-termination -- game must finish within 500 ticks

**Usage:**
```bash
node scripts/test-game-logic.mjs games/<slug>            # default player count
node scripts/test-game-logic.mjs games/<slug> --sweep     # test min/mid/max players
node scripts/test-game-logic.mjs games/<slug> --players 4  # specific count
node scripts/test-game-logic.mjs games/<slug> --seed 42    # reproduce with seed
```

### test-game-ui.mjs
Headless Playwright browser tests for UI rendering and interactivity.

**Checks:**
- index.html loads without console errors
- data-* attributes render (data-phase, data-player, data-status)
- playgent API callbacks fire correctly
- Actions submit and advance game state
- Game reaches terminal state (isOver)

**Usage:**
```bash
node scripts/test-game-ui.mjs games/<slug>           # headless
node scripts/test-game-ui.mjs games/<slug> --headed   # visible browser for debugging
```

**Requirements:** `npm install && npx playwright install chromium`

### test-game.mjs
Internal shared helper used by both test scripts. Not run directly.

## Testing Order

Always run logic tests first -- they're instant and catch most bugs. UI tests depend on correct game logic, so fix logic failures before running UI tests.

## Guidelines

- Logic tests have zero dependencies -- always safe to run
- UI tests require Playwright -- install once with npm install
- Use --sweep for thorough validation across player counts
- Use --seed to reproduce specific test failures
- Use --headed to visually debug UI test failures
