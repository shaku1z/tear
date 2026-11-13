import { PUBLISHED_ENEMY_IDENTITY_IDS, type EnemyKind } from "../run/content-director";
import type { TutorialIntent, TutorialLesson, TutorialUpdateSnapshot } from "./tutorial-controller";

export type PracticeEnemyKnowledge = "confirmed-defeated" | "encountered" | "save-unconfirmed" | "unknown";
export interface PracticeEnemyEntry {
  readonly id: EnemyKind;
  readonly title: string;
  readonly knowledge: PracticeEnemyKnowledge;
  readonly canPractice: boolean;
}
export interface PracticeEnemyState {
  readonly id: EnemyKind;
  readonly weaponId: "sword";
  readonly knowledge: Exclude<PracticeEnemyKnowledge, "unknown">;
  spawned: boolean;
  defeated: boolean;
}
export function isPracticeEnemy(id: string): id is EnemyKind {
  return PUBLISHED_ENEMY_IDENTITY_IDS.some((entry) => entry === id);
}
export function practiceEnemyIdentity(actor: Readonly<{ kind: string; supportType?: string }>): EnemyKind | undefined {
  const id = actor.kind === "support" ? actor.supportType : actor.kind;
  return typeof id === "string" && isPracticeEnemy(id) ? id : undefined;
}
export function encounterStat(id: EnemyKind): string {
  return `encounterEnemy:${id}`;
}
export function practiceEnemyCatalog(
  stat: (key: string) => number,
  unconfirmed: ReadonlySet<string> = new Set(),
): readonly PracticeEnemyEntry[] {
  return PUBLISHED_ENEMY_IDENTITY_IDS.map((id) => {
    const knowledge: PracticeEnemyKnowledge =
      stat(`kill_${id}`) > 0
        ? "confirmed-defeated"
        : stat(encounterStat(id)) > 0
          ? unconfirmed.has(id)
            ? "save-unconfirmed"
            : "encountered"
          : "unknown";
    return { id, title: id.toUpperCase(), knowledge, canPractice: knowledge !== "unknown" };
  });
}
export function validatePracticeEnemy(value: unknown): PracticeEnemyState {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("Invalid practice enemy");
  const state = value as Record<string, unknown>;
  if (
    Object.keys(state).some((key) => !["id", "weaponId", "knowledge", "spawned", "defeated"].includes(key)) ||
    typeof state.id !== "string" ||
    !isPracticeEnemy(state.id) ||
    state.weaponId !== "sword" ||
    (state.knowledge !== "confirmed-defeated" &&
      state.knowledge !== "encountered" &&
      state.knowledge !== "save-unconfirmed") ||
    typeof state.spawned !== "boolean" ||
    typeof state.defeated !== "boolean" ||
    (state.defeated && !state.spawned)
  )
    throw new RangeError("Invalid practice enemy state");
  return {
    id: state.id,
    weaponId: "sword",
    knowledge: state.knowledge,
    spawned: state.spawned,
    defeated: state.defeated,
  };
}
export function practiceEnemyLesson(state: PracticeEnemyState): TutorialLesson {
  return {
    title: `${state.id.toUpperCase()} ENCOUNTER`,
    description: state.defeated
      ? "OPPONENT DEFEATED · Restart to try again, or select another exercise."
      : "Read this opponent's real attacks and recovery. Defeat it, or pause to reset instantly. Training death recovery stays on; no rewards or discovery are earned here.",
    arena: "field-floor",
    teachingFocus: "enemy",
    keys: ["MOUSE", "SHIFT", "RMB"],
    progress: () => [state.defeated ? 1 : 0, 1],
    complete: () => state.defeated,
  };
}
export function updatePracticeEnemy(state: PracticeEnemyState, snapshot: TutorialUpdateSnapshot): TutorialIntent[] {
  if (!state.spawned) {
    state.spawned = true;
    return [{ type: "spawn", kind: state.id, hpScale: 1, role: "opponent" }];
  }
  if (
    !snapshot.enemies.some((enemy) => !enemy.dead && !enemy.tutorialDummy && practiceEnemyIdentity(enemy) === state.id)
  )
    state.defeated = true;
  return [];
}
