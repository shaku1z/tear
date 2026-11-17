import { describe, expect, it, vi } from "vitest";
import {
  RuntimeFrameCoordinator,
  type RuntimeFrameCoordinatorOptions,
  type RuntimeFrameInputPort,
} from "../../src/app/shell/runtime-frame-coordinator";

function createHarness(initialState = "playing") {
  let state = initialState;
  let touch = false;
  let escape = false;
  let pause = false;
  let cinemaActive = false;
  let endCinemaOnUpdate = false;
  let cinemaPlayerMode: string | undefined;
  let cssPerLogicalPixel = 1;
  let simulationSteps = 1;
  let now = 0;
  const events: string[] = [];
  const input: RuntimeFrameInputPort = {
    held: new Set(),
    pressed: new Set(),
    btnHeld: {},
    tJump: false,
    allowLock: false,
    mode: "keyboard",
    locked: false,
    uiMode: false,
    updateUI: () => {
      events.push("input");
    },
    takeClick: () => null,
    touchActive: () => touch,
    pausePressed: () => pause,
    escapePressed: () => escape,
    endFrame: () => {
      events.push("end-input");
    },
    discardScenePresses: () => {
      events.push("discard-scene-presses");
    },
  };
  const pad = {
    connected: true,
    index: 0,
    poll: vi.fn(() => {
      events.push("pad");
    }),
  };
  const options: RuntimeFrameCoordinatorOptions = {
    now: () => ++now,
    state: () => state,
    setState: (next) => {
      events.push(`state:${next}`);
      state = next;
    },
    input,
    pad,
    navigator: { getGamepads: () => [] },
    document: {
      body: { dataset: {} },
      exitPointerLock: () => {
        events.push("unlock");
      },
    },
    canvas: { clientWidth: 1280, clientHeight: 720 },
    cinema: {
      get active() {
        return cinemaActive;
      },
      get playerMode() {
        return cinemaPlayerMode;
      },
      update: () => {
        events.push("cinema");
        if (endCinemaOnUpdate) cinemaActive = false;
      },
    },
    clipper: null,
    autoPauseDisconnect: () => true,
    advancePlayingPrelude: () => {
      events.push("prelude");
    },
    advancePlayingSimulation: () => {
      events.push("simulation");
      return simulationSteps;
    },
    resetSimulation: () => {
      events.push("reset");
    },
    requestPointerLock: () => {
      events.push("request-lock");
    },
    exitReplay: () => {
      events.push("exit-replay");
    },
    advanceClocks: () => {
      events.push("clocks");
    },
    advanceContinue: () => {
      events.push("continue");
    },
    updateAttract: (_delta, menu) => {
      events.push(`attract:${String(menu)}`);
    },
    isMenuScreen: (current) => current === "menu",
    gameplayStart: () => {
      events.push("gameplay-start");
    },
    gameplayStop: () => {
      events.push("gameplay-stop");
    },
    cssPerLogicalPixel: () => cssPerLogicalPixel,
    setUiDensity: (density) => {
      events.push(`density:${density.touch ? "touch" : "desktop"}@${String(density.cssPerLogicalPixel)}`);
    },
    syncMusic: () => {
      events.push("music");
    },
    render: () => {
      events.push("render");
    },
    handleUi: () => {
      events.push("ui");
    },
    diagnostics: {
      record: (name) => {
        events.push(`record:${name}`);
      },
      gauge: (name) => {
        events.push(`gauge:${name}`);
      },
    },
    entityCounts: () => ({ enemies: 2, projectiles: 3, effects: 4 }),
  };
  return {
    coordinator: new RuntimeFrameCoordinator(options),
    events,
    input,
    pad,
    state: () => state,
    setTouch: (value: boolean) => {
      touch = value;
    },
    setEscape: (value: boolean) => {
      escape = value;
    },
    setPause: (value: boolean) => {
      pause = value;
    },
    setCinema: (active: boolean, playerMode?: string) => {
      cinemaActive = active;
      cinemaPlayerMode = playerMode;
    },
    endCinemaOnNextUpdate: () => {
      endCinemaOnUpdate = true;
    },
    setCssPerLogicalPixel: (value: number) => {
      cssPerLogicalPixel = value;
    },
    setSimulationSteps: (value: number) => {
      simulationSteps = value;
    },
    advanceClock: (milliseconds: number) => {
      now += milliseconds;
    },
    options,
  };
}

describe("RuntimeFrameCoordinator", () => {
  it("drops the press that ended a scene before the next simulation tick seals it", () => {
    const harness = createHarness();
    harness.setCinema(true, "locked");
    harness.coordinator.run(1 / 60);
    expect(harness.events, "a scene still playing keeps its input").not.toContain("discard-scene-presses");

    harness.events.length = 0;
    harness.endCinemaOnNextUpdate();
    harness.coordinator.run(1 / 60);
    const discard = harness.events.indexOf("discard-scene-presses");
    expect(discard, "the frame that ends the scene drops waiting presses").toBeGreaterThan(
      harness.events.indexOf("cinema"),
    );
    expect(discard, "before the simulation tick reads them").toBeLessThan(harness.events.indexOf("simulation"));

    harness.events.length = 0;
    harness.coordinator.run(1 / 60);
    expect(harness.events, "later frames keep the player's presses").not.toContain("discard-scene-presses");
  });

  it("preserves input, fixed-step host, platform, music, render and diagnostic ordering", () => {
    const harness = createHarness();
    harness.coordinator.run(1 / 60);

    expect(harness.events.slice(0, 12)).toEqual([
      "pad",
      "input",
      "prelude",
      "simulation",
      "clocks",
      "gameplay-start",
      "continue",
      "attract:false",
      "music",
      "render",
      "ui",
      "end-input",
    ]);
    expect(harness.events.slice(-8)).toEqual([
      "record:simulation",
      "record:render",
      "record:frame",
      "record:frameInterval",
      "record:outsideFrameWork",
      "gauge:enemies",
      "gauge:projectiles",
      "gauge:effects",
    ]);
    expect(harness.input.allowLock).toBe(true);
  });

  it("auto-pauses a run on controller disconnect before simulation advances", () => {
    const harness = createHarness();
    harness.coordinator.run(1 / 60);
    harness.events.length = 0;
    harness.pad.connected = false;

    harness.coordinator.run(1 / 60);

    expect(harness.state()).toBe("paused");
    expect(harness.events).toContain("unlock");
    expect(harness.events).toContain("reset");
    expect(harness.events).toContain("gameplay-stop");
    expect(harness.events).not.toContain("simulation");
  });

  it("publishes input modality for CSS cursor ownership and never stamps a cursor surface", () => {
    const harness = createHarness();
    harness.input.mode = "mouse";
    harness.coordinator.run(1 / 60);
    expect(harness.options.document.body.dataset.imode).toBe("mouse");
    expect(harness.options.document.body.dataset.cursor).toBeUndefined();
  });

  it("honors pause gates and playground/replay navigation without stepping gameplay", () => {
    const pauseHarness = createHarness();
    pauseHarness.setPause(true);
    pauseHarness.coordinator.run(1 / 60);
    expect(pauseHarness.state()).toBe("paused");
    expect(pauseHarness.events).not.toContain("simulation");

    const menuHarness = createHarness("pgmenu");
    menuHarness.input.pressed.add("Tab");
    menuHarness.coordinator.run(1 / 60);
    expect(menuHarness.state()).toBe("playing");
    expect(menuHarness.events).toContain("request-lock");

    const replayHarness = createHarness("replay");
    replayHarness.setEscape(true);
    replayHarness.coordinator.run(1 / 60);
    expect(replayHarness.events).toContain("exit-replay");
  });

  it("toggles pause with P or Escape after the settle window and consumes the keys it acted on", () => {
    const harness = createHarness();
    harness.setPause(true);
    harness.input.pressed.add("KeyP");
    harness.coordinator.run(1 / 60);
    expect(harness.state()).toBe("paused");
    expect(harness.input.pressed.has("KeyP")).toBe(false);

    // The same Escape/P burst that paused (or a stray repeat) cannot resume at once.
    harness.events.length = 0;
    harness.setPause(false);
    harness.setEscape(true);
    harness.input.pressed.add("Escape");
    harness.coordinator.run(1 / 60);
    expect(harness.state()).toBe("paused");
    expect(harness.input.pressed.has("Escape")).toBe(false);
    expect(harness.events).not.toContain("request-lock");

    harness.advanceClock(400);
    harness.coordinator.run(1 / 60);
    expect(harness.state()).toBe("playing");
    expect(harness.events).toContain("request-lock");

    harness.setEscape(false);
    harness.setPause(true);
    harness.coordinator.run(1 / 60);
    expect(harness.state()).toBe("paused");
    // A second pause measures its own settle window, not the previous pause's.
    harness.coordinator.run(1 / 60);
    expect(harness.state()).toBe("paused");
    harness.events.length = 0;
    harness.advanceClock(400);
    harness.coordinator.run(1 / 60);
    expect(harness.state()).toBe("playing");
    expect(harness.events).toContain("request-lock");

    const replay = createHarness("replay");
    replay.setEscape(true);
    replay.input.pressed.add("Escape");
    replay.coordinator.run(1 / 60);
    // The UI frame that follows must not read the same Escape as BACK on the next screen.
    expect(replay.input.pressed.has("Escape")).toBe(false);
  });

  it("applies touch density and cinema input ownership without changing simulation cadence", () => {
    const harness = createHarness();
    harness.setTouch(true);
    harness.setCssPerLogicalPixel(0.5);
    harness.setCinema(true, "chapter");

    harness.coordinator.run(1 / 30);

    expect(harness.events).toContain("cinema");
    expect(harness.events).toContain("density:touch@0.5");
    expect(harness.input.uiMode).toBe(true);
    expect(harness.events.filter((event) => event === "simulation")).toHaveLength(1);
  });

  it("preserves gameplay edges across display frames that produce no fixed step", () => {
    const harness = createHarness();
    const endFrame = vi.fn();
    harness.input.endFrame = endFrame;
    harness.setSimulationSteps(0);

    harness.coordinator.run(1 / 240);

    expect(endFrame).toHaveBeenCalledWith(true);
  });
});
