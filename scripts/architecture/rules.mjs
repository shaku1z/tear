/**
 * The architecture rule catalogue. Every scope and target is either a
 * directory glob or an `@role` from config/architecture-roles.json; no rule
 * names a single file directly, so moving a module means editing the role map,
 * and the gate fails closed until that is done.
 *
 * Kinds:
 * - import: a module in `in` (minus `except`) may not reference a module in
 *   `to`. `edges` is `any` (default, includes `import type`), `value`, or
 *   `static-value` (dynamic `import()` allowed). `transitive` also follows
 *   every edge of the import graph.
 * - text: the source text of an in-scope module may not match `pattern`.
 * - lines: an in-scope module may not exceed `max` lines.
 * - extension: no in-scope file may exist.
 *
 * Each rule carries planted fixtures; the gate re-runs them on every invocation
 * against a current member of the scope, so a rule that can no longer fire is
 * itself a failure. `legacy` names the rows of the pre-role gate it replaces
 * (see docs/ARCHITECTURE.md and the rule inventory).
 */

const BROWSER_GLOBALS = /\b(?:window|document|HTMLCanvasElement|CanvasRenderingContext2D)\b/u;
const BROWSER_GLOBALS_WIDE =
  /\b(?:window|document|HTMLElement|HTML\w*Element|Canvas\w*|KeyboardEvent|PointerEvent|MouseEvent|Gamepad)\b/u;
const OUTWARD = Object.freeze([
  "src/app/**",
  "src/presentation/**",
  "src/audio/**",
  "src/persistence/**",
  "src/platform/**",
  "@replay.ghost2-compat-family",
]);
const CANVAS_FIXTURE = Object.freeze({ text: "const canvas: HTMLCanvasElement | null = null;" });
const APP_IMPORT_FIXTURE = Object.freeze({ imports: "@app.live-runtime-root" });

function importRule(id, legacy, scope, to, message, extra = {}) {
  return Object.freeze({ id, legacy, kind: "import", in: scope, to, message, ...extra });
}

function textRule(id, legacy, scope, pattern, message, fixtures, extra = {}) {
  return Object.freeze({ id, legacy, kind: "text", in: scope, pattern, message, fixtures, ...extra });
}

function liveRootStateRule(id, legacy, pattern, message, reject, accept) {
  return textRule(id, legacy, ["@app.live-runtime-root"], pattern, message, {
    reject: [{ text: reject }],
    accept: [{ text: accept }],
  });
}

const BIOME_RULES = [
  importRule(
    "biome.pale-isolation",
    ["R01", "T1"],
    ["@biome.pale.sources"],
    ["@biome.verdant.implementation"],
    "Pale biome source cannot depend on Verdant-specific implementation",
    {
      transitive: true,
      fixtures: {
        reject: [{ imports: "@biome.verdant.implementation" }],
        accept: [{ imports: "@environment.neutral-foundation" }],
      },
    },
  ),
  importRule(
    "biome.verdant-isolation",
    ["R02", "T2"],
    ["@biome.verdant.sources"],
    ["@biome.pale.implementation"],
    "Verdant biome source cannot depend on Pale-specific implementation",
    {
      transitive: true,
      fixtures: {
        reject: [{ imports: "@biome.pale.implementation" }],
        accept: [{ imports: "@environment.neutral-foundation" }],
      },
    },
  ),
  importRule(
    "environment.neutral-foundation-imports",
    ["R03"],
    ["@environment.neutral-foundation"],
    ["@biome.verdant.implementation", "@biome.pale.implementation"],
    "biome-neutral environment foundation cannot import a biome implementation",
    {
      fixtures: {
        reject: [{ imports: "@biome.pale.implementation" }, { imports: "@biome.verdant.implementation", type: true }],
        accept: [],
      },
    },
  ),
  textRule(
    "environment.neutral-schema-vocabulary",
    ["S1"],
    ["@environment.neutral-schema"],
    /\b(?:Verdant\w*|Pale\w*|Aurora\w*|GhostTrack\w*|Bloom\w*|Graft\w*|RootCage\w*|Rootbound\w*|WhiteHart\w*|carryStates|transportEligibility|heavyInfluenceScale|sourceTrackId|graftType|rootCageId|paleEntered|verdantEntered)\b/u,
    "biome-neutral environment foundation contains biome-owned schema vocabulary",
    {
      reject: [{ text: "interface AuroraTrackCarryState {}" }],
      accept: [{ text: "interface EnvironmentExtensionState {}" }],
    },
  ),
];

const PORTABLE_RULES = [
  importRule(
    "game-reference.purity",
    ["R04"],
    ["src/game-reference/**"],
    [
      "@config.game-config",
      "src/app/**",
      "src/platform/**",
      "src/presentation/**",
      "src/entrypoints/**",
      "src/**/browser/**",
      "@remote.adapters",
    ],
    "game-reference projections must remain pure authored data and cannot depend on runtime, browser, or remote adapters",
    {
      fixtures: {
        reject: [
          { imports: "src/remote/config", type: true },
          { imports: "@config.game-config", type: true },
        ],
        accept: [{ imports: "@gameplay.world-bootstrap" }],
      },
    },
  ),
  importRule(
    "research.no-ghost2-compat",
    ["R05"],
    ["src/ghost/**", "src/agents/**", "src/tearbench/**"],
    ["@replay.ghost2-compat"],
    "portable Ghost, agent, and TearBench modules cannot depend on the Ghost 2 compatibility adapter",
    { fixtures: { reject: [{ imports: "@replay.ghost2-compat", type: true }], accept: [] } },
  ),
  importRule(
    "tearbench.structural-world-ports",
    ["R06"],
    ["src/tearbench/**"],
    ["@app.world-runtime-types"],
    "portable TearBench modules must consume structural simulation ports, not concrete app world types",
    { fixtures: { reject: [{ imports: "@app.world-runtime-types", type: true }], accept: [] } },
  ),
  importRule(
    "gameplay.portable-core-imports",
    ["R07"],
    ["@gameplay.portable-core"],
    [...OUTWARD, "src/tearbench/**"],
    "portable gameplay modules cannot depend on outward app, TearBench, presentation, service, or Ghost 2 adapters",
    {
      fixtures: {
        reject: [APP_IMPORT_FIXTURE, { imports: "@tearbench.portable-live-runtime" }],
        accept: [{ imports: "@environment.neutral-foundation" }],
      },
    },
  ),
  textRule(
    "gameplay.portable-core-browser-globals",
    ["R08"],
    ["@gameplay.portable-core"],
    BROWSER_GLOBALS,
    "portable gameplay modules cannot reference browser or Canvas globals",
    { reject: [CANVAS_FIXTURE], accept: [{ text: "const x = 1;" }] },
  ),
  importRule(
    "tearbench.detached-world-imports",
    ["R09"],
    ["@tearbench.detached-world"],
    OUTWARD,
    "detached TearBench world modules cannot depend on outward app, presentation, service, or Ghost 2 adapters",
    { fixtures: { reject: [{ imports: "@app.world-runtime-types", type: true }], accept: [] } },
  ),
  textRule(
    "tearbench.detached-world-browser-globals",
    ["R10"],
    ["@tearbench.detached-world"],
    BROWSER_GLOBALS,
    "detached TearBench world modules cannot reference browser or Canvas globals",
    { reject: [CANVAS_FIXTURE], accept: [] },
  ),
  importRule(
    "tearbench.headless-entry-imports",
    ["R11"],
    ["@tearbench.production-headless-entry"],
    [...OUTWARD, "src/**/browser/**"],
    "production headless entry cannot import browser or outward adapters directly",
    { fixtures: { reject: [APP_IMPORT_FIXTURE, { imports: "@tearbench.browser-adapters" }], accept: [] } },
  ),
  textRule(
    "tearbench.headless-entry-browser-globals",
    ["R12"],
    ["@tearbench.production-headless-entry"],
    BROWSER_GLOBALS_WIDE,
    "production headless entry cannot reference browser or Canvas globals",
    { reject: [CANVAS_FIXTURE], accept: [] },
  ),
  importRule(
    "tearbench.portable-live-imports",
    ["R13"],
    ["@tearbench.portable-live-runtime"],
    [...OUTWARD, "src/**/browser/**"],
    "portable live TearBench modules cannot depend on browser or outward adapters",
    { fixtures: { reject: [{ imports: "@tearbench.browser-adapters" }], accept: [] } },
  ),
  textRule(
    "tearbench.portable-live-browser-globals",
    ["R14"],
    ["@tearbench.portable-live-runtime"],
    BROWSER_GLOBALS_WIDE,
    "portable live TearBench modules cannot reference browser or Canvas globals",
    { reject: [{ text: 'const pointer = new PointerEvent("pointerdown");' }], accept: [] },
  ),
  importRule(
    "tearbench.browser-adapter-imports",
    ["R15"],
    ["@tearbench.browser-adapters"],
    ["src/app/**", "@replay.ghost2-compat-family"],
    "browser TearBench adapters cannot depend on app-world or Ghost 2 compatibility modules",
    { fixtures: { reject: [APP_IMPORT_FIXTURE], accept: [] } },
  ),
  importRule(
    "tearbench.portable-barrel",
    ["R16"],
    ["@tearbench.portable-barrel"],
    ["@tearbench.developer-surfaces"],
    "the portable TearBench barrel cannot re-export browser/developer UI or test-support modules",
    {
      fixtures: {
        reject: [{ reexports: "@tearbench.developer-surfaces" }],
        accept: [{ reexports: "@environment.neutral-schema" }],
      },
    },
  ),
];

const WORLD_INSTANCE_RULES = [
  textRule(
    "world.no-shared-clock-random-particles",
    ["R18"],
    ["src/**"],
    // A world's clock, randomness, and particles must be created per world and
    // passed inward. A module-level instance would silently couple two worlds.
    /export\s*\{[^}]*\b(?:CLOCK|GAME_RANDOM|GAME_RANDOM_STREAMS|FX)\b[^}]*\}|export\s+const\s+(?:CLOCK|GAME_RANDOM|GAME_RANDOM_STREAMS|FX)\b/u,
    "world clock, random, and particle modules cannot export a shared instance; export a factory instead",
    {
      reject: [
        { text: "export { A11Y, CLOCK, CONFIG };" },
        { text: "export const GAME_RANDOM_STREAMS = new RunRandomStreams();" },
      ],
      accept: [{ text: "export { createParticleSystem };" }],
    },
  ),
  importRule(
    "presentation.no-game-config",
    ["R19", "R20", "R22", "R24", "R25", "R72"],
    ["src/presentation/**"],
    ["@config.game-config"],
    "presentation modules must receive configuration, preferences, timing, viewport and palette through explicit presentation policy ports",
    {
      fixtures: {
        reject: [{ imports: "@config.game-config" }, { imports: "@config.game-config", type: true }],
        accept: [],
      },
    },
  ),
  importRule(
    "presentation.injected-cosmetic-entropy",
    ["R19", "R26"],
    ["src/presentation/**"],
    ["@presentation.cosmetic-random"],
    "presentation renderers must receive cosmetic entropy through an explicit per-world policy port",
    {
      except: ["@presentation.cosmetic-random"],
      fixtures: { reject: [{ imports: "@presentation.cosmetic-random" }], accept: [] },
    },
  ),
  textRule(
    "presentation.no-module-backdrop-or-clock",
    ["R21"],
    ["src/presentation/**"],
    /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+(?:Backdrop|CLOCK)\b/mu,
    "presentation modules cannot retain a shared backdrop controller or clock; create one per composition",
    {
      reject: [{ text: "export const Backdrop = {};" }, { text: "let CLOCK = createTearWorldClock();" }],
      accept: [{ text: "export function createBackdrop() { return {}; }" }],
    },
  ),
  textRule(
    "presentation.no-module-cinematics",
    ["R23"],
    ["src/presentation/**"],
    /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+Cinematics\b/mu,
    "presentation modules cannot retain a shared cinematic runtime; create one per composition",
    {
      reject: [{ text: "export const Cinematics = {};" }],
      accept: [{ text: "export function createCinematics() { return {}; }" }],
    },
  ),
  textRule(
    "presentation.no-broad-game-config-type",
    ["R73"],
    ["src/presentation/**"],
    /\bGameConfig\b/u,
    "presentation must declare its exact rendering policy instead of importing the broad gameplay configuration",
    {
      reject: [{ text: 'import type { GameConfig } from "../../../gameplay/entities/enemy-contracts";' }],
      accept: [{ text: "export interface EnemyPresentationPolicy {}" }],
    },
  ),
  textRule(
    "audio.no-shared-sfx",
    ["R27", "R28"],
    ["src/**"],
    /export\s+const\s+SFX\b/u,
    "audio facades and synth runtimes must be created by composition instead of exported as a shared instance",
    {
      reject: [{ text: "export const SFX = Object.freeze({});" }],
      accept: [{ text: "export function createLegacySynthFacade() { return {}; }" }],
    },
  ),
  textRule(
    "audio.no-module-context-state",
    ["R29"],
    ["src/audio/**"],
    /(?:^|\n)(?:export\s+)?(?:let|var)\s+captured\b/mu,
    "browser audio context state must belong to a constructed composition handoff, not the module",
    {
      reject: [{ text: "let captured = null;" }],
      accept: [{ text: "export function createBrowserAudioContextHandoff() { let captured = null; return {}; }" }],
    },
  ),
  importRule(
    "audio.context-handoff-port",
    ["R30"],
    ["src/**"],
    ["@audio.context-handoff"],
    "only composition and the first-gesture audio facade may import the browser audio-context handoff; adapters receive the captured context through a port",
    {
      except: ["@audio.context-handoff", "@audio.context-handoff-consumers"],
      fixtures: { reject: [{ imports: "@audio.context-handoff", file: "src/audio/legacy-live-audio.ts" }], accept: [] },
    },
  ),
  importRule(
    "gameplay.world-bootstrap-config-port",
    ["R74"],
    ["@gameplay.world-bootstrap"],
    ["@config.game-config"],
    "the generic world bootstrap must receive base configuration through its explicit caller port",
    { fixtures: { reject: [{ imports: "@config.game-config", type: true }], accept: [] } },
  ),
  importRule(
    "core.world-config-injection",
    ["R75"],
    ["src/gameplay/**", "src/simulation/**", "src/domain/**"],
    ["@config.game-config"],
    "world-owned gameplay must receive configuration through an explicit port (type-only imports of the config shape stay legal)",
    {
      edges: "value",
      fixtures: {
        reject: [{ imports: "@config.game-config", names: "GFX, CONFIG as worldConfig" }],
        accept: [{ imports: "@config.game-config", type: true }],
      },
    },
  ),
];

const APP_BROWSER_RULES = [
  textRule(
    "app.browser-navigator-port",
    ["R31"],
    ["src/app/**"],
    /(?<![\w.])navigator\b(?!\s*:)/u,
    "app coordination must receive browser navigator capability through the composition dependency port",
    {
      reject: [{ text: "const gamepad = navigator.getGamepads()[0];" }],
      accept: [{ text: "const context = { navigator: dependencies.browserNavigator };" }],
    },
    { except: ["@app.navigator-owners"] },
  ),
  textRule(
    "app.browser-document-port",
    ["R32"],
    ["src/app/**"],
    /(?<![\w.])document\b(?!\s*:)/u,
    "app coordination must receive document capability through the composition dependency port",
    {
      reject: [{ text: "document.exitPointerLock();" }],
      accept: [{ text: "const context = { document: dependencies.browserDocument };" }],
    },
    { except: ["@app.document-owners"] },
  ),
  textRule(
    "app.browser-window-port",
    ["R33", "R34", "R35", "R37", "R38", "R39", "R40"],
    ["src/app/**"],
    /(?<![\w.])window\b(?!\s*:)/u,
    "app coordination must receive the browser window (IndexedDB, query, frames, inspection hooks) through the composition dependency port",
    {
      reject: [
        { text: "const database = window.indexedDB;" },
        { text: "emitLiveTearBenchPhysicalInput(input, { window, canvas });" },
      ],
      accept: [{ text: "emitLiveTearBenchPhysicalInput(input, { window: dependencies.browserWindow, canvas });" }],
    },
    { except: ["@app.window-owners"] },
  ),
  textRule(
    "app.browser-storage-port",
    ["R41"],
    ["src/app/**"],
    /\blocalStorage\s*\.|(?<![\w.])(?:localStorage|sessionStorage|indexedDB)\b(?!\s*:)/u,
    "app coordination must receive browser storage through the composition dependency port",
    {
      reject: [{ text: 'localStorage.setItem("tear.cinematic.seen", "1");' }],
      accept: [{ text: 'dependencies.browserStorage.setItem("tear.cinematic.seen", "1");' }],
    },
  ),
  textRule(
    "ghost.inspector-global-adapter",
    ["R36"],
    ["src/**"],
    /["']__TEAR_GHOST_V3__["']/u,
    "the Ghost V3 test inspection surface must be assembled and installed by its browser adapter",
    { reject: [{ text: 'const inspectorName = "__TEAR_GHOST_V3__";' }], accept: [] },
    { except: ["@tearbench.ghost-inspector-adapter"] },
  ),
  textRule(
    "progress.composition-owned-profile-writes",
    ["R42", "R43", "R44", "R62", "R63", "R64", "R65", "R66", "R67", "R68", "R69", "R70", "R71"],
    ["src/**"],
    /\bPROFILE\.(?:addStat|maxStat|save|markBiome|setPendingFinale|clearPendingFinale|pendingFinale)\(|\bPROFILE\.data\.(?:seen|weaponsWon|rewards|advDiffs)\b/u,
    "profile and achievement writes must use a composition-owned persistence adapter",
    {
      reject: [
        { text: 'd.PROFILE.addStat("touchOnboarded", 1);' },
        { text: "d.ACH.check(); d.PROFILE.save();" },
        { text: "d.PROFILE.data.seen[id] = true;" },
      ],
      accept: [{ text: 'd.profileStatsPersistence.add("touchOnboarded", 1);' }],
    },
    { except: ["@progress.direct-profile-writers"] },
  ),
];

const LIVE_ROOT_RULES = [
  liveRootStateRule(
    "app.live-root-automation-input",
    ["R17"],
    /\b(?:aiInput|lmbOverride|aimOverride)\b/u,
    "live composition must route automation input through the live authoritative input adapter",
    "player.aiInput = input;",
    "const input = adapter.read();",
  ),
  liveRootStateRule(
    "app.live-root-session-values",
    ["R45"],
    /\blet\s+(?:lastGhost|lastVaultId|overInfo|selMode|selDiff|selWeapon|selBoss)\b/u,
    "live world session values must use the explicit session-state owner",
    "let lastGhost = null;",
    "const production = createLiveProductionWorld(options);",
  ),
  liveRootStateRule(
    "app.live-root-transient-collections",
    ["R46"],
    /\blet\s+(?:floaters|slowZones|tempWalls)\b/u,
    "live transient combat collections must stay in world state",
    "let floaters = [];",
    "const floaters = hostState.floaters();",
  ),
  liveRootStateRule(
    "app.live-root-boss-cinematic",
    ["R47"],
    /\blet\s+(?:bossIntro|bossBeat)\b/u,
    "live boss cinematic state must stay in world state",
    "let bossIntro = null;",
    "const intro = hostState.bossIntro();",
  ),
  liveRootStateRule(
    "app.live-root-actors",
    ["R48"],
    /\blet\s+(?:enemies|projectiles)\b/u,
    "live actor collections must stay in world state",
    "let enemies = [];",
    "const actors = hostState.enemies();",
  ),
  liveRootStateRule(
    "app.live-root-run",
    ["R49"],
    /\blet\s+run\b/u,
    "live run state must stay in world state",
    "let run = {}; ",
    "const run = hostState.run();",
  ),
  liveRootStateRule(
    "app.live-root-blade",
    ["R50"],
    /\blet\s+blade\b/u,
    "live blade state must stay in world state",
    "let blade = {}; ",
    "const blade = hostState.blade();",
  ),
  liveRootStateRule(
    "app.live-root-player",
    ["R51"],
    /\blet\s+player\b/u,
    "live player state must stay in world state",
    "let player = {}; ",
    "const player = hostState.player();",
  ),
  liveRootStateRule(
    "app.live-root-shop-feedback",
    ["R52"],
    /\blet\s+(?:shopCoinShow|shopFlash)\b/u,
    "live shop feedback must use the typed presentation-state owner",
    "let shopCoinShow = null;",
    "const shopFeedback = createLiveShopFeedbackState();",
  ),
  liveRootStateRule(
    "app.live-root-hud-feedback",
    ["R53"],
    /\blet\s+(?:hudHpLag|hudMultPrev|hudMultPop)\b/u,
    "live HUD feedback must use the typed presentation-state owner",
    "let hudHpLag = 1;",
    "const hudFeedback = createLiveHudFeedbackState();",
  ),
  liveRootStateRule(
    "app.live-root-interface-interaction",
    ["R54"],
    /\b(?:let\s+(?:uiButtons|focus|listScroll)|const\s+hoverAnim)\b/u,
    "live interface interaction state must use the typed presentation-state owner",
    "let uiButtons = [];",
    "const interfaceInteraction = createLiveInterfaceInteractionState();",
  ),
  liveRootStateRule(
    "app.live-root-interface-frame",
    ["R55"],
    /\blet\s+(?:lastUiState|uiT|enterT|lastUiDt|eIn|uiZoom)\b/u,
    "live interface frame state must use the typed presentation-state owner",
    "let uiT = 0;",
    "const interfaceFrame = createLiveInterfaceFrameState(state);",
  ),
  liveRootStateRule(
    "app.live-root-revive-countdown",
    ["R56"],
    /\blet\s+continueT\b/u,
    "live revive countdown must use the typed outcome-state owner",
    "let continueT = 0;",
    "const reviveCountdown = createLiveReviveCountdownState();",
  ),
  liveRootStateRule(
    "app.live-root-run-seed",
    ["R58"],
    /\blet\s+tearBenchRunSeed\b/u,
    "TearBench run-seed overrides must use the typed world-session owner",
    "let tearBenchRunSeed = 27;",
    "const seed = session.takeRunSeed();",
  ),
  liveRootStateRule(
    "app.live-root-input-authority",
    ["R60"],
    /\blet\s+semanticInputAuthority\b/u,
    "live input authority must use the typed browser-input owner",
    "let semanticInputAuthority = true;",
    "const authority = createLiveInputAuthorityState(requestLock);",
  ),
  textRule(
    "world.music-direction-owner",
    ["R57"],
    ["src/**"],
    /\bnew\s+MusicDirector\b/u,
    "live music direction must be constructed by the world composition",
    {
      reject: [{ text: "const music = new MusicDirector(SFX);", file: "@app.live-runtime-root" }],
      accept: [{ text: "const world = createLiveProductionWorld({});" }],
    },
    { except: ["@app.music-direction-owner"] },
  ),
  textRule(
    "replay.ghost-recorder-session-owner",
    ["R59"],
    ["src/**"],
    /\b(?:let\s+ghostV3EventSequence|let\s+ghostV3ReplayContext|createBrowserGhostLiveRecorder\s*\()/u,
    "Ghost V3 recorder session state must use the typed live recording-session owner",
    {
      reject: [
        {
          text: "let ghostV3EventSequence = 0; createBrowserGhostLiveRecorder(factory);",
          file: "@app.live-runtime-root",
        },
      ],
      accept: [{ text: "const session = createLiveGhostRecordingSessionState(factory, {});" }],
    },
    { except: ["@replay.ghost-recorder-session-owners"] },
  ),
  textRule(
    "app.production-world-root",
    ["R61"],
    ["src/**"],
    /\b(?:createLiveWorldSessionState|createLiveWorldComposition)\b/u,
    "the live world session and composition must be constructed through the production-world root",
    {
      reject: [{ text: "const session = createLiveWorldSessionState();", file: "@app.live-runtime-root" }],
      accept: [{ text: "const production = createLiveProductionWorld(options);" }],
    },
    { except: ["@app.world-construction-owners"] },
  ),
];

const STRUCTURE_RULES = [
  Object.freeze({
    id: "structure.typescript-only",
    legacy: ["J1"],
    kind: "extension",
    in: ["src/**/*.js"],
    anticipatory: true,
    message: "production source must be strict TypeScript",
  }),
  // A module must still be small enough to review as one coherent subsystem. Size is
  // measured in formatting-independent line equivalents (the code budget's chars metric,
  // 25,300 chars = 700); a module over it passes only while the code budget baseline
  // records its size debt, which may only fall. The code budget supersedes this once its
  // recorded debt reaches zero.
  Object.freeze({
    id: "structure.module-line-limit",
    legacy: ["L1"],
    kind: "size",
    in: ["src/**/*.ts"],
    except: ["@size.authored-data-exceptions"],
    max: 700,
    message: "exceeds the 700-line subsystem boundary (formatting-independent line equivalents)",
  }),
  textRule(
    "structure.no-suppressions",
    ["X1"],
    ["src/**"],
    /@ts-ignore|@ts-nocheck|eslint-disable/u,
    "contains a forbidden suppression",
    {
      reject: [{ text: "// @ts-ignore" }, { text: "/* eslint-disable */" }],
      accept: [{ text: "// @ts-expect-error is reviewed elsewhere" }],
    },
  ),
  importRule(
    "engineering.lazy-channel",
    ["N1"],
    ["src/**"],
    ["@engineering.channel-entries"],
    "engineering-channel modules may only be loaded through a guarded dynamic import, never a static value import",
    {
      except: ["@engineering.channel-entries"],
      edges: "static-value",
      fixtures: {
        reject: [{ imports: "src/app/engineering/example-channel-entry", file: "@app.live-runtime-root" }],
        accept: [
          { imports: "src/app/engineering/example-channel-entry", type: true, file: "@app.live-runtime-root" },
          { dynamic: "src/app/engineering/example-channel-entry", file: "@app.live-runtime-root" },
        ],
      },
    },
  ),
];

export const RULES = Object.freeze([
  ...BIOME_RULES,
  ...PORTABLE_RULES,
  ...WORLD_INSTANCE_RULES,
  ...APP_BROWSER_RULES,
  ...LIVE_ROOT_RULES,
  ...STRUCTURE_RULES,
]);

/** Every selector a rule names, for fail-closed coverage. */
export function ruleSelectorUsages(rules = RULES) {
  return rules.map((rule) => ({
    where: `rule ${rule.id}`,
    selectors: [...(rule.anticipatory === true ? [] : rule.in), ...(rule.except ?? []), ...(rule.to ?? [])],
  }));
}
