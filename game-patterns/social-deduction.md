# Social Deduction

## When This Applies
Games with hidden roles, information asymmetry, and elimination via voting.
Werewolf, Mafia, Secret Hitler, Resistance/Avalon, Coup, Blood on the Clocktower.

## State Shape
```
phase: string              // "roleReveal" | "day_discussion" | "day_vote" | "day_result" | "night" | "night_result"
players: {
  id: string, name: string, role: string,
  alive: boolean, votedFor: string | null
}[]
roles: string[]            // master list, HIDDEN — assigned in setup()
votes: Record<string, string>  // voter → target, current round
round: number              // day/night cycle counter
eliminated: string | null  // player eliminated this phase (for result display)
```

## Turn Flow
1. **Phase machine** — each phase transitions to the next:
   `roleReveal → night → night_result → day_discussion → day_vote → day_result → night → ...`
2. **Display-only phases** (roleReveal, day_discussion, day_result, night_result):
   - `actions()` returns `[]` for ALL players
   - `turnConfig(state, null)` returns `{ timeoutMs: 5000-15000, defaultAction: { type: "continue" } }`
   - `perform("continue")` advances to next phase
3. **day_vote phase:**
   - `actions(state, pid)` → alive players get `[{type:"vote", target: <each other alive player>}, {type:"vote", target:"skip"}]`
   - Dead/already-voted → `[]`
   - All votes in → perform resolves majority → advance to day_result
4. **night phase:**
   - Role-specific actions: werewolves pick target, seer picks investigation, doctor picks protection
   - `actions()` returns role-appropriate options only for that player's role
   - All night actions collected → resolve in night_result
5. **Win check:** at day_result AND night_result — wolves >= villagers, or all wolves dead

## Gotchas
- **Dead players:** `actions()` MUST return `[]`. Grant `spectatorChat: true` in view()
- **day_discussion is NOT game-over:** it's a chat-only phase. Do not check isOver() here
- **Win check timing:** check at day_result AND night_result, not during vote/night
- **Player leave during night:** if a wolf leaves, remaining wolves still act. Handle missing actions
- **view() filtering by role:**
  - All players: own role, alive statuses, vote results
  - Werewolves: see each other's roles
  - Seer: sees investigation history
  - Dead: see everything (spectator mode)
  - Spectators: public info only

## UI Landmarks
- `[data-role]` — player's role display (own only)
- `[data-alive]` — alive/dead status indicator per player
- `[data-vote-target]` — vote selection buttons
- `[data-phase-info]` — current phase name and timer

## Example Reference
`games/werewolf/game.js` — full social deduction with day/night phases and multiple roles.
