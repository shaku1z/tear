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
    roots: Object.freeze(["src/presentation/backdrop.ts", "src/presentation/backdrop-biomes.ts"]),
    pattern: /(?:from\s+|import\s*\()\s*["'][^"']*config\/game-config["']/u,
    message: "the backdrop factory and biome art must receive configuration and preferences through explicit policy ports",
  }),
  Object.freeze({
    roots: Object.freeze(["src/presentation/backdrop.ts"]),
    pattern: /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+(?:Backdrop|CLOCK)\b/um,
    message: "the backdrop module cannot retain a shared controller or clock; create one controller per composition",
  }),
  Object.freeze({
    roots: Object.freeze(["src/presentation/cinematics.ts"]),
    pattern: /(?:from\s+|import\s*\()\s*["'][^"']*config\/game-config["']/u,
    message: "the cinematic renderer must receive presentation timing through an explicit per-world policy",
  }),
  Object.freeze({
    roots: Object.freeze(["src/presentation/cinematics.ts"]),
    pattern: /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+Cinematics\b/um,
    message: "the cinematic renderer cannot retain a shared presentation runtime; create one per composition",
  }),
  Object.freeze({
    roots: Object.freeze(["src/presentation/ui-contracts.ts", "src/presentation/ui-tokens.ts"]),
    pattern: /(?:from\s+|import\s*\()\s*["'][^"']*config\/game-config["']/u,
    message: "the UI factory must receive viewport, palette, and overscan through an explicit presentation policy",
  }),
  Object.freeze({
    roots: Object.freeze(["src/presentation/attract-runtime.ts"]),
    pattern: /(?:from\s+|import\s*\()\s*["'][^"']*config\/game-config["']/u,
    message: "the Attract renderer must receive visual configuration through an explicit composition policy",
  }),
  Object.freeze({
    roots: Object.freeze(["src/presentation/attract-runtime.ts"]),
    pattern: /(?:from\s+|import\s*\()\s*["'][^"']*cosmetic-random["']/u,
    message: "the Attract renderer must receive cosmetic entropy through its visual policy",
  }),
  Object.freeze({
    roots: Object.freeze(["src/audio/legacy-synth.ts"]),
    pattern: /export\s+const\s+SFX\b/u,
    message: "the first-gesture audio facade must be created by composition instead of exported as a shared instance",
  }),
  Object.freeze({
    roots: Object.freeze(["src/audio/legacy-synth-runtime.ts"]),
    pattern: /export\s+const\s+SFX\b/u,
    message: "the concrete synth runtime must be created for its facade instead of exported as a shared instance",
  }),
  Object.freeze({
    roots: Object.freeze(["src/audio/audio-context-handoff.ts"]),
    pattern: /(?:^|\n)(?:export\s+)?(?:let|var)\s+captured\b/um,
    message: "browser audio context state must belong to a constructed composition handoff, not the module",
  }),
  Object.freeze({
    roots: Object.freeze(["src/audio/legacy-live-audio.ts"]),
    pattern: /(?:from\s+|import\s*\()\s*["'][^"']*audio-context-handoff["']/u,
    message: "the live audio adapter must receive the captured browser context through its explicit facade/runtime port",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts", "src/app/live-session-services-composition.ts"]),
    pattern: /(?<![\w.])navigator\b(?!\s*:)/u,
    message: "live input and settings coordination must receive browser navigator capability through the composition dependency port",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts", "src/app/live-browser-runtime.ts"]),
    pattern: /(?<![\w.])document\b(?!\s*:)/u,
    message: "live browser and pointer-lock coordination must receive document capability through the composition dependency port",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /\bwindow\.indexedDB\b/u,
    message: "live Ghost V3 capture and inspection must receive IndexedDB capability through the composition dependency port",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /\bwindow\.location\.search\b/u,
    message: "live Ghost V3 test configuration must receive browser query capability through the composition dependency port",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /Object\.defineProperty\(window,\s*["']__TEAR_GHOST_V3__["']/u,
    message: "live Ghost V3 test inspection must install through the composition-supplied browser window",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /["']__TEAR_GHOST_V3__["']/u,
    message: "live Ghost V3 test inspection surface must be assembled by the browser adapter",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /\(\s*window\s+as\s+Window\s*&\s*\{\s*__TEAR_PARITY_TICK__/u,
    message: "live parity-tick observation must receive the browser window through the composition dependency port",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /new\s+RuntimeFrameDriver\(window\)/u,
    message: "live frame coordination must receive its animation-frame source through the composition dependency port",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /emitLiveTearBenchPhysicalInput\(input,\s*\{\s*window,/u,
    message: "test-build physical input emission must receive its browser window through the composition dependency port",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /installLiveTearRuntimeBridge\(\{[\s\S]*?\}, window\);/u,
    message: "test-build runtime bridge installation must receive its browser window through the composition dependency port",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-cinematic-host.ts"]),
    pattern: /\blocalStorage\s*\./u,
    message: "live cinematic persistence must receive storage through the composition dependency port",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-world-presentation-adapters.ts"]),
    pattern: /\bd\.PROFILE\.data\.seen\s*\[/u,
    message: "achievement-toast seen markers must use the composition-owned persistence adapter",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-world-presentation-adapters.ts"]),
    pattern: /\bd\.PROFILE\.save\(\)/u,
    message: "achievement-toast profile saves must use the composition-owned persistence adapter",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-world-presentation-adapters.ts"]),
    pattern: /\bd\.PROFILE\.addStat\("touchOnboarded"/u,
    message: "touch onboarding profile stats must use the composition-owned adapter",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /\blet\s+(?:lastGhost|lastVaultId|overInfo|selMode|selDiff|selWeapon|selBoss)\b/u,
    message: "live world session values must use the explicit session-state owner",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /\blet\s+(?:floaters|slowZones|tempWalls)\b/u,
    message: "live transient combat collections must stay in world state",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /\blet\s+(?:bossIntro|bossBeat)\b/u,
    message: "live boss cinematic state must stay in world state",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /\blet\s+(?:enemies|projectiles)\b/u,
    message: "live actor collections must stay in world state",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /\blet\s+run\b/u,
    message: "live run state must stay in world state",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /\blet\s+blade\b/u,
    message: "live blade state must stay in world state",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /\blet\s+player\b/u,
    message: "live player state must stay in world state",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-game-runtime.ts"]),
    pattern: /\blet\s+(?:shopCoinShow|shopFlash)\b/u,
    message: "live shop feedback must use the typed presentation-state owner",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-style-host.ts"]),
    pattern: /\bd\.ACH\.check\(\);\s*d\.PROFILE\.save\(\)/u,
    message: "live style achievement persistence must use the composition-owned adapter",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-platform-bootstrap.ts"]),
    pattern: /\bd\.PROFILE\.maxStat\("shopMaxed"/u,
    message: "platform bootstrap progression backfill must use the composition-owned persistence adapter",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-platform-bootstrap.ts"]),
    pattern: /\bd\.ACH\.check\(\);\s*d\.PROFILE\.save\(\)/u,
    message: "platform bootstrap achievement persistence must use the composition-owned adapter",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-outcome-composition.ts"]),
    pattern: /\bd\.PROFILE\.(?:setPendingFinale|save|clearPendingFinale|pendingFinale)\(/u,
    message: "live outcome pending-finale persistence must use the composition-owned adapter",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-campaign-training-composition.ts"]),
    pattern: /\bd\.PROFILE\.(?:markBiome|maxStat)\(/u,
    message: "campaign biome progress must use the composition-owned adapter",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-victory-progression-host.ts"]),
    pattern: /\bd\.PROFILE\.(?:addStat|maxStat)\(/u,
    message: "victory progression generic profile stats must use the composition-owned adapter",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-victory-progression-host.ts"]),
    pattern: /\bd\.PROFILE\.data\.(?:weaponsWon|rewards|advDiffs)\b/u,
    message: "victory progression profile-data operations must use the composition-owned adapter",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-outcome-composition.ts"]),
    pattern: /\bd\.PROFILE\.(?:addStat|maxStat)\(/u,
    message: "live outcome defeat-progress persistence must use the composition-owned adapter",
  }),
  Object.freeze({
    roots: Object.freeze(["src/app/live-setup-shop-renderers.ts"]),
    pattern: /\bd\.PROFILE\.(?:addStat|maxStat)\(/u,
    message: "shop purchase persistence must use the composition-owned adapter",
  }),
  Object.freeze({
    roots: Object.freeze([
      "src/app/live-session-services-composition.ts",
      "src/app/live-wave-composition.ts",
      "src/app/live-style-host.ts",
      "src/app/live-training-host-runtime.ts",
      "src/app/live-combat-actions.ts",
    ]),
    pattern: /\bd\.PROFILE\.(?:addStat|maxStat)\(/u,
    message: "generic session, wave, live-style, and training profile stats must use the composition-owned adapter",
  }),
  Object.freeze({
    roots: Object.freeze([
      "src/presentation/entities/blade-renderer.ts",
      "src/presentation/entities/mirror-renderer.ts",
      "src/presentation/entities/projectile-renderer.ts",
    ]),
    pattern: /(?:from\s+|import\s*\()\s*["'][^"']*config\/game-config["']/u,
    message: "entity renderers must receive only their narrow rendering policy from presentation composition",
  }),
  Object.freeze({
    roots: Object.freeze(["src/presentation/enemies/renderers/enemy-renderer-types.ts"]),
    pattern: /\bGameConfig\b/u,
    message: "legacy enemy presentation must declare its exact rendering policy instead of importing the broad gameplay configuration",
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
if (dependencyErrors("src/presentation/backdrop.ts",
  'import { CONFIG } from "../config/game-config";').length !== 1
  || dependencyErrors("src/presentation/backdrop-biomes.ts",
    'import type { GFX } from "../config/game-config";').length !== 1
  || dependencyErrors("src/presentation/backdrop.ts",
    'export const Backdrop = {};').length !== 1
  || dependencyErrors("src/presentation/backdrop.ts",
    'let CLOCK = createTearWorldClock();').length !== 1
  || dependencyErrors("src/presentation/backdrop.ts",
    'export function createBackdrop() { return {}; }').length !== 0) {
  throw new Error("source architecture backdrop policy injection rule self-test failed");
}
if (dependencyErrors("src/presentation/cinematics.ts",
  'import { CONFIG } from "../config/game-config";').length !== 1
  || dependencyErrors("src/presentation/cinematics.ts",
    'import type { CONFIG } from "../config/game-config";').length !== 1
  || dependencyErrors("src/presentation/cinematics.ts",
    'export const Cinematics = {};').length !== 1
  || dependencyErrors("src/presentation/cinematics.ts",
    'export function createCinematics() { return {}; }').length !== 0) {
  throw new Error("source architecture cinematic presentation policy rule self-test failed");
}
if (dependencyErrors("src/presentation/ui-contracts.ts",
  'import type { CONFIG } from "../config/game-config";').length !== 1
  || dependencyErrors("src/presentation/ui-tokens.ts",
    'import type { CONFIG } from "../config/game-config";').length !== 1
  || dependencyErrors("src/presentation/ui-contracts.ts",
    'export interface UiPresentationPolicy {}').length !== 0) {
  throw new Error("source architecture UI presentation policy rule self-test failed");
}
if (dependencyErrors("src/presentation/attract-runtime.ts",
  'import type { CONFIG } from "../config/game-config";').length !== 1
  || dependencyErrors("src/presentation/attract-runtime.ts",
    'import { cosmeticRandom } from "./cosmetic-random";').length !== 1
  || dependencyErrors("src/presentation/attract-runtime.ts",
    'export interface AttractVisualPolicy {}').length !== 0) {
  throw new Error("source architecture Attract visual policy rule self-test failed");
}
if (dependencyErrors("src/audio/legacy-synth.ts",
  "export const SFX = Object.freeze({});").length !== 1
  || dependencyErrors("src/audio/legacy-synth.ts",
    "export function createLegacySynthFacade() { return {}; }").length !== 0) {
  throw new Error("source architecture composition-owned audio facade rule self-test failed");
}
if (dependencyErrors("src/audio/legacy-synth-runtime.ts",
  "export const SFX = Object.freeze({});").length !== 1
  || dependencyErrors("src/audio/legacy-synth-runtime.ts",
    "export function createLegacySynthRuntime() { return {}; }").length !== 0) {
  throw new Error("source architecture composition-owned concrete audio runtime rule self-test failed");
}
if (dependencyErrors("src/audio/audio-context-handoff.ts",
  "let captured = null;").length !== 1
  || dependencyErrors("src/audio/audio-context-handoff.ts",
    "export function createBrowserAudioContextHandoff() { let captured = null; return {}; }").length !== 0
  || dependencyErrors("src/audio/legacy-live-audio.ts",
    'import { capturedAudioContext } from "./audio-context-handoff";').length !== 1
  || dependencyErrors("src/audio/legacy-live-audio.ts",
    "export function createLegacyAudioCompatibility(_synth, _window, _capturedContext) { return {}; }").length !== 0) {
  throw new Error("source architecture composition-owned browser audio-context handoff rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "const gamepad = navigator.getGamepads()[0];").length !== 1
  || dependencyErrors("src/app/live-session-services-composition.ts",
    "const cores = navigator.hardwareConcurrency;").length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "const context = { navigator: dependencies.browserNavigator };").length !== 0
  || dependencyErrors("src/app/live-session-services-composition.ts",
    "const options = { navigator: dependencies.browserNavigator };").length !== 0) {
  throw new Error("source architecture composition-owned browser navigator rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "document.exitPointerLock();").length !== 1
  || dependencyErrors("src/app/live-browser-runtime.ts",
    'const canvas = document.getElementById("game");').length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "const context = { document: dependencies.browserDocument };").length !== 0
  || dependencyErrors("src/app/live-browser-runtime.ts",
    "const canvas = dependencies.browserDocument.getElementById(\"game\");").length !== 0) {
  throw new Error("source architecture composition-owned browser document rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "const database = window.indexedDB;").length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "const database = dependencies.browserIndexedDb;").length !== 0) {
  throw new Error("source architecture composition-owned browser IndexedDB rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "const search = window.location.search;").length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "const search = dependencies.browserWindow.location.search;").length !== 0) {
  throw new Error("source architecture composition-owned browser query rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  'Object.defineProperty(window, "__TEAR_GHOST_V3__", {});').length !== 2
  || dependencyErrors("src/app/live-game-runtime.ts",
    'Object.defineProperty(dependencies.browserWindow, "__TEAR_GHOST_V3__", {});').length !== 1) {
  throw new Error("source architecture composition-owned Ghost inspector rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  'const inspectorName = "__TEAR_GHOST_V3__";').length !== 1
  || dependencyErrors("src/tearbench/browser/live-runtime-bridge.ts",
    'Object.defineProperty(target, "__TEAR_GHOST_V3__", {});').length !== 0) {
  throw new Error("source architecture Ghost inspector browser-adapter rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "const hook = (window as Window & { __TEAR_PARITY_TICK__: {} }).__TEAR_PARITY_TICK__;").length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "const hook = (dependencies.browserWindow as BrowserParityTickWindow).__TEAR_PARITY_TICK__;").length !== 0) {
  throw new Error("source architecture composition-owned parity-tick browser window rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "const driver = new RuntimeFrameDriver(window);").length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "const driver = new RuntimeFrameDriver(dependencies.browserWindow);").length !== 0) {
  throw new Error("source architecture composition-owned frame-driver window rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "emitLiveTearBenchPhysicalInput(input, { window, canvas });").length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "emitLiveTearBenchPhysicalInput(input, { window: dependencies.browserWindow, canvas });").length !== 0) {
  throw new Error("source architecture composition-owned physical-input browser window rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "installLiveTearRuntimeBridge({\n  source,\n}, window);").length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "installLiveTearRuntimeBridge({\n  source,\n}, dependencies.browserWindow);").length !== 0) {
  throw new Error("source architecture composition-owned runtime-bridge browser window rule self-test failed");
}
if (dependencyErrors("src/app/live-cinematic-host.ts",
  'localStorage.setItem("tear.cinematic.seen", "1");').length !== 1
  || dependencyErrors("src/app/live-cinematic-host.ts",
    'dependencies.browserStorage.setItem("tear.cinematic.seen", "1");').length !== 0) {
  throw new Error("source architecture composition-owned cinematic persistence rule self-test failed");
}
if (dependencyErrors("src/app/live-world-presentation-adapters.ts",
  "d.PROFILE.data.seen[id] = true;").length !== 1
  || dependencyErrors("src/app/live-world-presentation-adapters.ts",
    "d.achievementToastPersistence.markSeen(id);").length !== 0) {
  throw new Error("source architecture composition-owned achievement seen-marker rule self-test failed");
}
if (dependencyErrors("src/app/live-world-presentation-adapters.ts",
  "d.PROFILE.save();").length !== 1
  || dependencyErrors("src/app/live-world-presentation-adapters.ts",
    "d.achievementToastPersistence.save();").length !== 0) {
  throw new Error("source architecture composition-owned achievement save rule self-test failed");
}
if (dependencyErrors("src/app/live-world-presentation-adapters.ts",
  'd.PROFILE.addStat("touchOnboarded", 1);').length !== 1
  || dependencyErrors("src/app/live-world-presentation-adapters.ts",
    'd.profileStatsPersistence.add("touchOnboarded", 1);').length !== 0) {
  throw new Error("source architecture composition-owned touch onboarding profile stats rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "let lastGhost = null;").length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "const session = createLiveWorldSessionState();").length !== 0) {
  throw new Error("source architecture live world session-state owner rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "let floaters = [];").length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "const floaters = hostState.floaters();").length !== 0) {
  throw new Error("source architecture live transient collection owner rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "let bossIntro = null;").length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "const intro = hostState.bossIntro();").length !== 0) {
  throw new Error("source architecture live boss cinematic owner rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "let enemies = [];").length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "const actors = hostState.enemies();").length !== 0) {
  throw new Error("source architecture live actor collection owner rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "let run = {}; ").length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "const run = hostState.run();").length !== 0) {
  throw new Error("source architecture live run owner rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "let blade = {}; ").length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "const blade = hostState.blade();").length !== 0) {
  throw new Error("source architecture live blade owner rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "let player = {}; ").length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "const player = hostState.player();").length !== 0) {
  throw new Error("source architecture live player owner rule self-test failed");
}
if (dependencyErrors("src/app/live-game-runtime.ts",
  "let shopCoinShow = null;").length !== 1
  || dependencyErrors("src/app/live-game-runtime.ts",
    "const shopFeedback = createLiveShopFeedbackState();").length !== 0) {
  throw new Error("source architecture live shop feedback owner rule self-test failed");
}
if (dependencyErrors("src/app/live-style-host.ts",
  "d.ACH.check(); d.PROFILE.save();").length !== 1
  || dependencyErrors("src/app/live-style-host.ts",
    "d.styleAchievementPersistence.checkAndSave();").length !== 0) {
  throw new Error("source architecture composition-owned live-style achievement persistence rule self-test failed");
}
if (dependencyErrors("src/app/live-platform-bootstrap.ts",
  'd.PROFILE.maxStat("shopMaxed", 1);').length !== 1
  || dependencyErrors("src/app/live-platform-bootstrap.ts",
    "d.platformBootstrapPersistence.backfillShopProgress();").length !== 0) {
  throw new Error("source architecture composition-owned platform bootstrap progression rule self-test failed");
}
if (dependencyErrors("src/app/live-platform-bootstrap.ts",
  "d.ACH.check(); d.PROFILE.save();").length !== 1
  || dependencyErrors("src/app/live-platform-bootstrap.ts",
    "d.platformBootstrapPersistence.backfillShopProgress();").length !== 0) {
  throw new Error("source architecture composition-owned platform bootstrap achievement rule self-test failed");
}
if (dependencyErrors("src/app/live-outcome-composition.ts",
  "d.PROFILE.setPendingFinale({});").length !== 1
  || dependencyErrors("src/app/live-outcome-composition.ts",
    "d.pendingFinalePersistence.persist({});").length !== 0) {
  throw new Error("source architecture composition-owned pending-finale persistence rule self-test failed");
}
if (dependencyErrors("src/app/live-campaign-training-composition.ts",
  'd.PROFILE.maxStat("biomesSeen", d.PROFILE.markBiome(name));').length !== 1
  || dependencyErrors("src/app/live-campaign-training-composition.ts",
    "d.biomeProgressPersistence.remember(name);").length !== 0) {
  throw new Error("source architecture composition-owned campaign biome progress rule self-test failed");
}
if (dependencyErrors("src/app/live-victory-progression-host.ts",
  'd.PROFILE.maxStat("distinctWeaponsWon", 1);').length !== 1
  || dependencyErrors("src/app/live-victory-progression-host.ts",
    "d.profileStatsPersistence.max(\"distinctWeaponsWon\", 1);").length !== 0) {
  throw new Error("source architecture composition-owned victory profile stats rule self-test failed");
}
if (dependencyErrors("src/app/live-victory-progression-host.ts",
  "d.PROFILE.data.weaponsWon = {};").length !== 1
  || dependencyErrors("src/app/live-victory-progression-host.ts",
    "d.victoryProfileProgressPersistence.markWeaponWin(weaponId);").length !== 0) {
  throw new Error("source architecture composition-owned victory profile-data rule self-test failed");
}
if (dependencyErrors("src/app/live-outcome-composition.ts",
  'd.PROFILE.addStat("runs", 1);').length !== 1
  || dependencyErrors("src/app/live-outcome-composition.ts",
    "d.outcomeDefeatProgressPersistence.record(run);").length !== 0) {
  throw new Error("source architecture composition-owned outcome defeat-progress persistence rule self-test failed");
}
if (dependencyErrors("src/app/live-setup-shop-renderers.ts",
  'd.PROFILE.addStat("shopBuys", 1);').length !== 1
  || dependencyErrors("src/app/live-setup-shop-renderers.ts",
    "d.shopPurchaseProgressPersistence.recordPurchase();").length !== 0) {
  throw new Error("source architecture composition-owned shop purchase persistence rule self-test failed");
}
if (dependencyErrors("src/app/live-wave-composition.ts",
  'd.PROFILE.maxStat("waves", 1);').length !== 1
  || dependencyErrors("src/app/live-wave-composition.ts",
    "d.profileStatsPersistence.max(\"waves\", 1);").length !== 0) {
  throw new Error("source architecture composition-owned generic profile stats rule self-test failed");
}
if (dependencyErrors("src/app/live-style-host.ts",
  'd.PROFILE.addStat("tricks", 1);').length !== 1
  || dependencyErrors("src/app/live-style-host.ts",
    "d.profileStatsPersistence.add(\"tricks\", 1);").length !== 0) {
  throw new Error("source architecture composition-owned live-style profile stats rule self-test failed");
}
if (dependencyErrors("src/app/live-training-host-runtime.ts",
  'd.PROFILE.addStat("tutorials", 1);').length !== 1
  || dependencyErrors("src/app/live-training-host-runtime.ts",
    "d.profileStatsPersistence.add(\"tutorials\", 1);").length !== 0) {
  throw new Error("source architecture composition-owned training profile stats rule self-test failed");
}
if (dependencyErrors("src/app/live-combat-actions.ts",
  'd.PROFILE.maxStat("armorBypassKills", 1);').length !== 1
  || dependencyErrors("src/app/live-combat-actions.ts",
    "d.profileStatsPersistence.max(\"armorBypassKills\", 1);").length !== 0) {
  throw new Error("source architecture composition-owned combat profile stats rule self-test failed");
}
for (const moduleName of [
  "src/presentation/entities/blade-renderer.ts",
  "src/presentation/entities/mirror-renderer.ts",
  "src/presentation/entities/projectile-renderer.ts",
]) {
  if (dependencyErrors(moduleName,
    'import type { CONFIG } from "../../config/game-config";').length !== 1
    || dependencyErrors(moduleName,
      'export interface RendererPolicy {}').length !== 0) {
    throw new Error("source architecture entity renderer policy rule self-test failed");
  }
}
if (dependencyErrors("src/presentation/enemies/renderers/enemy-renderer-types.ts",
  'import type { GameConfig } from "../../../gameplay/entities/enemy-contracts";').length !== 1
  || dependencyErrors("src/presentation/enemies/renderers/enemy-renderer-types.ts",
    'export interface EnemyPresentationPolicy {}').length !== 0) {
  throw new Error("source architecture legacy enemy presentation policy rule self-test failed");
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
