import { describe, expect, it, vi } from "vitest";

const captured: { tutorialOptions: unknown; presentationOptions: unknown } = vi.hoisted(() => ({
  tutorialOptions: undefined,
  presentationOptions: undefined,
}));

vi.mock("../../src/gameplay/training/live-tutorial-runtime", () => ({
  createLiveTutorialRuntime: (options: unknown) => {
    captured.tutorialOptions = options;
    return Object.freeze({});
  },
}));
vi.mock("../../src/gameplay/training/playground-controller", () => ({
  PlaygroundController: class {
    readonly state = { labFilter: "" };
  },
  PLAYGROUND_ALL_KINDS: [],
  PLAYGROUND_HOTKEY_KINDS: [],
}));
vi.mock("../../src/gameplay/training/runtime-bridge", () => ({
  createPlaygroundRuntimeBridge: () => Object.freeze({ homePlatforms: () => [] }),
  PLAYGROUND_TABS: [],
}));
vi.mock("../../src/gameplay/training/live-playground-presentation", () => ({
  createLivePlaygroundPresentation: (options: unknown) => {
    captured.presentationOptions = options;
    return Object.freeze({});
  },
}));

import { createLiveTrainingHostRuntime } from "../../src/app/training/training-host-runtime";
import { createTrainingCallouts } from "../../src/app/training/training-coach";

describe("live training host runtime", () => {
  it("supplies its tutorial profile-stat port from the shared adapter", () => {
    const add = vi.fn(),
      input = { mode: "touch" };
    createLiveTrainingHostRuntime({
      dependencies: { profileStatsPersistence: { add, max: vi.fn() }, Input: input } as never,
      state: {} as never,
      width: 1600,
      height: 900,
      lifecycle: {} as never,
      stage: {} as never,
      spawn: vi.fn(),
      navigate: vi.fn(),
      resetScroll: vi.fn(),
      releasePointer: vi.fn(),
      requestPointer: vi.fn(),
      selectStage: vi.fn(),
      wipe: vi.fn(),
      resetRun: vi.fn(),
      startPractice: vi.fn(),
      selectedWeapon: vi.fn(),
      selectWeapon: vi.fn(),
      callouts: createTrainingCallouts(),
      drawGhost: vi.fn(),
      abilityColors: vi.fn(),
      scroll: vi.fn(),
      setScroll: vi.fn(),
      renderMenu: vi.fn(),
      renderLab: vi.fn(),
    });

    const tutorial = captured.tutorialOptions as {
      readonly addProfileStat: (stat: string, amount: number) => void;
    };
    tutorial.addProfileStat("tutorials", 1);

    expect(add).toHaveBeenCalledWith("tutorials", 1);

    // The playground build menu words its subtitle for the device that owns input right now.
    const presentation = captured.presentationOptions as { readonly inputDevice: () => string };
    expect(presentation.inputDevice()).toBe("touch");
    input.mode = "gamepad";
    expect(presentation.inputDevice()).toBe("gamepad");
  });
});
