import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { CLOCK, CONFIG } from "../../src/config/game-config";
import type { BladePlayerPort, BladePresentationPort } from "../../src/gameplay/entities/blade";
import { createBlade } from "../../src/gameplay/entities/blade";
import type { PlayerPresentationPort } from "../../src/gameplay/entities/player";
import { createPlayer } from "../../src/gameplay/entities/player";
import type { ProjectilePresentationPort } from "../../src/gameplay/entities/projectile";
import { createProjectile } from "../../src/gameplay/entities/projectile";

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));
const len = (x: number, y: number): number => Math.hypot(x, y);
const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;
const lerpAngle = lerp;

describe("entity presentation boundary", () => {
  it("keeps gameplay entity modules free of browser rendering types and ambient randomness", () => {
    const files = [
      "../../src/gameplay/entities/player.ts",
      "../../src/gameplay/entities/projectile.ts",
      "../../src/gameplay/entities/blade.ts",
      "../../src/gameplay/entities/blade-core.ts",
      "../../src/gameplay/entities/blade-contracts.ts",
      "../../src/gameplay/entities/mirror.ts",
      "../../src/gameplay/entities/mirror-actions.ts",
      "../../src/gameplay/entities/mirror-contracts.ts",
    ];

    for (const file of files) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      expect(source).not.toMatch(/CanvasRenderingContext2D|HTMLCanvasElement|OffscreenCanvas|Path2D/);
      expect(source).not.toContain("Math.random(");
    }
  });

  it("delegates player rendering with a readonly entity view", () => {
    const draw = vi.fn<PlayerPresentationPort["draw"]>();
    const Player = createPlayer({
      CONFIG,
      FX: { burst: vi.fn(), drip: vi.fn() },
      GFX: { low: false },
      Input: {
        right: () => false, left: () => false, up: () => false, down: () => false,
        dashPressed: () => false, jumpPressed: () => false,
      },
      presentation: { draw },
      aabbOverlap: () => false,
      clamp,
      len,
    });
    const player = new Player(120, 240);
    const surface = { id: "player-surface" };

    player.draw(surface);

    expect(draw).toHaveBeenCalledWith(surface, player);
  });

  it("delegates blade and projectile rendering without exposing a browser surface to gameplay", () => {
    const bladeDraw = vi.fn<BladePresentationPort["draw"]>();
    const Blade = createBlade({
      CLOCK,
      CONFIG,
      Input: {
        touchAim: false, stickAim: null, locked: false, mouseX: 0, mouseY: 0,
        tetherHeld: false, consumeDelta: () => ({ x: 0, y: 0 }),
      },
      presentation: { draw: bladeDraw },
      clamp,
      len,
      lerp,
      lerpAngle,
    });
    const blade = new Blade();
    const player: BladePlayerPort = { x: 100, y: 200, vx: 0, vy: 0, facing: 1 };
    const bladeSurface = { id: "blade-surface" };
    blade.draw(bladeSurface, player);
    expect(bladeDraw).toHaveBeenCalledWith(bladeSurface, blade, player);

    const projectileDraw = vi.fn<ProjectilePresentationPort["draw"]>();
    const Projectile = createProjectile({
      CLOCK,
      CONFIG,
      FX: { burst: vi.fn(), ring: vi.fn() },
      SFX: {},
      presentation: { draw: projectileDraw },
      clamp,
      len,
      lerp,
    });
    const projectile = new Projectile(10, 20, 30, 40);
    const projectileSurface = { id: "projectile-surface" };
    projectile.draw(projectileSurface);
    expect(projectileDraw).toHaveBeenCalledWith(projectileSurface, projectile);
  });
});
