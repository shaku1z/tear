import { describe, expect, it, vi } from "vitest";
import type {
  AudioGraphContext,
  AudioNodePort,
  GainNodePort,
  GainParamPort,
} from "../../src/audio/mixer";
import type { MusicRunSessionMetadata } from "../../src/audio/music-contracts";
import {
  TearScoreMusicBackend,
  type TearScoreClient,
  type TearScoreInitializeOptions,
} from "../../src/audio/tear-score-adapter";

class Node implements GainNodePort {
  readonly gain: GainParamPort = {
    value: 1,
    cancelScheduledValues: () => undefined,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
  };
  connect(): void { return undefined; }
  disconnect(): void { return undefined; }
}

class Context implements AudioGraphContext {
  readonly currentTime = 0;
  readonly state = "running" as const;
  readonly destination = new Node();
  createGain(): GainNodePort { return new Node(); }
  resume(): Promise<void> { return Promise.resolve(); }
  suspend(): Promise<void> { return Promise.resolve(); }
  close(): Promise<void> { return Promise.resolve(); }
}

describe("TearScore adapter contract", () => {
  it("initializes TearScore against the host music bus before starting it", async () => {
    const calls: string[] = [];
    let initialization: TearScoreInitializeOptions | null = null;
    const client: TearScoreClient = {
      engineVersion: "0.1.0-alpha.1",
      initialize: (options) => { initialization = options; calls.push("initialize"); return Promise.resolve(); },
      start: () => { calls.push("start"); return Promise.resolve(); },
      beginRun: () => Promise.resolve(),
      updateContext: () => undefined,
      emitEvent: () => undefined,
      endRun: () => Promise.resolve(),
      setMuteReason: () => undefined,
      replayMetadata: () => ({ enabled: false, reason: "not-recorded" }),
      resume: () => Promise.resolve(),
      suspend: () => Promise.resolve(),
      dispose: () => Promise.resolve(),
    };
    const context = new Context();
    const musicBus: AudioNodePort = new Node();
    const backend = new TearScoreMusicBackend(client, "high");

    await backend.initialize({ context, output: musicBus });

    expect(calls).toEqual(["initialize", "start"]);
    expect(initialization).toEqual({
      audioContext: context,
      outputNode: musicBus,
      quality: "high",
    });
    expect(backend.id).toBe("tear-score@0.1.0-alpha.1");
  });

  it("retains run seed and version metadata at the package boundary", async () => {
    const beginRun = vi.fn((metadata: MusicRunSessionMetadata) => {
      void metadata;
      return Promise.resolve();
    });
    const client: TearScoreClient = {
      engineVersion: "dev",
      initialize: () => Promise.resolve(),
      start: () => Promise.resolve(),
      beginRun,
      updateContext: () => undefined,
      emitEvent: () => undefined,
      endRun: () => Promise.resolve(),
      setMuteReason: () => undefined,
      replayMetadata: () => ({ enabled: false, reason: "not-recorded" }),
      resume: () => Promise.resolve(),
      suspend: () => Promise.resolve(),
      dispose: () => Promise.resolve(),
    };
    const backend = new TearScoreMusicBackend(client);
    const metadata: MusicRunSessionMetadata = {
      runId: "run-42",
      runSeed: "seed-42",
      rulesetVersion: "rules-3",
      gameVersion: "1.0.0",
      scoreVersion: "score-7",
    };

    await backend.beginRun(metadata);

    expect(beginRun).toHaveBeenCalledWith(metadata);
  });
});
