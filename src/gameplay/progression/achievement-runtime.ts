export interface AchievementRunState {
  mode: string;
  biomeState?: StageRestrictions;
  runTime: number;
  clearTimer: number;
  _bossFightT?: number | null;
  _airKills?: number;
  _staticParry?: number;
  _projDashes?: number;
  _revivedT?: boolean;
}

export interface StageRestrictions {
  swung: boolean;
  thrown: boolean;
  jumped: boolean;
}

export interface AchievementBoss {
  isBoss?: boolean;
  bossId?: string;
  dmgSrc?: Set<string>;
  _lastSrc?: string;
}

export interface AchievementEnemy {
  dead?: boolean;
  y: number;
  _updraftT?: number;
  bleedStacks?: number;
  burnT?: number;
  markT?: number;
}

export interface AchievementPlayer {
  onGround: boolean;
  dashTimer: number;
  hp: number;
  maxHp: number;
}

export interface DodgeProjectile {
  _dodged?: boolean;
}

export type AchievementIntent =
  | Readonly<{ type: "profile-max"; stat: string; value: number }>
  | Readonly<{ type: "achievement-check" }>;

export function tracksAchievements(run: AchievementRunState | null | undefined): boolean {
  return Boolean(run && run.mode !== "tutorial" && run.mode !== "playground");
}

export function resetStageRestrictions(run: AchievementRunState | null | undefined): void {
  if (run) run.biomeState = { swung: false, thrown: false, jumped: false };
}

export function markStageRestriction(
  run: AchievementRunState | null | undefined,
  action: keyof StageRestrictions,
): void {
  if (run?.biomeState) run.biomeState[action] = true;
}

export function recordBossHit(boss: AchievementBoss | null | undefined, source: string): void {
  if (!boss?.isBoss) return;
  (boss.dmgSrc ??= new Set()).add(source);
  boss._lastSrc = source;
}

export function bossKillIntents(
  run: AchievementRunState | null | undefined,
  boss: AchievementBoss | null | undefined,
): readonly AchievementIntent[] {
  if (!tracksAchievements(run) || !run || !boss?.bossId) return Object.freeze([]);
  const sources = boss.dmgSrc ?? new Set<string>();
  const only = (source: string): boolean => sources.has(source) && ![...sources].some((other) => other !== source);
  const intents: AchievementIntent[] = [];
  if (boss.bossId === "warden" && only("deflect")) intents.push({ type: "profile-max", stat: "wardenDeflectOnly", value: 1 });
  if (boss.bossId === "colossus" && sources.size > 0 && !sources.has("melee")) intents.push({ type: "profile-max", stat: "colossusThrowOnly", value: 1 });
  if (boss.bossId === "echo" && boss._lastSrc === "deflect") intents.push({ type: "profile-max", stat: "echoReflectKill", value: 1 });
  if (boss.bossId === "source" && run._bossFightT != null && run.runTime - run._bossFightT < 60) {
    intents.push({ type: "profile-max", stat: "sourceSpeedrun", value: 1 });
  }
  return Object.freeze(intents);
}

export interface MetaLevels {
  readonly thickskin: number;
  readonly warding: number;
  readonly sharp: number;
}

export function stageDoneIntents(
  run: AchievementRunState | null | undefined,
  meta: MetaLevels,
): readonly AchievementIntent[] {
  if (!tracksAchievements(run) || !run?.biomeState) return Object.freeze([]);
  const restrictions = run.biomeState;
  const intents: AchievementIntent[] = [];
  if (!restrictions.thrown) intents.push({ type: "profile-max", stat: "stageNoThrow", value: 1 });
  if (!restrictions.swung) intents.push({ type: "profile-max", stat: "stageThrowOnly", value: 1 });
  if (!restrictions.jumped) intents.push({ type: "profile-max", stat: "stageNoJump", value: 1 });
  if (meta.thickskin === 0 && meta.warding === 0 && meta.sharp > 0) {
    intents.push({ type: "profile-max", stat: "stageGlassCannon", value: 1 });
  }
  intents.push({ type: "achievement-check" });
  return Object.freeze(intents);
}

export function killIntents(
  run: AchievementRunState | null | undefined,
  player: Pick<AchievementPlayer, "onGround">,
): readonly AchievementIntent[] {
  if (!tracksAchievements(run) || !run) return Object.freeze([]);
  const intents: AchievementIntent[] = [];
  if (!player.onGround) {
    run._airKills = (run._airKills ?? 0) + 1;
    intents.push({ type: "profile-max", stat: "airComboKills", value: run._airKills });
  }
  if (run.clearTimer > 0) intents.push({ type: "profile-max", stat: "transitionKills", value: 1 });
  return Object.freeze(intents);
}

export function parryIntents(run: AchievementRunState | null | undefined): readonly AchievementIntent[] {
  if (!tracksAchievements(run) || !run) return Object.freeze([]);
  run._staticParry = (run._staticParry ?? 0) + 1;
  return Object.freeze([{ type: "profile-max", stat: "staticParryStreak", value: run._staticParry }]);
}

export function breakStaticParry(run: AchievementRunState | null | undefined): void {
  if (run) run._staticParry = 0;
}

export function dashDodgeIntents(
  run: AchievementRunState | null | undefined,
  projectile: DodgeProjectile | null | undefined,
): readonly AchievementIntent[] {
  if (!tracksAchievements(run) || !run || !projectile || projectile._dodged) return Object.freeze([]);
  projectile._dodged = true;
  run._projDashes = (run._projDashes ?? 0) + 1;
  return Object.freeze([{ type: "profile-max", stat: "projectileDashes", value: run._projDashes }]);
}

export function markRevived(run: AchievementRunState | null | undefined): void {
  if (run) run._revivedT = true;
}

export function hordeClearIntents(
  run: AchievementRunState | null | undefined,
  seconds: number,
): readonly AchievementIntent[] {
  if (!tracksAchievements(run) || !(seconds < 15)) return Object.freeze([]);
  return Object.freeze([{ type: "profile-max", stat: "fastHordeClear", value: 1 }]);
}

export interface AchievementTickInput {
  readonly run: AchievementRunState | null | undefined;
  readonly player: AchievementPlayer;
  readonly enemies: readonly AchievementEnemy[];
  readonly moving: boolean;
  readonly dt: number;
}

export function tickAchievementRuntime(input: AchievementTickInput): readonly AchievementIntent[] {
  const { run, player } = input;
  if (!tracksAchievements(run) || !run) return Object.freeze([]);
  if (player.onGround) run._airKills = 0;
  if (input.moving || player.dashTimer > 0) breakStaticParry(run);
  let rainbow = false;
  let launched = false;
  for (const enemy of input.enemies) {
    if (enemy.dead) continue;
    if ((enemy._updraftT ?? 0) > 0) {
      enemy._updraftT = (enemy._updraftT ?? 0) - input.dt;
      if (enemy.y < -40) launched = true;
    }
    if ((enemy.bleedStacks ?? 0) > 0 && (enemy.burnT ?? 0) > 0 && (enemy.markT ?? 0) > 0) rainbow = true;
  }
  const intents: AchievementIntent[] = [];
  if (rainbow) intents.push({ type: "profile-max", stat: "tripleStatus", value: 1 });
  if (launched) intents.push({ type: "profile-max", stat: "launchOffScreen", value: 1 });
  if (run._revivedT && player.hp >= player.maxHp) intents.push({ type: "profile-max", stat: "reviveToFull", value: 1 });
  return Object.freeze(intents);
}
