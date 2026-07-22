import { describe, expect, it } from "vitest";
import {
  IllegalAppTransitionError,
  initialAppState,
  transitionAppState,
  type AppState,
} from "../../src/app/state-machine";

describe("application state machine", () => {
  it("covers the live run, interstitial, and terminal flow with explicit edges", () => {
    let state: AppState = initialAppState();
    state = transitionAppState(state, { type: "open-setup" });
    state = transitionAppState(state, { type: "start-run", runId: "run-7" });
    expect(state.type).toBe("playing");

    for (const [open, expected, resolve] of [
      ["open-draft", "draft", "resolve-draft"],
      ["open-reserve", "reserve", "resolve-reserve"],
      ["open-tier-up", "tier-up", "resolve-tier-up"],
    ] as const) {
      state = transitionAppState(state, { type: open });
      expect(state.type).toBe(expected);
      state = transitionAppState(state, { type: resolve });
      expect(state.type).toBe("playing");
    }

    state = transitionAppState(state, { type: "victory" });
    state = transitionAppState(state, { type: "start-replay", replayId: "replay-7" });
    expect(state).toEqual({ type: "replay", replayId: "replay-7", paused: false });
    expect(transitionAppState(state, { type: "toggle-replay-pause" })).toMatchObject({ type: "replay", paused: true });
  });

  it("restores the exact prior state after settings", () => {
    const playing: AppState = { type: "playing", runId: "run-a" };
    const settings = transitionAppState(playing, { type: "open-settings" });
    expect(settings.type).toBe("settings");
    expect(transitionAppState(settings, { type: "close-settings" })).toEqual(playing);
  });

  it("supports continue and pause while rejecting unspecified edges", () => {
    const continuation = transitionAppState(initialAppState(), { type: "show-continue", saveId: "save-a" });
    let state = transitionAppState(continuation, { type: "start-run", runId: "run-a" });
    state = transitionAppState(state, { type: "pause" });
    expect(transitionAppState(state, { type: "resume" })).toEqual({ type: "playing", runId: "run-a" });
    expect(() => transitionAppState(initialAppState(), { type: "victory" })).toThrow(IllegalAppTransitionError);
  });
});
