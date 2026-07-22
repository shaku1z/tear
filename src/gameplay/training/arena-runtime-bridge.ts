import { createBossArena, type ArenaActor, type ArenaPlatform, type BossArenaRules } from "./arena-rules";

export interface BossArenaRuntimeDependencies<TEnemy extends ArenaActor = ArenaActor> {
  readonly rules: BossArenaRules;
  readonly viewportWidth: number; readonly viewportHeight: number; readonly groundY: number; readonly reformWarn: number;
  ring(x: number, y: number, radius: number, color: string): void;
  burst(x: number, y: number, dx: number, dy: number, count: number, color: string): void;
  bossEvent(owner: TEnemy, event: "platformBreak" | "platformRebuild", color: string, quiet: true): void;
  run(): { _arenaBroken?: ArenaPlatform[] | null } | null;
  platforms(): ArenaPlatform[];
  player(): ArenaActor | null;
  enemies(): readonly TEnemy[];
  lowGraphics(): boolean;
}

export interface BossArenaRuntimeBridge {
  create(bossId: string): ArenaPlatform[] | null;
  update(platforms: ArenaPlatform[], broken: ArenaPlatform[], dt: number, player: ArenaActor | null, enemies: readonly ArenaActor[], lowGraphics: boolean): void;
  updateLive(dt: number): void;
}

export function createBossArenaRuntimeBridge<TEnemy extends ArenaActor>(
  dependencies: BossArenaRuntimeDependencies<TEnemy>,
): BossArenaRuntimeBridge {
  return {
    create(bossId) {
      const authored = createBossArena(bossId, dependencies.viewportWidth, dependencies.viewportHeight, dependencies.groundY, dependencies.reformWarn);
      return authored ? authored.map((platform) => ({ ...platform })) : null;
    },
    update(platforms, broken, dt, player, enemies, lowGraphics) {
      const intents = dependencies.rules.update({ platforms, broken }, dt, player, enemies, lowGraphics);
      for (const intent of intents) {
        if (intent.type === "ring") dependencies.ring(intent.x, intent.y, intent.radius, intent.color);
        else if (intent.type === "burst") dependencies.burst(intent.x, intent.y, intent.dx, intent.dy, intent.count, intent.color);
        else {
          const owner = dependencies.enemies().find((enemy) => !enemy.dead && enemy.presentationId === intent.ownerId);
          if (owner) dependencies.bossEvent(owner, intent.event, intent.color, intent.quiet);
        }
      }
    },
    updateLive(dt) {
      const run = dependencies.run(); if (!run) return;
      const broken = run._arenaBroken ?? (run._arenaBroken = []);
      const intents = dependencies.rules.update({ platforms: dependencies.platforms(), broken }, dt,
        dependencies.player(), dependencies.enemies(), dependencies.lowGraphics());
      for (const intent of intents) {
        if (intent.type === "ring") dependencies.ring(intent.x, intent.y, intent.radius, intent.color);
        else if (intent.type === "burst") dependencies.burst(intent.x, intent.y, intent.dx, intent.dy, intent.count, intent.color);
        else {
          const owner = dependencies.enemies().find((enemy) => !enemy.dead && enemy.presentationId === intent.ownerId);
          if (owner) dependencies.bossEvent(owner, intent.event, intent.color, intent.quiet);
        }
      }
    },
  };
}
