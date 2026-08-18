import { describe, expect, it } from "vitest";

import { createLiveGhostRecordingSessionState } from "../../src/app/live-ghost-recording-session-state";

describe("live Ghost recording session state", () => {
  it("keeps the V3 replay context and causal sequence together for one recording session", () => {
    const state = createLiveGhostRecordingSessionState(undefined, {});
    const context = { run: { id: "run-93" } } as never;

    state.setReplayContext(context);

    expect(state.recorder()).toBeNull();
    expect(state.nextEventSequence()).toBe(1);
    expect(state.nextEventSequence()).toBe(2);
    expect(state.replayContext()).toBe(context);

    state.reset();

    expect(state.nextEventSequence()).toBe(1);
    expect(state.replayContext()).toBeUndefined();
    expect(Object.isFrozen(state)).toBe(true);
  });
});
