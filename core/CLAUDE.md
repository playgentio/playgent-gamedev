# core/

Game engine runtime and type definitions. This code runs on the platform side, not inside games.

## Files

- `index.js` -- GameEngine class, seeded PRNG (Mulberry32), game validator
- `types.d.ts` -- TypeScript interfaces for the 6-function contract
- `VERSION` -- Git commit hash for engine version tracking

## GameEngine (index.js)

The engine loads a game's `game.js` into an isolated V8 context and manages:
- State initialization via setup()
- Action processing via perform()
- Action log for deterministic replay
- View generation per player via view()
- Game-over detection via isOver()
- Turn timer config via turnConfig()

### Key exports

- `GameEngine` -- Main class, manages game lifecycle
- `createSeededRandom(seed)` -- Mulberry32 PRNG, returns `random()` function that produces deterministic floats [0,1)
- `validateGame()` -- Automated checker for common game bugs (frozen states, system action crashes, view leaks)

## Types (types.d.ts)

Core interfaces:
- `GameDefinition` -- The 6-function contract (setup, actions, perform, view, isOver, turnConfig)
- `SetupContext` -- {players, random, config, seed} passed to setup()
- `TurnConfig` -- {timeoutMs?, defaultAction?, spectatorChat?}
- `GameResult` -- {winners: string[], summary?: string}
- `PlayerView` -- What view() returns (filtered state)
- `SeededRandom` -- The random() function type

System action player ID is `'__system__'` for timeout, join, leave, reconnect events.

## Guidelines

- Do not modify core/ unless changing the engine contract
- Games never import from core/ directly -- the engine loads them
- types.d.ts is the canonical reference for the game interface
