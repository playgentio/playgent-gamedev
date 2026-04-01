# Economic

## When This Applies
Games with resource management, markets, trading between players, or engine-building.
Monopoly, Catan, Splendor, Ticket to Ride, Power Grid, Agricola.

## State Shape
```
resources: Record<string, Record<string, number>>  // pid → { gold: 5, wood: 3, ... }
market: { available: Item[], prices: Record<string, number> }
board: any                 // game-specific (property map, hex grid, route network)
turnPhase: string          // "roll" | "trade" | "build" | "end"
currentPlayer: string
victoryPoints: Record<string, number>  // derived, but cached for display
round: number
```
**Trade state** (when active):
```
tradeOffer: { from: string, to: string, offering: Resources, requesting: Resources } | null
```

## Turn Flow
1. **Multi-step turns:** each turn has sub-phases. `actions()` returns different options per phase:
   - Roll/produce → collect resources
   - Trade → propose/accept/reject trades with other players
   - Build/buy → spend resources to acquire assets
   - End turn → explicit `{type: "end_turn"}` action required
2. `actions(state, pid)`:
   - If `pid !== currentPlayer` → return `[]` (except trade responses)
   - If trade pending and `pid === tradeOffer.to` → return accept/reject
   - Filter by current turnPhase: only show relevant actions
3. `perform(state, action, pid)`:
   - **ALWAYS validate resource costs** — check player has enough before deducting
   - Apply purchase: deduct resources, grant asset/card/property
   - Trade: transfer resources between players atomically
   - `end_turn`: advance currentPlayer, reset turnPhase

## Gotchas
- **Resource validation is MANDATORY:** `perform()` must verify `resources[pid][type] >= cost`
  for every purchase/build/trade. Never trust the client
- **Derive victory points from state:** compute from properties owned, buildings built, etc.
  Do not store VP independently — it will desync
- **Trade target validation:** verify `tradeOffer.to` is a valid, active player
- **Explicit end_turn required:** do not auto-advance. Player may want to trade then build
- **Market exhaustion:** handle empty supply gracefully — remove from available actions
- **Worker placement variant:** shared board spaces that block. Track `occupied: Record<string, string>`
  — `actions()` must exclude occupied spaces

## UI Landmarks
- `[data-resources]` — player's resource display
- `[data-market]` — available purchases/market display
- `[data-victory-points]` — score/VP tracker
- `[data-turn-phase]` — current sub-phase indicator
- `[data-trade-offer]` — active trade proposal display

## Example Reference
Economic games combine sequential turns with resource state.
Start from `games/tic-tac-toe/game.js` and add resource/market layers.
