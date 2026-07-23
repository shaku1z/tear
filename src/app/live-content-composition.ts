import { BossArenaRules } from "../gameplay/training/arena-rules";
import { createBossArenaRuntimeBridge } from "../gameplay/training/arena-runtime-bridge";
import { createLiveContentHost } from "./live-content-host";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameEnemy, GamePlayer, GameRun } from "./game-runtime-state";
import type { LiveGameHostState } from "./live-game-host-state";
import type { createLiveCampaignHost } from "./live-campaign-host";

type CampaignStage = ReturnType<typeof createLiveCampaignHost>["stage"];

function isGameEnemy(value: object): value is GameEnemy {
  return "cfg" in value && "hit" in value && typeof value.hit === "function" &&
    "update" in value && typeof value.update === "function" &&
    "x" in value && typeof value.x === "number" && "y" in value && typeof value.y === "number" &&
    "hp" in value && typeof value.hp === "number" && "maxHp" in value && typeof value.maxHp === "number";
}

function requireGameEnemy(value: object): GameEnemy {
  if (!isGameEnemy(value)) throw new TypeError("Content factory produced an invalid live enemy");
  return value;
}

export interface LiveContentCompositionOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly state: LiveGameHostState;
  readonly stage: CampaignStage;
  readonly width: number;
  readonly height: number;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly enemies: () => GameEnemy[];
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
    random: d.GAME_RANDOM_STREAMS.stream("spawn"),
    run: options.run,
    modes: () => d.CONFIG.modes,
    stages: d.STAGES,
    stageIndex: () => options.stage.index,
    platforms: () => options.stage.platforms,
    setPlatforms: (value) => { options.stage.platforms = value; },
    createGround(kind) {
      if (kind === "ranged") return new d.Ranged(0, 0);
      if (kind === "bomber") return new d.Bomber(0, 0);
      if (kind === "armored") return new d.Armored(0, 0);
      if (kind === "chimera") return new d.Chimera(0, 0);
      return new d.Charger(0, 0);
    },
    createAir: (kind, x, y) => kind === "flyer" ? new d.Flyer(x, y) : new d.Wraith(x, y),
    createSupport: (kind) => new d.Support(0, 0, kind),
    createDefaultBoss: () => new d.Boss(options.width / 2, d.CONFIG.world.groundY - 140),
    createBoss(id) {
      if (id === "source") return requireGameEnemy(new d.Source(options.width / 2, d.CONFIG.world.groundY - 300));
      if (id === "echo") return requireGameEnemy(new d.MirrorHost(options.width / 2, d.CONFIG.world.groundY - d.CONFIG.echo.h / 2, options.run().mods));
      if (id === "aldric") return requireGameEnemy(new d.Aldric(options.width / 2, d.CONFIG.world.groundY - d.CONFIG.aldric.h / 2));
      if (id === "colossus") return requireGameEnemy(new d.Colossus(options.width / 2, d.CONFIG.world.groundY - d.CONFIG.colossus.h / 2));
      if (id === "warden") return requireGameEnemy(new d.Warden(options.width / 2, d.CONFIG.world.groundY - 140));
      return requireGameEnemy(new d.Boss(options.width / 2, d.CONFIG.world.groundY - 140));
    },
    applyPreset: (enemy, preset) => { d.applyPreset(enemy, preset); },
    rollVariant: (kind, wave) => d.rollVariant(kind, wave, d.GAME_RANDOM_STREAMS.stream("spawn")),
    applyVariant: (enemy, variant) => { d.applyVariant(enemy, variant); },
    rollAffixes: (enemy, wave) => { d.rollAffixes(enemy, wave, d.GAME_RANDOM_STREAMS.stream("spawn")); },
    arrivalEffect(enemy, boss) {
      d.FX.ring(enemy.x, enemy.y, 10, enemy.color);
      if (boss && !d.GFX.low) {
        d.FX.ring(enemy.x, enemy.y, 22, enemy.color);
        d.FX.burst(enemy.x, enemy.y, 0, -1, 10, enemy.color);
      }
    },
    recordSpawn: (enemy, role, detail) => { d.GHOST.spawn(enemy, role, detail); },
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
