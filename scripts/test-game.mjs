#!/usr/bin/env node

/**
 * End-to-end game test: spins up the dev server, connects bot players that
 * pick random legal actions via HTTP, and plays to completion.
 *
 * Adapted from the production socket.io test for the standalone dev server
 * (SSE + HTTP POST).
 *
 * Usage:
 *   node scripts/test-game.mjs games/my-game
 *   node scripts/test-game.mjs games/my-game --players 4
 *   node scripts/test-game.mjs games/my-game --seed 42
 *   node scripts/test-game.mjs games/my-game --sweep
 */

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import http from "node:http";
import { createDevServer } from "../dev-server.mjs";

// --- CLI args ---
const gameDir = process.argv[2];
const args = process.argv.slice(3);
function arg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}
const hasFlag = (name) => args.includes(`--${name}`);

if (!gameDir) {
  console.error(
    "Usage: node scripts/test-game.mjs <game-directory> [--players N] [--seed N] [--sweep]"
  );
  process.exit(1);
}

const absDir = path.resolve(gameDir);
const manifestPath = path.join(absDir, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`Missing manifest.json in ${absDir}`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

// Load GameLogic
const gameJsPath = path.join(absDir, "game.js");
if (!existsSync(gameJsPath)) {
  console.error(`Missing game.js in ${absDir}`);
  process.exit(1);
}
const fileUrl = pathToFileURL(gameJsPath).href + `?t=${Date.now()}`;
const mod = await import(fileUrl);
const GameLogic = mod.default ?? mod.GameLogic ?? mod;
if (!GameLogic?.setup) {
  console.error("Could not load GameLogic from game directory");
  process.exit(1);
}

// --- Deterministic PRNG ---
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Same seeded random as dev-server (Mulberry32 variant)
function createSeededRandom(seed) {
  let state = seed | 0;
  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function integer(min, max) { return Math.floor(next() * (max - min + 1)) + min; }
  function shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = integer(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  function pick(array) { return array[integer(0, array.length - 1)]; }
  return { next, integer, shuffle, pick };
}

// --- HTTP helpers ---
function postAction(base, playerId, action) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ playerId, action });
    const url = new URL("/action", base);
    const req = http.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, ...parsed });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function postReset(base) {
  return new Promise((resolve, reject) => {
    const url = new URL("/reset", base);
    const req = http.request(url, { method: "POST" }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => resolve({ status: res.statusCode }));
    });
    req.on("error", reject);
    req.end();
  });
}

// Connect to SSE and get initial state
function getStateViaSSE(base, playerNum) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/events?player=${playerNum}`, base);
    const req = http.get(url, (res) => {
      let buf = "";
      res.on("data", (chunk) => {
        buf += chunk.toString();
        // Parse first SSE state event
        const match = buf.match(/event: state\ndata: (.+)\n/);
        if (match) {
          req.destroy();
          try { resolve(JSON.parse(match[1])); } catch (e) { reject(e); }
        }
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    setTimeout(() => { req.destroy(); reject(new Error("SSE timeout")); }, 5000);
  });
}

// --- Sweep mode ---
if (hasFlag("sweep")) {
  const counts = new Set([manifest.minPlayers, manifest.maxPlayers]);
  const mid = Math.floor((manifest.minPlayers + manifest.maxPlayers) / 2);
  if (mid > manifest.minPlayers && mid < manifest.maxPlayers) counts.add(mid);
  const sorted = [...counts].sort((a, b) => a - b);
  console.log(
    `\nSweep: testing ${manifest.name} at player counts: ${sorted.join(", ")}\n`
  );
  let allPassed = true;
  for (const n of sorted) {
    const result = await runTest(n, parseInt(arg("seed", "0"), 10) || null);
    if (!result.passed) allPassed = false;
  }
  process.exit(allPassed ? 0 : 1);
} else {
  const playerCount = parseInt(arg("players", String(manifest.minPlayers)), 10);
  const seed = parseInt(arg("seed", "0"), 10) || null;
  const result = await runTest(playerCount, seed);
  process.exit(result.passed ? 0 : 1);
}

// === Core test runner ===

async function runTest(playerCount, seed) {
  // Start dev server on a random port
  const { server, port } = await createDevServer(absDir, { port: 0 });
  const base = `http://localhost:${port}`;

  // Reset to get a clean game
  await postReset(base);

  // Get initial state from SSE
  const initialState = await getStateViaSSE(base, 1);
  const gameSeed = initialState.seed;
  const players = initialState.players;

  const rngSeed = seed || Math.floor(Math.random() * 2147483647);
  const rng = mulberry32(rngSeed);

  console.log(`Testing ${manifest.name} (${manifest.slug})`);
  console.log(`Players: ${playerCount}  Seed: ${rngSeed}`);

  // Build local engine state by replaying
  function replayState(actionLog) {
    const random = createSeededRandom(gameSeed);
    let state = GameLogic.setup({ players, random, config: {}, seed: gameSeed });
    for (const entry of actionLog) {
      state = GameLogic.perform(state, entry.playerId, entry.action);
    }
    return state;
  }

  // --- Game loop ---
  const MAX_ACTIONS = 500;
  const actionLog = [];
  let actionCount = 0;
  let rejections = 0;
  let consecutiveStalls = 0;
  const actionsPerPlayer = {};
  for (const p of players) actionsPerPlayer[p.id] = 0;

  let state = replayState(actionLog);

  console.log("Playing...\n");

  while (actionCount < MAX_ACTIONS) {
    // Check game over
    const result = GameLogic.isOver(state);
    if (result) break;

    // Find a player with legal actions
    let acted = false;
    for (const p of players) {
      const legal = GameLogic.actions(state, p.id);
      if (legal.length === 0) continue;

      // Pick random action
      const action = legal[Math.floor(rng() * legal.length)];

      // Submit via HTTP
      const res = await postAction(base, p.id, action);
      if (res.status === 200 && res.ok) {
        actionLog.push({ playerId: p.id, action });
        state = GameLogic.perform(state, p.id, action);
        actionCount++;
        actionsPerPlayer[p.id]++;
        acted = true;
        consecutiveStalls = 0;
        break; // Re-evaluate after each action (turn may have changed)
      } else {
        rejections++;
        // Server rejected — resync by fetching current state
        try {
          const freshState = await getStateViaSSE(base, 1);
          actionLog.length = 0;
          actionLog.push(...(freshState.actionLog || []));
          state = replayState(actionLog);
        } catch {
          // SSE fetch failed, continue with local state
        }
      }
    }

    if (!acted) {
      // No player had legal actions — check for system timer / turnConfig
      const tc = GameLogic.turnConfig(state, null);
      if (tc && tc.defaultAction) {
        // Simulate system action locally
        const currentPlayer = players.find(p => GameLogic.actions(state, p.id).length > 0);
        if (currentPlayer) {
          const res = await postAction(base, currentPlayer.id, tc.defaultAction);
          if (res.status === 200) {
            actionLog.push({ playerId: currentPlayer.id, action: tc.defaultAction });
            state = GameLogic.perform(state, currentPlayer.id, tc.defaultAction);
            actionCount++;
            consecutiveStalls = 0;
            continue;
          }
        }
      }

      consecutiveStalls++;
      if (consecutiveStalls > 10) {
        console.error("STUCK: No player can act and no system timer.");
        break;
      }
      // Small delay for system timer to fire server-side
      await new Promise((r) => setTimeout(r, 200));

      // Resync from server
      try {
        const freshState = await getStateViaSSE(base, 1);
        actionLog.length = 0;
        actionLog.push(...(freshState.actionLog || []));
        state = replayState(actionLog);
      } catch { /* continue */ }
    }
  }

  // --- Report ---
  const result = GameLogic.isOver(state);
  const gameOver = result !== null && result !== undefined;
  const passed = gameOver;

  console.log("\n-------------------------------------------");
  console.log("  E2E TEST REPORT");
  console.log("-------------------------------------------");
  console.log(`  Game:       ${manifest.name}`);
  console.log(`  Players:    ${playerCount}`);
  console.log(`  Seed:       ${rngSeed}`);
  console.log(`  Actions:    ${actionCount}`);
  console.log(`  Rejections: ${rejections}`);

  if (gameOver && result) {
    console.log(`  Result:     ${result.summary || "GAME COMPLETED"}`);
    if (result.winners?.length > 0) {
      const winnerNames = result.winners.map((w) => {
        const p = players.find((p) => p.id === w);
        return p ? p.name : w;
      });
      console.log(`  Winners:    ${winnerNames.join(", ")}`);
    }
  } else if (actionCount >= MAX_ACTIONS) {
    console.log("  Result:     MAX ACTIONS REACHED (game may be too long)");
  } else if (consecutiveStalls > 10) {
    console.log("  Result:     STUCK (no legal actions, no timer)");
  } else {
    console.log("  Result:     COMPLETED (no explicit game over)");
  }

  // Per-player action counts
  const playerSummary = players
    .map((p) => `${p.name}:${actionsPerPlayer[p.id] || 0}`)
    .join("  ");
  console.log(`  Per-player: ${playerSummary}`);
  console.log(`  Status:     ${passed ? "PASS" : "FAIL"}`);
  console.log("-------------------------------------------\n");

  server.close();
  return { passed, result };
}
