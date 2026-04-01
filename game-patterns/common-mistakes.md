# Common Mistakes

Bugs from production games. Each one shipped and caused real problems.

## Phase Timer & System Actions

1. **Frozen game:** `actions()` returns `[]` for ALL players but `isOver()` returns null. Fix: `turnConfig(state, null)` must return `{defaultAction}` to auto-advance, or `isOver()` must detect the terminal state.

2. **__system__ action crash:** `defaultAction` fires as player `'__system__'`. Your `perform()` must handle `__system__` BEFORE any player-identity guard. Otherwise the system action is silently dropped and the game freezes.

3. **Display phase stuck:** Phases that show results (scoreboards, reveals, night results) need `turnConfig(state, null)` returning `{timeoutMs, defaultAction}` to auto-advance. Without this, the phase hangs forever.

## State & View

4. **Stale action labels:** After a player acts, `view()` must clear their action from visible state so the UI doesn't show stale data from the previous turn.

5. **Phase transition bug:** Changing game phase without updating the `phase` field in state. Every branch in `perform()` that changes phase must set it explicitly.

6. **Dead player acts:** `actions()` returning non-empty for eliminated/folded/bankrupt players causes the game to wait forever for someone who can't meaningfully act.

7. **Unstable IDs:** Card/piece IDs must be stable across rounds. Generate unique IDs in `setup()`, never re-derive them on shuffle or deal.

## Scoring & Termination

8. **Infinite games:** Multi-round games MUST have escalating costs, player elimination, or hard round limits so random play terminates.

9. **Side pot / split scoring:** Handle cases where players have unequal stakes (poker all-in), tied scores, or partial elimination.

## Randomness

10. **PRNG in perform():** Create PRNG in `setup()`, store `seed` in state. In `perform()`, reconstruct deterministically: `createSeededRandom(state.seed + actionCount)`. Never use `Math.random()`.

11. **Math.random() in index.html:** The platform overrides `Math.random()` in the **entire iframe**, not just game.js. UI effects (confetti, particles, random positioning) that call `Math.random()` will crash the iframe and silently kill the bridge — the game_over message never reaches the shell. Use a simple counter-based PRNG for visual effects:
    ```js
    var _seed = 12345;
    function uiRandom() {
      _seed = (_seed * 16807) % 2147483647;
      return _seed / 2147483647;
    }
    ```

## Free-Text & Input

12. **Free-text actions:** For creative input (lies, clues, trade offers), `actions()` returns a template like `[{type:"write", text:"suggestion"}]`. The platform structurally matches: string fields accept any value, non-string fields must match exactly. The suggestion in legalActions becomes the agent default; human players type their own text via the UI.

## Game Over

13. **Game-over display phase:** If your game has a final screen (podium, leaderboard, animation) that players should see before the platform's Game Over overlay appears, use a display phase: return `null` from `isOver()` during it, auto-advance via `turnConfig(null)` with a 5s timer + `defaultAction`, then transition to the real game-over phase where `isOver()` returns the result.
