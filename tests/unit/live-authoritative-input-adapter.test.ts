import { describe, expect, it } from "vitest";

import { EnvelopeSequencer } from "../../src/domain/envelopes";
import { AuthoritativeInputState } from "../../src/gameplay/runtime/authoritative-input";
import type { PlayerInputPort } from "../../src/gameplay/entities/player";
import { createLiveAuthoritativeInputAdapter } from "../../src/app/live-authoritative-input-adapter";

describe("live authoritative input adapter", () => {
  it("contains legacy player and blade overrides behind the simulation action port", () => {
    const player: { x: number; y: number; vx: number; vy: number; facing: number; aiInput?: PlayerInputPort } = {
      x: 10, y: 20, vx: 0, vy: 0, facing: 1,
    };
    const blade: {
      lmbOverride?: boolean;
      aimOverride?: { x: number; y: number };
      handPos(): { x: number; y: number };
    } = {
      handPos: () => ({ x: 14, y: 16 }),
    };
    const adapter = createLiveAuthoritativeInputAdapter({
      player: () => player,
      blade: () => blade,
      aimRadius: () => 100,
    });
    const sequencer = new EnvelopeSequencer();
    const input = new AuthoritativeInputState();
    adapter.actionPort.apply(input, 1, [
      sequencer.command(1, { type: "aim", turn: 0 }),
      sequencer.command(1, { type: "weapon", intent: "primary", phase: "pressed" }),
    ]);

    expect(player.aiInput).toBe(input);
    expect(blade.lmbOverride).toBe(true);
    expect(blade.aimOverride).toEqual({ x: 114, y: 16 });
    adapter.clear();
    expect(player.aiInput).toBeUndefined();
    expect(blade.lmbOverride).toBeUndefined();
    expect(blade.aimOverride).toBeUndefined();
  });

  it("routes throw consumption through the adapter before falling back to physical input", () => {
    const player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1 };
    const blade = { handPos: () => ({ x: 0, y: 0 }) };
    const adapter = createLiveAuthoritativeInputAdapter({ player: () => player, blade: () => blade, aimRadius: () => 1 });
    let fallbackCalls = 0;
    expect(adapter.consumeThrow(() => { fallbackCalls += 1; return true; })).toBe(true);
    expect(fallbackCalls).toBe(1);
  });
});
