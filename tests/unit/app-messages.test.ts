import { describe, expect, it } from "vitest";
import { EnvelopeSequencer, hasMonotonicEnvelopes } from "../../src/app/messages";

describe("EnvelopeSequencer", () => {
  it("assigns one monotonic id sequence to commands and their domain events", () => {
    const messages = new EnvelopeSequencer();
    const command = messages.command(4, { type: "attack" });
    const event = messages.event(4, { type: "attack-started" }, command.id);
    const next = messages.command(5, { type: "move" });

    expect([command.id, event.id, next.id]).toEqual([1, 2, 3]);
    expect(event.causedByCommandId).toBe(command.id);
    expect(hasMonotonicEnvelopes([command, event, next])).toBe(true);
  });

  it("rejects time travel and references to future commands", () => {
    const messages = new EnvelopeSequencer();
    messages.command(10, { type: "first" });
    expect(() => messages.command(9, { type: "past" })).toThrow(/cannot move backwards/);
    expect(() => messages.event(10, { type: "future-cause" }, 12)).toThrow(/earlier envelope/);
  });
});
