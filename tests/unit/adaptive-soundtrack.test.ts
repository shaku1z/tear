import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_SOUNDTRACK_MODULE_PATH,
  ADAPTIVE_SOUNDTRACK_TONE_HOST_PATH,
  AdaptiveSoundtrackMusicBackend,
  preparePinnedAdaptiveSoundtrackClient,
  withPinnedToneHost,
  type AdaptiveSoundtrackClient,
} from "../../src/audio/adaptive-soundtrack";
import type { AudioGraphContext, AudioNodePort } from "../../src/audio/mixer";
import type {
  MusicReplayMetadata,
  MusicRunSessionMetadata,
} from "../../src/audio/music-contracts";
import {
  BrowserAudioGraphContext,
  BrowserAudioNodePort,
} from "../../src/audio/browser-audio";
import type {
  TearScoreModuleApi,
} from "../../src/audio/tear-score-module";

const RUN: MusicRunSessionMetadata = {
  runId: "run-adaptive-1",
  runSeed: "seed-adaptive-1",
  rulesetVersion: "rules-1",
  gameVersion: "game-1",
  scoreVersion: "score-1",
};

interface Observation {
  readonly initializeHosts: unknown[];
  starts: number;
  disposals: number;
}

function createApi(observation: Observation): TearScoreModuleApi {
  return {
    initialize: (options) => {
      observation.initializeHosts.push(options);
      return Promise.resolve();
    },
    start: () => {
      observation.starts += 1;
      return Promise.resolve();
    },
    updateContext: () => undefined,
    setMuteReason: () => undefined,
    dispose: () => {
      observation.disposals += 1;
      return Promise.resolve();
    },
  };
}

function createModule(observation: Observation): { readonly api: TearScoreModuleApi; readonly AdaptiveSoundtrackAPI: new () => TearScoreModuleApi } {
  class AdaptiveSoundtrackAPI implements TearScoreModuleApi {
    readonly #api = createApi(observation);
    initialize(options: Parameters<TearScoreModuleApi["initialize"]>[0]): Promise<void> {
      return this.#api.initialize(options);
    }
    start(): Promise<void> { return this.#api.start(); }
    updateContext(context: Parameters<TearScoreModuleApi["updateContext"]>[0]): void {
      this.#api.updateContext(context);
    }
    setMuteReason(reason: string, muted: boolean): void {
      this.#api.setMuteReason(reason, muted);
    }
    dispose(): Promise<void> { return this.#api.dispose(); }
  }
  return { api: createApi(observation), AdaptiveSoundtrackAPI };
}

function fakeClient(observation: {
  readonly calls: string[];
}): AdaptiveSoundtrackClient {
  const replay: MusicReplayMetadata = {
    enabled: true,
    engineVersion: "0.1.0-alpha.1",
    scoreVersion: RUN.scoreVersion,
    seed: RUN.runSeed,
    eventJournalHash: "1234abcd",
  };
  return {
    engineVersion: "0.1.0-alpha.1",
    initialize: (options) => {
      observation.calls.push(`initialize:${options.quality}`);
      return Promise.resolve();
    },
    start: () => {
      observation.calls.push("start");
      return Promise.resolve();
    },
    beginRun: (metadata) => {
      observation.calls.push(`begin:${metadata.runId}`);
      return Promise.resolve();
    },
    updateContext: () => undefined,
    emitEvent: () => undefined,
    endRun: () => Promise.resolve(),
    setMuteReason: (reason, muted) => {
      observation.calls.push(`mute:${reason}:${String(muted)}`);
    },
    replayMetadata: () => replay,
    resume: () => {
      observation.calls.push("resume");
      return Promise.resolve();
    },
    suspend: () => {
      observation.calls.push("suspend");
      return Promise.resolve();
    },
    dispose: () => {
      observation.calls.push("dispose");
      return Promise.resolve();
    },
  };
}

function browserHost() {
  const rawNode = {} as AudioNode;
  const rawContext = {
    destination: rawNode,
    currentTime: 0,
    state: "running",
  } as unknown as AudioContext;
  return {
    rawContext,
    rawNode,
    audioContext: new BrowserAudioGraphContext(rawContext),
    outputNode: new BrowserAudioNodePort(rawNode),
    quality: "balanced" as const,
  };
}

describe("Adaptive Soundtrack compatibility facade", () => {
  it("defines canonical asset locations while retaining the explicit legacy fallback", () => {
    const root = resolve(import.meta.dirname, "../..");
    expect(ADAPTIVE_SOUNDTRACK_MODULE_PATH).toBe("vendor/tear-music/adaptive-soundtrack.esm.js");
    expect(ADAPTIVE_SOUNDTRACK_TONE_HOST_PATH).toBe("vendor/tear-music/tone-host-14.9.17.esm.js");
    expect(existsSync(resolve(root, "public", ADAPTIVE_SOUNDTRACK_MODULE_PATH))).toBe(true);
    expect(existsSync(resolve(root, "public", ADAPTIVE_SOUNDTRACK_TONE_HOST_PATH))).toBe(true);
    expect(existsSync(resolve(root, "public", "vendor/tear-score/tear-score.esm.js"))).toBe(true);
    expect(existsSync(resolve(root, "public", "vendor/tear-score/tone-host-14.9.17.esm.js"))).toBe(true);
  });

  it("loads the canonical module first and does not invoke the fallback after success", async () => {
    const observation: Observation = { initializeHosts: [], starts: 0, disposals: 0 };
    const calls: string[] = [];
    const client = await preparePinnedAdaptiveSoundtrackClient({
      canonicalLoader: () => {
        calls.push("canonical");
        return Promise.resolve(createModule(observation));
      },
      fallbackLoader: () => {
        calls.push("fallback");
        return Promise.resolve(fakeClient({ calls }));
      },
      cache: false,
    });

    expect(client.engineVersion).toBe("0.1.0-alpha.1");
    expect(calls).toEqual(["canonical"]);
  });

  it("falls back to the pinned TearScore client when the canonical module is absent or invalid", async () => {
    const calls: string[] = [];
    const fallback = fakeClient({ calls });
    const client = await preparePinnedAdaptiveSoundtrackClient({
      canonicalLoader: () => {
        calls.push("canonical");
        return Promise.resolve({ notAnAdapter: true });
      },
      fallbackLoader: () => {
        calls.push("fallback");
        return Promise.resolve(fallback);
      },
      cache: false,
    });

    expect(client).toBe(fallback);
    expect(calls).toEqual(["canonical", "fallback"]);
  });

  it("deletes the temporary Tone global after successful canonical evaluation", async () => {
    const runtime = globalThis as typeof globalThis & { Tone?: unknown };
    const hadOwnTone = Object.prototype.hasOwnProperty.call(runtime, "Tone");
    const previousTone = runtime.Tone;

    try {
      delete runtime.Tone;
      const result = await withPinnedToneHost(
        { marker: "canonical-success" },
        () => Promise.resolve().then(() => {
          expect(Object.prototype.hasOwnProperty.call(runtime, "Tone")).toBe(true);
          expect(runtime.Tone).toEqual({ marker: "canonical-success" });
          return "loaded";
        }),
      );

      expect(result).toBe("loaded");
      expect(Object.prototype.hasOwnProperty.call(runtime, "Tone")).toBe(false);
    } finally {
      if (hadOwnTone) runtime.Tone = previousTone;
      else delete runtime.Tone;
    }
  });

  it("restores an existing Tone global when canonical evaluation rejects", async () => {
    const runtime = globalThis as typeof globalThis & { Tone?: unknown };
    const hadOwnTone = Object.prototype.hasOwnProperty.call(runtime, "Tone");
    const previousTone = runtime.Tone;
    const existingTone = { marker: "pre-existing" };

    try {
      runtime.Tone = existingTone;
      await expect(
        withPinnedToneHost(
          { marker: "canonical-rejected" },
          () => Promise.resolve().then(() => {
            expect(runtime.Tone).toEqual({ marker: "canonical-rejected" });
            throw new Error("canonical import rejected");
          }),
        ),
      ).rejects.toThrow("canonical import rejected");

      expect(runtime.Tone).toBe(existingTone);
    } finally {
      if (hadOwnTone) runtime.Tone = previousTone;
      else delete runtime.Tone;
    }
  });

  it("shares one preparation promise for concurrent callers", async () => {
    const observation: Observation = { initializeHosts: [], starts: 0, disposals: 0 };
    let loads = 0;
    const options = {
      canonicalLoader: () => {
        loads += 1;
        return Promise.resolve().then(() => createModule(observation));
      },
      fallbackLoader: () => Promise.resolve(fakeClient({ calls: [] })),
      cache: true,
    } as const;

    const first = preparePinnedAdaptiveSoundtrackClient(options);
    const second = preparePinnedAdaptiveSoundtrackClient(options);
    expect(await first).toBe(await second);
    expect(loads).toBe(1);
  });

  it("keeps the shared host and legacy replay metadata contract in the canonical backend facade", async () => {
    const observation = { calls: [] as string[] };
    const client = fakeClient(observation);
    const context = {} as AudioGraphContext;
    const output = {} as AudioNodePort;
    const backend = new AdaptiveSoundtrackMusicBackend(client, "high");

    await backend.initialize({ context, output });
    await backend.beginRun(RUN);
    backend.setMuteReason("platform-suspend", true);
    await backend.suspend();
    await backend.resume();

    expect(backend.id).toBe("tear-score@0.1.0-alpha.1");
    expect(observation.calls).toEqual([
      "initialize:high",
      "start",
      "begin:run-adaptive-1",
      "mute:platform-suspend:true",
      "suspend",
      "resume",
    ]);
    expect(backend.replayMetadata()).toEqual({
      enabled: true,
      engineVersion: "0.1.0-alpha.1",
      scoreVersion: "score-1",
      seed: "seed-adaptive-1",
      eventJournalHash: "1234abcd",
    });
  });

  it("retains canonical client replay metadata and shared AudioContext identity", async () => {
    const observation: Observation = { initializeHosts: [], starts: 0, disposals: 0 };
    const client = await preparePinnedAdaptiveSoundtrackClient({
      canonicalLoader: () => Promise.resolve(createModule(observation)),
      fallbackLoader: () => Promise.reject(new Error("fallback must not run")),
      cache: false,
    });
    const host = browserHost();

    await client.initialize(host);
    await client.beginRun(RUN);

    expect(observation.initializeHosts[0]).toMatchObject({
      audioContext: host.rawContext,
      outputNode: host.rawNode,
    });
    expect(client.replayMetadata()).toMatchObject({
      enabled: true,
      engineVersion: "0.1.0-alpha.1",
      scoreVersion: RUN.scoreVersion,
      seed: RUN.runSeed,
    });
  });
});
