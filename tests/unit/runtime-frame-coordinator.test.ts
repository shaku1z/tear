import { describe, expect, it, vi } from "vitest";
import {
  RuntimeFrameCoordinator,
  type RuntimeFrameCoordinatorOptions,
  type RuntimeFrameInputPort,
} from "../../src/app/runtime-frame-coordinator";

function createHarness(initialState = "playing") {
  let state = initialState;
  let touch = false;
  let escape = false;
  let pause = false;
  let cinemaActive = false;
  let cinemaPlayerMode: string | undefined;
  let cssPerLogicalPixel = 1;
  let now = 0;
  const events: string[] = [];
  const input: RuntimeFrameInputPort = {
    held: new Set(), pressed: new Set(), btnHeld: {}, tJump: false,
    allowLock: false, mode: "keyboard", locked: false, uiMode: false,
    updateUI: () => { events.push("input"); },
    takeClick: () => null,
    touchActive: () => touch,
    pausePressed: () => pause,
    escapePressed: () => escape,
    endFrame: () => { events.push("end-input"); },
  };
  const pad = { connected: true, index: 0, poll: vi.fn(() => { events.push("pad"); }) };
  const options: RuntimeFrameCoordinatorOptions = {
    now: () => ++now,
    state: () => state,
    setState: (next) => { events.push(`state:${next}`); state = next; },
    input, pad,
    navigator: { getGamepads: () => [] },
    document: { body: { dataset: {} }, exitPointerLock: () => { events.push("unlock"); } },
    canvas: { clientWidth: 1280, clientHeight: 720 },
    cinema: {
      get active() { return cinemaActive; },
      get playerMode() { return cinemaPlayerMode; },
      update: () => { events.push("cinema"); },
    },
    clipper: null,
    autoPauseDisconnect: () => true,
    advancePlayingPrelude: () => { events.push("prelude"); },
    advancePlayingSimulation: () => { events.push("simulation"); },
    resetSimulation: () => { events.push("reset"); },
    requestPointerLock: () => { events.push("request-lock"); },
    exitReplay: () => { events.push("exit-replay"); },
    advanceClocks: () => { events.push("clocks"); },
    advanceContinue: () => { events.push("continue"); },
    updateAttract: (_delta, menu) => { events.push(`attract:${String(menu)}`); },
    isMenuScreen: (current) => current === "menu",
    gameplayStart: () => { events.push("gameplay-start"); },
    gameplayStop: () => { events.push("gameplay-stop"); },
    cssPerLogicalPixel: () => cssPerLogicalPixel,
    setUiDensity: (density) => { events.push(`density:${density}`); },
    syncMusic: () => { events.push("music"); },
    render: () => { events.push("render"); },
    handleUi: () => { events.push("ui"); },
    diagnostics: {
      record: (name) => { events.push(`record:${name}`); },
      gauge: (name) => { events.push(`gauge:${name}`); },
    },
    entityCounts: () => ({ enemies: 2, projectiles: 3, effects: 4 }),
  };
  return {
    coordinator: new RuntimeFrameCoordinator(options), events, input, pad,
    state: () => state,
    setTouch: (value: boolean) => { touch = value; },
    setEscape: (value: boolean) => { escape = value; },
    setPause: (value: boolean) => { pause = value; },
    setCinema: (active: boolean, playerMode?: string) => {
      cinemaActive = active;
      cinemaPlayerMode = playerMode;
    },
    setCssPerLogicalPixel: (value: number) => { cssPerLogicalPixel = value; },
    options,
  };
}

describe("RuntimeFrameCoordinator", () => {
  it("preserves input, fixed-step host, platform, music, render and diagnostic ordering", () => {
    const harness = createHarness();
    harness.coordinator.run(1 / 60);

    expect(harness.events.slice(0, 12)).toEqual([
      "pad", "input", "prelude", "simulation", "clocks", "gameplay-start",
      "continue", "attract:false", "music", "render", "ui", "end-input",
    ]);
    expect(harness.events.slice(-6)).toEqual([
      "record:simulation", "record:render", "record:frame",
      "gauge:enemies", "gauge:projectiles", "gauge:effects",
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

  it("publishes the cursor surface after the final state transition for the frame", () => {
    const harness = createHarness();
    harness.input.mode = "mouse";
    harness.coordinator.run(1 / 60);
    expect(harness.options.document.body.dataset.cursor).toBe("native");

    harness.input.locked = true;
    harness.coordinator.run(1 / 60);
    expect(harness.options.document.body.dataset.cursor).toBe("hidden");

    harness.setPause(true);
    harness.input.locked = false;
    harness.coordinator.run(1 / 60);
    expect(harness.state()).toBe("paused");
    expect(harness.options.document.body.dataset.cursor).toBe("canvas");
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

  it("applies touch density and cinema input ownership without changing simulation cadence", () => {
    const harness = createHarness();
    harness.setTouch(true);
    harness.setCssPerLogicalPixel(0.5);
    harness.setCinema(true, "chapter");

    harness.coordinator.run(1 / 30);

    expect(harness.events).toContain("cinema");
    expect(harness.events).toContain("density:touch");
    expect(harness.input.uiMode).toBe(true);
    expect(harness.events.filter((event) => event === "simulation")).toHaveLength(1);
  });
});
