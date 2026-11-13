import type { GameEnemy, GameRun } from "../shell/game-runtime-state";
import type { LiveDebugHarnessContext } from "./debug-harness";

/** Debug-harness services the performance fixtures reuse instead of re-implementing. */
export interface DebugPerformanceScenarioServices {
  readonly run: () => GameRun;
  readonly prepareCurrentGameplay: () => void;
  /** Ends the current wave and leaves the lifecycle where the next wave may be prepared. */
  readonly retireWave: () => void;
}

/**
 * Bounded browser performance fixtures. Each one composes its workload through
 * the production entity factory, wave planner and environment bindings; none
 * writes an authored result directly.
 */
export function createDebugPerformanceScenarios(context: LiveDebugHarnessContext, services: DebugPerformanceScenarioServices) {
  const d = context.dependencies;
  const performanceEnvironmentSnapshot = () => {
    if (context.environment === undefined) throw new Error("Performance environment diagnostics are unavailable");
    const fields = context.environment.fields();
    const combatObjects = context.environment.combatObjects();
    const routes = context.environment.routes();
    const kinds: Record<string, number> = {};
    for (const entry of [...fields, ...combatObjects, ...routes]) {
      const key = `${entry.kind}:${entry.state}`;
      kinds[key] = (kinds[key] ?? 0) + 1;
    }
    return Object.freeze({ fields: fields.length, combatObjects: combatObjects.length, routes: routes.length,
      kinds: Object.freeze(kinds) });
  };
  return {
    performanceEnvironmentSnapshot,
    /** Bounded performance fixture composed through the production entity factory and live environment bindings. */
    prepareVerdantPerformanceScenario() {
      services.prepareCurrentGameplay();
      const run = services.run();
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
    /** Bounded PT3-C11 workload composed through the production boss, enemy, variant, and environment paths. */
    preparePalePerformanceScenario() {
      services.prepareCurrentGameplay();
      const run = services.run();
      const player = context.state.player();
      const boss = context.state.enemies().find((enemy) => enemy.isBoss && enemy.bossId === "white-hart" && !enemy.dead);
      if (player === undefined || boss === undefined) throw new Error("Pale performance requires the live White Hart encounter");
      const phase = (boss as GameEnemy & { readonly phase?: number }).phase;
      if (phase !== 2) throw new Error(`Pale performance requires White Hart phase two, received ${String(phase)}`);
      if (context.spawnExplicitVariant === undefined) throw new Error("Pale performance requires the explicit production variant seam");
      const groundY = d.CONFIG.world.groundY;
      const hounds = [430, 620].map((x) => context.entities.createEnemy("rimehound", x, groundY - 17, run));
      for (const hound of hounds) Object.assign(hound, {
        vx: 0, vy: 0, onGround: true, spawnT: 0, stun: 0, hitCd: 0, aliveT: 0,
        atk: "flank", atkT: 0, atkCd: 0, canClimb: false, climber: false,
        variant: "", variantName: "", affixes: [], affixCount: 0,
      });
      context.state.setEnemies([boss, ...hounds]);
      for (const [kind, variantId] of [
        ["charger", "rime-runner"], ["ranged", "prism-seer"], ["flyer", "snowfall-kite"],
        ["bomber", "hailcaster"], ["armored", "glacier-guard"],
      ] as const) context.spawnExplicitVariant(kind, variantId);
      for (const enemy of context.state.enemies()) {
        Object.assign(enemy, { spawnT: 0, stun: 0, hitCd: 0, aliveT: 0 });
        enemy.hp = Math.max(enemy.hp, 1_000);
        enemy.hpDisplay = enemy.hp;
      }
      player.hp = Math.max(player.hp, 1_000);
      context.state.setProjectiles([]);
    },
    /**
     * Replaces the current Endless wave with the authored composition of `wave`
     * through the production wave planner, so dense mid-run waves can be
     * measured without playing through the earlier ones.
     */
    prepareWaveCompositionScenario(wave: number) {
      const run = services.run();
      if (run.mode !== "endless") throw new Error(`Wave composition requires an Endless run, received ${run.mode}`);
      if (!Number.isSafeInteger(wave) || wave < 2) throw new RangeError("Wave composition requires a later authored wave");
      if (context.startNextWave === undefined) throw new Error("Wave composition requires the live wave controller");
      services.prepareCurrentGameplay();
      services.retireWave();
      run.spawnQueue.length = 0;
      context.state.setEnemies([]);
      context.state.setProjectiles([]);
      run.wave = wave - 1;
      context.startNextWave();
      const player = context.state.player();
      if (player !== undefined) player.hp = Math.max(player.hp, 1_000);
    },
  };
}
