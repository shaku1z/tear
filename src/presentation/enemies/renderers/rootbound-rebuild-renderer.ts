import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import { ROOTBOUND_MOVES } from "../../../gameplay/entities/enemy-types/rootbound-rebuild/rootbound-moves";
import type { BossFigureFrame, FigurePoseLayer } from "../figures/boss-figure";
import {
  ROOTBOUND_FIGURE,
  ROOTBOUND_FIGURE_LAYOUT,
  ROOTBOUND_PHASE_POSES,
  ROOTBOUND_SEEDLING_FLAG,
  type RootboundFigureColor,
} from "../figures/rootbound-figure";
import type { EnemyRendererRuntime } from "./enemy-renderer-runtime";
import type { RenderInstance } from "./enemy-renderer-types";

/**
 * The new Rootbound (plans/active/VERDANT_PALE_REBUILD.md, 2.1) drawn with the approved figure. The body and
 * its vine are the tells; the only marks are the Surface Strike column and the Canopy Vault landing, both
 * through the shared helpers, and the shared peril diamond on the moves that can't be parried.
 */

type Boss = RenderInstance<"RootboundRebuild">;

/** How a state's pose grows: in through a windup, held through a strike, out through a recovery. */
type Grow = "in" | "hold" | "out";

/** The figure's pose in each state of each move. Every pose is the approved figure's own. */
export const ROOTBOUND_REBUILD_STATE_POSES: Readonly<Record<string, readonly [pose: string, grow: Grow]>> = {
  swingwind: ["coil", "in"],
  swing: ["lunge", "hold"],
  swingrecover: ["lunge", "out"],
  staggered: ["split", "hold"],
  throwwind: ["coil", "in"],
  throwrecover: ["lunge", "out"],
  sink: ["sink", "in"],
  uprootsink: ["sink", "in"],
  rise: ["rise", "out"],
  surface: ["stretch", "hold"],
  split: ["split", "hold"],
  vaultwind: ["crouch", "in"],
  vault: ["stretch", "hold"],
  vaultrecover: ["stretch", "out"],
  swell: ["swell", "in"],
  burst: ["burst", "hold"],
  burstrecover: ["burst", "hold"],
};

type Ink = Readonly<{ stem: string; edge: string; thorn: string; earth: string; vine: string; mark: string }>;

function stateLayer(boss: Boss): FigurePoseLayer | null {
  const entry = ROOTBOUND_REBUILD_STATE_POSES[boss.state];
  if (entry === undefined) return null;
  const [pose, grow] = entry;
  const k = boss.progress();
  return { pose, weight: grow === "in" ? k : grow === "out" ? 1 - k : 1 };
}

function figureFrame(boss: Boss, intro: number, highContrast: boolean, ink: string): BossFigureFrame<RootboundFigureColor> {
  const layers: (FigurePoseLayer | null)[] = [
    { pose: ROOTBOUND_PHASE_POSES[boss.enteredPhase] ?? "", weight: 1 },
    stateLayer(boss),
    { pose: "rise", weight: 1 - intro },
    boss.dying ? { pose: "death", weight: boss.deathP } : null,
  ];
  const flags = new Set<string>();
  if (boss.dying && boss.deathP >= ROOTBOUND_FIGURE_LAYOUT.seedlingAt) flags.add(ROOTBOUND_SEEDLING_FLAG);
  return {
    layers: layers.filter((layer): layer is FigurePoseLayer => layer !== null),
    flags,
    palette: highContrast ? "highContrast" : "standard",
    flash: boss.flash > 0 ? 1 : 0,
    facing: boss.facing,
    colors: highContrast ? {} : { ink },
  };
}

/** A mound of turned earth: the keeper under the floor, or the floor swelling where it will come up. */
function mound(ctx: CanvasRenderingContext2D, ink: Ink, x: number, ground: number, k: number) {
  if (k <= 0) return;
  ctx.fillStyle = ink.earth;
  ctx.strokeStyle = ink.edge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, ground, 64 * k, 20 * k, 0, Math.PI, 0);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = ink.thorn;
  for (const offset of [-26, 0, 26]) {
    ctx.beginPath();
    ctx.moveTo(x + offset - 7 * k, ground - 8 * k);
    ctx.lineTo(x + offset, ground - 30 * k);
    ctx.lineTo(x + offset + 7 * k, ground - 8 * k);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * The strike itself: the column of roots out of the floor, and thorns bristling from the pod. Not marks: they
 * hit. The burst's reach is its shockwave ring (the simulation's FX), so the thorns stay near the body.
 */
function drawStrike(ctx: CanvasRenderingContext2D, boss: Boss, ink: Ink, ground: number) {
  const k = boss.progress();
  if (boss.state === "surface" || (boss.state === "split" && k < 0.4)) {
    const { width, height } = ROOTBOUND_MOVES.surfaceStrike;
    const grown = boss.state === "surface" ? 1 : 1 - k / 0.4;
    ctx.fillStyle = ink.vine;
    ctx.strokeStyle = ink.edge;
    ctx.lineWidth = 2;
    for (let index = 0; index < 5; index += 1) {
      const base = boss.x - width / 2 + ((index + 0.5) / 5) * width;
      const tall = height * grown * (index % 2 === 0 ? 1 : 0.72);
      ctx.beginPath();
      ctx.moveTo(base - 13, ground);
      ctx.lineTo(base, ground - tall);
      ctx.lineTo(base + 13, ground);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  if (boss.state === "burst") {
    const bristle = 70 * (1 - boss.progress() * 0.4);
    ctx.strokeStyle = ink.thorn;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(boss.x + Math.cos(angle) * boss.hw * 0.7, boss.y + Math.sin(angle) * boss.hh * 0.7);
      ctx.lineTo(boss.x + Math.cos(angle) * (boss.hw + bristle), boss.y + Math.sin(angle) * (boss.hh + bristle));
      ctx.stroke();
    }
  }
}

/** The vine, a prop: rearing through the coil, swept through the swing, drawn back after it. */
function drawVine(runtime: EnemyRendererRuntime, ctx: CanvasRenderingContext2D, boss: Boss, ink: Ink) {
  const k = boss.progress();
  const reach = ROOTBOUND_MOVES.vineSwing.reach;
  const shoulder = boss.vineShoulder();
  let angle: number, length: number;
  if (boss.state === "swingwind") [angle, length] = [boss.vineAngle(), reach * (0.5 + 0.5 * k)];
  else if (boss.state === "swing") [angle, length] = [boss.vineAngle(), reach];
  else if (boss.state === "swingrecover") [angle, length] = [0.4, reach * (1 - k)];
  else if (boss.state === "throwwind") [angle, length] = [-1.25 * k, 90];
  else return;
  if (length < 12) return;
  const tip = {
    x: shoulder.x + boss.facing * Math.cos(angle) * length,
    y: shoulder.y + Math.sin(angle) * length,
  };
  const width = boss.state === "swing" ? 8 : 5;
  runtime.drawRootVine(ctx, shoulder, tip, boss.state === "swing" ? 30 : 50, width, ink);
}

export function installRootboundRebuildRenderer(types: EnemyTypes, runtime: EnemyRendererRuntime): void {
  const { A11Y, CONFIG, THEME, clamp } = runtime;
  Object.assign(types.RootboundRebuild.prototype, {
    draw(this: Boss, ctx: CanvasRenderingContext2D) {
      const intro = this.introT > 0 ? clamp(1 - this.introT / Math.max(CONFIG.bossTheater.introDur, 0.001), 0, 1) : 1;
      const ground = CONFIG.world.groundY;
      const high = A11Y.highContrast;
      const palette = ROOTBOUND_FIGURE.palettes[high ? "highContrast" : "standard"];
      const ink: Ink = high
        ? { stem: palette.stem, edge: palette.ink, thorn: "#fff36b", earth: "#4b00d1", vine: "#ffffff", mark: "#fff36b" }
        : {
            stem: palette.stem,
            edge: THEME.ink,
            thorn: palette.seam,
            earth: THEME.dark ? "#2a2219" : "#5b4a33",
            vine: THEME.dark ? "#3f6b3a" : "#4f844c",
            mark: palette.mark,
          };
      const k = this.progress();
      // The two marks, through the shared helpers: where the column comes up, and where the vault lands.
      if (this.state === "rise") {
        const { width, height } = ROOTBOUND_MOVES.surfaceStrike;
        runtime.dangerColumn(ctx, this.x, width, ground - height, ground, ink.mark, k);
      }
      if (this.state === "vaultwind" && this.vaultTarget !== null)
        runtime.dangerReticle(ctx, this.vaultToX, this.vaultToY + this.hh, ROOTBOUND_MOVES.canopyVault.range, k, ink.mark);
      runtime.drawPeril(ctx, this);
      if (this.hidden) {
        mound(ctx, ink, this.x, ground, 1);
        this.drawHpBar(ctx);
        return;
      }
      if (this.state === "sink" || this.state === "uprootsink") mound(ctx, ink, this.x, ground, k);
      if (this.state === "rise") mound(ctx, ink, this.x, ground, 1 - k * 0.5);
      ctx.save();
      ctx.translate(this.x, this.y + this.hh);
      runtime.drawBossFigure(ctx, ROOTBOUND_FIGURE, figureFrame(this, intro, high, THEME.ink));
      ctx.restore();
      ctx.save();
      drawVine(runtime, ctx, this, ink);
      drawStrike(ctx, this, ink, ground);
      ctx.restore();
      this.drawHpBar(ctx);
    },
  });
}
