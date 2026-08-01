import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "src");
const authoredDataExceptions = new Set([
  "src/config/game-config.ts",
  "src/gameplay/upgrades.ts",
]);
// A module must still be small enough to review as one coherent subsystem, but
// established composition/replay coordinators legitimately need more room than
// the original provisional 500-line cap.
const MAX_SUBSYSTEM_LINES = 700;
const errors = [];
const forbiddenDependencyRules = Object.freeze([
  Object.freeze({
    roots: Object.freeze(["src/ghost/", "src/agents/", "src/tearbench/"]),
    pattern: /(?:from\s+|import\s*\()\s*["'][^"']*replay\/legacy-compat["']/u,
    message: "portable Ghost, agent, and TearBench modules cannot depend on the Ghost 2 compatibility adapter",
  }),
  Object.freeze({
    roots: Object.freeze(["src/tearbench/"]),
    pattern: /(?:from\s+|import\s*\()\s*["'][^"']*app\/game-runtime-state["']/u,
    message: "portable TearBench modules must consume structural simulation ports, not concrete app world types",
  }),
  Object.freeze({
    roots: Object.freeze([
      "src/gameplay/runtime/tear-simulation-runtime.ts",
      "src/gameplay/runtime/tear-combat-simulation.ts",
      "src/gameplay/runtime/gameplay-event-publishers.ts",
      "src/gameplay/runtime/tear-world-entity-construction.ts",
      "src/gameplay/runtime/tear-world-context.ts",
      "src/gameplay/runtime/tear-world-simulation-factories.ts",
      "src/gameplay/runtime/tear-world-bootstrap.ts",
      "src/gameplay/run/reward-runtime.ts",
      "src/gameplay/campaign/finale-runtime.ts",
      "src/gameplay/campaign/finale-outward-call.ts",
    ]),
    pattern: /(?:from\s+|import\s*\()\s*["'][^"']*(?:app\/|presentation\/|audio\/|persistence\/|platform\/|tearbench\/|replay\/legacy-compat)[^"']*["']/u,
    message: "portable gameplay modules cannot depend on outward app, TearBench, presentation, service, or Ghost 2 adapters",
  }),
  Object.freeze({
    roots: Object.freeze([
      "src/gameplay/runtime/tear-simulation-runtime.ts",
      "src/gameplay/runtime/tear-combat-simulation.ts",
      "src/gameplay/runtime/gameplay-event-publishers.ts",
      "src/gameplay/runtime/tear-world-entity-construction.ts",
      "src/gameplay/runtime/tear-world-context.ts",
      "src/gameplay/runtime/tear-world-simulation-factories.ts",
      "src/gameplay/runtime/tear-world-bootstrap.ts",
      "src/gameplay/run/reward-runtime.ts",
      "src/gameplay/campaign/finale-runtime.ts",
      "src/gameplay/campaign/finale-outward-call.ts",
    ]),
    pattern: /\b(?:window|document|HTMLCanvasElement|CanvasRenderingContext2D)\b/u,
    message: "portable gameplay modules cannot reference browser or Canvas globals",
  }),
  Object.freeze({
    roots: Object.freeze(["src/tearbench/detached-world-hydrator.ts", "src/tearbench/detached-world-runtime.ts"]),
    pattern: /(?:from\s+|import\s*\()\s*["'][^"']*(?:app\/|presentation\/|audio\/|persistence\/|platform\/|replay\/legacy-compat)[^"']*["']/u,
    message: "detached TearBench world modules cannot depend on outward app, presentation, service, or Ghost 2 adapters",
  }),
  Object.freeze({
    roots: Object.freeze(["src/tearbench/detached-world-hydrator.ts", "src/tearbench/detached-world-runtime.ts"]),
    pattern: /\b(?:window|document|HTMLCanvasElement|CanvasRenderingContext2D)\b/u,
    message: "detached TearBench world modules cannot reference browser or Canvas globals",
  }),
  Object.freeze({
    roots: Object.freeze(["src/tearbench/live-runtime-environment.ts", "src/tearbench/live-runtime-action-routing.ts"]),
    pattern: /(?:from\s+|import\s*\()\s*["'][^"']*(?:app\/|presentation\/|audio\/|persistence\/|platform\/|replay\/legacy-compat|browser\/)[^"']*["']/u,
    message: "portable live TearBench modules cannot depend on browser or outward adapters",
  }),
  Object.freeze({
    roots: Object.freeze(["src/tearbench/live-runtime-environment.ts", "src/tearbench/live-runtime-action-routing.ts"]),
    pattern: /\b(?:window|document|HTMLElement|HTML\w*Element|Canvas\w*|KeyboardEvent|PointerEvent|MouseEvent|Gamepad)\b/u,
    message: "portable live TearBench modules cannot reference browser or Canvas globals",
  }),
  Object.freeze({
    roots: Object.freeze(["src/tearbench/browser/"]),
    pattern: /(?:from\s+|import\s*\()\s*["'][^"']*(?:app\/|replay\/legacy-compat)[^"']*["']/u,
    message: "browser TearBench adapters cannot depend on app-world or Ghost 2 compatibility modules",
  }),
  Object.freeze({
    roots: Object.freeze(["src/tearbench/index.ts"]),
    pattern: /export\s+\*\s+from\s+["']\.\/(?:ghost-lab-panel|state-forge-studio|live-state-forge-studio-host|test-environment|browser(?:\/[^"']*)?|test-support(?:\/[^"']*)?)["']/u,
    message: "the portable TearBench barrel cannot re-export browser/developer UI or test-support modules",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /\b(?:aiInput|lmbOverride|aimOverride)\b/u,
    message: "live composition must route automation input through the live authoritative input adapter",
  }),
  Object.freeze({
    roots: Object.freeze([
      "src/config/game-config.ts",
      "src/simulation/run-random.ts",
      "src/presentation/particles.ts",
    ]),
    // A world's clock, randomness, and particles must be created per world and
    // passed inward. A module-level instance would silently couple two worlds.
    pattern: /export\s*\{[^}]*\b(?:CLOCK|GAME_RANDOM|GAME_RANDOM_STREAMS|FX)\b[^}]*\}|export\s+const\s+(?:CLOCK|GAME_RANDOM|GAME_RANDOM_STREAMS|FX)\b/u,
    message: "world clock, random, and particle modules cannot export a shared instance; export a factory instead",
  }),
  Object.freeze({
    roots: Object.freeze(["src/presentation/particles.ts"]),
    pattern: /from\s+["'][^"']*(?:config\/game-config|cosmetic-random)["']/u,
    message: "the particle factory must receive policy and entropy through an explicit per-world port",
  }),
  Object.freeze({
    roots: Object.freeze(["src/gameplay/runtime/tear-world-bootstrap.ts"]),
    pattern: /(?:from\s+|import\s*\()\s*["'][^"']*config\/game-config["']/u,
    message: "the generic world bootstrap must receive base configuration through its explicit caller port",
  }),
  Object.freeze({
    roots: Object.freeze([
      "src/gameplay/weapons.ts",
      "src/gameplay/upgrades.ts",
      "src/gameplay/stages.ts",
      "src/gameplay/combat/live-opening-phase.ts",
      "src/gameplay/combat/live-collision-phase.ts",
      "src/gameplay/combat/live-kill-runtime.ts",
      "src/gameplay/runtime/cinematic-director.ts",
      "src/gameplay/training/tutorial-production-ghost.ts",
    ]),
    // Reject reordered, mixed, and aliased value imports too. `import type`
    // remains legal because these modules still describe the config shape.
    pattern: /import(?!\s+type)\s*\{[^}]*\bCONFIG\b[^}]*\}\s*from\s*["'][^"']*config\/game-config["']/u,
    message: "world-owned gameplay must receive configuration through an explicit port",
  }),
]);

function dependencyErrors(relative, text) {
  return forbiddenDependencyRules.flatMap((rule) =>
    rule.roots.some((prefix) => relative.startsWith(prefix)) && rule.pattern.test(text)
      ? [`${relative}: ${rule.message}`]
      : []);
}

// A planted forbidden edge proves this gate is capable of rejecting the
// dependency it claims to enforce, without modifying the worktree.
if (dependencyErrors("src/tearbench/__planted-violation.ts",
  'import type { LiveGhostEngineEvent } from "../replay/legacy-compat";').length !== 1) {
  throw new Error("source architecture dependency-rule self-test failed");
}
if (dependencyErrors("src/tearbench/__planted-world-violation.ts",
  'import type { GameEnemy } from "../app/game-runtime-state";').length !== 1) {
  throw new Error("source architecture world-port rule self-test failed");
}
if (dependencyErrors("src/gameplay/runtime/tear-simulation-runtime.ts",
  'import { startLiveGame } from "../../app/live-game-runtime";').length !== 1) {
  throw new Error("source architecture portable simulation import-rule self-test failed");
}
if (dependencyErrors("src/gameplay/runtime/tear-simulation-runtime.ts",
  'const canvas: HTMLCanvasElement | null = null;').length !== 1) {
  throw new Error("source architecture portable simulation browser-rule self-test failed");
}
if (dependencyErrors("src/gameplay/runtime/tear-combat-simulation.ts",
  'import { LiveFrameRuntime } from "../../app/live-frame-runtime";').length !== 1) {
  throw new Error("source architecture portable combat import-rule self-test failed");
}
if (dependencyErrors("src/gameplay/runtime/tear-combat-simulation.ts",
  'const context: CanvasRenderingContext2D | null = null;').length !== 1) {
  throw new Error("source architecture portable combat browser-rule self-test failed");
}
if (dependencyErrors("src/gameplay/runtime/gameplay-event-publishers.ts",
  'import { startLiveGame } from "../../app/live-game-runtime";').length !== 1) {
  throw new Error("source architecture gameplay-event publisher import-rule self-test failed");
}
if (dependencyErrors("src/gameplay/runtime/gameplay-event-publishers.ts",
  'document.dispatchEvent(new Event("run"));').length !== 1) {
  throw new Error("source architecture gameplay-event publisher browser-rule self-test failed");
}
if (dependencyErrors("src/gameplay/runtime/tear-world-entity-construction.ts",
  'import type { GameRuntimeDependencies } from "../../app/game-runtime-dependencies";').length !== 1) {
  throw new Error("source architecture world-construction import-rule self-test failed");
}
if (dependencyErrors("src/config/game-config.ts", "export { A11Y, CLOCK, CONFIG };").length !== 1) {
  throw new Error("source architecture per-world instance rule self-test failed");
}
if (dependencyErrors("src/gameplay/weapons.ts", 'import { CONFIG } from "../config/game-config";').length !== 1
  || dependencyErrors("src/gameplay/upgrades.ts", 'import { CONFIG } from "../config/game-config";').length !== 1
  || dependencyErrors("src/gameplay/stages.ts", 'import { CONFIG } from "../config/game-config";').length !== 1
  || dependencyErrors("src/gameplay/combat/live-opening-phase.ts", 'import { CONFIG } from "../../config/game-config";').length !== 1
  || dependencyErrors("src/gameplay/combat/live-collision-phase.ts", 'import { CONFIG } from "../../config/game-config";').length !== 1
  || dependencyErrors("src/gameplay/combat/live-kill-runtime.ts", 'import { CONFIG } from "../../config/game-config";').length !== 1
  || dependencyErrors("src/gameplay/runtime/cinematic-director.ts", 'import { CONFIG } from "../../config/game-config";').length !== 1
  || dependencyErrors("src/gameplay/training/tutorial-production-ghost.ts", 'import { GFX, CONFIG as worldConfig } from "../../config/game-config";').length !== 1
  || dependencyErrors("src/gameplay/weapons.ts", 'import type { CONFIG } from "../config/game-config";').length !== 0) {
  throw new Error("source architecture world-configuration injection rule self-test failed");
}
if (dependencyErrors("src/simulation/run-random.ts",
  "export const GAME_RANDOM_STREAMS = new RunRandomStreams();").length !== 1) {
  throw new Error("source architecture per-world random rule self-test failed");
}
if (dependencyErrors("src/presentation/particles.ts", "export { createParticleSystem };").length !== 0) {
  throw new Error("source architecture per-world factory export must remain allowed");
}
if (dependencyErrors("src/presentation/particles.ts",
  'import { CONFIG } from "../config/game-config";').length !== 1
  || dependencyErrors("src/presentation/particles.ts",
    'import { GFX, A11Y as accessibility } from "../config/game-config";').length !== 1
  || dependencyErrors("src/presentation/particles.ts",
    'import type { CONFIG } from "../config/game-config";').length !== 1
  || dependencyErrors("src/presentation/particles.ts",
    'import { cosmeticRandom } from "./cosmetic-random";').length !== 1) {
  throw new Error("source architecture particle policy injection rule self-test failed");
}
if (dependencyErrors("src/gameplay/runtime/tear-world-bootstrap.ts",
  'import { CONFIG } from "../../config/game-config";').length !== 1
  || dependencyErrors("src/gameplay/runtime/tear-world-bootstrap.ts",
    'import type { CONFIG } from "../../config/game-config";').length !== 1) {
  throw new Error("source architecture generic bootstrap configuration rule self-test failed");
}
if (dependencyErrors("src/gameplay/runtime/tear-world-bootstrap.ts",
  'import { startLiveGame } from "../../app/live-game-runtime";').length !== 1
  || dependencyErrors("src/gameplay/runtime/tear-world-bootstrap.ts",
    'const canvas: HTMLCanvasElement | null = null;').length !== 1) {
  throw new Error("source architecture generic bootstrap portability rule self-test failed");
}
if (dependencyErrors("src/gameplay/runtime/tear-world-entity-construction.ts",
  'const canvas: HTMLCanvasElement | null = null;').length !== 1) {
  throw new Error("source architecture world-construction browser-rule self-test failed");
}
if (dependencyErrors("src/gameplay/runtime/tear-world-context.ts",
  'import type { GameRuntimeDependencies } from "../../app/game-runtime-dependencies";').length !== 1) {
  throw new Error("source architecture world-context import-rule self-test failed");
}
if (dependencyErrors("src/gameplay/runtime/tear-world-context.ts",
  'const canvas: HTMLCanvasElement | null = null;').length !== 1) {
  throw new Error("source architecture world-context browser-rule self-test failed");
}
if (dependencyErrors("src/gameplay/runtime/tear-world-simulation-factories.ts",
  'import { createLiveWorldSimulationPresentationAdapter } from "../../app/live-world-simulation-factories";').length !== 1) {
  throw new Error("source architecture portable world-factory import-rule self-test failed");
}
if (dependencyErrors("src/gameplay/runtime/tear-world-simulation-factories.ts",
  'import { createPlayerRenderer } from "../../presentation/entities/player-renderer";').length !== 1) {
  throw new Error("source architecture portable world-factory presentation-rule self-test failed");
}
if (dependencyErrors("src/gameplay/runtime/tear-world-simulation-factories.ts",
  'const canvas: HTMLCanvasElement | null = null;').length !== 1) {
  throw new Error("source architecture portable world-factory browser-rule self-test failed");
}
if (dependencyErrors("src/gameplay/run/reward-runtime.ts",
  'import { startLiveGame } from "../../app/live-game-runtime";').length !== 1) {
  throw new Error("source architecture portable reward import-rule self-test failed");
}
if (dependencyErrors("src/gameplay/run/reward-runtime.ts",
  'import { routeLiveTearBenchAction } from "../../tearbench/live-runtime-action-routing";').length !== 1) {
  throw new Error("source architecture portable reward direction-rule self-test failed");
}
if (dependencyErrors("src/gameplay/run/reward-runtime.ts",
  'document.exitPointerLock();').length !== 1) {
  throw new Error("source architecture portable reward browser-rule self-test failed");
}
if (dependencyErrors("src/gameplay/campaign/finale-runtime.ts",
  'import { createLiveCampaignRuntime } from "../../app/live-campaign-runtime";').length !== 1) {
  throw new Error("source architecture portable finale import-rule self-test failed");
}
if (dependencyErrors("src/gameplay/campaign/finale-runtime.ts",
  'window.requestAnimationFrame(() => document.exitPointerLock());').length !== 1) {
  throw new Error("source architecture portable finale browser-rule self-test failed");
}
if (dependencyErrors("src/gameplay/campaign/finale-runtime.ts",
  'import { FinaleController } from "./finale-controller";').length !== 0) {
  throw new Error("source architecture portable finale inward dependency self-test failed");
}
if (dependencyErrors("src/tearbench/detached-world-hydrator.ts",
  'import type { GameRuntimeDependencies } from "../app/game-runtime-dependencies";').length !== 1) {
  throw new Error("source architecture detached hydrator import-rule self-test failed");
}
if (dependencyErrors("src/tearbench/detached-world-hydrator.ts",
  'const canvas: HTMLCanvasElement | null = null;').length !== 1) {
  throw new Error("source architecture detached hydrator browser-rule self-test failed");
}
if (dependencyErrors("src/tearbench/detached-world-runtime.ts",
  'import type { GameRuntimeDependencies } from "../app/game-runtime-dependencies";').length !== 1) {
  throw new Error("source architecture detached runtime import-rule self-test failed");
}
if (dependencyErrors("src/tearbench/detached-world-runtime.ts",
  'const canvas: HTMLCanvasElement | null = null;').length !== 1) {
  throw new Error("source architecture detached runtime browser-rule self-test failed");
}
if (dependencyErrors("src/tearbench/live-runtime-environment.ts",
  'import { installGhostLabPanel } from "./browser/ghost-lab-panel";').length !== 1) {
  throw new Error("source architecture portable live environment import-rule self-test failed");
}
if (dependencyErrors("src/tearbench/live-runtime-action-routing.ts",
  'const pointer = new PointerEvent("pointerdown");').length !== 1) {
  throw new Error("source architecture portable live action browser-rule self-test failed");
}
if (dependencyErrors("src/tearbench/browser/live-runtime-bridge.ts",
  'import { startLiveGame } from "../../app/live-game-runtime";').length !== 1) {
  throw new Error("source architecture browser adapter import-rule self-test failed");
}
if (dependencyErrors("src/tearbench/index.ts",
  'export * from "./state-forge-studio";').length !== 1) {
  throw new Error("source architecture portable barrel-rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts", "player.aiInput = input;").length !== 1) {
  throw new Error("source architecture live input adapter-rule self-test failed");
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

for (const file of walk(sourceRoot)) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (file.endsWith(".js")) errors.push(`${relative}: production source must be strict TypeScript`);
  if (!file.endsWith(".ts")) continue;
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/u).length;
  if (lines > MAX_SUBSYSTEM_LINES && !authoredDataExceptions.has(relative)) {
    errors.push(`${relative}: ${String(lines)} lines exceeds the ${String(MAX_SUBSYSTEM_LINES)}-line subsystem boundary`);
  }
  for (const suppression of ["@ts-ignore", "@ts-nocheck", "eslint-disable"]) {
    if (text.includes(suppression)) errors.push(`${relative}: contains forbidden ${suppression} suppression`);
  }
  errors.push(...dependencyErrors(relative, text));
}

if (errors.length > 0) {
  console.error(["Source architecture gate failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
  process.exit(1);
}
console.log("source architecture gate passed");
