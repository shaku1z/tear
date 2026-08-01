import { BossArenaRules } from "../gameplay/training/arena-rules";
import { createBossArenaRuntimeBridge } from "../gameplay/training/arena-runtime-bridge";
import { planBossPlacement } from "../gameplay/run/boss-placement";
import { createLiveContentHost } from "./live-content-host";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameEnemy, GamePlayer, GameRun } from "./game-runtime-state";
import type { LiveGameHostState } from "./live-game-host-state";
import type { LiveWorldEntityConstructionPort } from "./live-world-entity-factory";
import type { LiveWorldServices } from "./live-world-context";
import type { createLiveCampaignHost } from "./live-campaign-host";

type CampaignStage = ReturnType<typeof createLiveCampaignHost>["stage"];

export interface LiveContentCompositionOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly entities: LiveWorldEntityConstructionPort;
  readonly state: LiveGameHostState;
  readonly worldServices: Pick<LiveWorldServices, "random">;
  readonly stage: CampaignStage;
  readonly width: number;
  readonly height: number;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly enemies: () => GameEnemy[];
  readonly actorId: (enemy: GameEnemy) => string;
  readonly wipeRemainingSeconds: () => number;
  readonly setBossIntro: (enemy: GameEnemy, duration: number, delay: number) => void;
  readonly clearBossBeat: () => void;
  readonly clearBanner: () => void;
}

/** Owns boss-arena effects and enemy construction as one content composition boundary. */
export function createLiveContentComposition(options: LiveContentCompositionOptions) {
  const d = options.dependencies;
  const arenaRules = new BossArenaRules(d.CONFIG.bossArena, d.CONFIG.colors);
  const arena = createBossArenaRuntimeBridge({
    rules: arenaRules,
    viewportWidth: options.width,
    viewportHeight: options.height,
    groundY: d.CONFIG.world.groundY,
    reformWarn: d.CONFIG.bossArena.reformWarn,
    ring: (x, y, radius, color) => { d.FX.ring(x, y, radius, color); },
    burst: (x, y, dx, dy, count, color) => { d.FX.burst(x, y, dx, dy, count, color); },
    bossEvent: (owner, event, color, quiet) => {
      d.BOSSFX.event(owner, event, { color, quiet });
    },
    run: options.run,
    platforms: () => options.stage.platforms,
    player: options.player,
    enemies: options.enemies,
    lowGraphics: () => d.GFX.low,
  });
  const content = createLiveContentHost<GameEnemy>({
    width: options.width,
    groundY: d.CONFIG.world.groundY,
    random: options.worldServices.random.stream("spawn"),
    run: options.run,
    modes: () => d.CONFIG.modes,
    stages: d.STAGES,
    stageIndex: () => options.stage.index,
    platforms: () => options.stage.platforms,
    setPlatforms: (value) => { options.stage.platforms = value; },
    createGround: (kind) => options.entities.createEnemy(kind, 0, 0, options.run()),
    createAir: (kind, x, y) => options.entities.createEnemy(kind, x, y, options.run()),
    createSupport: (kind) => options.entities.createEnemy(kind, 0, 0, options.run()),
    createDefaultBoss: () => {
      const placement = planBossPlacement("", options.width, d.CONFIG);
      return options.entities.createEnemy(placement.factoryId, placement.x, placement.y, options.run());
    },
    createBoss(id) {
      // Spawn placement is canonical world state, so it is shared rather than
      // restated: a detached, replay, or headless world must place bosses
      // identically or its trace diverges on the first boss tick.
      const placement = planBossPlacement(id, options.width, d.CONFIG);
      return options.entities.createEnemy(placement.factoryId, placement.x, placement.y, options.run());
    },
    applyPreset: (enemy, preset) => { d.applyPreset(enemy, preset); },
    rollVariant: (kind, wave) => d.rollVariant(kind, wave, options.worldServices.random.stream("spawn")),
    applyVariant: (enemy, variant) => { d.applyVariant(enemy, variant); },
    rollAffixes: (enemy, wave) => { d.rollAffixes(enemy, wave, options.worldServices.random.stream("spawn")); },
    arrivalEffect(enemy, boss) {
      d.FX.ring(enemy.x, enemy.y, 10, enemy.color);
      if (boss && !d.GFX.low) {
        d.FX.ring(enemy.x, enemy.y, 22, enemy.color);
        d.FX.burst(enemy.x, enemy.y, 0, -1, 10, enemy.color);
      }
    },
    recordSpawn: (enemy, role, detail) => {
      d.GAMEPLAY_EVENTS.emit({
        kind: "spawn", actorId: options.actorId(enemy), actorKind: role, x: enemy.x, y: enemy.y,
        variantName: detail.vn, bossId: detail.b,
      });
    },
    install: (enemy) => { options.enemies().push(enemy); },
    startClipper: () => { d.Clipper?.start(); },
    bossIntroDuration: d.CONFIG.bossTheater.introDur,
    wipeRemainingSeconds: options.wipeRemainingSeconds,
    setBossIntro: options.setBossIntro,
    clearBossBeat: options.clearBossBeat,
    clearBanners: options.clearBanner,
    bossArena: (id) => arena.create(id),
  });
  return Object.freeze({ ...content, updateBossArenaPlatforms: (deltaSeconds: number) => { arena.updateLive(deltaSeconds); } });
}
