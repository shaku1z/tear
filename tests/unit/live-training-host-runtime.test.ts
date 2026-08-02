import { describe, expect, it, vi } from "vitest";

const captured: { tutorialOptions: unknown } = vi.hoisted(() => ({ tutorialOptions: undefined }));

vi.mock("../../src/gameplay/training/live-tutorial-runtime", () => ({
  createLiveTutorialRuntime: (options: unknown) => {
    captured.tutorialOptions = options;
    return Object.freeze({});
  },
}));
vi.mock("../../src/gameplay/training/playground-controller", () => ({
  PlaygroundController: class { readonly state = { labFilter: "" }; },
  PLAYGROUND_ALL_KINDS: [],
}));
vi.mock("../../src/gameplay/training/runtime-bridge", () => ({
  createPlaygroundRuntimeBridge: () => Object.freeze({ homePlatforms: () => [] }),
}));
vi.mock("../../src/gameplay/training/live-playground-presentation", () => ({
  createLivePlaygroundPresentation: () => Object.freeze({}),
}));

import { createLiveTrainingHostRuntime } from "../../src/app/live-training-host-runtime";

describe("live training host runtime", () => {
  it("supplies its tutorial profile-stat port from the shared adapter", () => {
    const add = vi.fn();
    createLiveTrainingHostRuntime({
      dependencies: { profileStatsPersistence: { add, max: vi.fn() } } as never,
      state: {} as never, width: 1600, height: 900, lifecycle: {} as never,
      stage: {} as never, spawn: vi.fn(), navigate: vi.fn(), resetScroll: vi.fn(),
      releasePointer: vi.fn(), requestPointer: vi.fn(), selectStage: vi.fn(),
      wipe: vi.fn(), resetRun: vi.fn(), startPractice: vi.fn(), selectedWeapon: vi.fn(),
      selectWeapon: vi.fn(), addFloater: vi.fn(), drawGhost: vi.fn(), abilityColors: vi.fn(),
      scroll: vi.fn(), setScroll: vi.fn(), renderMenu: vi.fn(), renderLab: vi.fn(),
    });

    const tutorial = captured.tutorialOptions as {
      readonly addProfileStat: (stat: string, amount: number) => void;
    };
    tutorial.addProfileStat("tutorials", 1);

    expect(add).toHaveBeenCalledWith("tutorials", 1);
  });
});
