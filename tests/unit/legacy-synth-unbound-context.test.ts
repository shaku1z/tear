import { afterEach, describe, expect, it, vi } from "vitest";

import { createBrowserAudioContextHandoff } from "../../src/audio/audio-context-handoff";
import { createLegacySynthFacade } from "../../src/audio/legacy-synth";

// A concrete runtime whose cues behave like the real one: they require the bound context.
const runtime = vi.hoisted(() => {
  const played: string[] = [];
  const state = { ctx: null as object | null };
  const requireContext = (name: string) => () => {
    if (state.ctx === null) throw new Error("Legacy audio context is not bound");
    played.push(name);
  };
  return {
    played,
    state,
    sfx: {
      get ctx() {
        return state.ctx;
      },
      init: vi.fn(),
      resume: vi.fn(),
      applySettings: vi.fn(),
      setVol: vi.fn(),
      wave: requireContext("wave"),
      swing: requireContext("swing"),
      ui: requireContext("ui"),
      hurt: requireContext("hurt"),
      debugSnapshot: () => ({ state: state.ctx === null ? "awaiting-user-activation" : "running" }),
    },
  };
});

vi.mock("../../src/audio/legacy-synth-runtime", () => ({ createLegacySynthRuntime: () => runtime.sfx }));

function createFacade() {
  const target = new EventTarget() as unknown as Window;
  return createLegacySynthFacade({
    audioContextHandoff: createBrowserAudioContextHandoff(),
    browserWindow: target,
    readPersistedSettings: () => ({}),
  });
}

afterEach(() => {
  runtime.played.splice(0);
  runtime.state.ctx = null;
});

describe("legacy SFX before the audio context is bound", () => {
  it("drops cues instead of throwing into gameplay once the runtime is loaded", async () => {
    const SFX = createFacade();
    SFX.init();
    await vi.dynamicImportSettled();

    expect(() => {
      SFX.wave();
      SFX.swing(3000);
      SFX.hurt();
      SFX.ui();
    }).not.toThrow();
    expect(runtime.played).toEqual([]);

    runtime.state.ctx = {};
    SFX.wave();
    expect(runtime.played).toEqual(["wave"]);
  });

  it("does not replay queued cues late, and an unbound context never fails the runtime load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const SFX = createFacade();
    SFX.wave();
    SFX.swing(3000);
    SFX.setVol(0.4);
    SFX.init();
    await vi.dynamicImportSettled();

    expect(runtime.played).toEqual([]);
    expect(runtime.sfx.setVol).toHaveBeenCalledWith(0.4);
    // A queued cue that threw here used to fail the runtime load and dispose the
    // audio-context handoff, leaving the whole session silent.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    runtime.state.ctx = {};
    SFX.hurt();
    expect(runtime.played).toEqual(["hurt"]);
  });
});
