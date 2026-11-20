import { ENEMY_IDENTITY_IDS } from "../run/content-director";
import { anyKeyIn } from "../../domain/keyboard-bindings";

/** Menu projection of the canonical enemy identity authority. */
export const PLAYGROUND_ALL_KINDS = ENEMY_IDENTITY_IDS;

export type PlaygroundEnemyKind = (typeof PLAYGROUND_ALL_KINDS)[number];

export interface PlaygroundState {
  god: boolean;
  freeze: boolean;
  slow: boolean;
  hpMultiplier: number;
  count: number;
  arena: number;
  labFilter: string;
}

export interface PlaygroundDifficulty {
  readonly id: string;
  readonly label: string;
  readonly oneHit?: boolean;
  readonly mods?: Readonly<{ dmg?: number; hp?: number; count?: number; coin?: number; score?: number }>;
}

export interface PlaygroundPlayerSnapshot {
  readonly x: number;
  readonly y: number;
  readonly facing: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly oneHit: boolean;
}

export interface PlaygroundEnemySnapshot {
  readonly id: string;
  readonly dead: boolean;
  readonly tutorialDummy: boolean;
  readonly hp: number;
  readonly maxHp: number;
}

export interface PlaygroundUpgradeSnapshot {
  readonly id: string;
  readonly unique?: boolean;
  readonly tierCount?: number;
  readonly owned: number;
  readonly tier: number;
}

export interface PlaygroundInputSnapshot {
  readonly pressed: ReadonlySet<string>;
  readonly player: PlaygroundPlayerSnapshot;
  readonly enemies: readonly PlaygroundEnemySnapshot[];
  readonly viewportWidth: number;
}

export type PlaygroundIntent =
  | Readonly<{ type: "announce"; text: string; emphasis: boolean; color: string }>
  | Readonly<{
      type: "apply-difficulty";
      id: string;
      damageRatio: number;
      hp: number;
      count: number;
      coin: number;
      score: number;
      oneHit: boolean;
    }>
  | Readonly<{ type: "apply-upgrade"; upgradeId: string }>
  | Readonly<{ type: "clear-enemies" }>
  | Readonly<{ type: "clear-projectiles" }>
  | Readonly<{ type: "heal-player" }>
  | Readonly<{ type: "navigate"; screen: "pgmenu" | "pglab" | "playing" }>
  | Readonly<{ type: "release-pointer" }>
  | Readonly<{ type: "request-pointer" }>
  | Readonly<{ type: "reset-run" }>
  | Readonly<{ type: "select-arena"; arena: number }>
  | Readonly<{ type: "spawn"; kind: string; count: number; hpScale: number; role?: "dummy" | "boss"; x?: number }>
  | Readonly<{ type: "stabilize-dummy"; enemyId: string; minimumStun: number; healBelow: number }>
  | Readonly<{ type: "tier-up"; upgradeId: string }>
  | Readonly<{ type: "wipe" }>;

export interface TrainingPlatform {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly floor?: boolean;
  readonly oneway?: boolean;
}

export function trainingPlatforms(
  viewportWidth: number,
  viewportHeight: number,
  groundY: number,
): readonly TrainingPlatform[] {
  return Object.freeze([
    { x: 0, y: groundY, w: viewportWidth, h: viewportHeight - groundY, floor: true },
    { x: viewportWidth * 0.28, y: 560, w: 300, h: 24, oneway: true },
    { x: viewportWidth * 0.62, y: 430, w: 260, h: 24, oneway: true },
  ]);
}

/** An enemy spawn from the menu, as the repeat key brings it back: kind, count and health. */
export type PlaygroundSpawn = Extract<PlaygroundIntent, { type: "spawn" }>;

export class PlaygroundController {
  readonly state: PlaygroundState;
  #lastSpawn: PlaygroundSpawn | null = null;

  constructor(initial?: Partial<PlaygroundState>) {
    this.state = {
      god: false,
      freeze: false,
      slow: false,
      hpMultiplier: 1,
      count: 1,
      arena: -1,
      labFilter: "all",
      ...initial,
    };
  }

  setDifficulty(
    difficultyId: string,
    difficulties: readonly PlaygroundDifficulty[],
    currentDamage: number,
  ): PlaygroundIntent {
    const selected = difficulties.find((difficulty) => difficulty.id === difficultyId) ?? difficulties[1];
    if (!selected) throw new Error("Playground requires at least one difficulty");
    const modifiers = selected.mods ?? {};
    const damage = modifiers.dmg ?? 1;
    return {
      type: "apply-difficulty",
      id: selected.id,
      damageRatio: damage / (currentDamage || 1),
      hp: modifiers.hp ?? 1,
      count: modifiers.count ?? 1,
      coin: modifiers.coin ?? 1,
      score: modifiers.score ?? 1,
      oneHit: selected.oneHit === true,
    };
  }

  nextArena(stageCount: number): readonly PlaygroundIntent[] {
    const next = this.state.arena >= stageCount - 1 ? -1 : this.state.arena + 1;
    this.state.arena = next;
    return [{ type: "wipe" }, { type: "select-arena", arena: next }];
  }

  arenaName(stageNames: readonly string[]): string {
    if (this.state.arena === -1) return "TRAINING GROUNDS";
    return (stageNames[this.state.arena] ?? "TRAINING GROUNDS").toUpperCase();
  }

  spawn(kind: string): PlaygroundSpawn {
    const spawn: PlaygroundSpawn = {
      type: "spawn",
      kind,
      count: this.state.count || 1,
      hpScale: this.state.hpMultiplier || 1,
    };
    this.#lastSpawn = spawn;
    return spawn;
  }

  /** The last enemy spawn again (the repeat key), or null before the first. */
  get lastSpawn(): PlaygroundSpawn | null {
    return this.#lastSpawn;
  }

  spawnDummy(player: PlaygroundPlayerSnapshot, viewportWidth: number): PlaygroundIntent {
    return {
      type: "spawn",
      kind: "charger",
      count: 1,
      hpScale: 10,
      role: "dummy",
      x: Math.max(160, Math.min(player.x + (player.facing || 1) * 280, viewportWidth - 160)),
    };
  }

  setLabFilter(filter: string): void {
    this.state.labFilter = filter;
  }

  labAction(upgrade: PlaygroundUpgradeSnapshot): PlaygroundIntent | null {
    const maximumTier = upgrade.tierCount === undefined ? 1 : upgrade.tierCount + 1;
    if (upgrade.owned > 0 && upgrade.tierCount !== undefined)
      return upgrade.tier < maximumTier ? { type: "tier-up", upgradeId: upgrade.id } : null;
    if (upgrade.owned > 0 && upgrade.unique) return null;
    return { type: "apply-upgrade", upgradeId: upgrade.id };
  }

  toggle(modifier: "freeze" | "god" | "slow"): void {
    this.state[modifier] = !this.state[modifier];
  }

  update(snapshot: PlaygroundInputSnapshot, colors: Readonly<Record<string, string>>): readonly PlaygroundIntent[] {
    const intents: PlaygroundIntent[] = [],
      { pressed, player, enemies } = snapshot;
    if (this.state.god && player.hp < player.maxHp) intents.push({ type: "heal-player" });
    for (const enemy of enemies)
      if (enemy.tutorialDummy && !enemy.dead)
        intents.push({ type: "stabilize-dummy", enemyId: enemy.id, minimumStun: 1, healBelow: enemy.maxHp * 0.5 });

    if (anyKeyIn(pressed, "playground-menu"))
      return [{ type: "navigate", screen: "pgmenu" }, { type: "release-pointer" }];
    const announce = (text: string, color: string, emphasis = false): PlaygroundIntent => ({
      type: "announce",
      text,
      emphasis,
      color,
    });
    if (anyKeyIn(pressed, "heal")) intents.push({ type: "heal-player" }, announce("HEALED", "#1faf5a", true));
    if (anyKeyIn(pressed, "clear-enemies"))
      intents.push(
        { type: "clear-enemies" },
        { type: "clear-projectiles" },
        announce("CLEARED", colors.perfect ?? "#fff", true),
      );
    if (anyKeyIn(pressed, "spawn-dummy"))
      intents.push(this.spawnDummy(player, snapshot.viewportWidth), announce("DUMMY", "#888"));
    if (anyKeyIn(pressed, "repeat-spawn")) {
      const last = this.#lastSpawn;
      intents.push(
        ...(last === null
          ? [announce("SPAWN ONE FROM THE MENU FIRST", "#888")]
          : [last, announce(last.kind.toUpperCase(), colors[last.kind] ?? "#000")]),
      );
    }
    if (anyKeyIn(pressed, "toggle-freeze")) {
      this.toggle("freeze");
      intents.push(announce(this.state.freeze ? "ENEMIES FROZEN" : "ENEMIES MOVE", "#7fd4ff"));
    }
    if (anyKeyIn(pressed, "toggle-no-damage")) {
      this.toggle("god");
      intents.push(announce(this.state.god ? "NO DAMAGE ON" : "NO DAMAGE OFF", "#1faf5a"));
    }
    return intents;
  }
}
