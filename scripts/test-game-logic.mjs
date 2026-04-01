#!/usr/bin/env node

/**
 * Local game logic validator — runs without a server.
 *
 * Validates 4 structural properties:
 *   1. Phase timer freeze — no players can act and no turnConfig(null) defaultAction
 *   2. System action unreachable — defaultAction doesn't advance state
 *   3. View secrecy leak — view() exposes other players' private data
 *   4. Non-termination — game doesn't finish in 500 ticks
 *
 * Usage:
 *   node scripts/test-game-logic.mjs games/tic-tac-toe
 *   node scripts/test-game-logic.mjs games/tic-tac-toe --players 2 --seed 42
 *   node scripts/test-game-logic.mjs games/werewolf --sweep
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

// --- Arg parsing ---
const gameDir = process.argv[2];
const args = process.argv.slice(3);
function arg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}
const hasFlag = (name) => args.includes(`--${name}`);

if (!gameDir) {
  console.error(
    "Usage: node scripts/test-game-logic.mjs <game-directory> [--players N] [--seed N] [--sweep]",
  );
  process.exit(1);
}

// --- Load game ---
const absDir = path.resolve(gameDir);
const manifestPath = path.join(absDir, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`Missing manifest.json in ${absDir}`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

const { GameEngine } = require("../core/index.js");

const gameJsPath = path.join(absDir, "game.js");
const gameTsPath = path.join(absDir, "game.ts");
let gameModule;
if (existsSync(gameJsPath)) {
  gameModule = require(gameJsPath);
} else if (existsSync(gameTsPath)) {
  gameModule = require(gameTsPath);
}
const GameLogic = gameModule?.default ?? gameModule;
if (!GameLogic?.setup) {
  console.error("Could not load GameLogic from game directory");
  process.exit(1);
}
GameLogic.manifest = manifest;

// --- Deterministic PRNG for action selection ---
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Sweep mode ---
if (hasFlag("sweep")) {
  const counts = new Set([manifest.minPlayers, manifest.maxPlayers]);
  const mid = Math.floor((manifest.minPlayers + manifest.maxPlayers) / 2);
  if (mid > manifest.minPlayers && mid < manifest.maxPlayers) counts.add(mid);
  const sorted = [...counts].sort((a, b) => a - b);
  console.log(
    `\nSweep: testing ${manifest.name} at player counts: ${sorted.join(", ")}\n`,
  );
  let allPassed = true;
  for (const n of sorted) {
    const result = runTest(n, parseInt(arg("seed", "0"), 10) || null);
    if (!result.passed) allPassed = false;
  }
  process.exit(allPassed ? 0 : 1);
} else {
  const playerCount = parseInt(arg("players", String(manifest.minPlayers)), 10);
  const seed = parseInt(arg("seed", "0"), 10) || null;
  const result = runTest(playerCount, seed);
  process.exit(result.passed ? 0 : 1);
}

// === View secrecy checking ===

/** Known private field names on player-indexed objects or nested player entries */
const PRIVATE_FIELDS = new Set([
  "hand",
  "cards",
  "role",
  "holeCards",
  "tiles",
  "identity",
]);

/**
 * Check if any player's view leaks another player's private data.
 * Returns first failure message or null.
 *
 * Strategy: check structural leaks rather than substring matching on short values.
 * 1. Seed/deck: full state.seed or state.deck array appearing in view
 * 2. Player-keyed maps: if state has an object keyed by player IDs (like `roles`),
 *    check that the view doesn't contain the FULL map — only the viewer's own entry.
 * 3. Nested player data: if state has player objects with private fields (hand, cards, etc.),
 *    check that other players' field values don't appear in the viewer's view.
 */
function checkViewSecrecy(engine, players, state) {
  const playerIds = players.map((p) => p.id);
  const playerIdSet = new Set(playerIds);

  // Only check living players — dead/spectator views intentionally reveal more info
  const livingPlayers = state.alive
    ? players.filter((p) => state.alive[p.id] !== false)
    : players;

  // Check seed/PRNG leak
  if (state.seed !== undefined) {
    const seedStr = JSON.stringify(state.seed);
    for (const p of livingPlayers) {
      const viewJson = JSON.stringify(engine.getView(p.id));
      // Look for "seed":VALUE pattern to avoid matching the number elsewhere
      if (
        viewJson.includes(`"seed":${seedStr}`) ||
        viewJson.includes(`"seed": ${seedStr}`)
      ) {
        return `LEAK: state.seed (${seedStr}) visible in ${p.name}'s view`;
      }
    }
  }

  // Check deck leak
  if (
    state.deck !== undefined &&
    Array.isArray(state.deck) &&
    state.deck.length > 0
  ) {
    const deckStr = JSON.stringify(state.deck);
    for (const p of livingPlayers) {
      const viewJson = JSON.stringify(engine.getView(p.id));
      if (viewJson.includes(deckStr)) {
        return `LEAK: state.deck visible in ${p.name}'s view`;
      }
    }
  }

  // Check player-keyed maps for full-map leaks.
  // A player-keyed map (e.g., state.roles = {"player-0":"werewolf","player-1":"villager"})
  // should not appear in its entirety in any player's view unless all values are public.
  for (const key of Object.keys(state)) {
    const val = state[key];
    if (val === null || typeof val !== "object" || Array.isArray(val)) continue;
    if (playerIdSet.has(key)) continue;
    const objKeys = Object.keys(val);
    // Must have at least 2 player-ID keys to be a meaningful player-keyed map
    const playerKeyCount = objKeys.filter((k) => playerIdSet.has(k)).length;
    if (playerKeyCount < 2) continue;
    // Skip if all values are booleans (alive map), null, or player IDs / simple tokens
    // These are typically public data (alive status, vote targets, etc.)
    const hasPrivateValues = objKeys.some((k) => {
      if (!playerIdSet.has(k)) return false;
      const v = val[k];
      if (v === null || v === undefined || typeof v === "boolean") return false;
      if (typeof v === "string" && (playerIdSet.has(v) || v === "skip"))
        return false;
      if (typeof v === "number") return false;
      return true;
    });
    if (!hasPrivateValues) continue;

    // This is a player-keyed map with non-trivial values. Check if any view
    // contains another player's value in the SAME map key structure.
    const fullMapStr = JSON.stringify(val);
    for (const viewer of livingPlayers) {
      const view = engine.getView(viewer.id);
      // If the view contains the same key with the full map, that's a leak
      if (
        view[key] !== undefined &&
        typeof view[key] === "object" &&
        !Array.isArray(view[key])
      ) {
        const viewMapStr = JSON.stringify(view[key]);
        if (viewMapStr === fullMapStr) {
          // Full map exposed — check it's not all-same values (public info)
          const uniqueVals = new Set(
            Object.values(val).map((v) => JSON.stringify(v)),
          );
          if (uniqueVals.size > 1) {
            return `LEAK: full '${key}' map visible in ${viewer.name}'s view (contains all players' private data)`;
          }
        }
      }
    }
  }

  // Check nested player objects for private field leaks
  if (Array.isArray(state.players)) {
    for (const entry of state.players) {
      if (typeof entry !== "object" || entry === null) continue;
      const ownerId = entry.id;
      if (!ownerId || !playerIdSet.has(ownerId)) continue;

      for (const field of PRIVATE_FIELDS) {
        if (entry[field] === undefined || entry[field] === null) continue;
        const secret =
          typeof entry[field] === "object"
            ? JSON.stringify(entry[field])
            : JSON.stringify(entry[field]);
        // Only check compound values (arrays, objects) to avoid false positives
        if (typeof entry[field] !== "object") continue;

        for (const viewer of livingPlayers) {
          if (viewer.id === ownerId) continue;
          const viewJson = JSON.stringify(engine.getView(viewer.id));
          if (viewJson.includes(secret)) {
            return `LEAK: ${ownerId}'s ${field} visible in ${viewer.name}'s view`;
          }
        }
      }
    }
  }

  return null;
}

// === Core test runner ===

function runTest(playerCount, seed) {
  const rngSeed = seed || Math.floor(Math.random() * 2147483647);
  const rng = mulberry32(rngSeed);

  console.log(`Testing ${manifest.name} (${manifest.slug})`);
  console.log(`Players: ${playerCount}  Seed: ${rngSeed}`);

  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `player-${i}`,
    name: `Bot${i + 1}`,
  }));

  const engine = new GameEngine(GameLogic, players, {}, rngSeed);

  const MAX_TICKS = 500;
  let actionCount = 0;
  const phasesVisited = new Set();
  const failures = [];

  for (let tick = 0; tick < MAX_TICKS; tick++) {
    const state = engine.getState();

    // Track phases
    if (state.phase !== undefined) {
      phasesVisited.add(state.phase);
    }

    // Check game over
    if (engine.getResult() !== null) break;

    // Check if any player has actions
    let anyActions = false;
    const playerActions = [];
    for (const p of players) {
      const acts = engine.getActions(p.id);
      if (acts.length > 0) {
        anyActions = true;
        playerActions.push({ player: p, actions: acts });
      }
    }

    if (!anyActions) {
      // VALIDATION: Phase Timer Freeze
      const sysConfig = engine.getTurnConfig(null);
      if (!sysConfig?.defaultAction) {
        const phase = state.phase ?? "unknown";
        failures.push(
          `FREEZE: no players can act and no phase timer at phase '${phase}'`,
        );
        break;
      }

      // VALIDATION: System Action Reachability
      const defaultAction = sysConfig.defaultAction;
      const clonedState = JSON.parse(JSON.stringify(state));
      const newState = GameLogic.perform(
        clonedState,
        "__system__",
        defaultAction,
      );
      if (JSON.stringify(state) === JSON.stringify(newState)) {
        failures.push(
          `UNREACHABLE: defaultAction ${JSON.stringify(defaultAction)} does not advance state at phase '${state.phase ?? "unknown"}'`,
        );
        break;
      }

      // Process the system action
      engine.processAction("__system__", defaultAction);
      actionCount++;
      continue;
    }

    // VALIDATION: View Secrecy (every 10th action)
    if (actionCount % 10 === 0) {
      const leak = checkViewSecrecy(engine, players, state);
      if (leak) {
        failures.push(leak);
        // Don't break — continue playing to check other properties
      }
    }

    // Pick random legal actions for all active players
    for (const { player, actions } of playerActions) {
      const action = actions[Math.floor(rng() * actions.length)];
      engine.processAction(player.id, action);
      actionCount++;

      // Re-check game over after each action
      if (engine.getResult() !== null) break;
    }

    if (engine.getResult() !== null) break;
  }

  // VALIDATION: Termination
  if (engine.getResult() === null) {
    failures.push("NON-TERMINATION: game did not finish in 500 ticks");
  }

  // Final secrecy check
  if (
    engine.getResult() === null ||
    failures.every((f) => !f.startsWith("LEAK"))
  ) {
    const finalLeak = checkViewSecrecy(engine, players, engine.getState());
    if (finalLeak && !failures.includes(finalLeak)) {
      failures.push(finalLeak);
    }
  }

  // --- Report ---
  const result = engine.getResult();
  const passed = failures.length === 0 && result !== null;

  console.log("\n-------------------------------------------");
  console.log("  LOGIC TEST REPORT");
  console.log("-------------------------------------------");
  console.log(`  Game:       ${manifest.name}`);
  console.log(`  Players:    ${playerCount}`);
  console.log(`  Seed:       ${rngSeed}`);
  console.log(`  Actions:    ${actionCount}`);
  if (phasesVisited.size > 0) {
    console.log(`  Phases:     ${[...phasesVisited].join(" -> ")}`);
  }

  if (result) {
    console.log(`  Result:     ${result.summary || "game over"}`);
    if (result.winners?.length > 0) {
      const winnerNames = result.winners.map((w) => {
        const p = players.find((pl) => pl.id === w);
        return p ? p.name : w;
      });
      console.log(`  Winners:    ${winnerNames.join(", ")}`);
    }
  }

  if (failures.length > 0) {
    console.log(`  Status:     FAIL (${failures.length} issue(s))`);
    for (const f of failures) {
      console.log(`    - ${f}`);
    }
  } else {
    console.log("  Status:     PASS");
  }
  console.log("-------------------------------------------\n");

  return { passed, failures, result };
}
