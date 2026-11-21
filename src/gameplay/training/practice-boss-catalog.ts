import { BOSS_ROSTER } from "../run/content-director";
import {
  isPracticeBossId,
  validateBossPhasePracticeState,
  type BossPhasePracticeState,
  type PracticeBossAdmission,
  type PracticeBossId,
  type PracticeBossPhase,
} from "./boss-phase-practice-runtime";
import type { TutorialLesson } from "./tutorial-controller";
import { requireRecord } from "../../domain/records";

export type PracticeBossKnowledge = "defeated-identity" | "encountered-phase" | "save-unconfirmed" | "unknown";
export interface PracticeBossEntry {
  readonly id: string;
  readonly bossId: PracticeBossId;
  readonly phase: PracticeBossPhase;
  readonly title: string;
  readonly knowledge: PracticeBossKnowledge;
  readonly canPractice: boolean;
}
export interface PracticeBossState {
  readonly bossId: PracticeBossId;
  readonly phase: PracticeBossPhase;
  readonly knowledge: "defeated-identity" | "encountered-phase";
  readonly runtime: BossPhasePracticeState;
  readonly defeated: boolean;
}
const defeatStats: Readonly<Record<PracticeBossId, string>> = {
  warden: "killWarden",
  colossus: "killColossus",
  aldric: "killAldric",
  rootbound: "killRootbound",
  echo: "killEcho",
  source: "killSource",
};
export function practiceBossIdentity(
  actor: Readonly<{ isBoss?: boolean; isMirrorBoss?: boolean; bossId?: string }>,
): PracticeBossId | undefined {
  if (!actor.isBoss) return undefined;
  return actor.isMirrorBoss === true ? "echo" : BOSS_ROSTER.find(({ id }) => id === actor.bossId)?.id;
}
export function bossEncounterStat(id: PracticeBossId, phase: PracticeBossPhase): string {
  return `encounterBoss:${id}:${String(phase)}`;
}
export function practiceBossCatalog(
  stat: (key: string) => number,
  unconfirmed: ReadonlySet<string> = new Set(),
): readonly PracticeBossEntry[] {
  return BOSS_ROSTER.flatMap(({ id, name }) =>
    ([1, 2, 3] as const).map((phase) => {
      const key = bossEncounterStat(id, phase);
      const knowledge: PracticeBossKnowledge =
        phase === 1 && stat(defeatStats[id]) > 0
          ? "defeated-identity"
          : unconfirmed.has(key)
            ? "save-unconfirmed"
            : stat(key) > 0
              ? "encountered-phase"
              : "unknown";
      return {
        id: `${id}:${String(phase)}`,
        bossId: id,
        phase,
        title: `${name.toUpperCase()} · P${String(phase)}`,
        knowledge,
        canPractice: knowledge === "defeated-identity" || knowledge === "encountered-phase",
      };
    }),
  );
}
export function validatePracticeBoss(
  value: unknown,
  admits: PracticeBossAdmission = isPracticeBossId,
): PracticeBossState {
  const state = requireRecord(value, "Invalid boss practice selection"),
    runtime = validateBossPhasePracticeState(state.runtime, undefined, admits);
  if (
    Object.keys(state).length !== 5 ||
    Object.keys(state).some((key) => !["bossId", "phase", "knowledge", "runtime", "defeated"].includes(key)) ||
    state.bossId !== runtime.bossId ||
    state.phase !== runtime.phase ||
    runtime.lifecycle === "cancelled" ||
    (state.knowledge !== "defeated-identity" && state.knowledge !== "encountered-phase") ||
    (state.knowledge === "defeated-identity" && state.phase !== 1) ||
    typeof state.defeated !== "boolean" ||
    (state.defeated && runtime.lifecycle !== "active")
  )
    throw new RangeError("Inconsistent boss practice selection");
  return {
    bossId: runtime.bossId,
    phase: runtime.phase,
    knowledge: state.knowledge,
    runtime,
    defeated: state.defeated,
  };
}
export function practiceBossLesson(state: PracticeBossState): TutorialLesson {
  const ready = state.runtime.lifecycle === "active";
  return {
    title: `${state.bossId.toUpperCase()} · PHASE ${String(state.phase)}`,
    description: state.defeated
      ? "BOSS DEFEATED · Restart this entry, or choose another exercise."
      : !ready
        ? "Preparing the authored entry. Follow the real transition and ritual; combat opens when this phase is ready."
        : "Read this boss's attacks and recovery. Complete its real rituals and defeat it, or pause to reset. Baseline Sword · no rewards or discovery.",
    arena: "field-floor",
    teachingFocus: "encounter",
    progress: () => [state.defeated ? 1 : 0, 1],
    complete: () => state.defeated,
  };
}

export interface BossPracticeCandidate {
  readonly run: Readonly<{ mode: string; weaponId: string; diff: string; runSeed: number }>;
  readonly actors: readonly object[];
  readonly cinematicActive: boolean;
}
export interface BossPracticePort {
  begin(request: Readonly<{ bossId: PracticeBossId; phase: PracticeBossPhase }>): BossPhasePracticeState;
  afterWorldStep(): Readonly<{ runtime: BossPhasePracticeState; defeated: boolean }> | undefined;
  validate(state: PracticeBossState, candidate?: BossPracticeCandidate): void;
  restore(state: PracticeBossState | undefined): void;
  capture(): void;
  cancel(): void;
}
