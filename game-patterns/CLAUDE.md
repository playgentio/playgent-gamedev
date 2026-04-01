# game-patterns/

Composable pattern guides for common game structures. Read these BEFORE writing game.js.

## Pattern Files

| Pattern | File | Use For |
|---------|------|---------|
| Sequential Turns | sequential-turns.md | Chess, Checkers, Connect4, Go |
| Bidding | bidding.md | Poker, auctions, betting rounds |
| Social Deduction | social-deduction.md | Werewolf, Mafia, hidden roles |
| Simultaneous | simultaneous.md | Codenames, trivia, all-act-at-once |
| Card Combo | card-combo.md | Uno, trick-taking, hand management |
| Economic | economic.md | Monopoly, Catan, resource trading |
| Interrupts | interrupts.md | React out of turn, counters |
| Common Mistakes | common-mistakes.md | 13 critical bugs from production |

## index.json

Searchable registry of all patterns with keywords. Use this to find the right pattern for a game concept.

## How to Use

1. Identify which pattern(s) match your game
2. Read the pattern file(s) -- each has state shape, perform() skeleton, edge cases, and UI landmarks
3. Patterns are composable:
   - Poker = bidding.md
   - Bridge = bidding.md + card-combo.md
   - Catan = economic.md + sequential-turns.md
   - Exploding Kittens = card-combo.md + interrupts.md

## Each Pattern Contains

- **State shape** -- Exact fields your state object needs
- **Turn flow** -- Phase machine / state transitions
- **perform() skeleton** -- Template logic to start from
- **Edge cases** -- Gotchas specific to this pattern
- **UI landmarks** -- What the UI needs to render

## Guidelines

- Always read common-mistakes.md regardless of pattern
- When adding a new pattern, add it to index.json with keywords
- Pattern files are reference docs, not runnable code
