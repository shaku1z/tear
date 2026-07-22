import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { aabbOverlap, clamp, len } from "../../src/domain/geometry";
import { createPlayer, type PlayerInputPort, type PlayerPlatformPort } from "../../src/gameplay/entities/player";

interface MutableInput extends PlayerInputPort {
  held: Set<"left" | "right" | "up" | "down">;
  dashEdge: boolean;
  jumpEdge: boolean;
}

function fixture(x = 400, y = CONFIG.world.groundY - CONFIG.player.h / 2) {
  const input: MutableInput = {
    held: new Set(),
    dashEdge: false,
    jumpEdge: false,
    right() { return this.held.has("right"); },
    left() { return this.held.has("left"); },
    up() { return this.held.has("up"); },
    down() { return this.held.has("down"); },
    dashPressed() { const value = this.dashEdge; this.dashEdge = false; return value; },
    jumpPressed() { const value = this.jumpEdge; this.jumpEdge = false; return value; },
  };
  const Player = createPlayer({
    CONFIG,
    FX: { burst: () => undefined, drip: () => undefined },
    GFX: { low: true },
    Input: input,
    presentation: { draw: () => undefined },
    aabbOverlap,
    clamp,
    len,
  });
  return { input, player: new Player(x, y) };
}

const floor: PlayerPlatformPort = { x: 0, y: CONFIG.world.groundY, w: CONFIG.view.w, h: 100, floor: true };

describe("player locomotion contract", () => {
  it("accelerates to the configured cap and applies grounded friction", () => {
    const { input, player } = fixture();
    player.onGround = true;
    player._wasGround = true;
    input.held.add("right");

    for (let frame = 0; frame < 30; frame += 1) player.update(1 / 60, [floor]);
    expect(player.vx).toBeCloseTo(CONFIG.player.moveSpeed);
    expect(player.facing).toBe(1);

    input.held.clear();
    for (let frame = 0; frame < 10; frame += 1) player.update(1 / 60, [floor]);
    expect(player.vx).toBe(0);
  });

  it("accepts a jump during the coyote window after leaving a ledge", () => {
    const { input, player } = fixture();
    player.onGround = true;
    player._wasGround = true;

    player.update(1 / 60, []);
    expect(player.coyote).toBeCloseTo(CONFIG.player.coyoteTime);

    input.jumpEdge = true;
    player.update(1 / 60, []);
    expect(player.vy).toBeLessThan(-CONFIG.player.jumpSpeed + CONFIG.world.gravity / 30);
    expect(player.coyote).toBe(0);
    expect(player.jumpBuf).toBe(0);
  });

  it("buffers an early jump and consumes it immediately after landing", () => {
    const { input, player } = fixture(400, 748);
    player.vy = 420;
    input.jumpEdge = true;

    player.update(1 / 60, [floor]);
    expect(player.jumpBuf).toBeGreaterThan(0);
    player.update(0.04, [floor]);
    expect(player.onGround).toBe(true);
    expect(player.jumpBuf).toBeGreaterThan(0);

    player.update(1 / 120, [floor]);
    expect(player.onGround).toBe(false);
    expect(player.vy).toBeLessThan(0);
    expect(player.jumpBuf).toBe(0);
  });

  it("normalizes directional dashes, spends a charge, retains exit momentum and refills on landing", () => {
    const { input, player } = fixture(400, 500);
    input.held.add("up");
    input.held.add("right");
    input.dashEdge = true;

    player.update(1 / 120, []);
    expect(len(player.dashX, player.dashY)).toBeCloseTo(1);
    expect(player.dashX).toBeGreaterThan(0);
    expect(player.dashY).toBeLessThan(0);
    expect(player.dashCharges).toBe(0);
    expect(player.iframe).toBeGreaterThan(0);

    input.held.clear();
    while (player.dashTimer > 0) player.update(1 / 60, []);
    expect(player.dashEndT).toBeGreaterThan(0);
    expect(Math.abs(player.vx)).toBeLessThan(CONFIG.dash.speed);

    player.y = 760;
    player.vy = 600;
    player.update(1 / 30, [floor]);
    expect(player.onGround).toBe(true);
    expect(player.dashCharges).toBe(player.maxDashCharges);
  });

  it("lands on one-way platforms from above but drops through while down is held or buffered", () => {
    const platform: PlayerPlatformPort = { x: 250, y: 500, w: 300, h: 20, oneway: true };
    const landing = fixture(400, 455);
    landing.player.vy = 500;
    landing.player.update(0.05, [platform]);
    expect(landing.player.onGround).toBe(true);
    expect(landing.player.y).toBe(platform.y - landing.player.hh);

    const dropping = fixture(400, 455);
    dropping.player.vy = 500;
    dropping.input.held.add("down");
    dropping.player.update(0.05, [platform]);
    expect(dropping.player.onGround).toBe(false);
    expect(dropping.player.y).toBeGreaterThan(platform.y - dropping.player.hh);

    dropping.input.held.clear();
    expect(dropping.player.downBufferT).toBeGreaterThan(0);
  });
});
