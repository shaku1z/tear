import { describe, expect, it } from "vitest";

import { EnvelopeSequencer } from "../../src/domain/envelopes";
import { AuthoritativeInputState } from "../../src/gameplay/runtime/authoritative-input";
import type { PlayerInputPort } from "../../src/gameplay/entities/player";
import { createLiveAuthoritativeInputAdapter } from "../../src/app/world/authoritative-input-adapter";
import { CONFIG } from "../../src/config/game-config";
import { clamp, len, lerp, lerpAngle } from "../../src/domain/geometry";
import { createBlade } from "../../src/gameplay/entities/blade";
import { applyWeapon } from "../../src/gameplay/weapons";

describe("live authoritative input adapter", () => {
  it("fires real Riftlock rounds from canonical press/release edges while preserving physical fallback and override ownership at 120 Hz", () => {
    const config = structuredClone(CONFIG), clock = { sim: 0 };
    const physical = { touchAim: false, stickAim: null, locked: false, mouseX: 500, mouseY: 500,
      tetherHeld: false, consumeDelta: () => ({ x: 0, y: 0 }) };
    const Blade = createBlade({ CLOCK: clock, CONFIG: config, Input: physical,
      presentation: { draw: () => undefined }, clamp, len, lerp, lerpAngle });
    const blade = new Blade(), player = { x: 400, y: 500, vx: 0, vy: 0, facing: 1 };
    blade.weapon = applyWeapon(config, "riftlock"); blade.resetRiftlock();
    const adapter = createLiveAuthoritativeInputAdapter({ player: () => player, blade: () => blade, aimRadius: () => config.blade.aimRadius });
    const input = new AuthoritativeInputState(), sequence = new EnvelopeSequencer();
    let tick = 0, rounds = 0;
    const update = () => { clock.sim = ++tick / 120; blade.update(1 / 120, player, []); rounds += blade.drainWeaponEvents().filter((event) => event.type === "razorRound").length; };
    const step = (phase?: "pressed" | "released") => {
      const next = tick + 1;
      adapter.actionPort.apply(input, next, phase === undefined ? [] : [sequence.command(next, { type: "weapon", intent: "primary", phase })]);
      update();
    };
    step("pressed");
    expect(rounds).toBe(1); expect(blade.riftChambers).toBe(config.weapons.riftlock.chambers - 1);
    const cooldownTicks = Math.ceil(config.weapons.riftlock.razorCooldown * 120) + 2;
    for (let index = 0; index < cooldownTicks; index++) step();
    expect(rounds).toBe(1); // A retained held level must not become automatic fire.
    step("released"); step("pressed");
    expect(rounds).toBe(2); expect(blade.riftChambers).toBe(config.weapons.riftlock.chambers - 2);
    physical.tetherHeld = true; step("released");
    for (let index = 0; index < cooldownTicks; index++) step();
    expect(rounds).toBe(2); // Canonical false suppresses physical true.
    adapter.clear(); physical.tetherHeld = false; update();
    physical.tetherHeld = true; update();
    expect(rounds).toBe(3); expect(blade.riftChambers).toBe(config.weapons.riftlock.chambers - 3);
  });
  it.each([0, 250])("projects restored held aim magnitude %s on the next command-free tick", (magnitude) => {
    const player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1 };
    const blade: { aimOverride?: { x: number; y: number }; handPos(): { x: number; y: number } } = { handPos: () => ({ x: 14, y: 16 }) };
    const adapter = createLiveAuthoritativeInputAdapter({ player: () => player, blade: () => blade, aimRadius: () => 100 });
    const input = new AuthoritativeInputState();
    adapter.actionPort.apply(input, 1, [{ kind: "command", id: 1, tick: 1, command: { type: "aim", turn: 0, magnitude } }]);
    const before = blade.aimOverride, restored = new AuthoritativeInputState(); restored.restore(input.snapshot());
    adapter.clear(); adapter.actionPort.apply(restored, 2, []);
    expect(blade.aimOverride).toEqual(before);
    expect(blade.aimOverride).toEqual({ x: 14 + magnitude / 10, y: 16 });
  });
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
