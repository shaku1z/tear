import type { RunDifficulty, RunMode } from "../gameplay/run/session";
import type { RunResultInfo } from "../gameplay/run/outcome-planner";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { LiveWorldSessionPort } from "./live-world-composition";

type ReplayPacket = ReturnType<GameRuntimeDependencies["GHOST"]["stopRec"]>;

/** The setup choices retained between worlds by the live application. */
export interface LiveWorldSetupSelection {
  readonly mode: RunMode;
  readonly difficulty: RunDifficulty;
  readonly weapon: string;
  readonly boss: string;
}

/**
 * App-owned session state that outlives an individual world. The portable
 * world still receives only the narrow `LiveWorldSessionPort` it needs.
 */
export interface LiveWorldSessionState extends LiveWorldSessionPort {
  selectedMode(): RunMode;
  setSelectedMode(value: RunMode): void;
  selectedDifficulty(): RunDifficulty;
  setSelectedDifficulty(value: RunDifficulty): void;
  selectedBoss(): string;
  setSelectedBoss(value: string): void;
  selection(): LiveWorldSetupSelection;
  setRunSeed(value: number): void;
  takeRunSeed(): number | null;
}

/**
 * `defaultMode` supplies the mode shown until the player picks one; it is read
 * live so a profile that loads (or finishes the tutorial) after the session was
 * created still gets the right first-run default. An explicit pick always wins.
 */
export function createLiveWorldSessionState(defaultMode: () => RunMode = () => "endless"): LiveWorldSessionState {
  let chosenMode: RunMode | null = null;
  const currentMode = (): RunMode => chosenMode ?? defaultMode();
  let difficulty: RunDifficulty = "normal";
  let weapon = "sword";
  let boss = "shuffle";
  let outcome: RunResultInfo | null = null;
  let lastRecording: ReplayPacket = null;
  let lastVaultId: string | null = null;
  let winSeconds = 0;
  let runSeed: number | null = null;
  return Object.freeze({
    selectedMode: currentMode,
    setSelectedMode: (value) => { chosenMode = value; },
    selectedDifficulty: () => difficulty,
    setSelectedDifficulty: (value) => { difficulty = value; },
    selectedWeapon: () => weapon,
    setSelectedWeapon: (value) => { weapon = value; },
    selectedBoss: () => boss,
    setSelectedBoss: (value) => { boss = value; },
    selection: () => Object.freeze({ mode: currentMode(), difficulty, weapon, boss }),
    setRunSeed: (value) => { runSeed = value; },
    takeRunSeed: () => { const value = runSeed; runSeed = null; return value; },
    outcome: () => outcome,
    setOutcome: (value) => { outcome = value; },
    lastRecording: () => lastRecording,
    setLastRecording: (value) => { lastRecording = value; },
    lastVaultId: () => lastVaultId,
    setLastVaultId: (value) => { lastVaultId = value; },
    winSeconds: () => winSeconds,
    setWinSeconds: (value) => { winSeconds = value; },
  } satisfies LiveWorldSessionState);
}
