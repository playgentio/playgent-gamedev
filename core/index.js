// src/seeded-random.ts
function createSeededRandom(seed) {
  let state = seed | 0;
  function next() {
    state = state + 1831565813 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  function integer(min, max) {
    if (min > max) throw new Error(`integer(): min (${min}) > max (${max})`);
    return Math.floor(next() * (max - min + 1)) + min;
  }
  function shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = integer(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  function pick(array) {
    if (array.length === 0)
      throw new Error("pick(): cannot pick from empty array");
    return array[integer(0, array.length - 1)];
  }
  return { next, integer, shuffle, pick };
}

// src/engine.ts
var GameEngine = class _GameEngine {
  state;
  actionLog = [];
  game;
  constructor(game, players, config, seed, teamAssignments) {
    this.game = game;
    this.state = game.setup({
      players,
      config,
      random: createSeededRandom(seed),
      seed,
      ...teamAssignments ? { teamAssignments } : {}
    });
  }
  static fromActionLog(game, players, config, seed, log, teamAssignments) {
    const engine = new _GameEngine(game, players, config, seed, teamAssignments);
    for (const entry of log) {
      engine.processAction(entry.playerId, entry.action, entry.timestamp);
    }
    return engine;
  }
  processAction(playerId, action, timestamp) {
    this.state = this.game.perform(this.state, playerId, action);
    this.actionLog.push({
      playerId,
      action,
      timestamp: timestamp ?? Date.now()
    });
  }
  getState() {
    return this.state;
  }
  getView(playerId) {
    return this.game.view(this.state, playerId);
  }
  getActions(playerId) {
    return this.game.actions(this.state, playerId);
  }
  getResult() {
    return this.game.isOver(this.state);
  }
  getTurnConfig(playerId) {
    return this.game.turnConfig(this.state, playerId);
  }
  getActionLog() {
    return [...this.actionLog];
  }
};

// src/types.ts
var SYSTEM_ACTOR_ID = "__system__";
var MAX_CHAT_MESSAGES = 150;

// src/validate-game.ts
function pass(name) {
  return { name, passed: true };
}
function fail(name, error) {
  return { name, passed: false, error };
}
function makePlayers(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `player_${i + 1}`,
    name: `Player${i + 1}`
  }));
}
function validateGame(game, seeds = [42, 123, 999]) {
  const results = [];
  const rules = game.manifest.rules;
  if (!rules || typeof rules !== "string") {
    results.push(
      fail(
        "manifest has rules",
        "manifest.rules is missing \u2014 agents need rules to play the game"
      )
    );
  } else if (rules.length < 100) {
    results.push(
      fail(
        "manifest has rules",
        `manifest.rules is ${rules.length} chars \u2014 must be at least 100 to be useful for agents`
      )
    );
  } else {
    results.push(pass("manifest has rules"));
  }
  const playerCounts = [game.manifest.minPlayers];
  if (game.manifest.maxPlayers !== game.manifest.minPlayers) {
    playerCounts.push(game.manifest.maxPlayers);
  }
  for (const playerCount of playerCounts) {
    const suffix = playerCounts.length > 1 ? ` (${playerCount}p)` : "";
    const players = makePlayers(playerCount);
    runChecks(game, players, seeds, suffix, results);
  }
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const warnings = results.filter(
    (r) => r.passed && r.error !== void 0
  ).length;
  return { results, passed, failed, warnings };
}
function runChecks(game, players, seeds, suffix, results) {
  const named = (name) => name + suffix;
  for (const seed of seeds) {
    try {
      const state = game.setup({
        players,
        config: {},
        random: createSeededRandom(seed),
        seed
      });
      if (state == null) {
        results.push(
          fail(named("setup returns state"), `seed ${seed}: returned ${state}`)
        );
      } else {
        results.push(pass(named("setup returns state")));
      }
    } catch (e) {
      results.push(
        fail(
          named("setup returns state"),
          `seed ${seed}: threw ${e instanceof Error ? e.message : e}`
        )
      );
    }
  }
  try {
    const state1 = game.setup({
      players,
      config: {},
      random: createSeededRandom(42),
      seed: 42
    });
    const state2 = game.setup({
      players,
      config: {},
      random: createSeededRandom(42),
      seed: 42
    });
    if (JSON.stringify(state1) === JSON.stringify(state2)) {
      results.push(pass(named("deterministic setup")));
    } else {
      results.push(
        fail(
          named("deterministic setup"),
          "Same seed produced different states"
        )
      );
    }
  } catch (e) {
    results.push(
      fail(
        named("deterministic setup"),
        `threw ${e instanceof Error ? e.message : e}`
      )
    );
  }
  try {
    const state = game.setup({
      players,
      config: {},
      random: createSeededRandom(42),
      seed: 42
    });
    const snapshot = JSON.stringify(state);
    for (const p of players) {
      const actions = game.actions(state, p.id);
      if (actions.length > 0) {
        game.perform(state, p.id, actions[0]);
        break;
      }
    }
    if (JSON.stringify(state) === snapshot) {
      results.push(pass(named("perform is pure (no mutation)")));
    } else {
      results.push(
        fail(
          named("perform is pure (no mutation)"),
          "State was mutated by perform()"
        )
      );
    }
  } catch (e) {
    results.push(
      fail(
        named("perform is pure (no mutation)"),
        `threw ${e instanceof Error ? e.message : e}`
      )
    );
  }
  const FORBIDDEN_VIEW_KEYS = ["nextSeed", "seed"];
  try {
    const state = game.setup({
      players,
      config: {},
      random: createSeededRandom(42),
      seed: 42
    });
    let leaked = false;
    for (const p of players) {
      const view = game.view(state, p.id);
      for (const key of FORBIDDEN_VIEW_KEYS) {
        if (key in view) {
          results.push(
            fail(
              named("view filters sensitive fields"),
              `view(${p.id}) exposes "${key}"`
            )
          );
          leaked = true;
          break;
        }
      }
      if (leaked) break;
    }
    if (!leaked) {
      const specView = game.view(state, null);
      for (const key of FORBIDDEN_VIEW_KEYS) {
        if (key in specView) {
          results.push(
            fail(
              named("view filters sensitive fields"),
              `spectator view exposes "${key}"`
            )
          );
          leaked = true;
          break;
        }
      }
    }
    if (!leaked) {
      results.push(pass(named("view filters sensitive fields")));
    }
  } catch (e) {
    results.push(
      fail(
        named("view filters sensitive fields"),
        `threw ${e instanceof Error ? e.message : e}`
      )
    );
  }
  try {
    const state = game.setup({
      players,
      config: {},
      random: createSeededRandom(42),
      seed: 42
    });
    let anyConfig = false;
    for (const p of players) {
      const config = game.turnConfig(state, p.id);
      if (config) anyConfig = true;
    }
    const phaseConfig = game.turnConfig(state, null);
    if (phaseConfig) anyConfig = true;
    if (anyConfig) {
      results.push(pass(named("turnConfig returns config for initial state")));
    } else {
      results.push(
        fail(
          named("turnConfig returns config for initial state"),
          "All players and null returned null \u2014 no timer will be scheduled"
        )
      );
    }
  } catch (e) {
    results.push(
      fail(
        named("turnConfig returns config for initial state"),
        `threw ${e instanceof Error ? e.message : e}`
      )
    );
  }
  try {
    const state = game.setup({
      players,
      config: {},
      random: createSeededRandom(42),
      seed: 42
    });
    let roundTripOk = true;
    for (const p of players) {
      const actions = game.actions(state, p.id);
      if (actions.length === 0) continue;
      for (const action of actions) {
        const newState = game.perform(state, p.id, action);
        if (newState == null) {
          results.push(
            fail(
              named("action round-trip"),
              `perform(${p.id}, ${JSON.stringify(action)}) returned null`
            )
          );
          roundTripOk = false;
          break;
        }
      }
      if (!roundTripOk) break;
    }
    if (roundTripOk) {
      results.push(pass(named("action round-trip")));
    }
  } catch (e) {
    results.push(
      fail(
        named("action round-trip"),
        `threw ${e instanceof Error ? e.message : e}`
      )
    );
  }
  try {
    const state = game.setup({
      players,
      config: {},
      random: createSeededRandom(42),
      seed: 42
    });
    const result = game.isOver(state);
    if (result === null) {
      results.push(pass(named("isOver returns null for initial state")));
    } else {
      results.push(
        fail(
          named("isOver returns null for initial state"),
          `returned ${JSON.stringify(result)}`
        )
      );
    }
  } catch (e) {
    results.push(
      fail(
        named("isOver returns null for initial state"),
        `threw ${e instanceof Error ? e.message : e}`
      )
    );
  }
}
export {
  GameEngine,
  MAX_CHAT_MESSAGES,
  SYSTEM_ACTOR_ID,
  createSeededRandom,
  validateGame
};
