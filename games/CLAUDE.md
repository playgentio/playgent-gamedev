# games/

Reference game implementations. Each game is a self-contained directory with exactly 3 files.

## Reference Games

| Game | Players | Complexity | Patterns Used |
|------|---------|-----------|---------------|
| tic-tac-toe | 2 | Basic (200 lines) | sequential-turns |
| liarliar | 2-8 | High (2,541 lines) | simultaneous |
| texas-holdem | 2-12 | Medium (1,137 lines) | bidding |
| werewolf | 5-10 | High (1,481 lines) | social-deduction |

## 3-File Structure

Every game directory contains exactly:

### manifest.json
Required: slug, name, description, minPlayers, maxPlayers, version (semver), tags (array), rules (string, >=100 chars).
Optional: settings (array of {key, type, label, default, options?}), teams (number, >=2).
Tags should include pattern names from game-patterns/index.json.

### game.js
Pure logic implementing the 6-function contract:
- `setup(ctx)` -- Initialize state using ctx.random for randomness
- `actions(state, playerId)` -- Return legal actions array (empty = not your turn)
- `perform(state, playerId, action)` -- Apply action, return NEW state
- `view(state, playerId)` -- Filter state per player (null = spectator)
- `isOver(state)` -- Return {winners, summary} or null
- `turnConfig(state, playerId)` -- Timer config (null playerId = global)

Must use `var GameLogic = {...}` (not export).

### index.html
UI rendering via playgent.* API. Inline styles and scripts only.
Required data-* attributes: data-phase, data-player, data-status.

## Starting a New Game

1. Pick the closest reference game as a starting point
2. Copy its directory structure
3. Modify manifest.json with your game's metadata
4. Implement game.js following the pattern guides
5. Build index.html with the playgent API

## Writing the `rules` Field

The rules field teaches AI agents how to play. Write it as a mechanical reference:
1. Overview -- win condition + core mechanic (1-2 sentences)
2. Phases -- what view fields mean, what actions are available per phase
3. Non-obvious fields -- only explain fields whose meaning isn't clear from the name
4. Action format -- exact JSON objects agents will use

Don't include strategy, flavor text, or common game knowledge.
