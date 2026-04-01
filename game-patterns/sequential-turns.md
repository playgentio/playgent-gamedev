# Sequential Turns

## When This Applies
Games where players alternate taking one action per turn on a shared board or space.
Chess, Checkers, Connect4, Go, Othello, Backgammon, Blokus, Carcassonne, Love Letter.

## State Shape
```
board: number[][]          // 2D grid — 0=empty, 1=P1, 2=P2 (or flat array with width)
players: string[]          // ordered player IDs
currentTurn: string        // player ID whose turn it is
winner: string | null      // set when game ends
draw: boolean              // true if stalemate/draw
moveHistory: Move[]        // optional — for undo, replay, notation
```
**Spatial/territory variant:** add `adjacency: Record<string, string[]>` for hex/graph maps.
Use `view()` to implement fog-of-war — only return cells visible to the requesting player.

## Turn Flow
1. `actions(state, playerId)`:
   - If `playerId !== state.currentTurn` → return `[]`
   - Enumerate all legal moves for current player
   - For forced-capture games (checkers): return ONLY capture moves when any exist
   - If no legal moves but game continues: return `[{type: "pass"}]` (Go, Othello)
2. `perform(state, action, playerId)`:
   - Clone state (never mutate)
   - Apply placement/movement to board
   - Check win/draw condition immediately after every perform
   - Advance `currentTurn` to next player in `players` array
   - Return new state
3. `turnConfig(state, playerId)`:
   - Return `{ timeoutMs: 30000, defaultAction: <first legal move or pass> }`
   - No phase timers needed — one phase, one player at a time

## Gotchas
- **Forced capture (checkers):** `actions()` must return ONLY captures when captures exist — do not include non-capture moves
- **Pass handling (Go/Othello):** return `[{type:"pass"}]`, never return `[]` (empty = game over)
- **Win check timing:** check after EVERY `perform()`, not just at end of round
- **Immutable state:** always deep-clone before modifying — `JSON.parse(JSON.stringify(state))`
- **Board indexing:** pick row-major `board[row][col]` and be consistent everywhere
- **Large boards (Go 19x19):** use flat array + width for performance

## UI Landmarks
- `[data-board]` — the board container
- `[data-cell="r,c"]` — individual cell at row,col
- `[data-current-player]` — whose turn indicator
- `[data-move-history]` — optional move log

## Example Reference
`games/tic-tac-toe/game.js` — simplest 2-player sequential turn game.
