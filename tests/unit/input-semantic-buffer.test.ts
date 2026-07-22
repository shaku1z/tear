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

  it("does not accumulate live browser events until replay capture is enabled", () => {
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
});
