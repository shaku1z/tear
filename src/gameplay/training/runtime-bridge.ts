import { trainingPlatforms, type PlaygroundController, type PlaygroundDifficulty, type PlaygroundIntent,
  type PlaygroundUpgradeSnapshot, type TrainingPlatform } from "./playground-controller";

export interface PlaygroundRuntimePlayer {
  x: number; y: number; facing: number; hp: number; maxHp: number; oneHit: boolean;
}

export interface PlaygroundRuntimeEnemy {
  dead: boolean; tutDummy?: boolean; affixCount?: number; contactDmg?: number;
  x: number; y: number; hh: number; stun: number; hp: number; maxHp: number;
  isMirrorBoss?: boolean;
}

export interface PlaygroundRuntimeRun {
  diff: string; diffDmg: number; diffHp: number; diffCount: number; coinMod: number; scoreMod: number;
  bossIdx: number; bossOrder: string[]; curBoss: string | null; pgArena?: number;
}

export interface PlaygroundRuntimeDependencies {
  readonly controller: PlaygroundController;
  readonly difficulties: readonly PlaygroundDifficulty[];
  readonly colors: Readonly<Record<string, string>>;
  readonly stageNames: readonly string[];
  readonly groundY: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly pressed: ReadonlySet<string>;
  readonly player: PlaygroundRuntimePlayer;
  readonly run: PlaygroundRuntimeRun;
  readonly enemies: PlaygroundRuntimeEnemy[];
  scalePlayerDamage(ratio: number): void;
  clearProjectiles(): void;
  spawn(kind: string, hpScale: number): PlaygroundRuntimeEnemy | undefined;
  announce(text: string, emphasis: boolean, color: string): void;
  navigate(screen: "pgmenu" | "pglab" | "playing"): void;
  releasePointer(): void;
  requestPointer(): void;
  dismissMirror(): void;
  selectArena(arena: number): void;
  wipe(): void;
  resetRun(): void;
  applyUpgrade(id: string): void;
  tierUp(id: string): void;
  readonly actions?: PlaygroundActionDependencies;
}

export interface PlaygroundActionDependencies {
  selectWeapon(id: string): void;
  restartWithWeapon(): void;
  resetAtDifficulty(): void;
  openLab(): void;
  clearLabScroll(): void;
  lookupUpgrade(id: string): PlaygroundUpgradeSnapshot | null;
  playUi(): void;
  playRankUp(): void;
}

export interface PlaygroundRuntimeBridge {
  readonly state: PlaygroundController["state"];
  execute(intents: readonly PlaygroundIntent[]): void;
  setDifficulty(id: string): void;
  nextArena(): void;
  arenaName(): string;
  spawn(kind: string): void;
  spawnDummy(): void;
  step(): void;
  dispatchAction(id: string): void;
  reset(): void;
  homePlatforms(): TrainingPlatform[];
}

export function createPlaygroundRuntimeBridge(dependencies: PlaygroundRuntimeDependencies): PlaygroundRuntimeBridge {
  const { controller } = dependencies;
  const homePlatforms = (): TrainingPlatform[] => trainingPlatforms(
    dependencies.viewportWidth, dependencies.viewportHeight, dependencies.groundY,
  ).map((platform) => ({ ...platform }));

  function execute(intents: readonly PlaygroundIntent[]): void {
    for (const intent of intents) {
      if (intent.type === "announce") dependencies.announce(intent.text, intent.emphasis, intent.color);
      else if (intent.type === "apply-difficulty") {
        dependencies.scalePlayerDamage(intent.damageRatio);
        dependencies.run.diffDmg *= intent.damageRatio;
        dependencies.run.diff = intent.id; dependencies.run.diffHp = intent.hp; dependencies.run.diffCount = intent.count;
        dependencies.run.coinMod = intent.coin; dependencies.run.scoreMod = intent.score; dependencies.player.oneHit = intent.oneHit;
        const difficulty = dependencies.difficulties.find((entry) => entry.id === intent.id);
        dependencies.announce((difficulty?.label ?? intent.id).toUpperCase(), true, dependencies.colors.perfect ?? "#fff");
      } else if (intent.type === "spawn") {
        for (let index = 0; index < intent.count; index++) {
          const enemy = dependencies.spawn(intent.role === "boss" ? "boss" : intent.kind, intent.hpScale);
          if (enemy && intent.role === "dummy") {
            enemy.tutDummy = true; enemy.affixCount = 0; enemy.contactDmg = 0;
            enemy.x = intent.x ?? enemy.x; enemy.y = dependencies.groundY - enemy.hh;
          }
        }
      } else if (intent.type === "stabilize-dummy") {
        const enemy = dependencies.enemies[Number(intent.enemyId)];
        if (enemy) { enemy.stun = Math.max(enemy.stun, intent.minimumStun); if (enemy.hp < intent.healBelow) enemy.hp = enemy.maxHp; }
      } else if (intent.type === "summon-boss") {
        dependencies.run.curBoss = intent.bossId; dependencies.run.bossIdx = intent.nextBossIndex; dependencies.spawn("boss", 1);
      } else if (intent.type === "clear-enemies") {
        for (const enemy of dependencies.enemies) enemy.dead = true;
      } else if (intent.type === "clear-projectiles") dependencies.clearProjectiles();
      else if (intent.type === "dismiss-mirror") {
        const enemy = dependencies.enemies[Number(intent.enemyId)]; if (enemy) enemy.dead = true; dependencies.dismissMirror();
      } else if (intent.type === "heal-player") dependencies.player.hp = dependencies.player.maxHp;
      else if (intent.type === "navigate") dependencies.navigate(intent.screen);
      else if (intent.type === "release-pointer") dependencies.releasePointer();
      else if (intent.type === "request-pointer") dependencies.requestPointer();
      else if (intent.type === "select-arena") { dependencies.run.pgArena = intent.arena; dependencies.selectArena(intent.arena); }
      else if (intent.type === "wipe") dependencies.wipe();
      else if (intent.type === "reset-run") dependencies.resetRun();
      else if (intent.type === "apply-upgrade") dependencies.applyUpgrade(intent.upgradeId);
      else dependencies.tierUp(intent.upgradeId);
    }
  }

  function step(): void {
    execute(controller.update({
      pressed: dependencies.pressed,
      player: dependencies.player,
      run: { difficulty: dependencies.run.diff, difficultyDamage: dependencies.run.diffDmg || 1,
        bossIndex: dependencies.run.bossIdx, bossOrder: dependencies.run.bossOrder },
      enemies: dependencies.enemies.map((enemy, index) => ({ id: String(index), dead: enemy.dead,
        tutorialDummy: !!enemy.tutDummy, mirrorBoss: !!enemy.isMirrorBoss, hp: enemy.hp, maxHp: enemy.maxHp })),
      viewportWidth: dependencies.viewportWidth,
    }, dependencies.colors));
  }

  function dispatchAction(id: string): void {
    const actions = dependencies.actions;
    if (actions === undefined) throw new Error("playground actions are not configured");
    const [kind = "", value = ""] = id.split(":");
    if (kind === "spawn") { execute([controller.spawn(value)]); actions.playUi(); }
    else if (kind === "dummy") { execute([controller.spawnDummy(dependencies.player, dependencies.viewportWidth)]); actions.playUi(); }
    else if (kind === "hp") controller.state.hpMultiplier = Number(value);
    else if (kind === "count") controller.state.count = Number(value);
    else if (kind === "difficulty") execute([controller.setDifficulty(value, dependencies.difficulties, dependencies.run.diffDmg || 1)]);
    else if (kind === "boss") {
      dependencies.run.curBoss = value; dependencies.spawn("boss", 1); actions.playUi();
    } else if (kind === "arena") { execute(controller.nextArena(dependencies.stageNames.length)); actions.playUi(); }
    else if (kind === "weapon") { actions.selectWeapon(value); actions.restartWithWeapon(); }
    else if (kind === "toggle") {
      if (value === "god" || value === "freeze" || value === "slow") controller.toggle(value);
      else if (value === "onehit") dependencies.player.oneHit = !dependencies.player.oneHit;
    } else if (kind === "lab") actions.openLab();
    else if (kind === "clear") {
      for (const enemy of dependencies.enemies) enemy.dead = true;
      dependencies.clearProjectiles(); actions.playUi();
    } else if (kind === "heal") { dependencies.player.hp = dependencies.player.maxHp; actions.playUi(); }
    else if (kind === "reset") actions.resetAtDifficulty();
    else if (kind === "filter") { controller.setLabFilter(value); actions.clearLabScroll(); }
    else if (kind === "ability") {
      const upgrade = actions.lookupUpgrade(value);
      if (upgrade === null) return;
      const intent = controller.labAction(upgrade);
      if (intent !== null) { execute([intent]); actions.playRankUp(); }
    }
  }

  return {
    state: controller.state,
    execute,
    setDifficulty(id) { execute([controller.setDifficulty(id, dependencies.difficulties, dependencies.run.diffDmg || 1)]); },
    nextArena() { execute(controller.nextArena(dependencies.stageNames.length)); },
    arenaName() { return controller.arenaName(dependencies.stageNames); },
    spawn(kind) { execute([controller.spawn(kind)]); },
    spawnDummy() { execute([controller.spawnDummy(dependencies.player, dependencies.viewportWidth)]); },
    step,
    dispatchAction,
    reset() { Object.assign(controller.state, { god: false, freeze: false, slow: false,
      hpMultiplier: 1, count: 1, arena: -1, labFilter: "all" }); },
    homePlatforms,
  };
}
