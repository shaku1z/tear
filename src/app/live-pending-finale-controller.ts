import type { RunDifficulty, RunWaveLogEntry } from "../gameplay/run/session";

export interface PendingFinaleRecord {
  readonly weapon?: string;
  readonly diff?: RunDifficulty;
  readonly wave?: number;
  readonly score?: number;
  readonly time?: number;
  readonly log?: readonly RunWaveLogEntry[];
  readonly isNew?: boolean;
  readonly earned?: number;
  readonly coins?: number;
  readonly best?: Readonly<{ wave: number; score: number; time: number }>;
}

export interface PendingFinaleRun {
  wave: number;
  score: number;
  runTime: number;
  waveLog: RunWaveLogEntry[];
  spawnQueue: unknown[];
  _victoryPrepared?: Readonly<{ isNew: boolean; earned: number; coins: number }>;
}

export interface PendingFinalePlayer {
  x: number;
  y: number;
  hw?: number;
  hh: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export interface PendingFinaleResult {
  readonly wave: number;
  readonly score: number;
  readonly time: number;
  readonly log: readonly RunWaveLogEntry[];
  readonly best: Readonly<{ wave: number; score: number; time: number }>;
  readonly isNew: boolean;
  readonly win: true;
  readonly campaign: true;
  readonly earned: number;
  readonly coins: number;
  readonly diff: RunDifficulty;
}

export interface PendingFinalePort {
  pending(): PendingFinaleRecord | null;
  selectedWeapon(): string;
  selectWeapon(id: string): void;
  startCampaign(difficulty: RunDifficulty): void;
  cancelCinematic(reason: string): void;
  run(): PendingFinaleRun;
  player(): PendingFinalePlayer;
  stageCount(): number;
  loadStage(index: number): void;
  clearCombat(): void;
  groundY(): number;
  viewport(): Readonly<{ width: number; height: number }>;
  recording(): boolean;
  stopRecording(reason: "claimedFinale" | "resumedFinale"): void;
  coins(): number;
  clearPending(): void;
  achievementTracking(): boolean;
  pushCloud(): void;
  terminateVictory(): void;
  presentClaimed(result: PendingFinaleResult): void;
  launchFinale(death: Readonly<{ x: number; y: number }>, recovered: true): void;
}

/** Recovers a persisted finale exactly once, either directly to results or through the authored final cut. */
export class LivePendingFinaleController {
  readonly #port: PendingFinalePort;

  constructor(port: PendingFinalePort) { this.#port = port; }

  claim(): boolean {
    const pending = this.#port.pending();
    if (pending === null) return false;
    const record = this.#prepare(pending, "claim-final-cut", "claimedFinale", 0);
    const player = this.#port.player();
    const viewport = this.#port.viewport();
    player.x = viewport.width / 2;
    player.y = this.#port.groundY() - player.hh;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    const result = this.#result(record);
    this.#port.clearPending();
    if (this.#port.achievementTracking()) this.#port.pushCloud();
    this.#port.terminateVictory();
    this.#port.presentClaimed(result);
    return true;
  }

  resume(): boolean {
    const record = this.#port.pending();
    if (record === null) return false;
    const finalStage = Math.max(0, this.#port.stageCount() - 1);
    this.#prepare(record, "resume-final-cut", "resumedFinale", finalStage);
    const viewport = this.#port.viewport();
    this.#port.launchFinale({ x: viewport.width / 2, y: viewport.height * 0.38 }, true);
    return true;
  }

  #prepare(
    record: PendingFinaleRecord,
    cancelReason: string,
    recordingReason: "claimedFinale" | "resumedFinale",
    stage: number,
  ): PendingFinaleRecord {
    this.#port.selectWeapon(record.weapon ?? this.#port.selectedWeapon());
    this.#port.startCampaign(record.diff ?? "normal");
    this.#port.cancelCinematic(cancelReason);
    const run = this.#port.run();
    run.wave = record.wave ?? this.#port.stageCount() * 10;
    run.score = record.score ?? 0;
    run.runTime = record.time ?? 0;
    run.waveLog = [...(record.log ?? [])];
    run.spawnQueue.length = 0;
    run._victoryPrepared = {
      isNew: record.isNew === true,
      earned: record.earned ?? 0,
      coins: record.coins ?? this.#port.coins(),
    };
    this.#port.loadStage(stage);
    this.#port.clearCombat();
    if (this.#port.recording()) this.#port.stopRecording(recordingReason);
    return record;
  }

  #result(record: PendingFinaleRecord): PendingFinaleResult {
    return Object.freeze({
      wave: record.wave ?? this.#port.stageCount() * 10,
      score: record.score ?? 0,
      time: record.time ?? 0,
      log: [...(record.log ?? [])],
      best: record.best ?? { wave: record.wave ?? 0, score: record.score ?? 0, time: record.time ?? 0 },
      isNew: record.isNew === true,
      win: true,
      campaign: true,
      earned: record.earned ?? 0,
      coins: record.coins ?? this.#port.coins(),
      diff: record.diff ?? "normal",
    });
  }
}
