# Interrupts

## When This Applies
Games where players can react out of turn to cancel, counter, or modify another player's action.
Nope (Exploding Kittens), Neigh (Unstable Unicorns), Challenge/Block (Coup), Trap cards.

## State Shape
Add these fields to your base game state:
```
pendingAction: Action | null       // the action waiting to resolve
interruptWindow: boolean           // true when players can react
interruptDepth: number             // 0 = original action, 1 = counter, 2 = counter-counter
interruptResponses: Record<string, Action | null>  // pid → response (null = not yet responded)
maxInterruptDepth: number          // cap at 3-4 to prevent infinite chains
```

## Turn Flow
1. **Action played** → do NOT resolve immediately:
   - Set `pendingAction` to the played action
   - Set `interruptWindow = true`, `interruptDepth = 0`
   - Initialize `interruptResponses = {}` for all other players (values = null)
2. **During interrupt window:**
   - `actions(state, pid)` for non-acting players → `[{type:"react", card: X}, {type:"pass"}]`
   - `actions(state, actingPlayer)` → `[]` (cannot act during own interrupt window)
   - `turnConfig(state, null)`: `{ timeoutMs: 10000, defaultAction: {type: "pass"} }`
   - `perform("pass", pid)` → set `interruptResponses[pid] = "pass"`
   - `perform("react", pid)` → counter the pending action
3. **Counter-on-counter (Nope on Nope):**
   - `interruptDepth++`, new interrupt window opens for the counter
   - Even depths (0, 2) = original action resolves; odd depths (1, 3) = action is cancelled
4. **Window closes** (all responded OR timer fires):
   - If no react: resolve `pendingAction` normally
   - If countered (odd depth): discard `pendingAction`, do not resolve
   - Reset: `interruptWindow = false`, `pendingAction = null`, `interruptDepth = 0`

### Challenge/Block Variant (Coup)
Different from nope-style — challenge is a verification step:
1. Player claims action (e.g., "I have Duke, I take 3 coins")
2. Another player challenges → reveal card
3. If bluffing: action fails, bluffer loses influence
4. If truthful: challenger loses influence, action resolves
This is a **resolve step**, not a nested interrupt window.

## Gotchas
- **ALWAYS set timer on interrupt windows:** without `turnConfig(null)` + defaultAction,
  game freezes waiting for responses that never come
- **Cap interrupt depth:** set `maxInterruptDepth = 3` or 4. At cap, auto-resolve
- **Check interruptResponses[pid]:** only allow one response per player per window
- **Challenge/block is NOT a nested window:** it's a resolve step. Don't open a new
  interrupt window for it — use a `resolving` sub-phase instead
- **Wait for ALL responses:** don't resolve on first react. Wait for all players to
  respond (react or pass) before resolving the window

## UI Landmarks
- `[data-pending-action]` — the action being interrupted
- `[data-interrupt-window]` — interrupt response buttons (react/pass)
- `[data-interrupt-timer]` — countdown for interrupt window

## Example Reference
Interrupts layer on top of other patterns. Combine with card-combo or social-deduction.
See `games/werewolf/game.js` for a phase-based reaction pattern.
