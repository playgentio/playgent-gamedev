#!/usr/bin/env node

/**
 * Standalone Playwright UI test for games — no dev server needed.
 *
 * Loads game.js in Node, generates phase snapshots via GameEngine,
 * builds a test HTML with mock playgent, pushes state through the
 * game's onStateChange callback, asserts data-* landmarks, and
 * screenshots each phase.
 *
 * Usage:
 *   node scripts/test-game-ui.mjs games/tic-tac-toe
 *   node scripts/test-game-ui.mjs games/tic-tac-toe --players 2 --seed 42
 *   node scripts/test-game-ui.mjs games/tic-tac-toe --headed
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium } from "@playwright/test";

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
    "Usage: node scripts/test-game-ui.mjs <game-directory> [--players N] [--seed N] [--headed]",
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
let gameModule;
if (existsSync(gameJsPath)) {
  gameModule = require(gameJsPath);
}
const GameLogic = gameModule?.default ?? gameModule;
if (!GameLogic?.setup) {
  console.error("Could not load GameLogic from game.js");
  process.exit(1);
}
GameLogic.manifest = manifest;

const htmlPath = path.join(absDir, "index.html");
if (!existsSync(htmlPath)) {
  console.error(`Missing index.html in ${absDir}`);
  process.exit(1);
}
const rawHtml = readFileSync(htmlPath, "utf-8");

// --- Config ---
const playerCount = parseInt(arg("players", String(manifest.minPlayers)), 10);
const headed = hasFlag("headed");
const screenshotDir = path.resolve("screenshots", manifest.slug);

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

// --- Snapshot generation ---
function generateSnapshots(seed) {
  const rng = mulberry32(seed);
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `player-${i}`,
    name: `Bot${i + 1}`,
  }));

  const engine = new GameEngine(GameLogic, players, {}, seed);
  const snapshots = [];
  let actionCount = 0;
  let lastPhase;
  const hasPhases = engine.getState().phase !== undefined;
  const actionMilestones = new Set([3, 6, 9]);

  // Capture a snapshot
  function capture(label) {
    const result = engine.getResult();
    const playerId = players[0].id;
    const view = engine.getView(playerId);
    const legalActions = engine.getActions(playerId);
    const gameOver = result
      ? { winners: result.winners, summary: result.summary }
      : null;
    snapshots.push({ label, view, legalActions, playerId, players, gameOver });
  }

  // Initial snapshot
  capture("initial");

  const MAX_TICKS = 500;
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    const state = engine.getState();
    if (engine.getResult() !== null) break;

    // Phase change snapshot
    if (hasPhases && state.phase !== lastPhase && lastPhase !== undefined) {
      capture(`phase-${state.phase}`);
    }
    lastPhase = state.phase;

    // Collect all players with legal actions
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
      // Try system action
      const sysConfig = engine.getTurnConfig(null);
      if (sysConfig?.defaultAction) {
        engine.processAction("__system__", sysConfig.defaultAction);
        actionCount++;
        continue;
      }
      break; // Stuck
    }

    // Execute random actions
    for (const { player, actions } of playerActions) {
      const action = actions[Math.floor(rng() * actions.length)];
      engine.processAction(player.id, action);
      actionCount++;

      // Action-count milestone snapshots (fallback for phase-less games)
      if (!hasPhases && actionMilestones.has(actionCount)) {
        if (engine.getResult() === null) {
          capture(`action-${actionCount}`);
        }
      }

      if (engine.getResult() !== null) break;
    }
  }

  // Game over snapshot
  if (engine.getResult() !== null) {
    capture("game-over");
  }

  return { snapshots, actionCount };
}

// Try up to 3 seeds to get >= 3 snapshots
let baseSeed = parseInt(arg("seed", "42"), 10);
let result;
for (let attempt = 0; attempt < 3; attempt++) {
  const seed = baseSeed + attempt * 1000;
  result = generateSnapshots(seed);
  if (result.snapshots.length >= 3) {
    baseSeed = seed;
    break;
  }
}
const { snapshots } = result;

console.log(
  `Generated ${snapshots.length} snapshot(s) (${result.actionCount} actions, seed ${baseSeed})`,
);
for (const s of snapshots) {
  console.log(`  - ${s.label}`);
}

// --- Pattern landmark loading ---
function loadPatternLandmarks() {
  const patternsDir = path.resolve("game-patterns");
  const indexPath = path.join(patternsDir, "index.json");
  if (!existsSync(indexPath)) return [];

  const index = JSON.parse(readFileSync(indexPath, "utf-8"));
  const tags = (manifest.tags || []).map((t) => t.toLowerCase());

  const matchedFiles = [];
  for (const pattern of index.patterns) {
    const keywords = pattern.keywords || [];
    const hit = keywords.some((kw) =>
      tags.some((tag) => tag.includes(kw) || kw.includes(tag)),
    );
    if (hit) matchedFiles.push(pattern.file);
  }

  const selectors = [];
  for (const file of matchedFiles) {
    const mdPath = path.join(patternsDir, file);
    if (!existsSync(mdPath)) continue;
    const md = readFileSync(mdPath, "utf-8");
    const match = md.match(/## UI Landmarks\n([\s\S]*?)(?=\n##|\n---|$)/);
    if (!match) continue;
    const section = match[1];
    const dataAttrs = section.match(/\[data-[^\]]+\]/g);
    if (dataAttrs) {
      for (const attr of dataAttrs) {
        // Convert [data-foo="bar"] to CSS selector
        selectors.push(attr);
      }
    }
  }
  return selectors;
}

const patternLandmarks = loadPatternLandmarks();
const universalLandmarks = ["[data-phase]", "[data-player]", "[data-status]"];

console.log(
  `Pattern landmarks (warnings): ${patternLandmarks.length > 0 ? patternLandmarks.join(", ") : "none"}`,
);
console.log(`Universal landmarks (required): ${universalLandmarks.join(", ")}`);

// --- Build test HTML ---
function buildTestHtml() {
  // Extract <style> tags
  const styleRegex = /<style[^>]*>[\s\S]*?<\/style>/gi;
  const styles = (rawHtml.match(styleRegex) || []).join("\n");

  // Extract <script> tags
  const scriptRegex = /<script[^>]*>[\s\S]*?<\/script>/gi;
  const scripts = (rawHtml.match(scriptRegex) || []).join("\n");

  // Body content = everything that's not style or script
  let bodyContent = rawHtml;
  bodyContent = bodyContent.replace(styleRegex, "");
  bodyContent = bodyContent.replace(scriptRegex, "");
  // Strip any stray HTML/HEAD/BODY wrapper tags
  bodyContent = bodyContent.replace(
    /<\/?(html|head|body|!doctype)[^>]*>/gi,
    "",
  );
  bodyContent = bodyContent.trim();

  const mockPlaygent = `
window.playgent = {
  _stateChangeCb: null,
  _actionCb: null,
  onStateChange: function(cb) { window.playgent._stateChangeCb = cb; },
  onAction: function(cb) { window.playgent._actionCb = cb; },
  submitAction: function(action) { window.__lastAction = action; },
  sound: function() {},
  toast: function() {},
  get teamAssignments() { return undefined; }
};
window.__playgentPush = function(view, legalActions, playerId, players, gameOver) {
  if (!window.playgent._stateChangeCb) return;
  window.playgent._stateChangeCb(view, legalActions, {
    myId: playerId,
    players: players,
    isMyTurn: legalActions.length > 0,
    currentPlayerId: legalActions.length > 0 ? playerId : null,
    gameOver: gameOver,
  });
};
`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${styles}
</head>
<body>
${bodyContent}
<script>${mockPlaygent}</script>
${scripts}
</body>
</html>`;
}

const testHtml = buildTestHtml();

// --- Ephemeral HTTP server ---
function startServer(html) {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

// --- Main test ---
async function runTest() {
  mkdirSync(screenshotDir, { recursive: true });

  const { server, url } = await startServer(testHtml);
  console.log(`\nServing test page at ${url}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: !headed });
  } catch (err) {
    console.error(
      `BLOCKED: Could not launch Playwright browser: ${err.message}`,
    );
    server.close();
    process.exit(2);
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 size
  });
  const page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Wait briefly for scripts to initialize
  await page.waitForTimeout(300);

  const failures = [];
  const warnings = [];
  let screenshotCount = 0;

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    console.log(`\nPushing snapshot: ${snap.label}`);

    // Push state through mock playgent
    await page.evaluate(
      ({ view, legalActions, playerId, players, gameOver }) => {
        window.__playgentPush(view, legalActions, playerId, players, gameOver);
      },
      {
        view: snap.view,
        legalActions: snap.legalActions,
        playerId: snap.playerId,
        players: snap.players,
        gameOver: snap.gameOver,
      },
    );

    // Let the UI render
    await page.waitForTimeout(200);

    // Check universal landmarks (hard failures)
    for (const selector of universalLandmarks) {
      const count = await page.locator(selector).count();
      if (count === 0) {
        failures.push(
          `[${snap.label}] Missing universal landmark: ${selector}`,
        );
      }
    }

    // Check pattern landmarks (warnings only)
    for (const selector of patternLandmarks) {
      const count = await page.locator(selector).count();
      if (count === 0) {
        warnings.push(`[${snap.label}] Missing pattern landmark: ${selector}`);
      }
    }

    // Screenshot
    const screenshotPath = path.join(
      screenshotDir,
      `${String(i).padStart(2, "0")}-${snap.label}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    screenshotCount++;
    console.log(
      `  Screenshot: ${path.relative(process.cwd(), screenshotPath)}`,
    );
  }

  // Check console errors (hard failures)
  for (const err of consoleErrors) {
    failures.push(`Console error: ${err}`);
  }

  await browser.close();
  server.close();

  // --- Report ---
  console.log("\n-------------------------------------------");
  console.log("  UI TEST REPORT");
  console.log("-------------------------------------------");
  console.log(`  Game:         ${manifest.name}`);
  console.log(`  Players:      ${playerCount}`);
  console.log(`  Seed:         ${baseSeed}`);
  console.log(`  Snapshots:    ${snapshots.length}`);
  console.log(
    `  Screenshots:  ${screenshotCount} (in ${path.relative(process.cwd(), screenshotDir)}/)`,
  );

  if (warnings.length > 0) {
    console.log(`  Warnings:     ${warnings.length}`);
    for (const w of warnings) {
      console.log(`    ⚠ ${w}`);
    }
  }

  if (failures.length > 0) {
    console.log(`  Status:       FAIL (${failures.length} issue(s))`);
    for (const f of failures) {
      console.log(`    ✗ ${f}`);
    }
  } else {
    console.log("  Status:       PASS");
  }
  console.log("-------------------------------------------\n");

  return failures.length === 0 ? 0 : 1;
}

const exitCode = await runTest();
process.exit(exitCode);
