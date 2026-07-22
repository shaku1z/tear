import { describe, expect, it } from "vitest";
import { RunReplacementGuard } from "../../src/gameplay/run/run-replacement";

describe("RunReplacementGuard", () => {
  it("seals tracked runs before tracked and untracked replacement clock resets", () => {
    let recording = true;
    const events: string[] = [];
    const guard = new RunReplacementGuard({
      recording: () => recording,
      stopInterruptedRecording: () => { events.push("seal"); recording = false; },
    });

    guard.resetAuthoritativeClocks(() => { events.push("reset-for-untracked"); });
    recording = true;
    guard.resetAuthoritativeClocks(() => { events.push("reset-for-tracked"); });

    expect(events).toEqual(["seal", "reset-for-untracked", "seal", "reset-for-tracked"]);
  });

  it("does not invent a recording when replacing an untracked run", () => {
    const events: string[] = [];
    const guard = new RunReplacementGuard({
      recording: () => false,
      stopInterruptedRecording: () => { events.push("seal"); },
    });

    guard.resetAuthoritativeClocks(() => { events.push("reset"); });

    expect(events).toEqual(["reset"]);
  });
});
