import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";
import { createLiveWorldEntityFactory } from "../../src/app/world/world-entity-factory";
import { createLiveWorldSimulationPresentationAdapter } from "../../src/app/world/world-simulation-factories";
import { createUi } from "../../src/presentation/ui";
import { A11Y, GFX, THEME } from "../../src/config/game-config";
import { clamp, len, lerp } from "../../src/domain/geometry";

const world = createProductionReplayWorld({
  seed: "wiki",
  presentation: (context) =>
    createLiveWorldSimulationPresentationAdapter({
      clock: context.clock,
      effects: context.effects,
      ui: createUi({
        CLOCK: context.clock,
        presentation: { view: context.config.view, colors: context.config.colors, overscan: { x: 0, y: 0 } },
        Input: { mode: "mouse" },
        clamp,
        controllerGlyph: () => "",
      } as never) as never,
      configuration: { config: context.config, theme: { ...THEME }, graphics: { ...GFX }, accessibility: { ...A11Y } },
      geometry: { clamp, len, lerp },
      cosmeticRandom: context.cosmeticRandom,
    }),
});
const entities = createLiveWorldEntityFactory({ ...world.factories.enemyTypes, ...world.factories.mirrorTypes } as never);
const player = { x: 360, y: 0, hw: 16, hh: 25, facing: 1, invulnerable: false, dashTimer: 0, vx: 0, vy: 0, onGround: true };

(window as unknown as { probe: (id: string) => string }).probe = (id) => {
  const inst = entities.createEnemy(id, 0, 0, world.run as never) as unknown as Record<string, unknown> & { draw: (c: CanvasRenderingContext2D, p: unknown) => void; hw: number; hh: number };
  const canvas = document.createElement("canvas");
  canvas.width = 160; canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  const maxDim = Math.max(inst.hw * 2, inst.hh * 2) + 18;
  const s = 136 / maxDim;
  Object.assign(inst, { x: 0, y: 0, facing: 1, flash: 0, stun: 0, spawnT: 0, _noBar: true });
  ctx.translate(80, 80); ctx.scale(s, s);
  inst.draw(ctx, player);
  return canvas.toDataURL("image/webp", 0.8);
};
(window as unknown as { ready: boolean }).ready = true;
