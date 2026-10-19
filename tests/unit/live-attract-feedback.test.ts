import { describe, expect, it } from "vitest";
import { createLiveAttractFeedback } from "../../src/app/live-attract-feedback";
import { createAttract } from "../../src/presentation/attract-runtime";
import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";
import { STAGES } from "../../src/gameplay/stages";
import { aabbOverlap, clamp, len } from "../../src/domain/geometry";

describe("menu emission isolation", () => {
  it("isolates actual menu reset/update/kill/explode/deflection and real Player damage from live FX/entropy", () => {
    const live = createProductionReplayWorld({ seed: "menu-emission-isolation" });
    live.effects.spark(800, 775, 1, -1);
    const before = structuredClone({ list: live.effects.list, view: live.effects.view, cursor: live.effects._replacementCursor,
      entropy: live.cosmeticEmissionRandom.snapshot(), gameplay: live.random.streams.snapshot() });
    let menuDraws = 0;
    const input = { right: () => false, left: () => false, up: () => false, down: () => false, dashPressed: () => false, jumpPressed: () => false };
    const config = live.configuration.value;
    const menu = createLiveAttractFeedback({ CONFIG: config, GFX: { low: false }, Input: input, presentation: { draw: () => undefined },
      aabbOverlap, clamp, len, reducedMotion: () => false, random: () => { menuDraws++; return 0.5; } });
    const attract = createAttract({ Backdrop: { fillFull: () => undefined, draw: () => undefined, platform: () => undefined, post: () => undefined },
      Blade: live.factories.Blade, Player: menu.Player, FX: menu.FX, STAGES, clamp,
      policy: { view: config.view, world: config.world, blade: config.blade, colors: config.colors, overscan: { x: 0 },
        lowGraphics: () => false, random: () => 0.5, theme: { dark: false, ink: "#000", rim: "#fff", set: () => undefined } } });
    attract.reset(); attract.update(1 / 120);
    const foe = attract.foes[0]; if (foe === undefined) throw new Error("menu foe missing");
    attract._kill(foe); attract._explode(800, 775);
    const player = attract.player, blade = attract.blade;
    if (player === null || blade === null) throw new Error("real menu actor pair missing");
    Object.assign(blade, { x: 800, y: 775, tipX: 820, tipY: 775, tipSpeed: 1000 });
    attract._updateShot({ x: 810, y: 775, vx: 1, vy: 0, r: 8, tint: "red", hist: [], deflected: false, dead: false }, 0, player, blade);
    const particles = menu.FX.list.length; player.iframe = 0; player.dashTimer = 0;
    expect(player.takeDamage(1, player.x - 1)).toBe("hit"); expect(menu.FX.list.length).toBeGreaterThan(particles);
    expect(menuDraws).toBeGreaterThan(0); expect(menu.FX).not.toBe(live.effects);
    expect({ list: live.effects.list, view: live.effects.view, cursor: live.effects._replacementCursor,
      entropy: live.cosmeticEmissionRandom.snapshot(), gameplay: live.random.streams.snapshot() }).toEqual(before);
    attract.reset(); expect(menu.FX.list).toEqual([]); expect(live.effects.list).toEqual(before.list);
  });
});
