import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameEnemy, GameRun } from "./game-runtime-state";
import type { LiveGameHostState } from "./live-game-host-state";
import type { LiveWorldEntityConstructionPort } from "./live-world-entity-factory";
import type { RunDifficulty, RunMode } from "../gameplay/run/session";
import type { BossId } from "../gameplay/run/content-director";
import type { RunPhase } from "../gameplay/run/lifecycle";
import { eligibleTierChoices } from "../gameplay/run/reward-selection";
import type { UpgradeDefinition } from "../gameplay/upgrades";
import type { LegacyAppScreen, LegacyTransitionContext } from "./legacy-state-controller";

export interface DebugLifecycle {
  readonly phase: RunPhase;
  activateWave(): void;
  clearWave(): void;
  prepareReward(reward: "draft" | "boss"): void;
  terminate(outcome: "defeat" | "victory"): void;
}
interface DebugCinema { active: boolean; beat: unknown; cancel(reason: string): void; requestSkip(): void; advance(): void }
interface DebugStage { index: number; current: unknown; platforms: unknown[] }
type ExplicitVariantKind = "charger" | "ranged" | "flyer" | "armored";

export interface LiveDebugHarnessContext {
  readonly enabled: boolean;
  readonly dependencies: GameRuntimeDependencies;
  readonly entities: LiveWorldEntityConstructionPort;
  readonly state: LiveGameHostState;
  readonly lifecycle: DebugLifecycle;
  readonly cinema: DebugCinema;
  readonly stage: DebugStage;
  readonly width: number;
  readonly height: number;
  readonly spawnExplicitVariant?: (kind: ExplicitVariantKind, variantId: string) => void;
  readonly startRun: (mode: RunMode, difficulty: RunDifficulty) => void;
  readonly selectBoss: (boss: BossId) => void;
  readonly setScreen: (screen: LegacyAppScreen, detail?: LegacyTransitionContext) => void;
  readonly setContinueSeconds: (value: number) => void;
  readonly screen: () => string;
  readonly openDraft: () => void;
  readonly openTier: (choices: readonly UpgradeDefinition[]) => void;
  readonly applyUpgrade: (upgrade: GameRuntimeDependencies["UPGRADES"][number]) => void;
  readonly enterReplay: (record: object, from: "menu") => void;
  readonly beginRename: () => void;
  readonly applyOptions: (options: object) => void;
  readonly startFinale: (death: { x: number; y: number }, recovered: boolean) => void;
  readonly severFinale: () => unknown;
  readonly selectSettingsTab: (tab: string) => void;
  readonly auditEffects: () => object;
  readonly snapshot: () => object;
  readonly tutorialSnapshot: () => object;
  readonly stopRecording: () => void;
  readonly install: (api: object) => void;
}

function runOf(state: LiveGameHostState): GameRun {
  const run = state.run();
  if (run === null) throw new Error("Debug harness requires an active run");
  return run;
}

export function clearPreparedOrActiveDebugWave(lifecycle: DebugLifecycle): void {
  if (lifecycle.phase === "wave-prepared") lifecycle.activateWave();
  if (lifecycle.phase !== "wave-active") {
    throw new Error(`Debug journey requires an active or prepared wave, received ${lifecycle.phase}`);
  }
  lifecycle.clearWave();
}

/** Installs the browser-journey control surface without leaking it into production. */
export function installLiveDebugHarness(context: LiveDebugHarnessContext): void {
  if (!context.enabled) return;
  const d = context.dependencies;
  const clearCombat = (): void => { context.state.setEnemies([]); context.state.setProjectiles([]); };
  const prepareCurrentGameplay = (): void => {
    if (context.cinema.active) context.cinema.cancel("tearbench-current-gameplay");
    const player = context.state.player();
    if (player === undefined) throw new Error("Current gameplay scenario requires a live player");
    Object.assign(player, { y: d.CONFIG.world.groundY - player.hh, vy: 0, onGround: true });
  };
  context.install(Object.freeze({
    startMode(mode?: RunMode, difficulty?: RunDifficulty) { context.startRun(mode ?? "endless", difficulty ?? "normal"); },
    prepareCurrentGameplayScenario: prepareCurrentGameplay,
    prepareVariantSelectionScenario(kind: ExplicitVariantKind, variantId: string) {
      const run = runOf(context.state);
      if (run.mode !== "playground" && run.mode !== "sandbox") throw new Error("explicit variant selection is limited to Playground/Enemy Test");
      if (context.spawnExplicitVariant === undefined) throw new Error("explicit variant training port is unavailable");
      if (!(context.dependencies.VARIANTS[kind] ?? []).some((variant) => variant.id === variantId)) {
        throw new RangeError(`unknown variant ${variantId} for ${kind}`);
      }
      clearCombat(); context.spawnExplicitVariant(kind, variantId);
    },
    prepareNaturalWaveClearScenario() {
      prepareCurrentGameplay();
      const run = runOf(context.state);
      if (context.lifecycle.phase === "wave-prepared") context.lifecycle.activateWave();
      if (context.lifecycle.phase !== "wave-active") {
        throw new Error(`Current wave-clear scenario requires an active wave, received ${context.lifecycle.phase}`);
      }
      run.spawnQueue.length = 0;
      context.state.setEnemies([]);
    },
    /** Adds a real live actor without a wave-spawn fact so ownership projection can prove it stays unrelated. */
    addUnownedWaveObserverActor() {
      if (context.lifecycle.phase !== "wave-active") {
        throw new Error(`Unowned wave observer requires an active live wave, received ${context.lifecycle.phase}`);
      }
      const actor = context.entities.createEnemy("charger", context.width - 180,
        d.CONFIG.world.groundY - d.CONFIG.enemy.h / 2, runOf(context.state));
      Object.assign(actor, { vx: 0, vy: 0, onGround: true, spawnT: 0, stun: 30, hitCd: 0, aliveT: 0,
        behavior: "bull", atk: "idle", atkT: 0, atkCd: 30, canClimb: false, climber: false,
        variant: "", variantName: "", affixes: [], affixCount: 0 });
      context.state.setEnemies([...context.state.enemies(), actor]);
    },
    prepareBossSupportScenario(id: "aldric" | "echo") {
      if (context.cinema.active) context.cinema.cancel("tearbench-current-boss-support");
      const boss = context.state.enemies().find((enemy) => enemy.isBoss && enemy.bossId === id);
      if (boss === undefined) throw new Error(`Current boss support requires its actual ${id} encounter`);
      Object.assign(boss, { spawnT: 0, introT: 0,
        ...(id === "echo" ? { _live: true, spawnClone: true } : { spawnAdds: true }) });
    },
    /** Bounded performance fixture composed through the production entity factory and live environment bindings. */
    prepareVerdantPerformanceScenario() {
      prepareCurrentGameplay();
      const run = runOf(context.state);
      const player = context.state.player();
      const boss = context.state.enemies().find((enemy) => enemy.isBoss && enemy.bossId === "rootbound" && !enemy.dead);
      if (player === undefined || boss === undefined) throw new Error("Verdant performance requires the live Rootbound encounter");
      const phase = (boss as GameEnemy & { readonly phase?: number }).phase;
      if (phase !== 2) throw new Error(`Verdant performance requires Rootbound phase two, received ${String(phase)}`);
      const groundY = d.CONFIG.world.groundY;
      const additions = [
        context.entities.createEnemy("rootbinder", 520, groundY - d.CONFIG.rootbinder.h / 2, run),
        context.entities.createEnemy("charger", 760, groundY - d.CONFIG.enemy.h / 2, run),
        context.entities.createEnemy("ranged", 940, groundY - d.CONFIG.ranged.h / 2, run),
      ];
      for (const enemy of additions) Object.assign(enemy, { spawnT: 0, stun: 0, hitCd: 0, aliveT: 0 });
      player.hp = Math.max(player.hp, 1_000);
      context.state.setEnemies([boss, ...additions]);
      context.state.setProjectiles([]);
    },
    /** Exact-tick parity fixture: author one Charger after the run exists, before its next step. */
    prepareEnemyParityScenario() {
      const player = context.state.player();
      if (player === undefined) throw new Error("Enemy parity scenario requires a live player");
      player.x = context.width / 2; player.y = d.CONFIG.world.groundY - player.hh;
      player.vx = 0; player.vy = 0; player.onGround = true;
      const enemy = context.entities.createEnemy("charger", context.width / 2 + 300,
        d.CONFIG.world.groundY - d.CONFIG.enemy.h / 2, runOf(context.state));
      Object.assign(enemy, {
        vx: 0, vy: 0, onGround: true, spawnT: 0, stun: 0, hitCd: 0, aliveT: 0,
        behavior: "bull", atk: "windup", atkT: 0.3, atkMax: 0.3, atkDir: -1,
        atkCd: 0, chargePower: 0.5, chargeMult: 1, canClimb: false, climber: false,
        variant: "", variantName: "", affixes: [], affixCount: 0,
      });
      context.state.setEnemies([enemy]);
      context.state.setProjectiles([]);
    },
    /** Exact-tick parity fixture: enter the real Ranged telegraph, fire, and kite loop. */
    prepareRangedParityScenario() {
      const player = context.state.player();
      if (player === undefined) throw new Error("Ranged parity scenario requires a live player");
      Object.assign(player, { x: 450, y: d.CONFIG.world.groundY - player.hh,
        vx: 0, vy: 0, onGround: true });
      const enemy = context.entities.createEnemy("ranged", 1150, d.CONFIG.world.groundY - d.CONFIG.ranged.h / 2,
        runOf(context.state)) as
        GameEnemy & { state: string; aimTimer: number; windT: number; windMax: number };
      Object.assign(enemy, {
        vx: 0, vy: 0, onGround: true, spawnT: 0, stun: 0, hitCd: 0, aliveT: 0,
        behavior: "", state: "kite", aimTimer: 0.05, windT: 0, windMax: 0,
        fireRateMult: 1, auraHaste: 1, auraDmg: 1, volley: 1,
        canClimb: false, climber: false, variant: "", variantName: "", affixes: [], affixCount: 0,
      });
      context.state.setEnemies([enemy]);
      context.state.setProjectiles([]);
    },
    /** Exact-tick parity fixture: cross one hostile shot with a real high-speed held tip. */
    prepareProjectileParryScenario() {
      const player = context.state.player(), blade = context.state.blade(), run = runOf(context.state);
      if (player === undefined || blade === undefined) throw new Error("Parry parity scenario requires a live player and blade");
      const owner = context.entities.createEnemy("ranged", 1500, d.CONFIG.world.groundY - d.CONFIG.ranged.h / 2, run);
      Object.assign(owner, {
        vx: 0, vy: 0, onGround: true, spawnT: 0, stun: 9, hitCd: 0, aliveT: 0,
        behavior: "", state: "kite", aimTimer: 9, windT: 0, windMax: 0,
        canClimb: false, climber: false, variant: "", variantName: "", affixes: [], affixCount: 0,
      });
      const actualTipX = blade.tipX, actualTipY = blade.tipY;
      const shot = context.entities.createProjectile(blade.x + (actualTipX - blade.x) * 0.62,
        blade.y + (actualTipY - blade.y) * 0.62, -800, 0);
      shot.r = 18; shot.owner = owner; shot.sourceEnemy = owner; shot.dmg = d.CONFIG.proj.dmg;
      Object.assign(blade, { state: "held", vx: 0, vy: 0,
        tipX: actualTipX - 28, tipY: actualTipY, prevTipX: actualTipX - 28, prevTipY: actualTipY });
      run.mods.parryGuard = true; run.weaponStats.perfectParries = 0; player.guardT = 0;
      context.state.setEnemies([owner]);
      context.state.setProjectiles([shot]);
    },
    /** Exact-tick parity fixture: attach THE ECHO and observe deterministic neutral pursuit. */
    prepareMirrorPursuitScenario() {
      const player = context.state.player(), run = runOf(context.state);
      if (player === undefined) throw new Error("Mirror parity scenario requires a live player");
      Object.assign(player, { x: 350, y: d.CONFIG.world.groundY - player.hh,
        vx: 0, vy: 0, onGround: true, lastTrickT: 0, lastTrickKind: "" });
      d.Mirror.active = false; d.Mirror.host = null; d.Mirror.fxq.length = 0;
      const host = context.entities.createEnemy("echo", 1200, d.CONFIG.world.groundY - d.CONFIG.echo.h / 2, run) as
        unknown as GameEnemy & { _live: boolean };
      Object.assign(host, {
        bossId: "echo", presentationId: "echo", _live: true,
        vx: 0, vy: 0, onGround: true, spawnT: 0, introT: 0,
        stun: 0, hitCd: 0, aliveT: 0, variant: "", variantName: "", affixes: [], affixCount: 0,
      });
      context.state.setEnemies([host]);
      context.state.setProjectiles([]);
    },
    /** Exact-tick parity fixture: drive a real held strike through damage, kill, and cleanup. */
    prepareCombatParityScenario() {
      const player = context.state.player(), blade = context.state.blade(), run = runOf(context.state);
      if (player === undefined || blade === undefined) throw new Error("Combat parity scenario requires a live player and blade");
      const dx = blade.tipX - blade.x, dy = blade.tipY - blade.y;
      const survivor = context.entities.createEnemy("charger", blade.x + dx * 0.48, blade.y + dy * 0.48, run);
      const victim = context.entities.createEnemy("charger", blade.x + dx * 0.78, blade.y + dy * 0.78, run);
      for (const enemy of [survivor, victim]) Object.assign(enemy, {
        vx: 0, vy: 0, onGround: false, spawnT: 0, stun: 0.75, hitCd: 0, aliveT: 0,
        behavior: "bull", atk: "idle", atkT: 0, atkCd: 9, canClimb: false, climber: false,
        variant: "", variantName: "", affixes: [], affixCount: 0,
      });
      victim.hp = 1; victim.hpDisplay = 1;
      Object.assign(blade, { state: "held", vx: 1800, vy: 0 });
      context.state.setEnemies([survivor, victim]);
      context.state.setProjectiles([]);
    },
    /** Journey-only: drop the live boss to a health fraction so phase gates are reachable. */
    setBossHealthFraction(fraction: number) {
      const boss = context.state.enemies().find((enemy) => enemy.isBoss && !enemy.dead);
      if (boss === undefined) throw new Error("No live boss to damage");
      boss.hp = Math.max(1, Math.round(boss.maxHp * fraction));
      boss.hpDisplay = boss.hp;
    },
    /** Journey-only: enter the normal player-death/outcome path on the next simulation tail. */
    defeatPlayer() {
      const player = context.state.player();
      if (player === undefined) throw new Error("No live player to defeat");
      player.hp = 0;
    },
    startBoss(boss: BossId, difficulty?: RunDifficulty) {
      context.selectBoss(boss); context.startRun("bossonly", difficulty ?? "normal");
    },
    bossStage(boss: BossId) {
      const authored = d.STAGES.find((stage) => stage.boss === boss);
      if (authored === undefined) throw new Error(`No authored stage exists for boss ${boss}`);
      const current = context.stage.current;
      const currentId: unknown = typeof current === "object" && current !== null
        ? Reflect.get(current, "id") : undefined;
      return Object.freeze({
        currentId: typeof currentId === "string" ? currentId : null,
        currentIndex: context.stage.index,
        authoredId: authored.id,
        authoredIndex: d.STAGES.indexOf(authored),
      });
    },
    openDraft(options?: { expanded?: boolean; rerolls?: number; reserve?: boolean; preserveRun?: boolean }) {
      const selected = { expanded: true, rerolls: 2, reserve: true, ...options };
      if (selected.preserveRun !== true) context.startRun("endless", "normal");
      const run = runOf(context.state); run.wave = Math.max(1, run.wave); run.spawnQueue.length = 0; context.state.setEnemies([]);
      clearPreparedOrActiveDebugWave(context.lifecycle); context.lifecycle.prepareReward("draft");
      run.mods.expandedDraft = selected.expanded; run.mods.draftRerolls = Math.max(0, selected.rerolls | 0);
      run.mods.reservePick = selected.reserve; context.openDraft(); document.exitPointerLock();
    },
    openTierUp() {
      context.startRun("endless", "normal");
      const run = runOf(context.state); run.wave = Math.max(1, run.wave); run.spawnQueue.length = 0; context.state.setEnemies([]);
      clearPreparedOrActiveDebugWave(context.lifecycle); context.lifecycle.prepareReward("boss");
      for (const upgrade of d.UPGRADES.filter((candidate) => candidate.tiers != null).slice(0, 4)) context.applyUpgrade(upgrade);
      context.openTier(eligibleTierChoices(d.UPGRADES, run.mods.owned, run.mods.tier)); document.exitPointerLock();
    },
    advanceAgentJourney(kind: "draft" | "tier") {
      const run = runOf(context.state);
      run.spawnQueue.length = 0;
      clearCombat();
      clearPreparedOrActiveDebugWave(context.lifecycle);
      if (kind === "draft") {
        context.lifecycle.prepareReward("draft");
        run.mods.expandedDraft = false;
        run.mods.reservePick = false;
        run.mods.draftRerolls = 0;
        context.openDraft();
      } else {
        run.wave = Math.max(10, run.wave);
        context.lifecycle.prepareReward("boss");
        for (const upgrade of d.UPGRADES.filter((candidate) => candidate.tiers != null).slice(0, 4)) {
          context.applyUpgrade(upgrade);
        }
        context.openTier(eligibleTierChoices(d.UPGRADES, run.mods.owned, run.mods.tier));
      }
      document.exitPointerLock();
    },
    openTerminal(kind: "campaignWin" | "win" | "continue" | "gameover") {
      const campaign = kind === "campaignWin"; context.startRun(campaign ? "campaign" : "endless", "normal");
      if (context.cinema.active) context.cinema.cancel("debug-terminal");
      const run = runOf(context.state); run.wave = campaign ? d.STAGES.length * 10 : 8; run.score = 12345; run.runTime = 96;
      run.spawnQueue.length = 0; context.state.setEnemies([]); context.state.setLastRecording(null); context.state.setWinSeconds(campaign ? 1 : 0);
      run.waveLog = [{ wave: 1, time: 12.5, kills: 5, peak: 2 }];
      context.state.setOutcome({ wave: run.wave, score: run.score, time: run.runTime, log: run.waveLog.slice(),
        best: { wave: run.wave, score: run.score, time: run.runTime }, isNew: true,
        ...(kind === "win" || campaign ? { win: true as const } : {}), campaign,
        earned: 120, coins: d.META.coins(), diff: run.diff });
      if (kind === "continue") { context.setContinueSeconds(1e9); context.setScreen("continue"); }
      else { context.lifecycle.terminate(kind === "gameover" ? "defeat" : "victory"); context.setScreen(kind === "gameover" ? "gameover" : "win"); }
      document.exitPointerLock();
    },
    openReplay() {
      const count = 96;
      const px = Array.from({ length: count }, (_, index) => 300 + index * 8);
      const py = Array.from({ length: count }, (_, index) => 680 - Math.round(Math.sin(index / 8) * 70));
      const tx = px.map((x, index) => x + 70 + Math.round(Math.cos(index / 6) * 20));
      const ty = py.map((y, index) => y - 20 + Math.round(Math.sin(index / 6) * 20));
      context.enterReplay({ v: 2, dt: 0.1, edt: 0.25, px, py, tx, ty, fc: px.map(() => 1),
        stages: [{ t: 0, s: 0 }, { t: 4.5, s: 1 }], waves: [{ t: 0, w: 1, e: "start" }, { t: 3, w: 1, e: "clear" }, { t: 4.5, w: 2, e: "boss" }],
        spawns: [], esamp: [], deaths: [], events: [],
        // Oracle-published ghosts use the final summary form instead of timed picks.
        loadout: [{ id: "tempo", tier: 3, n: 1 }, { id: "reach", tier: 1, n: 2 }], thumb: null,
        mode: "endless", diff: "normal", name: "Journey Tester", wave: 2, score: 1234, won: true }, "menu");
    },
    openRename() { if (context.screen() !== "menu") context.setScreen("menu"); context.setScreen("profile"); context.beginRename(); },
    setOptions(options?: object) { context.applyOptions(options ?? {}); },
    startFinale() {
      context.startRun("campaign", "normal"); if (context.cinema.active) context.cinema.cancel("debug-final-cut");
      const run = runOf(context.state); run.wave = d.STAGES.length * 10; run.score = 12345; run.runTime = 612; run.spawnQueue.length = 0;
      run._victoryPrepared = { isNew: true, earned: 321, coins: d.META.coins() };
      context.stage.index = d.STAGES.length - 1; context.stage.current = d.stageAt(context.stage.index);
      context.stage.platforms = d.stagePlatforms(context.stage.index, d.CONFIG); clearCombat(); context.stopRecording();
      context.startFinale({ x: context.width / 2, y: context.height * 0.4 }, true);
    },
    cut: context.severFinale, skip() { context.cinema.requestSkip(); },
    advance() { if (context.cinema.active && context.cinema.beat) context.cinema.advance(); },
    pause() { if (context.screen() === "playing") context.setScreen("paused"); },
    resume() { if (context.screen() === "paused") context.setScreen("playing"); },
    openSettings(tab?: string) { if (context.screen() !== "menu") context.setScreen("menu"); context.setScreen("settings", { returnTo: "menu" }); if (tab) context.selectSettingsTab(tab); },
    auditEffects: context.auditEffects, tutorial: context.tutorialSnapshot, state: context.snapshot,
  }));
}
