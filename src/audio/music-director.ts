import {
  MUSIC_CONTEXT_SCHEMA_VERSION,
  type MusicContextSnapshot,
  type MusicEvent,
  type MusicRunSessionMetadata,
  type MusicScene,
} from "./music-contracts";

export type MusicContextObservation = Omit<MusicContextSnapshot, "schemaVersion" | "sequence">;

export type MusicEventIntent =
  | { readonly type: "scene-changed"; readonly scene: MusicScene }
  | { readonly type: "boss-entered"; readonly bossId: string }
  | { readonly type: "boss-phase-changed"; readonly bossId: string; readonly phase: number }
  | { readonly type: "combo-rank-changed"; readonly rankId: string }
  | { readonly type: "perfect-parry"; readonly weaponId: string }
  | { readonly type: "victory" }
  | { readonly type: "defeat" };

export interface MusicDirectorPort {
  beginMusicRun(metadata: MusicRunSessionMetadata): void;
  updateMusicContext(snapshot: MusicContextSnapshot): void;
  emitMusicEvent(event: MusicEvent): void;
  endMusicRun(): void;
}

/** Converts live semantic observations into bounded TearScore traffic. */
export class MusicDirector {
  #active = false;
  #snapshotSequence = 0;
  #eventSequence = 0;
  #nextSnapshotMs = 0;
  #lastScene: MusicScene | null = null;
  #lastBossId: string | null = null;
  #lastBossPhase: number | null = null;
  #lastRank = "";

  constructor(private readonly port: MusicDirectorPort, private readonly intervalMs = 125) {}

  get active(): boolean {
    return this.#active;
  }

  begin(metadata: MusicRunSessionMetadata): void {
    this.#active = true;
    this.#snapshotSequence = 0;
    this.#eventSequence = 0;
    this.#nextSnapshotMs = 0;
    this.#lastScene = null;
    this.#lastBossId = null;
    this.#lastBossPhase = null;
    this.#lastRank = "";
    this.port.beginMusicRun(metadata);
  }

  emit(timeSeconds: number, intent: MusicEventIntent): void {
    if (!this.#active) return;
    if (intent.type === "combo-rank-changed") this.#lastRank = intent.rankId;
    this.port.emitMusicEvent({
      ...intent,
      eventId: `music-${String(++this.#eventSequence)}`,
      timeMs: Math.round(timeSeconds * 1000),
    });
  }

  update(observation: MusicContextObservation): void {
    if (!this.#active) return;
    let changed = false;
    if (observation.scene !== this.#lastScene) {
      this.#lastScene = observation.scene;
      this.emit(observation.timeMs / 1000, { type: "scene-changed", scene: observation.scene });
      changed = true;
    }
    if (observation.bossId !== null && observation.bossId !== this.#lastBossId) {
      this.emit(observation.timeMs / 1000, { type: "boss-entered", bossId: observation.bossId });
      changed = true;
    }
    if (observation.bossId !== null && observation.bossPhase !== this.#lastBossPhase) {
      this.emit(observation.timeMs / 1000, {
        type: "boss-phase-changed",
        bossId: observation.bossId,
        phase: observation.bossPhase ?? 1,
      });
      changed = true;
    }
    if (observation.comboRankId !== this.#lastRank) {
      this.emit(observation.timeMs / 1000, {
        type: "combo-rank-changed",
        rankId: observation.comboRankId,
      });
      changed = true;
    }
    this.#lastBossId = observation.bossId;
    this.#lastBossPhase = observation.bossPhase;
    if (changed || observation.timeMs >= this.#nextSnapshotMs) {
      this.port.updateMusicContext({
        ...observation,
        schemaVersion: MUSIC_CONTEXT_SCHEMA_VERSION,
        sequence: ++this.#snapshotSequence,
      });
      this.#nextSnapshotMs = observation.timeMs + this.intervalMs;
    }
    if (observation.scene === "main-menu") this.end();
  }

  end(): void {
    if (!this.#active) return;
    this.#active = false;
    this.port.endMusicRun();
  }
}

export function resolveMusicScene(state: string, hasActiveBoss: boolean): MusicScene {
  if (["menu", "shop", "codex", "setup", "profile", "settings", "achievements", "leaderboards", "rename"].includes(state)) return "main-menu";
  if (state === "win") return "victory";
  if (state === "gameover" || state === "continue") return "defeat";
  if (state === "paused" || state === "confirmquit") return "paused";
  if (state === "draft" || state === "tierup") return "draft";
  if (hasActiveBoss) return "boss";
  return state === "playing" ? "combat" : "preparation";
}

export function resolveMusicBossPhase(
  health: number,
  maximumHealth: number,
  phaseMarks: readonly number[],
): number {
  const ratio = Math.max(0, Math.min(1, health / Math.max(1, maximumHealth)));
  return 1 + phaseMarks.filter((mark) => ratio <= mark).length;
}
