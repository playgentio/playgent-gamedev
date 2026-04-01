# Card Combo

## When This Applies
Games centered on hand management, playing/chaining cards, trick-taking, or deck-building.
Uno, Exploding Kittens, Unstable Unicorns, Dominion, Rummy, Hearts, Spades, Bridge.

## State Shape
```
drawPile: number[]         // HIDDEN — card IDs, top = index 0
discardPile: number[]      // public, top = last element
hands: Record<string, number[]>  // per-player PRIVATE
currentPlayer: string
turnDirection: 1 | -1      // for reverse cards (Uno)
phase: string              // "play" | "draw" | "discard" | etc.
```
**Card representation:** integers 0-51 for standard deck.
Map: `suit = Math.floor(id / 13)`, `rank = id % 13` (0=Ace...12=King).
Custom decks: use sequential integers with a cardDefs lookup array.

## Turn Flow
1. `actions(state, pid)`:
   - If `pid !== currentPlayer` → return `[]`
   - Return legal cards to play from hand + draw option
   - Filter by game rules (matching suit/color, playable combos)
2. `perform(state, action, pid)`:
   - Remove card from hand, add to discard (or play area)
   - Apply card effect (skip, reverse, draw-2, wild, etc.)
   - Check win condition (empty hand, point threshold)
   - Advance to next player (respecting turnDirection)
3. `turnConfig(state, pid)`:
   - `{ timeoutMs: 30000, defaultAction: { type: "draw" } }` or auto-play first legal card

### Sub-pattern: Trick-Taking (Hearts, Spades, Bridge)
```
trick: { plays: {pid: string, card: number}[], leadSuit: number }
tricksWon: Record<string, number[][]>
```
- Leader plays any card → others must follow suit if able → highest of lead suit wins
- `actions()`: filter hand to matching suit; if none, allow any card
- Trick complete → winner leads next trick

### Sub-pattern: Deck-Building (Dominion)
```
playerDecks: Record<string, { deck: number[], hand: number[], discard: number[], played: number[] }>
supply: Record<number, number>   // card type → remaining count
turnPhase: "action" | "buy" | "cleanup"
```
- Action phase: play action cards from hand
- Buy phase: spend treasure to gain cards from supply
- Cleanup: all played + hand + new cards → discard; draw 5

## Gotchas
- **Turn direction (Uno reverse):** next player = `players[(idx + direction + len) % len]`
  — always add `len` before modulo to handle negative direction
- **view() must hide:** drawPile contents and other players' hands. Show hand sizes only
- **Seeded PRNG for shuffles:** use `random` from setup() — never `Math.random()`
- **Draw pile exhaustion:** when empty, shuffle discard pile (minus top card) into draw pile
- **Card uniqueness:** after dealing, cards must not exist in two places simultaneously

## UI Landmarks
- `[data-hand]` — player's hand display
- `[data-discard-top]` — top of discard pile
- `[data-draw-pile]` — draw pile (show count, not contents)
- `[data-trick]` — current trick plays (trick-taking)
- `[data-action-buttons]` — play/draw/pass buttons

## Example Reference
Card games combine sequential turns with hand management.
Start from `games/tic-tac-toe/game.js` and add deck/hand state.
