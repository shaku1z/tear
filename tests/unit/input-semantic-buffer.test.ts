import { describe, expect, it } from "vitest";
import { SemanticInputBuffer } from "../../src/input/semantic-buffer";

function recordMoveFromRenderSamples(samples: readonly number[]): readonly unknown[] {
  const buffer = new SemanticInputBuffer();
  buffer.startRecording();
  for (const sample of samples) buffer.setMovement(sample, 0);
  return buffer.drain(12);
}

describe("SemanticInputBuffer", () => {
  it("coalesces render/device samples into one fixed-tick semantic command", () => {
    const keyboard = recordMoveFromRenderSamples([1]);
    const noisyGamepad = recordMoveFromRenderSamples([0.96, 0.98, 1]);
    const repeatedTouch = recordMoveFromRenderSamples([1, 1, 1, 1]);

    expect(noisyGamepad).toEqual(keyboard);
    expect(repeatedTouch).toEqual(keyboard);
    expect(keyboard).toEqual([{ kind: "command", id: 1, tick: 12, command: { type: "move", x: 1_000, y: 0 } }]);
  });

  it("orders aim and edge actions behind changed level state", () => {
    const buffer = new SemanticInputBuffer();
    buffer.startRecording();
    buffer.setMovement(-1, 0);
    buffer.setAimVector(0, 0.5);
    buffer.push({ type: "jump", phase: "pressed" });
    buffer.push({ type: "weapon", intent: "throw", phase: "pressed" });

    expect(buffer.drain(30).map((entry) => entry.command)).toEqual([
      { type: "move", x: -1_000, y: 0 },
      { type: "aim", turn: 250_000, magnitude: 500 },
      { type: "jump", phase: "pressed" },
      { type: "weapon", intent: "throw", phase: "pressed" },
    ]);
  });

  it("does not accumulate device events until a canonical input session begins", () => {
    const buffer = new SemanticInputBuffer();
    buffer.setMovement(1, 0);
    buffer.push({ type: "pause" });
    expect(buffer.drain(1)).toEqual([]);

    buffer.startRecording();
    buffer.push({ type: "pause" });
    expect(buffer.drain(2)).toMatchObject([{ id: 1, tick: 2, command: { type: "pause" } }]);
    buffer.stopRecording();
    expect(buffer.drain(3)).toEqual([]);
  });

  it("restarts command ids for each replay recording", () => {
    const buffer = new SemanticInputBuffer();
    buffer.startRecording();
    buffer.push({ type: "confirm" });
    expect(buffer.drain(1)[0]?.id).toBe(1);
    buffer.stopRecording();
    buffer.startRecording();
    buffer.push({ type: "confirm" });
    expect(buffer.drain(1)[0]?.id).toBe(1);
  });

  it("drops paused one-shot edges while preserving envelope monotonicity and current controls", () => {
    const buffer = new SemanticInputBuffer();
    buffer.startRecording();
    buffer.setMovement(1, 0);
    buffer.push({ type: "jump", phase: "pressed" });
    expect(buffer.drain(7).map((entry) => entry.id)).toEqual([1, 2]);

    // These actions occurred while gameplay was inactive. Keep the current
    // level controls for resume, but never replay the old one-shot edges.
    buffer.setMovement(-1, 0);
    buffer.setAimVector(0, 1);
    buffer.push({ type: "dash", x: -1_000, y: 0 });
    buffer.push({ type: "weapon", intent: "throw", phase: "pressed" });
    buffer.discardUnsealed();

    const resumed = buffer.drain(8);
    expect(resumed).toEqual([
      { kind: "command", id: 3, tick: 8, command: { type: "move", x: -1_000, y: 0 } },
      { kind: "command", id: 4, tick: 8, command: { type: "aim", turn: 250_000, magnitude: 1_000 } },
    ]);
    expect(buffer.lastSealedTick).toBe(8);
  });
});
