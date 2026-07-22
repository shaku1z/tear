import { describe, expect, it } from "vitest";
import {
  HierarchicalAudioMixer,
  type AudioGraphContext,
  type AudioNodePort,
  type AudioSettingsStore,
  type GainNodePort,
  type GainParamPort,
} from "../../src/audio/mixer";

class FakeParam implements GainParamPort {
  value = 1;
  readonly ramps: { readonly from: number; readonly to: number; readonly end: number }[] = [];

  cancelScheduledValues(): void { return undefined; }

  setValueAtTime(value: number): void {
    this.value = value;
  }

  linearRampToValueAtTime(value: number, endTime: number): void {
    this.ramps.push({ from: this.value, to: value, end: endTime });
    this.value = value;
  }
}

class FakeNode implements GainNodePort {
  readonly gain = new FakeParam();
  readonly connections: AudioNodePort[] = [];
  disconnected = false;

  connect(destination: AudioNodePort): void {
    this.connections.push(destination);
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeContext implements AudioGraphContext {
  currentTime = 3;
  state = "suspended" as const;
  readonly destination = new FakeNode();
  readonly nodes = new Map<string, FakeNode>();

  createGain(label: string): FakeNode {
    const node = new FakeNode();
    this.nodes.set(label, node);
    return node;
  }

  resume(): Promise<void> { return Promise.resolve(); }
  suspend(): Promise<void> { return Promise.resolve(); }
  close(): Promise<void> { return Promise.resolve(); }
}

describe("HierarchicalAudioMixer", () => {
  it("routes category buses through master and internal SFX buses through SFX", () => {
    const context = new FakeContext();
    const mixer = new HierarchicalAudioMixer(context, undefined);

    expect(context.nodes.get("master")?.connections).toEqual([context.destination]);
    expect(context.nodes.get("music")?.connections).toEqual([context.nodes.get("master")]);
    expect(context.nodes.get("sfx.weapons")?.connections).toEqual([context.nodes.get("sfx")]);
    expect(mixer.sfxBus("environment")).toBe(context.nodes.get("sfx.environment"));
  });

  it("persists user settings without overwriting them during temporary mutes", () => {
    const saved: unknown[] = [];
    const store: AudioSettingsStore = {
      load: () => undefined,
      save: (settings) => saved.push(settings),
    };
    const context = new FakeContext();
    const mixer = new HierarchicalAudioMixer(context, { musicVolume: 0.4 }, store, 0.02);

    mixer.setVolume("music", 0.7);
    mixer.setMuted("sfx", true);
    mixer.setTemporaryMute("ad", true);
    mixer.setTemporaryMute("portal", true);
    mixer.setTemporaryMute("ad", false);

    expect(mixer.settings.musicVolume).toBe(0.7);
    expect(mixer.settings.sfxMuted).toBe(true);
    expect(mixer.temporaryMuteReasons).toEqual(new Set(["portal"]));
    expect(saved).toHaveLength(2);
    expect(context.nodes.get("master")?.gain.value).toBe(0);

    mixer.setTemporaryMute("portal", false);
    expect(context.nodes.get("master")?.gain.value).toBe(0.6);
  });

  it("ramps every gain change rather than assigning it abruptly", () => {
    const context = new FakeContext();
    const mixer = new HierarchicalAudioMixer(context, undefined, null, 0.025);
    const music = context.nodes.get("music");

    mixer.setVolume("music", 0.2);

    expect(music?.gain.ramps.at(-1)).toEqual({ from: 0.5, to: 0.2, end: 3.025 });
  });
});
