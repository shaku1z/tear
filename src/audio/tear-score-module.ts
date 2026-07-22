import {
  unwrapBrowserAudioContext,
  unwrapBrowserAudioNode,
} from "./browser-audio";
import type { TemporaryMuteReason } from "./mixer";
import type {
  MusicContextSnapshot,
  MusicEvent,
  MusicReplayMetadata,
  MusicRunSessionMetadata,
} from "./music-contracts";
import type {
  TearScoreClient,
  TearScoreInitializeOptions,
} from "./tear-score-adapter";

export const TEAR_SCORE_PROVENANCE = Object.freeze({
  engineRepository: "shaku1z/tear-score",
  engineCommit: "766b910d07264fd81154be29a3d809c63de5c310",
  version: "0.1.0-alpha.1",
  builtAt: "2026-07-19T13:45:03.775Z",
  artifactFormat: "esm",
  bundleSha256: "fe1147cc4eb19719be9d9511c141345bf31affa34641022f4963bc52433ccbb8",
  toneVersion: "14.9.17",
  toneSha256: "15a9fb8e393c132f1c06ba1d71def8b8f3eeb83c288023b346af6321bcf26e26",
});

const TEAR_SCORE_PATH = "vendor/tear-score/tear-score.esm.js";

interface TearScoreGameContext {
  readonly screen: "menu" | "setup" | "playing" | "paused" | "draft" | "gameover" | "win";
  readonly mode?: string;
  readonly difficulty?: string;
  readonly biome?: string;
  readonly wave?: number;
  readonly waveActive?: boolean;
  readonly liveEnemies?: number;
  readonly queuedEnemies?: number;
  readonly projectileCount?: number;
  readonly horde?: boolean;
  readonly miniBoss?: boolean;
  readonly boss?: {
    readonly active: boolean;
    readonly id?: string;
    readonly phase?: number;
    readonly healthRatio?: number;
    readonly intro?: boolean;
    readonly defeated?: boolean;
  };
  readonly player?: {
    readonly healthRatio: number;
    readonly comboGauge: number;
    readonly comboMultiplier: number;
    readonly comboRank: string;
    readonly movingFast?: boolean;
    readonly airborne?: boolean;
  };
}

export interface TearScoreModuleApi {
  initialize(options: {
    readonly audioContext: AudioContext;
    readonly outputNode: AudioNode;
    readonly quality: "low" | "balanced" | "high";
    readonly seed?: string;
  }): Promise<void>;
  start(): Promise<void>;
  updateContext(context: TearScoreGameContext): void;
  setMuteReason(reason: string, muted: boolean): void;
  dispose(): Promise<void>;
}

interface TearScoreModule {
  readonly api: TearScoreModuleApi;
  readonly TearScoreAPI: new () => TearScoreModuleApi;
}
export type TearScoreModuleLoader = () => Promise<unknown>;

function isTearScoreModule(value: unknown): value is TearScoreModule {
  if (typeof value !== "object" || value === null || !("api" in value) || !("TearScoreAPI" in value)) return false;
  const api = value.api;
  return typeof api === "object" && api !== null && "initialize" in api
    && typeof api.initialize === "function" && typeof value.TearScoreAPI === "function";
}

function toGameContext(snapshot: MusicContextSnapshot): TearScoreGameContext {
  const screen = snapshot.scene === "main-menu" ? "menu"
    : snapshot.scene === "preparation" ? "setup"
      : snapshot.scene === "paused" ? "paused"
        : snapshot.scene === "draft" ? "draft"
          : snapshot.scene === "victory" ? "win"
            : snapshot.scene === "defeat" ? "gameover"
              : "playing";
  return {
    screen,
    mode: snapshot.modeId,
    difficulty: snapshot.difficultyId,
    biome: snapshot.biomeId,
    wave: snapshot.wave,
    ...(snapshot.waveActive === undefined ? {} : { waveActive: snapshot.waveActive }),
    ...(snapshot.liveEnemies === undefined ? {} : { liveEnemies: snapshot.liveEnemies }),
    ...(snapshot.queuedEnemies === undefined ? {} : { queuedEnemies: snapshot.queuedEnemies }),
    ...(snapshot.projectileCount === undefined ? {} : { projectileCount: snapshot.projectileCount }),
    ...(snapshot.horde === undefined ? {} : { horde: snapshot.horde }),
    ...(snapshot.miniBoss === undefined ? {} : { miniBoss: snapshot.miniBoss }),
    boss: {
      active: snapshot.bossActive,
      ...(snapshot.bossId === null ? {} : { id: snapshot.bossId }),
      ...(snapshot.bossPhase === null ? {} : { phase: snapshot.bossPhase }),
      ...(snapshot.bossHealthRatio === undefined ? {} : { healthRatio: snapshot.bossHealthRatio }),
      ...(snapshot.bossIntro === undefined ? {} : { intro: snapshot.bossIntro }),
      defeated: snapshot.scene === "victory",
    },
    player: {
      healthRatio: snapshot.playerHealthRatio,
      comboGauge: snapshot.comboGauge ?? 0,
      comboMultiplier: snapshot.comboMultiplier ?? 1,
      comboRank: snapshot.comboRankId,
      movingFast: snapshot.playerMoving,
      ...(snapshot.playerAirborne === undefined ? {} : { airborne: snapshot.playerAirborne }),
    },
  };
}

class PinnedModuleTearScoreClient implements TearScoreClient {
  readonly engineVersion = TEAR_SCORE_PROVENANCE.version;
  #api: TearScoreModuleApi;
  readonly #createApi: () => TearScoreModuleApi;
  #host: TearScoreInitializeOptions | null = null;
  readonly #muteReasons = new Set<TemporaryMuteReason>();
  #run: MusicRunSessionMetadata | null = null;
  #lastContext: TearScoreGameContext | null = null;
  #journalHash = 0x811c9dc5;

  constructor(api: TearScoreModuleApi, createApi: () => TearScoreModuleApi) {
    this.#api = api;
    this.#createApi = createApi;
  }

  initialize(options: TearScoreInitializeOptions): Promise<void> {
    this.#host = options;
    return this.#api.initialize({
      audioContext: unwrapBrowserAudioContext(options.audioContext),
      outputNode: unwrapBrowserAudioNode(options.outputNode),
      quality: options.quality,
      seed: "tear-menu",
    });
  }

  start(): Promise<void> { return this.#api.start(); }

  async beginRun(metadata: MusicRunSessionMetadata): Promise<void> {
    const host = this.#host;
    if (host === null) throw new Error("TearScore host must initialize before a musical run begins");
    await this.#api.dispose();
    this.#api = this.#createApi();
    await this.#api.initialize({
      audioContext: unwrapBrowserAudioContext(host.audioContext),
      outputNode: unwrapBrowserAudioNode(host.outputNode),
      quality: host.quality,
      seed: metadata.runSeed,
    });
    for (const reason of this.#muteReasons) this.#api.setMuteReason(reason, true);
    await this.#api.start();
    this.#run = metadata;
    this.#lastContext = null;
    this.#journalHash = 0x811c9dc5;
  }

  updateContext(snapshot: MusicContextSnapshot): void {
    this.#lastContext = toGameContext(snapshot);
    this.#api.updateContext(this.#lastContext);
  }

  emitEvent(event: MusicEvent): void {
    this.#appendJournal(JSON.stringify(event));
    if (this.#lastContext === null) return;
    const previous = this.#lastContext;
    if (event.type === "victory" || event.type === "defeat") {
      this.#lastContext = { ...previous, screen: event.type === "victory" ? "win" : "gameover" };
    } else if (event.type === "scene-changed") {
      this.#lastContext = { ...previous, screen: toGameContext({
        schemaVersion: 1,
        sequence: 0,
        timeMs: event.timeMs,
        scene: event.scene,
        modeId: previous.mode ?? "",
        difficultyId: previous.difficulty ?? "",
        biomeId: previous.biome ?? "menu",
        stageId: "",
        wave: previous.wave ?? 0,
        totalWaves: 0,
        bossActive: previous.boss?.active ?? false,
        bossId: previous.boss?.id ?? null,
        bossPhase: previous.boss?.phase ?? null,
        playerHealthRatio: previous.player?.healthRatio ?? 1,
        comboRankId: previous.player?.comboRank ?? "",
        playerMoving: previous.player?.movingFast ?? false,
      }).screen };
    } else if (event.type === "boss-entered") {
      this.#lastContext = { ...previous, boss: { ...previous.boss, active: true, id: event.bossId } };
    } else if (event.type === "boss-phase-changed") {
      this.#lastContext = { ...previous, boss: { ...previous.boss, active: true, id: event.bossId, phase: event.phase } };
    } else if (event.type === "combo-rank-changed") {
      const player = previous.player ?? { healthRatio: 1, comboGauge: 0, comboMultiplier: 1, comboRank: "" };
      this.#lastContext = {
        ...previous,
        player: { ...player, comboRank: event.rankId },
      };
    } else {
      const player = previous.player ?? { healthRatio: 1, comboGauge: 0, comboMultiplier: 1, comboRank: "" };
      this.#lastContext = {
        ...previous,
        player: { ...player, comboGauge: 1 },
      };
    }
    // Adapter 0.1 exposes context snapshots rather than a separate event channel.
    // Sending the adjusted snapshot here preserves same-frame semantic delivery.
    this.#api.updateContext(this.#lastContext);
  }

  endRun(): Promise<void> {
    this.#run = null;
    this.#lastContext = null;
    return Promise.resolve();
  }

  setMuteReason(reason: TemporaryMuteReason, muted: boolean): void {
    if (muted) this.#muteReasons.add(reason);
    else this.#muteReasons.delete(reason);
    this.#api.setMuteReason(reason, muted);
  }

  replayMetadata(): MusicReplayMetadata {
    if (this.#run === null) return { enabled: false, reason: "not-recorded" };
    return {
      enabled: true,
      engineVersion: TEAR_SCORE_PROVENANCE.version,
      scoreVersion: this.#run.scoreVersion,
      seed: this.#run.runSeed,
      eventJournalHash: this.#journalHash.toString(16).padStart(8, "0"),
    };
  }

  resume(): Promise<void> {
    this.#api.setMuteReason("platform-suspend", false);
    return this.#api.start();
  }

  suspend(): Promise<void> {
    this.#api.setMuteReason("platform-suspend", true);
    return Promise.resolve();
  }

  dispose(): Promise<void> { return this.#api.dispose(); }

  #appendJournal(value: string): void {
    for (let index = 0; index < value.length; index++) {
      this.#journalHash ^= value.charCodeAt(index);
      this.#journalHash = Math.imul(this.#journalHash, 0x01000193) >>> 0;
    }
  }
}

export function createPinnedModuleTearScoreClient(
  api: TearScoreModuleApi,
  createApi: () => TearScoreModuleApi = () => api,
): TearScoreClient {
  return new PinnedModuleTearScoreClient(api, createApi);
}

let preparation: Promise<TearScoreClient> | null = null;

const loadVendoredModule: TearScoreModuleLoader = async () => {
  if (typeof document === "undefined") throw new Error("TearScore ESM requires a browser document");
  const source = new URL(TEAR_SCORE_PATH, document.baseURI).href;
  return import(/* @vite-ignore */ source);
};

/** Loads the exact same-origin ESM release without globals or a second AudioContext. */
export function preparePinnedTearScoreClient(
  loader: TearScoreModuleLoader = loadVendoredModule,
): Promise<TearScoreClient> {
  if (preparation !== null) return preparation;
  preparation = (async () => {
    const module = await loader();
    if (!isTearScoreModule(module)) {
      throw new Error("Pinned TearScore ESM did not expose its adapter API");
    }
    return createPinnedModuleTearScoreClient(module.api, () => new module.TearScoreAPI());
  })().catch((error: unknown) => {
    preparation = null;
    throw error;
  });
  return preparation;
}
