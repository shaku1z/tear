import { describe, expect, it, vi } from "vitest";
import { AudioSystem } from "../../src/audio/audio-system";
import type {
  AudioGraphContext,
  AudioNodePort,
  GainNodePort,
  GainParamPort,
} from "../../src/audio/mixer";
import type {
  MusicBackend,
  MusicContextSnapshot,
  MusicEvent,
  MusicRunSessionMetadata,
} from "../../src/audio/music-contracts";
import type {
  AudioEffectsBackend,
  AudioEffectsBackendHost,
} from "../../src/audio/effects-contracts";

class FakeParam implements GainParamPort {
  value = 1;
  cancelScheduledValues(): void { return undefined; }
  setValueAtTime(value: number): void { this.value = value; }
  linearRampToValueAtTime(value: number): void { this.value = value; }
}

class FakeNode implements GainNodePort {
  readonly gain = new FakeParam();
  readonly connections: AudioNodePort[] = [];
  disconnected = false;
  connect(destination: AudioNodePort): void { this.connections.push(destination); }
  disconnect(): void { this.disconnected = true; }
}

class FakeContext implements AudioGraphContext {
  currentTime = 0;
  state: "suspended" | "running" | "closed" = "suspended";
  readonly destination = new FakeNode();
  readonly nodes = new Map<string, FakeNode>();
  readonly resume = vi.fn(() => { this.state = "running"; return Promise.resolve(); });
  readonly suspend = vi.fn(() => { this.state = "suspended"; return Promise.resolve(); });
  readonly close = vi.fn(() => { this.state = "closed"; return Promise.resolve(); });
  createGain(label: string): FakeNode {
    const node = new FakeNode();
    this.nodes.set(label, node);
    return node;
  }
}

class FakeBackend implements MusicBackend {
  readonly calls: string[] = [];
  failInitialization = false;
  failRunStart = false;
  constructor(readonly id: string) {}
  initialize(): Promise<void> {
    this.calls.push("initialize");
    if (this.failInitialization) return Promise.reject(new Error(`${this.id} failed`));
    return Promise.resolve();
  }
  beginRun(): Promise<void> {
    this.calls.push("beginRun");
    return this.failRunStart ? Promise.reject(new Error(`${this.id} run failed`)) : Promise.resolve();
  }
  updateContext(): void { this.calls.push("updateContext"); }
  emitEvent(): void { this.calls.push("emitEvent"); }
  endRun(): Promise<void> { this.calls.push("endRun"); return Promise.resolve(); }
  setMuteReason(reason: string, muted: boolean): void {
    this.calls.push(`mute:${reason}:${String(muted)}`);
  }
  replayMetadata() { return { enabled: false, reason: "fallback" } as const; }
  resume(): Promise<void> { this.calls.push("resume"); return Promise.resolve(); }
  suspend(): Promise<void> { this.calls.push("suspend"); return Promise.resolve(); }
  dispose(): Promise<void> { this.calls.push("dispose"); return Promise.resolve(); }
}

class FakeEffectsBackend implements AudioEffectsBackend {
  readonly initialize = vi.fn((host: AudioEffectsBackendHost) => {
    for (const route of ["weapons", "enemies", "player", "environment"] as const) {
      host.sfxOutput(route);
    }
    void host.interfaceOutput;
    return Promise.resolve();
  });
  readonly dispose = vi.fn(() => Promise.resolve());
  debugResourceSnapshot(): Readonly<{ readonly graphNodes: number }> {
    return Object.freeze({ graphNodes: 15 });
  }
}

const RUN: MusicRunSessionMetadata = {
  runId: "run-1",
  runSeed: "seed-1",
  rulesetVersion: "rules-3",
  gameVersion: "0.1.0",
  scoreVersion: "score-2",
};

const SNAPSHOT: MusicContextSnapshot = {
  schemaVersion: 1,
  sequence: 1,
  timeMs: 500,
  scene: "combat",
  modeId: "standard",
  difficultyId: "normal",
  biomeId: "ruins",
  stageId: "stage-1",
  wave: 2,
  totalWaves: 5,
  bossActive: false,
  bossId: null,
  bossPhase: null,
  playerHealthRatio: 0.8,
  comboRankId: "b",
  playerMoving: true,
};

const EVENT: MusicEvent = {
  eventId: "event-1",
  timeMs: 510,
  type: "perfect-parry",
  weaponId: "blade",
};

function makeSystem(
  context: FakeContext,
  primary: MusicBackend | null,
  fallback: MusicBackend | null,
  effectsBackend?: AudioEffectsBackend,
) {
  const create = vi.fn(() => { return context; });
  return {
    create,
    system: new AudioSystem({
      contextFactory: { create },
      settingsStore: null,
      initialSettings: undefined,
      primaryMusicBackend: primary,
      fallbackMusicBackend: fallback,
      ...(effectsBackend === undefined ? {} : { effectsBackend }),
      gainRampSeconds: 0.015,
    }),
  };
}

describe("AudioSystem", () => {
  it("creates and resumes its context exactly once across concurrent activation", async () => {
    const context = new FakeContext();
    const backend = new FakeBackend("tear-score");
    const { create, system } = makeSystem(context, backend, null);

    await Promise.all([system.activateFromUserGesture(), system.activateFromUserGesture()]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(backend.calls).toEqual(["initialize"]);
    expect(system.state).toBe("running");
  });

  it("disposes a failed primary before initializing the legacy fallback", async () => {
    const context = new FakeContext();
    const primary = new FakeBackend("tear-score");
    const fallback = new FakeBackend("legacy");
    primary.failInitialization = true;
    const { system } = makeSystem(context, primary, fallback);

    await system.activateFromUserGesture();

    expect(primary.calls).toEqual(["initialize", "dispose"]);
    expect(fallback.calls).toEqual(["initialize"]);
    expect(system.activeMusicBackendId).toBe("legacy");
  });

  it("switches exclusively to the fallback when a seeded run cannot start", async () => {
    const primary = new FakeBackend("tear-score");
    const fallback = new FakeBackend("legacy");
    primary.failRunStart = true;
    const { system } = makeSystem(new FakeContext(), primary, fallback);
    await system.activateFromUserGesture();

    await system.beginMusicRun(RUN);

    expect(primary.calls).toEqual(["initialize", "beginRun", "dispose"]);
    expect(fallback.calls).toEqual(["initialize", "beginRun"]);
    expect(system.activeMusicBackendId).toBe("legacy");
    expect(system.musicReplayMetadata()).toEqual({ enabled: false, reason: "fallback" });
  });

  it("forwards deterministic run context and events only during an active run", async () => {
    const backend = new FakeBackend("tear-score");
    const { system } = makeSystem(new FakeContext(), backend, null);
    await system.activateFromUserGesture();

    expect(() => { system.updateMusicContext(SNAPSHOT); }).toThrow("No music run is active");
    await system.beginMusicRun(RUN);
    system.updateMusicContext(SNAPSHOT);
    system.emitMusicEvent(EVENT);
    await system.endMusicRun();

    expect(backend.calls).toEqual([
      "initialize",
      "beginRun",
      "updateContext",
      "emitEvent",
      "endRun",
    ]);
  });

  it("keeps mute reasons through activation and owns suspend, resume, and disposal", async () => {
    const context = new FakeContext();
    const backend = new FakeBackend("tear-score");
    const { system } = makeSystem(context, backend, null);
    system.setTemporaryMute("ad", true);
    await system.activateFromUserGesture();
    await system.suspend();
    await system.resume();
    await Promise.all([system.dispose(), system.dispose()]);

    expect(backend.calls).toEqual([
      "initialize",
      "mute:ad:true",
      "suspend",
      "resume",
      "dispose",
    ]);
    expect(context.suspend).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(system.state).toBe("disposed");
  });

  it("releases every owned context, mixer node, and effects backend across repeated runs", async () => {
    for (let index = 0; index < 12; index++) {
      const context = new FakeContext();
      const effects = new FakeEffectsBackend();
      const { system } = makeSystem(context, null, null, effects);
      system.setTemporaryMute("visibility", true);

      await system.activateFromUserGesture();
      expect(system.debugResourceSnapshot()).toEqual({
        contexts: 1,
        mixerNodes: 8,
        effectsBackendNodes: 15,
        temporaryMuteReasons: ["visibility"],
      });

      await system.dispose();
      expect(effects.initialize).toHaveBeenCalledOnce();
      expect(effects.dispose).toHaveBeenCalledOnce();
      expect([...context.nodes.values()].every((node) => node.disconnected)).toBe(true);
      expect(system.debugResourceSnapshot()).toEqual({
        contexts: 0,
        mixerNodes: 0,
        effectsBackendNodes: 0,
        temporaryMuteReasons: ["visibility"],
      });
    }
  });
});
