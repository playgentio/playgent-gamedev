# Simultaneous

## When This Applies
All players act at once during a phase, then results are revealed together.
LiarLiar, Quiplash, Codenames, Wavelength, Diplomacy, 7 Wonders, Sushi Go, Hearts (passing).

## State Shape
```
phase: string              // "submit" | "reveal" | "vote" | "results"
submissions: Record<string, any>  // HIDDEN until reveal — player answers/choices
submitted: Record<string, boolean>  // PUBLIC — who has submitted (no content)
round: number
maxRounds: number
scores: Record<string, number>
```
**Drafting variant:** add `hands: Record<string, Card[]>` (private per player),
rotate hands after each reveal phase.

## Turn Flow
1. **submit phase:**
   - `actions(state, pid)` → if `submitted[pid]` return `[]`, else return submission options
   - `perform()` records submission, marks `submitted[pid] = true`
   - `turnConfig(state, null)`: `{ timeoutMs: 30000, defaultAction: { type: "submit", value: <random/skip> } }`
   - When all submitted (or timer fires) → advance to reveal
2. **reveal phase** (display-only):
   - `actions()` returns `[]` for ALL players
   - `turnConfig(state, null)`: `{ timeoutMs: 5000, defaultAction: { type: "continue" } }`
   - Show all submissions. `perform("continue")` → next phase (vote or next round)
3. **vote phase** (if applicable — LiarLiar, Quiplash):
   - Same pattern as submit: act once, wait for all, then resolve
4. **results phase** (display-only):
   - Score calculation, advance round or end game

## Gotchas
- **Already-submitted players:** `actions()` MUST return `[]` — do not allow resubmission
- **view() during submit:** hide `submissions` content, only show `submitted` booleans
- **Always provide defaultAction:** non-submitters need auto-submit on timeout, otherwise game freezes
- **Drafting hands are private:** `view()` must filter — each player sees only their own hand
- **Tie-breaking:** define deterministic tiebreaker (alphabetical player ID, first to submit)
- **Free-text submissions** (LiarLiar, Quiplash): `actions()` returns a template `[{type:"write", text:"suggestion"}]`. The platform's structural matching lets players submit any string in the `text` field. The suggestion is the agent default.

## UI Landmarks
- `[data-submission-status]` — shows who has/hasn't submitted
- `[data-submissions-revealed]` — revealed submissions display
- `[data-round]` — current round indicator
- `[data-scores]` — scoreboard

## Example Reference
`games/werewolf/game.js` — the day_vote phase uses simultaneous submit pattern.
