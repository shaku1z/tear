import {
  createRunSession,
  type CreateRunSessionOptions,
  type RunDifficulty,
  type RunMode,
  type RunSession,
} from "./session";

export type RunSessionBlueprint<TMods> = Omit<
  CreateRunSessionOptions<TMods>,
  "mode" | "difficulty" | "runSeed" | "voidSeed"
>;

export interface LiveRunStartPort<TMods extends { weaponId?: string }> {
  readonly replaceActiveRun: () => void;
  readonly initializeWorld: (mode: RunMode, difficulty: RunDifficulty) => RunSessionBlueprint<TMods>;
  readonly resetAuthoritativeClocks: () => void;
  readonly finishWorldReset: () => void;
  readonly createRunSeed: () => number;
  readonly resetRunRandom: (runSeed: number) => void;
  readonly installSession: (session: RunSession<TMods>) => void;
  readonly startLifecycle: (sessionId: string) => void;
  readonly exposeDebugState: () => void;
  readonly updateProgressionTracking: (mode: RunMode) => void;
  readonly startRecording: (runId: string, runSeed: number) => void;
  readonly configureMode: (mode: RunMode) => void;
  readonly applyMetaProgression: () => void;
  readonly activateOpeningContent: (mode: RunMode) => void;
  readonly enterPlayingState: (sessionId: string) => void;
  readonly beginMusic: (runId: string, runSeed: number) => void;
  readonly requestPointerLock: () => void;
}

function deriveVoidSeed(runSeed: number): number {
  const derived = (Math.imul(runSeed ^ 0x7f4a7c15, 1664525) + 1013904223) >>> 0;
  return derived || 1;
}

export class LiveRunStartController<TMods extends { weaponId?: string }> {
  readonly #port: LiveRunStartPort<TMods>;

  constructor(port: LiveRunStartPort<TMods>) {
    this.#port = port;
  }

  start(mode: RunMode, difficulty: RunDifficulty): RunSession<TMods> {
    this.#port.replaceActiveRun();
    const blueprint = this.#port.initializeWorld(mode, difficulty);
    this.#port.resetAuthoritativeClocks();
    const runSeed = this.#port.createRunSeed();
    const voidSeed = deriveVoidSeed(runSeed);
    this.#port.resetRunRandom(runSeed);
    const session = createRunSession({
      ...blueprint,
      mode,
      difficulty,
      runSeed,
      voidSeed,
    });
    this.#port.installSession(session);
    this.#port.finishWorldReset();
    const sessionId = `run-${runSeed.toString(36)}`;
    this.#port.startLifecycle(sessionId);
    this.#port.exposeDebugState();
    this.#port.updateProgressionTracking(mode);
    this.#port.startRecording(sessionId, runSeed);
    this.#port.configureMode(mode);
    this.#port.applyMetaProgression();
    this.#port.activateOpeningContent(mode);
    this.#port.enterPlayingState(sessionId);
    this.#port.beginMusic(sessionId, runSeed);
    this.#port.requestPointerLock();
    return session;
  }
}
