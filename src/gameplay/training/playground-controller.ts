export const PLAYGROUND_HOTKEY_KINDS = Object.freeze([
  "charger", "ranged", "flyer", "bomber", "armored", "wraith", "chimera", "priest",
] as const);

export const PLAYGROUND_ALL_KINDS = Object.freeze([
  ...PLAYGROUND_HOTKEY_KINDS, "herald", "mender", "anchor",
] as const);

export type PlaygroundEnemyKind = typeof PLAYGROUND_ALL_KINDS[number];

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

export interface PlaygroundRunSnapshot {
  readonly difficulty: string;
  readonly difficultyDamage: number;
  readonly bossIndex: number;
  readonly bossOrder: readonly string[];
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
  readonly mirrorBoss: boolean;
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
  readonly run: PlaygroundRunSnapshot;
  readonly enemies: readonly PlaygroundEnemySnapshot[];
  readonly viewportWidth: number;
}

export type PlaygroundIntent =
  | Readonly<{ type: "announce"; text: string; emphasis: boolean; color: string }>
  | Readonly<{ type: "apply-difficulty"; id: string; damageRatio: number; hp: number; count: number; coin: number; score: number; oneHit: boolean }>
  | Readonly<{ type: "apply-upgrade"; upgradeId: string }>
  | Readonly<{ type: "clear-enemies" }>
  | Readonly<{ type: "clear-projectiles" }>
  | Readonly<{ type: "dismiss-mirror"; enemyId: string }>
  | Readonly<{ type: "heal-player" }>
  | Readonly<{ type: "navigate"; screen: "pgmenu" | "pglab" | "playing" }>
  | Readonly<{ type: "release-pointer" }>
  | Readonly<{ type: "request-pointer" }>
  | Readonly<{ type: "reset-run" }>
  | Readonly<{ type: "select-arena"; arena: number }>
  | Readonly<{ type: "spawn"; kind: string; count: number; hpScale: number; role?: "dummy" | "boss"; x?: number }>
  | Readonly<{ type: "stabilize-dummy"; enemyId: string; minimumStun: number; healBelow: number }>
  | Readonly<{ type: "summon-boss"; bossId: string; nextBossIndex: number }>
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

export function trainingPlatforms(viewportWidth: number, viewportHeight: number, groundY: number): readonly TrainingPlatform[] {
  return Object.freeze([
    { x: 0, y: groundY, w: viewportWidth, h: viewportHeight - groundY, floor: true },
    { x: viewportWidth * 0.28, y: 560, w: 300, h: 24, oneway: true },
    { x: viewportWidth * 0.62, y: 430, w: 260, h: 24, oneway: true },
  ]);
}

export class PlaygroundController {
  readonly state: PlaygroundState;

  constructor(initial?: Partial<PlaygroundState>) {
    this.state = { god: false, freeze: false, slow: false, hpMultiplier: 1, count: 1, arena: -1, labFilter: "all", ...initial };
  }

  setDifficulty(difficultyId: string, difficulties: readonly PlaygroundDifficulty[], currentDamage: number): PlaygroundIntent {
    const selected = difficulties.find((difficulty) => difficulty.id === difficultyId) ?? difficulties[1];
    if (!selected) throw new Error("Playground requires at least one difficulty");
    const modifiers = selected.mods ?? {};
    const damage = modifiers.dmg ?? 1;
    return { type: "apply-difficulty", id: selected.id, damageRatio: damage / (currentDamage || 1), hp: modifiers.hp ?? 1,
      count: modifiers.count ?? 1, coin: modifiers.coin ?? 1, score: modifiers.score ?? 1, oneHit: selected.oneHit === true };
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

  spawn(kind: string): PlaygroundIntent {
    return { type: "spawn", kind, count: this.state.count || 1, hpScale: this.state.hpMultiplier || 1 };
  }

  spawnDummy(player: PlaygroundPlayerSnapshot, viewportWidth: number): PlaygroundIntent {
    return { type: "spawn", kind: "charger", count: 1, hpScale: 10, role: "dummy",
      x: Math.max(160, Math.min(player.x + (player.facing || 1) * 280, viewportWidth - 160)) };
  }

  setLabFilter(filter: string): void { this.state.labFilter = filter; }

  labAction(upgrade: PlaygroundUpgradeSnapshot): PlaygroundIntent | null {
    const maximumTier = upgrade.tierCount === undefined ? 1 : upgrade.tierCount + 1;
    if (upgrade.owned > 0 && upgrade.tierCount !== undefined) return upgrade.tier < maximumTier ? { type: "tier-up", upgradeId: upgrade.id } : null;
    if (upgrade.owned > 0 && upgrade.unique) return null;
    return { type: "apply-upgrade", upgradeId: upgrade.id };
  }

  toggle(modifier: "freeze" | "god" | "slow"): void { this.state[modifier] = !this.state[modifier]; }

  update(snapshot: PlaygroundInputSnapshot, colors: Readonly<Record<string, string>>): readonly PlaygroundIntent[] {
    const intents: PlaygroundIntent[] = [], { pressed, player, enemies, run } = snapshot;
    if (this.state.god && player.hp < player.maxHp) intents.push({ type: "heal-player" });
    for (const enemy of enemies) if (enemy.tutorialDummy && !enemy.dead) intents.push({ type: "stabilize-dummy", enemyId: enemy.id, minimumStun: 1, healBelow: enemy.maxHp * 0.5 });

    if (pressed.has("Tab") || pressed.has("KeyE")) return [{ type: "navigate", screen: "pgmenu" }, { type: "release-pointer" }];
    for (let index = 0; index < PLAYGROUND_HOTKEY_KINDS.length; index++) {
      const kind = PLAYGROUND_HOTKEY_KINDS[index];
      if (kind && pressed.has(`Digit${String(index + 1)}`)) intents.push(this.spawn(kind), { type: "announce", text: kind.toUpperCase(), emphasis: false, color: colors[kind] ?? "#000" });
    }
    if (pressed.has("KeyT")) intents.push(this.spawnDummy(player, snapshot.viewportWidth), { type: "announce", text: "DUMMY", emphasis: false, color: "#888" });
    if (pressed.has("KeyB")) {
      const bossId = run.bossOrder[run.bossIndex % run.bossOrder.length];
      if (bossId) intents.push({ type: "summon-boss", bossId, nextBossIndex: run.bossIndex + 1 });
    }
    if (pressed.has("KeyK")) intents.push({ type: "clear-enemies" }, { type: "clear-projectiles" }, { type: "announce", text: "CLEARED", emphasis: true, color: colors.perfect ?? "#fff" });
    if (pressed.has("KeyH")) intents.push({ type: "heal-player" }, { type: "announce", text: "HEALED", emphasis: true, color: "#1faf5a" });
    if (pressed.has("KeyU")) intents.push({ type: "navigate", screen: "pglab" }, { type: "release-pointer" });
    if (pressed.has("KeyM")) {
      const mirror = enemies.find((enemy) => enemy.mirrorBoss && !enemy.dead);
      if (mirror) intents.push({ type: "dismiss-mirror", enemyId: mirror.id }, { type: "announce", text: "ECHO DISMISSED", emphasis: false, color: "#b06cff" });
      else intents.push({ type: "summon-boss", bossId: "echo", nextBossIndex: run.bossIndex }, { type: "announce", text: "THE ECHO", emphasis: true, color: "#b06cff" });
    }
    return intents;
  }
}
