import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import type { BossAttackPose } from "../../../gameplay/entities/boss-attack-runner";
import {
  drawBossFigure,
  movePoseLayer,
  traceStem,
  type BossFigureFrame,
  type FigurePoseLayer,
} from "../figures/boss-figure";
import {
  ROOTBOUND_FIGURE,
  ROOTBOUND_FIGURE_LAYOUT,
  ROOTBOUND_MOVE_POSES,
  ROOTBOUND_PHASE_POSES,
  ROOTBOUND_SEEDLING_FLAG,
  graftFlag,
  type RootboundFigureColor,
} from "../figures/rootbound-figure";
import { drawBossTells } from "./boss-tell-renderer";
import type { EnemyRendererRuntime } from "./enemy-renderer-runtime";
import type { RenderInstance } from "./enemy-renderer-types";

/** The Verdant skin for this boss's marks, if `setBossTellSkin` has installed one. */
const TELL_SKIN = "verdant-sanctum";

type Ink = Readonly<{ vine: string; thorn: string; earth: string; lineWidth: number; lash: string; edge: string }>;

/** A row of root spikes standing on the ground, each `height` tall at full growth `k`. */
function spikes(
  ctx: CanvasRenderingContext2D,
  ink: Ink,
  x: number,
  ground: number,
  hw: number,
  height: number,
  k: number,
) {
  if (k <= 0) return;
  const count = Math.max(3, Math.round(hw / 14));
  ctx.fillStyle = ink.vine;
  ctx.strokeStyle = ink.thorn;
  ctx.lineWidth = ink.lineWidth;
  for (let index = 0; index < count; index += 1) {
    const u = (index + 0.5) / count;
    const base = x - hw + u * hw * 2;
    const tall = height * k * (0.62 + 0.38 * Math.sin(u * Math.PI));
    ctx.beginPath();
    ctx.moveTo(base - 9, ground);
    ctx.lineTo(base + (index % 2 === 0 ? 4 : -4), ground - tall);
    ctx.lineTo(base + 9, ground);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/** A mound of turned earth where the keeper moves under the floor. */
function mound(ctx: CanvasRenderingContext2D, ink: Ink, x: number, ground: number, k: number) {
  if (k <= 0) return;
  ctx.fillStyle = ink.earth;
  ctx.beginPath();
  ctx.ellipse(x, ground, 70 * k, 22 * k, 0, Math.PI, 0);
  ctx.fill();
  spikes(ctx, ink, x, ground, 40 * k, 26, k);
}

/** The lash vine: a thin stem from the shoulder to `reach` along the facing, curling back while it winds up. */
function vineArm(
  ctx: CanvasRenderingContext2D,
  ink: Ink,
  x: number,
  y: number,
  facing: number,
  reach: number,
  coil: number,
  width: number,
) {
  const vine = ROOTBOUND_FIGURE_LAYOUT.vine;
  const endX = x + facing * reach * (1 - coil) - facing * vine.coilBack * coil;
  const endY = y - vine.coilRise * coil;
  const control = [x + facing * reach * 0.4, y - vine.lift - vine.coilLift * coil] as const;
  traceStem(ctx, [x, y], control, [endX, endY], [width, vine.tipWidth]);
  ctx.fillStyle = ink.lash;
  ctx.fill();
  ctx.strokeStyle = ink.edge;
  ctx.lineWidth = ink.lineWidth;
  ctx.lineJoin = "round";
  ctx.stroke();
  const thorn = vine.thorn;
  ctx.fillStyle = ink.thorn;
  ctx.beginPath();
  ctx.moveTo(endX + facing * thorn.forward, endY);
  ctx.lineTo(endX - facing * thorn.back, endY - thorn.spread);
  ctx.lineTo(endX - facing * thorn.back, endY + thorn.spread);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** A root runs along the ground from the keeper to every Graft it has planted. `colors` null: high contrast. */
function drawGraftRoots(
  ctx: CanvasRenderingContext2D,
  boss: RenderInstance<"Rootbound">,
  footY: number,
  colors: Readonly<{ mercy: string; other: string }> | null,
) {
  for (const graft of boss.graftAnchorPlacements()) {
    if (!boss.plantedGraftTypes.includes(graft.graftType)) continue;
    const gx = graft.geometry.x + (graft.geometry.w ?? 0) / 2;
    const gy = graft.geometry.y + (graft.geometry.h ?? 0);
    ctx.save();
    ctx.globalAlpha = boss.activeGraftTypes.includes(graft.graftType) ? 0.9 : 0.45;
    ctx.strokeStyle = colors === null ? "#ffffff" : graft.graftType === "mercy" ? colors.mercy : colors.other;
    ctx.lineWidth = colors === null ? 5 : 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(boss.x, footY);
    ctx.quadraticCurveTo((boss.x + gx) / 2, Math.max(footY, gy) + 26, gx, gy);
    ctx.stroke();
    ctx.restore();
  }
}

/** The Phase II moves that place stage objects: planting a Graft, raising the cage, moving the Wells. */
function drawGardenMove(
  ctx: CanvasRenderingContext2D,
  ink: Ink,
  boss: Readonly<{ x: number; y: number; hw: number; hh: number }>,
  pose: BossAttackPose,
  ground: number,
) {
  const { stage, facing } = pose;
  const k = stage === "tell" ? pose.progress : 1;
  if (pose.attackId === "plant-graft" && stage !== "recover") {
    // Kneeling: a sprout rises from the earth at its feet while it plants.
    const x = boss.x + facing * (boss.hw + 18);
    mound(ctx, ink, x, ground, k);
    ctx.strokeStyle = ink.thorn;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, ground);
    ctx.lineTo(x, ground - 46 * k);
    ctx.stroke();
  } else if (pose.attackId === "root-cage" && stage === "tell") {
    // The earth swells where the two walls will rise, either side of where the player stood.
    for (const side of [-1, 1]) mound(ctx, ink, pose.target.x + side * 268, ground, k);
  } else if (pose.attackId === "bloom-shift" && stage !== "recover") {
    // Arms raised: rings of pollen open around the keeper as the Wells move.
    ctx.strokeStyle = ink.thorn;
    ctx.lineWidth = 3;
    for (const ring of [0.5, 1]) {
      ctx.beginPath();
      ctx.arc(boss.x, boss.y - boss.hh * 0.4, boss.hh * (0.9 + ring * k), Math.PI, 0);
      ctx.stroke();
    }
  }
}

/** The bright ring around the exposed keeper (origin at its feet); it drains as the opening closes. */
function drawExposedRing(ctx: CanvasRenderingContext2D, progress: number, highContrast: boolean) {
  const ring = ROOTBOUND_FIGURE_LAYOUT.ring;
  ctx.save();
  ctx.strokeStyle = highContrast ? ring.highContrast : ring.standard;
  ctx.lineWidth = ring.width;
  ctx.lineCap = "round";
  ctx.beginPath();
  const start = -Math.PI / 2;
  ctx.arc(ring.center[0], ring.center[1], ring.radius, start, start + Math.PI * 2 * (1 - progress));
  ctx.stroke();
  ctx.restore();
}

/**
 * How far through an opening the keeper is: the punish stage after a heavy move or a parry, or a forced opening
 * (a cut Graft or cage) outside any move. Null when it is not open.
 */
function exposedOpening(boss: RenderInstance<"Rootbound">, pose: BossAttackPose | null): number | null {
  if (pose?.stage === "punish") return pose.progress;
  const forced = boss.moveState.exposed;
  if (pose !== null || forced === null || boss.moveTick >= forced.until) return null;
  return (boss.moveTick - forced.from) / Math.max(1, forced.until - forced.from);
}

/** The figure's pose layers and flags from the keeper's state. */
function rootboundFrame(
  boss: RenderInstance<"Rootbound">,
  pose: BossAttackPose | null,
  opening: number | null,
  intro: number,
  look: Readonly<{ highContrast: boolean; ink: string }>,
): BossFigureFrame<RootboundFigureColor> {
  const layers: (FigurePoseLayer | null)[] = [
    { pose: ROOTBOUND_PHASE_POSES[boss.phase] ?? "", weight: 1 },
    movePoseLayer(ROOTBOUND_MOVE_POSES, pose),
    pose === null && opening !== null ? { pose: "split", weight: 1 } : null,
    { pose: "rise", weight: 1 - intro },
    boss.dying ? { pose: "death", weight: boss.deathP } : null,
  ];
  const flags = new Set(boss.activeGraftTypes.map(graftFlag));
  if (boss.dying && boss.deathP >= ROOTBOUND_FIGURE_LAYOUT.seedlingAt) flags.add(ROOTBOUND_SEEDLING_FLAG);
  return {
    layers: layers.filter((layer): layer is FigurePoseLayer => layer !== null),
    flags,
    palette: look.highContrast ? "highContrast" : "standard",
    flash: boss.flash > 0 ? 1 : 0,
    facing: boss.facing,
    colors: look.highContrast ? {} : { ink: look.ink },
  };
}

/** Draws the move in progress, in world space, from the pose the shared runner reports. */
function drawMove(
  ctx: CanvasRenderingContext2D,
  ink: Ink,
  boss: Readonly<{ x: number; y: number; hw: number; hh: number }>,
  pose: BossAttackPose,
  ground: number,
) {
  const { progress: k, stage, facing, area } = pose;
  const box = area?.kind === "box" ? area : null;
  const fade = stage === "recover" ? 1 - k : 1;
  switch (pose.attackId) {
    case "vine-lash": {
      const vine = ROOTBOUND_FIGURE_LAYOUT.vine;
      const shoulderX = boss.x + facing * boss.hw * vine.shoulder.x;
      const shoulderY = boss.y - boss.hh * vine.shoulder.y;
      const reach = box === null ? vine.defaultReach : Math.abs(box.x + facing * box.hw - shoulderX);
      if (stage === "tell")
        vineArm(ctx, ink, shoulderX, shoulderY, facing, reach, 1 - k * 0.2, vine.tellWidth + vine.tellGrowth * k);
      else if (stage === "active") vineArm(ctx, ink, shoulderX, shoulderY, facing, reach, 0, vine.activeWidth);
      else if (stage === "recover")
        vineArm(ctx, ink, shoulderX, shoulderY, facing, reach * (1 - k), 0, vine.recoverWidth);
      return;
    }
    case "root-glide":
      if (stage === "tell") {
        mound(ctx, ink, boss.x, ground, 1 - k);
        mound(ctx, ink, pose.target.x, ground, k);
      } else if (box !== null) spikes(ctx, ink, box.x, ground, box.hw, box.hh * 2, stage === "active" ? 1 : fade);
      return;
    case "canopy-vault":
      if (stage === "tell") {
        ctx.strokeStyle = ink.vine;
        ctx.lineWidth = 6;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(boss.x + side * boss.hw * 0.6, boss.y + boss.hh);
          ctx.lineTo(boss.x + side * boss.hw * 0.9, Math.min(ground, boss.y + boss.hh + 60 * k));
          ctx.stroke();
        }
      } else if (box !== null) spikes(ctx, ink, box.x, ground, box.hw, box.hh * 2, stage === "active" ? 1 : fade);
      return;
    case "thorn-burst": {
      const radius = area?.kind === "circle" ? area.r : 150;
      const reach = stage === "tell" ? 20 + 30 * k : stage === "active" ? radius : radius * fade;
      ctx.strokeStyle = ink.thorn;
      ctx.lineWidth = stage === "active" ? 7 : 4;
      for (let index = 0; index < 12; index += 1) {
        const angle = (index / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(boss.x + Math.cos(angle) * boss.hw * 0.7, boss.y + Math.sin(angle) * boss.hh * 0.7);
        ctx.lineTo(boss.x + Math.cos(angle) * reach, boss.y + Math.sin(angle) * reach);
        ctx.stroke();
      }
      return;
    }
    case "root-wave":
      if (stage === "tell") spikes(ctx, ink, boss.x + facing * (boss.hw + 30), ground, 30, 24, k);
      else if (stage === "active" && box !== null) {
        spikes(ctx, ink, box.x, ground, box.hw, box.hh * 2.4, 1);
        spikes(ctx, ink, box.x - facing * box.hw * 2.2, ground, box.hw, box.hh * 1.4, 0.7);
      }
      return;
    case "regrowth":
      // Kneeling into the earth, as when planting; while it channels a root wave leaves its front.
      if (stage !== "recover") mound(ctx, ink, boss.x, ground, stage === "tell" ? k : 1);
      if (stage === "active" && box !== null) spikes(ctx, ink, box.x, ground, box.hw, box.hh * 2.4, 1);
      return;
    case "last-spring":
      // The floor wakes along the whole band: thorns rise through the tell and stand at the strike.
      if ((stage === "tell" || stage === "active") && box !== null)
        for (let x = box.x - box.hw + 40; x < box.x + box.hw; x += 120)
          spikes(ctx, ink, x, ground, 24, (stage === "active" ? 1 : 0.25 + 0.5 * k) * box.hh * 2, 1);
      return;
    default:
      drawGardenMove(ctx, ink, boss, pose, ground);
  }
}

/** Rootbound's figure, its moves and the roots to its Grafts. Warning areas are drawn from its tells. */
export function installRootboundRenderer(types: EnemyTypes, runtime: EnemyRendererRuntime): void {
  const { A11Y, CONFIG, THEME, clamp } = runtime;
  Object.assign(types.Rootbound.prototype, {
    draw(this: RenderInstance<"Rootbound">, ctx: CanvasRenderingContext2D) {
      const intro = this.introT > 0 ? clamp(1 - this.introT / Math.max(CONFIG.bossTheater.introDur, 0.001), 0, 1) : 1;
      const footY = this.y + this.hh;
      const palette = ROOTBOUND_FIGURE.palettes[A11Y.highContrast ? "highContrast" : "standard"];
      const gold = palette.seam;
      const root = THEME.dark ? "#253627" : "#304b31";

      ctx.save();
      // Every warning and strike area comes from the boss's own tell data, drawn by the shared marks.
      const tells = this.tells();
      drawBossTells(runtime, ctx, tells, { skinId: TELL_SKIN, layer: "behind" });
      drawGraftRoots(ctx, this, footY, A11Y.highContrast ? null : { mercy: gold, other: root });
      // The move itself: the lash vine, mounds and root spikes, drawn from the runner's pose.
      const pose = this.movePose();
      const ink: Ink = A11Y.highContrast
        ? { vine: "#ffffff", thorn: "#fff36b", earth: "#4b00d1", lineWidth: 3, lash: palette.stem, edge: palette.ink }
        : {
            vine: THEME.dark ? "#3f6b3a" : "#4f844c",
            thorn: gold,
            earth: THEME.dark ? "#2a2219" : "#5b4a33",
            lineWidth: 2,
            lash: palette.stem,
            edge: THEME.ink,
          };
      // A wind-up is drawn behind the body; the strike and what it leaves are drawn in front, below.
      if (pose?.stage === "tell") {
        ctx.save();
        drawMove(ctx, ink, this, pose, CONFIG.world.groundY);
        ctx.restore();
      }
      // Burrowed: only the moving earth shows.
      if (this.hidden) {
        ctx.restore();
        this.drawHpBar(ctx);
        return;
      }
      ctx.translate(this.x, footY);
      // Exposed: split open along the seam inside a bright ring that drains as the opening closes.
      const opening = exposedOpening(this, pose);
      if (opening !== null) drawExposedRing(ctx, opening, A11Y.highContrast);
      drawBossFigure(
        ctx,
        ROOTBOUND_FIGURE,
        rootboundFrame(this, pose, opening, intro, { highContrast: A11Y.highContrast, ink: THEME.ink }),
      );
      ctx.restore();
      // In front of the body: the strike area, then the vines and spikes of the strike itself.
      drawBossTells(runtime, ctx, tells, { skinId: TELL_SKIN, layer: "front" });
      if (pose !== null && pose.stage !== "tell") {
        ctx.save();
        drawMove(ctx, ink, this, pose, CONFIG.world.groundY);
        ctx.restore();
      }
      this.drawHpBar(ctx);
    },
  });
}
