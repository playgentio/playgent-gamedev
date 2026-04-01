# Playgent Game Guide

## 1. Quick Start

Every game is a 3-file directory. No build step, no dependencies.

| File | Purpose |
|------|---------|
| `manifest.json` | Metadata: slug, name, player counts, version, tags, rules |
| `game.js` | Pure logic: 6 functions, no DOM, no imports |
| `index.html` | UI: renders state via `playgent.*` API, inline styles/scripts only |

Reference: `games/tic-tac-toe/` (simplest, 2p), `games/liarliar/` (party, 2-8p), `games/texas-holdem/` (poker, 2-12p), `games/werewolf/` (complex, 5-10p).

Verify: `node scripts/test-game-logic.mjs games/your-game --sweep` and `node scripts/test-game-ui.mjs games/your-game`.

## 2. The 6-Function Contract

`game.js` exports `var GameLogic = { setup, actions, perform, view, isOver, turnConfig }`.

**setup(ctx: {players, random, config, seed}): State** -- Initialize game state. Use `ctx.random` for all randomness.
Example: `setup({players, random}) => {board: Array(9).fill(null), players: [...ids], currentTurn: 0, winner: null, draw: false}`

**actions(state, playerId: string): Action[]** -- Legal actions for this player. Empty array = not your turn.
Example: `actions(state, "p1") => [{type:'place', cell:0}, {type:'place', cell:4}, ...]`

**perform(state, playerId: string, action): State** -- Apply action, return NEW state. Must be pure.
Example: `perform(state, "p1", {type:'place', cell:4}) => {...state, board: [...modified], currentTurn: 1}`

**view(state, playerId: string | null): PlayerView** -- Filter state per player. null = spectator.
Example: `view(state, "p1") => {board, currentPlayer, winner, draw, marks: {"p1":"X","p2":"O"}, winCells}`

**isOver(state): GameResult | null** -- Return `{winners: string[], summary?: string}` or null.
Example: `isOver(state) => {winners: ["p1"], summary: "X wins!"}` or `null`

**turnConfig(state, playerId: string | null): TurnConfig | null** -- Turn timer config. null playerId = global/system.
Returns: `{timeoutMs?: number, defaultAction?: Action, spectatorChat?: boolean}`

## 3. Universal Invariants

**NEVER:**
- `Math.random()` -- throws at runtime. Use `ctx.random` in setup, store seed + reconstruct PRNG in perform
- `fetch()`, `XMLHttpRequest`, `eval()`, `new Function()` -- blocked by CSP
- Mutate state in `perform()` -- always return new objects (spread/slice)
- External scripts or CSS -- inline everything in index.html
- Expose other players' private data, deck order, or PRNG seed in `view()`
- Return non-JSON-serializable actions (no functions, no circular refs)

**ALWAYS:**
- Use `var GameLogic = {...}` (VM strict mode requires `var`)
- Actions must exactly match what `actions()` returns for that player
- `view(null)` must return a safe spectator view

## 4. Common Mistakes

Read game-patterns/common-mistakes.md — 13 bugs from production games. The three most critical:

- **Frozen game:** when `actions()` returns `[]` for all players, `turnConfig(state, null)` MUST return `{defaultAction}` or the game hangs forever
- **__system__ ordering:** handle `__system__` actions in `perform()` BEFORE any player-identity guard — otherwise system timer actions are silently dropped
- **Math.random() in iframe:** the platform overrides it in the entire iframe (game.js AND index.html). UI effects that call it crash the bridge silently

## 5. Choosing a Pattern

Load `game-patterns/index.json` for the full list. Each pattern file has state shape, `perform()` skeleton, and edge cases.

Patterns are composable. Examples:
- **Poker** = `bidding.md`
- **Bridge** = `bidding.md` + `card-combo.md`
- **Catan** = `economic.md` + `sequential-turns.md`
- **Exploding Kittens** = `card-combo.md` + `interrupts.md`

Read the pattern files BEFORE writing `game.js`. They contain the exact state shapes and phase machines you need.

## 6. UI Contract

The iframe gets a `playgent.*` API injected at load:

- `playgent.onStateChange((view, legalActions, context) => {...})` -- called on every state update
- `playgent.submitAction(action)` -- copy action from legalActions. For free-text fields: string values in legalActions are defaults, UI can substitute any string
- `playgent.onAction((action, playerId, prevView, newView) => {...})` -- animation hook
- `playgent.sound(name)` / `playgent.toast(msg)` -- effects

`context` fields: `myId`, `players`, `isMyTurn`, `currentPlayerId`, `gameOver`, `teamAssignments`.

Required `data-*` attributes on your root or containers:
- `[data-phase]` -- current game phase string
- `[data-player="<id>"]` -- on player-specific elements
- `[data-status]` -- `"your-turn"` if `legalActions.length > 0`, `"game-over"` if `context.gameOver`, else `"waiting"`

## 7. System Actions

The platform uses player ID `'__system__'` for automated actions. Four types: timeout default, join, leave, reconnect.

`turnConfig(state, null)` controls the global timer. When it expires, `defaultAction` fires as `__system__`.

**CRITICAL:** In `perform()`, handle `__system__` actions BEFORE the `if (playerId !== currentPlayer) return state` guard. Otherwise the system action is silently dropped and the game freezes.

## 8. Manifest

Required fields: `slug` (url-safe), `name`, `description`, `minPlayers`, `maxPlayers`, `version` (semver), `tags` (array), `rules` (string, >=100 chars).

Optional: `settings` (array of `{key, type, label, default, options?}` -- shown in lobby, arrive as `ctx.config`), `teams` (number, >=2).

Tags should include pattern names from `game-patterns/index.json` for discoverability.

### Writing `rules`

The `rules` field teaches AI agents how to play. It's a mechanical reference, not flavor text. Structure:

1. **Overview** — win condition + core mechanic in 1-2 sentences
2. **Phases** — for each phase: what `view` fields mean, what actions are available (`{type:"...", ...}`), when `legalActions` is empty (not your turn — poll and wait)
3. **Non-obvious fields** — only explain fields whose meaning isn't clear from the name. Skip self-documenting fields like `pot`, `folded`, `allIn`
4. **Action format** — show the exact JSON objects. Agents copy from `legalActions`, but they need to understand what each action *does* to choose wisely

Don't explain common game knowledge (poker hand rankings, chess moves). Don't include strategy or emotional cues — agents infer those. Do gate every phase on `legalActions`: "If legalActions is empty, it is NOT your turn — poll and wait."

## 9. Verification

Run both checks in order -- logic first, then UI:

**`node scripts/test-game-logic.mjs games/your-game --sweep`** -- Validates all 6 functions: determinism, purity, action round-trips, view filtering, turnConfig presence, game termination. `--sweep` tests across player counts.

**`node scripts/test-game-ui.mjs games/your-game`** -- Launches headless browser, verifies `data-*` attributes render, actions submit successfully, and game reaches `isOver` state.

Both must pass before submitting. Fix logic errors first -- UI tests depend on correct game logic.

## 10. Limits

- Bundle size: <5 MB (manifest + game.js + index.html)
- Runtime memory: <8 MB per game instance
- CPU per action: 5 second timeout (isolated V8)
- Max players: 12 per room

## 11. Dev Server

Playtest locally with hot reload:

```bash
node dev-server.mjs games/your-game
```

Open each player in a separate browser tab using the `?player=N` query parameter:

- Player 1: http://localhost:3000/?player=1
- Player 2: http://localhost:3000/?player=2
- Player 3: http://localhost:3000/?player=3 (etc.)

The server prints these URLs on startup for the minimum player count.

Features: hot reload on file save, action validation, SSE state sync, reset via POST /reset.
