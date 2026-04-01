# Bidding

## When This Applies
Games with betting rounds, auctions, or wagering as a core mechanic.
Poker (Texas Hold'em, Omaha), Modern Art, For Sale, Liar's Dice, Skull.

## State Shape
```
phase: string              // "preflop" | "flop" | "turn" | "river" | "showdown"
pot: number                // total chips in pot
bets: Record<string, number>  // current round bets per player
needsToAct: string[]       // players who still must act this betting round
currentActor: string       // whose turn to bet
lastRaise: number          // amount of last raise (for min-raise calc)
deck: number[]             // HIDDEN — never expose via view()
communityCards: number[]   // revealed cards (poker)
players: {
  id: string, chips: number, hand: number[],
  folded: boolean, allIn: boolean
}[]
```
**Auction subtypes:** English (ascending bids), Once-around (single bid each),
Sealed-bid (simultaneous submit), Dutch (descending price, first claim wins).

## Turn Flow
1. `actions(state, playerId)`:
   - If `phase === "showdown"` → return `[]` for ALL players
   - If `playerId !== state.currentActor` → return `[]`
   - Return: fold, check (if no bet to match), call, raise (min/max amounts)
   - All-in is a raise/call variant capped at player's chips
2. `perform(state, action, playerId)`:
   - Apply bet: deduct chips, add to pot, update bets map
   - Raise: set lastRaise, reset needsToAct to all non-folded/non-allIn except raiser
   - Remove actor from needsToAct, advance currentActor
   - If `needsToAct` empty → advance phase (deal community cards, or showdown)
3. `turnConfig(state, playerId)`:
   - Normal play: `{ timeoutMs: 30000, defaultAction: { type: "fold" } }`
   - **CRITICAL — showdown:** `turnConfig(state, null)` MUST return:
     `{ timeoutMs: 3000, defaultAction: { type: "continue" } }`
   - The `continue` handler in perform() must resolve winner and end the game

## Gotchas
- **#1 freeze bug:** showdown with no `turnConfig(null)` defaultAction freezes the game forever.
  Put the `continue` action handler ABOVE the `__system__` guard in perform()
- **Side pots:** when a player is all-in for less than others, create separate pots.
  Each pot has eligible players. Resolve from smallest to largest
- **view() must hide hands:** only show player's own hand. At showdown, reveal all non-folded
- **Blind rotation:** track dealer button position, rotate each hand.
  Small blind = dealer+1, big blind = dealer+2 (heads-up: dealer = small blind)
- **Bet validation:** perform() must verify chips >= bet amount, reject otherwise

## UI Landmarks
- `[data-pot]` — current pot total
- `[data-bet-amount]` — bet/raise input
- `[data-community-cards]` — shared cards display
- `[data-hand]` — player's private hand
- `[data-action-buttons]` — fold/check/call/raise buttons

## Example Reference
`games/texas-holdem/game.js` — full poker implementation (see commit 86c18b6).
