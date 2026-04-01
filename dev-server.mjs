// Playgent Dev Server v2026-03-31
// Zero-dependency game development server.
// Usage: node dev-server.mjs <game-directory>


// src/index.ts
import { watch } from "node:fs";
import {
  createServer
} from "node:http";
import { extname } from "node:path";

// src/bundler.ts
function getDevRuntime() {
  return `
(function () {
  'use strict';

  // Override non-deterministic globals (mirrors platform sandbox)
  Math.random = function () { throw new Error('Math.random() is disabled \u2014 use random from setup()'); };
  Date.now = function () { return 1700000000000; };

  // Mulberry32 PRNG \u2014 exact same algorithm as @playgent/core SeededRandom
  function createSeededRandom(seed) {
    var state = seed | 0;
    function next() {
      state = (state + 0x6d2b79f5) | 0;
      var t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function integer(min, max) { return Math.floor(next() * (max - min + 1)) + min; }
    function shuffle(array) {
      var copy = array.slice();
      for (var i = copy.length - 1; i > 0; i--) {
        var j = integer(0, i);
        var tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
      return copy;
    }
    function pick(array) { return array[integer(0, array.length - 1)]; }
    return { next: next, integer: integer, shuffle: shuffle, pick: pick };
  }

  // Parse player number from ?player=N URL param \u2192 "player_N"
  function getPlayerId() {
    var params = new URLSearchParams(window.location.search);
    var num = params.get('player');
    return num ? 'player_' + num : 'player_1';
  }

  var stateChangeCallbacks = [];
  var actionCallbacks = [];
  var myId = getPlayerId();
  var playerNum = myId.replace('player_', '');

  // Build window.playgent API
  window.playgent = {
    onStateChange: function (cb) {
      stateChangeCallbacks.push(cb);
    },
    onAction: function (cb) {
      actionCallbacks.push(cb);
    },
    submitAction: function (action) {
      fetch('/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: myId, action: action }),
      }).catch(function (err) { console.error('[playgent] submitAction failed:', err); });
    },
    sound: function () { /* no-op in dev mode */ },
    toast: function (msg, type) { console.log('[playgent toast' + (type ? ':' + type : '') + ']', msg); },
  };

  // Replay state from SSE event data and notify callbacks
  function applyState(data) {
    var gameLogic = window.GameLogic;
    if (!gameLogic) {
      console.error('[playgent] GameLogic not found on window');
      return;
    }

    var players = data.players;
    var seed = data.seed;
    var actionLog = data.actionLog || [];
    var config = data.config || {};

    var random = createSeededRandom(seed);
    var state = gameLogic.setup({ players: players, random: random, config: config, seed: seed });

    // Replay all actions, firing onAction callbacks for each
    for (var i = 0; i < actionLog.length; i++) {
      var entry = actionLog[i];
      var prevView = gameLogic.view(state, myId);
      state = gameLogic.perform(state, entry.playerId, entry.action);
      var newView = gameLogic.view(state, myId);
      for (var k = 0; k < actionCallbacks.length; k++) {
        try { actionCallbacks[k](entry.action, entry.playerId, prevView, newView); } catch (e) { console.error(e); }
      }
    }

    var view = gameLogic.view(state, myId);
    var legalActions = gameLogic.actions(state, myId);
    var isOver = gameLogic.isOver(state);
    // Derive currentPlayerId by finding who has legal actions (matches production runtime)
    var currentPlayerId = null;
    for (var cp = 0; cp < players.length; cp++) {
      if (gameLogic.actions(state, players[cp].id).length > 0) {
        currentPlayerId = players[cp].id;
        break;
      }
    }

    var context = {
      myId: myId,
      players: players,
      isMyTurn: legalActions.length > 0,
      currentPlayerId: currentPlayerId,
      gameOver: isOver,
    };

    for (var j = 0; j < stateChangeCallbacks.length; j++) {
      try { stateChangeCallbacks[j](view, legalActions, context); } catch (e) { console.error(e); }
    }
  }

  // Connect to SSE stream
  var evtSource = new EventSource('/events?player=' + playerNum);

  evtSource.addEventListener('state', function (e) {
    try {
      var data = JSON.parse(e.data);
      applyState(data);
    } catch (err) {
      console.error('[playgent] Failed to parse state event:', err);
    }
  });

  evtSource.addEventListener('reload', function () {
    window.location.reload();
  });

  evtSource.onerror = function (err) {
    console.warn('[playgent] SSE connection error:', err);
  };
})();
`;
}
function bundleGameForDev(gameJs, indexHtml, _manifest) {
  const styleBlocks = [
    ...indexHtml.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi)
  ].map((m) => m[0]);
  const bodyContent = indexHtml.replace(/<!DOCTYPE[^>]*>/gi, "").replace(/<html[^>]*>/gi, "").replace(/<\/html>/gi, "").replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "").replace(/<body[^>]*>/gi, "").replace(/<\/body>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<meta[^>]*\/?>/gi, "").replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "").trim();
  let processedGameJs = gameJs.replace(/^export\s+default\s+\w+\s*;?\s*$/gm, "").replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, "");
  processedGameJs = processedGameJs.replace(/<\/script>/gi, "<\\/script>");
  const styleSection = styleBlocks.join("\n");
  const devRuntime = getDevRuntime();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
${styleSection}
</head>
<body>
${bodyContent}
<script>
${processedGameJs}
</script>
<script>
${devRuntime}
</script>
</body>
</html>`;
}

// src/game-loader.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
function extractGameLogic(mod) {
  const candidates = [
    mod["default"],
    mod["GameLogic"],
    mod
  ];
  for (const candidate of candidates) {
    if (candidate !== null && candidate !== void 0 && typeof candidate["setup"] === "function") {
      return candidate;
    }
  }
  return null;
}
async function loadGame(dir) {
  if (!existsSync(dir)) {
    throw new Error(`Game directory not found: ${dir}`);
  }
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing manifest.json in: ${dir}`);
  }
  const gameJsPath = join(dir, "game.js");
  if (!existsSync(gameJsPath)) {
    throw new Error(`Missing game.js in: ${dir}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const gameJs = readFileSync(gameJsPath, "utf-8");
  const indexHtmlPath = join(dir, "index.html");
  const indexHtml = existsSync(indexHtmlPath) ? readFileSync(indexHtmlPath, "utf-8") : '<div id="game"></div>';
  const fileUrl = pathToFileURL(gameJsPath).href + `?t=${Date.now()}`;
  const mod = await import(fileUrl);
  const definition = extractGameLogic(mod);
  if (definition === null) {
    throw new Error(`game.js must export a GameLogic object with a setup function`);
  }
  return { manifest, gameJs, indexHtml, definition, dir };
}

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
    return Math.floor(next() * (max - min + 1)) + min;
  }
  function shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = integer(0, i);
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }
  function pick(array) {
    if (array.length === 0)
      throw new Error("pick(): cannot pick from empty array");
    const idx = integer(0, array.length - 1);
    return array[idx];
  }
  return { next, integer, shuffle, pick };
}

// src/validate.ts
function run(name, fn) {
  try {
    fn();
    return { name, passed: true };
  } catch (err) {
    return {
      name,
      passed: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
function makePlayerIds(count) {
  return Array.from({ length: count }, (_, i) => `player_${i + 1}`);
}
function buildSetupCtx(playerIds, seed) {
  const random = createSeededRandom(seed);
  const players = playerIds.map((id) => ({ id, name: id }));
  return { players, random, config: {}, seed };
}
function validateGame(definition, manifest) {
  const results = [];
  results.push(
    run("manifest has rules (string, >= 100 chars)", () => {
      const rules = manifest["rules"];
      if (typeof rules !== "string")
        throw new Error("manifest.rules must be a string");
      if (rules.length < 100)
        throw new Error(
          `manifest.rules must be >= 100 chars, got ${rules.length}`
        );
    })
  );
  const seeds = [42, 123, 999];
  const playerCounts = [manifest.minPlayers, manifest.maxPlayers];
  for (const seed of seeds) {
    for (const count of playerCounts) {
      const label = `setup() returns state (seed=${seed}, players=${count})`;
      results.push(
        run(label, () => {
          const ctx = buildSetupCtx(makePlayerIds(count), seed);
          const state = definition.setup(ctx);
          if (state === null || state === void 0)
            throw new Error("setup() returned null/undefined");
        })
      );
    }
  }
  results.push(
    run("setup() is deterministic (same seed \u2192 same JSON)", () => {
      const count = manifest.minPlayers;
      const players = makePlayerIds(count);
      const ctx1 = buildSetupCtx(players, 42);
      const ctx2 = buildSetupCtx(players, 42);
      const s1 = JSON.stringify(definition.setup(ctx1));
      const s2 = JSON.stringify(definition.setup(ctx2));
      if (s1 !== s2)
        throw new Error("setup() is not deterministic");
    })
  );
  results.push(
    run("perform() does not mutate input state", () => {
      const count = manifest.minPlayers;
      const playerIds = makePlayerIds(count);
      const ctx = buildSetupCtx(playerIds, 42);
      const state = definition.setup(ctx);
      const frozen = JSON.parse(JSON.stringify(state));
      const firstPlayer = playerIds[0] ?? "";
      const actions = definition.actions(state, firstPlayer);
      if (actions.length === 0)
        return;
      const before = JSON.stringify(state);
      definition.perform(state, firstPlayer, actions[0]);
      const after = JSON.stringify(state);
      if (before !== after)
        throw new Error("perform() mutated the input state");
      if (JSON.stringify(frozen) !== before)
        throw new Error("frozen baseline mismatch \u2014 unreachable");
    })
  );
  results.push(
    run("view() filters sensitive fields (no 'seed' or 'nextSeed')", () => {
      const count = manifest.minPlayers;
      const playerIds = makePlayerIds(count);
      const ctx = buildSetupCtx(playerIds, 42);
      const state = definition.setup(ctx);
      for (const pid of playerIds) {
        const v = definition.view(state, pid);
        if ("seed" in v)
          throw new Error(`view() leaks 'seed' for player ${pid}`);
        if ("nextSeed" in v)
          throw new Error(`view() leaks 'nextSeed' for player ${pid}`);
      }
    })
  );
  results.push(
    run("turnConfig() returns a config object or null", () => {
      const count = manifest.minPlayers;
      const playerIds = makePlayerIds(count);
      const ctx = buildSetupCtx(playerIds, 42);
      const state = definition.setup(ctx);
      const cfg = definition.turnConfig(state, playerIds[0] ?? null);
      if (cfg !== null && typeof cfg !== "object") {
        throw new Error("turnConfig() must return an object or null");
      }
    })
  );
  results.push(
    run("actions() round-trip: actions are accepted by perform()", () => {
      const count = manifest.minPlayers;
      const playerIds = makePlayerIds(count);
      const ctx = buildSetupCtx(playerIds, 42);
      const state = definition.setup(ctx);
      let testedAny = false;
      for (const pid of playerIds) {
        const actions = definition.actions(state, pid);
        if (actions.length === 0)
          continue;
        const action = actions[0];
        if (action === void 0)
          continue;
        const newState = definition.perform(state, pid, action);
        if (newState === null || newState === void 0) {
          throw new Error(`perform() returned null for player ${pid}`);
        }
        const legalStrs = actions.map((a) => JSON.stringify(a));
        const actionStr = JSON.stringify(action);
        if (!legalStrs.includes(actionStr)) {
          throw new Error(`Action ${actionStr} not found in legal actions`);
        }
        testedAny = true;
        break;
      }
      if (!testedAny) {
      }
    })
  );
  results.push(
    run("isOver() returns null for initial state", () => {
      const count = manifest.minPlayers;
      const playerIds = makePlayerIds(count);
      const ctx = buildSetupCtx(playerIds, 42);
      const state = definition.setup(ctx);
      const result = definition.isOver(state);
      if (result !== null && result !== void 0) {
        throw new Error(
          `isOver() returned non-null for initial state: ${JSON.stringify(result)}`
        );
      }
    })
  );
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  return { results, passed, failed };
}

// src/index.ts
var BUILD_VERSION = true ? "2026-03-31" : "dev";
function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}
function initGameState(game) {
  const seed = randomSeed();
  const count = game.manifest.minPlayers;
  const players = Array.from({ length: count }, (_, i) => ({
    id: `player_${i + 1}`,
    name: `Player ${i + 1}`
  }));
  const random = createSeededRandom(seed);
  const state = game.definition.setup({ players, random, config: {}, seed });
  return { seed, players, state, actionLog: [] };
}
function buildStatePayload(srv) {
  return {
    seed: srv.seed,
    players: srv.players,
    actionLog: srv.actionLog,
    config: {}
  };
}
function broadcastState(srv) {
  const data = JSON.stringify(buildStatePayload(srv));
  const msg = `event: state
data: ${data}

`;
  for (const client of srv.sseClients) {
    try {
      client.res.write(msg);
    } catch {
    }
  }
}
function broadcastReload(srv) {
  const msg = `event: reload
data: {}

`;
  for (const client of srv.sseClients) {
    try {
      client.res.write(msg);
    } catch {
    }
  }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(json);
}
async function createDevServer(gameDir, opts = {}) {
  const game = await loadGame(gameDir);
  const initial = initGameState(game);
  const srv = {
    game,
    ...initial,
    sseClients: [],
    bundledHtml: bundleGameForDev(game.gameJs, game.indexHtml, game.manifest)
  };
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost`);
    const path = url.pathname;
    const method = req.method ?? "GET";
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      res.end();
      return;
    }
    if (method === "GET" && path === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(srv.bundledHtml);
      return;
    }
    if (method === "GET" && path === "/version") {
      sendJson(res, 200, { version: BUILD_VERSION });
      return;
    }
    if (method === "GET" && path === "/validate") {
      const report = validateGame(srv.game.definition, srv.game.manifest);
      sendJson(res, 200, report);
      return;
    }
    if (method === "GET" && path === "/events") {
      const playerParam = url.searchParams.get("player") ?? "1";
      const playerId = `player_${playerParam}`;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*"
      });
      res.flushHeaders();
      const initialData = JSON.stringify(buildStatePayload(srv));
      res.write(`event: state
data: ${initialData}

`);
      const client = { res, playerId };
      srv.sseClients.push(client);
      req.on("close", () => {
        const idx = srv.sseClients.indexOf(client);
        if (idx !== -1)
          srv.sseClients.splice(idx, 1);
      });
      return;
    }
    if (method === "POST" && path === "/action") {
      readBody(req).then((body) => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          sendJson(res, 400, { error: "Invalid JSON body" });
          return;
        }
        const { playerId, action } = parsed;
        if (!playerId || action === void 0) {
          sendJson(res, 400, { error: "Missing playerId or action" });
          return;
        }
        const legalActions = srv.game.definition.actions(srv.state, playerId);
        const actionStr = JSON.stringify(action);
        const legalStrs = legalActions.map((a) => JSON.stringify(a));
        if (!legalStrs.includes(actionStr)) {
          sendJson(res, 400, { error: "Illegal action", legalActions });
          return;
        }
        srv.state = srv.game.definition.perform(srv.state, playerId, action);
        srv.actionLog.push({ playerId, action });
        broadcastState(srv);
        sendJson(res, 200, { ok: true });
      }).catch((err) => {
        sendJson(res, 500, { error: String(err) });
      });
      return;
    }
    if (method === "POST" && path === "/reset") {
      const next = initGameState(srv.game);
      srv.seed = next.seed;
      srv.players = next.players;
      srv.state = next.state;
      srv.actionLog = next.actionLog;
      broadcastState(srv);
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  });
  const abortController = new AbortController();
  try {
    const watcher = watch(
      gameDir,
      { recursive: true, signal: abortController.signal },
      (_eventType, filename) => {
        if (!filename)
          return;
        const ext = extname(filename).toLowerCase();
        if (![".js", ".json", ".html"].includes(ext))
          return;
        console.log(`[dev-server] Hot reload: ${filename} changed`);
        loadGame(gameDir).then((reloadedGame) => {
          srv.game = reloadedGame;
          srv.bundledHtml = bundleGameForDev(
            reloadedGame.gameJs,
            reloadedGame.indexHtml,
            reloadedGame.manifest
          );
          const next = initGameState(reloadedGame);
          srv.seed = next.seed;
          srv.players = next.players;
          srv.state = next.state;
          srv.actionLog = next.actionLog;
          broadcastReload(srv);
        }).catch((err) => {
          console.error(`[dev-server] Hot reload failed:`, err);
        });
      }
    );
    server.on("close", () => {
      abortController.abort();
    });
  } catch {
  }
  return new Promise((resolve, reject) => {
    const listenPort = opts.port ?? 0;
    server.listen(listenPort, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : listenPort;
      resolve({ server, port });
    });
    server.on("error", reject);
  });
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const gameDir = process.argv[2];
  if (!gameDir) {
    console.error("Usage: dev-server <game-directory>");
    process.exit(1);
  }
  loadGame(gameDir).then(async (game) => {
    const report = validateGame(game.definition, game.manifest);
    console.log("\n=== Validation Report ===");
    for (const r of report.results) {
      const icon = r.passed ? "\x1B[32m\u2713\x1B[0m" : "\x1B[31m\u2717\x1B[0m";
      console.log(`${icon} ${r.name}${r.error ? ` \u2014 ${r.error}` : ""}`);
    }
    console.log(`
Passed: ${report.passed}  Failed: ${report.failed}`);
    if (report.failed > 0) {
      console.error(
        "\n\x1B[31mValidation failed. Fix errors above before starting the server.\x1B[0m"
      );
      process.exit(1);
    }
    const { port } = await createDevServer(gameDir, { port: 3000 });
    console.log(
      `
\x1B[32mDev server running on http://localhost:${port}\x1B[0m`
    );
    const minP = game.manifest.minPlayers;
    for (let i = 1; i <= minP; i++) {
      console.log(`  Player ${i}: http://localhost:${port}/?player=${i}`);
    }
  }).catch((err) => {
    console.error(
      "\x1B[31mError:\x1B[0m",
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  });
}
export {
  createDevServer
};
