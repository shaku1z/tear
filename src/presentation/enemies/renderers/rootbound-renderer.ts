import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import type { BossAttackPose } from "../../../gameplay/entities/boss-attack-runner";
import { drawBossTells } from "./boss-tell-renderer";
import type { EnemyRendererRuntime } from "./enemy-renderer-runtime";
import type { RenderInstance } from "./enemy-renderer-types";

/** The Verdant skin for this boss's marks, if `setBossTellSkin` has installed one. */
const TELL_SKIN = "verdant-sanctum";

type Ink = Readonly<{ vine: string; thorn: string; earth: string; lineWidth: number }>;

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

/** The vine arm: from the shoulder to `reach` along the facing, curling back while it winds up. */
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
  const endX = x + facing * reach * (1 - coil) - facing * 90 * coil;
  const endY = y - 70 * coil;
  ctx.strokeStyle = ink.vine;
  ctx.lineCap = "round";
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + facing * reach * 0.4, y - 60 - 40 * coil, endX, endY);
  ctx.stroke();
  ctx.fillStyle = ink.thorn;
  ctx.beginPath();
  ctx.moveTo(endX + facing * 16, endY);
  ctx.lineTo(endX - facing * 14, endY - 14);
  ctx.lineTo(endX - facing * 10, endY + 12);
  ctx.closePath();
  ctx.fill();
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

/** Draws the move in progress, in world space, from the pose the shared runner reports. */
/** The bright ring around the exposed keeper (origin at its feet); it drains as the opening closes. */
function drawExposedRing(ctx: CanvasRenderingContext2D, halfHeight: number, progress: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, -halfHeight, halfHeight * 1.55, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - progress));
  ctx.stroke();
  ctx.restore();
}

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
      const shoulderX = boss.x + facing * boss.hw * 0.5;
      const reach = box === null ? 260 : Math.abs(box.x + facing * box.hw - shoulderX);
      if (stage === "tell")
        vineArm(ctx, ink, shoulderX, boss.y - boss.hh * 0.3, facing, reach, 1 - k * 0.2, 10 + 8 * k);
      else if (stage === "active") vineArm(ctx, ink, shoulderX, boss.y - boss.hh * 0.3, facing, reach, 0, 24);
      else if (stage === "recover")
        vineArm(ctx, ink, shoulderX, boss.y - boss.hh * 0.3, facing, reach * (1 - k), 0, 16);
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
    default:
      drawGardenMove(ctx, ink, boss, pose, ground);
  }
}

/** Rootbound's silhouette, its moves and the roots to its Grafts. Warning areas are drawn from its tells. */
export function installRootboundRenderer(types: EnemyTypes, runtime: EnemyRendererRuntime): void {
  const { A11Y, CONFIG, GFX, THEME, clamp, lerp } = runtime;
  Object.assign(types.Rootbound.prototype, {
    draw(this: RenderInstance<"Rootbound">, ctx: CanvasRenderingContext2D) {
      const intro = this.introT > 0 ? clamp(1 - this.introT / Math.max(CONFIG.bossTheater.introDur, 0.001), 0, 1) : 1;
      const footY = this.y + this.hh;
      const gold = "#d7b84c";
      const root = THEME.dark ? "#253627" : "#304b31";

      ctx.save();
      // Every warning and strike area comes from the boss's own tell data, drawn by the shared marks.
      const tells = this.tells();
      drawBossTells(runtime, ctx, tells, { skinId: TELL_SKIN, layer: "behind" });
      drawGraftRoots(ctx, this, footY, A11Y.highContrast ? null : { mercy: gold, other: root });
      // The move itself: vines, mounds and root spikes, drawn from the runner's pose.
      const pose = this.movePose();
      const ink: Ink = A11Y.highContrast
        ? { vine: "#ffffff", thorn: "#fff36b", earth: "#4b00d1", lineWidth: 3 }
        : {
            vine: THEME.dark ? "#3f6b3a" : "#4f844c",
            thorn: gold,
            earth: THEME.dark ? "#2a2219" : "#5b4a33",
            lineWidth: 2,
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
      if (this.dying) ctx.rotate(this.facing * this.deathP * 0.4);
      // Leans into a wind-up. Exposed after a heavy move or a parry: slumped forward inside a bright
      // ring that drains as the opening closes, so it cannot be mistaken for the idle stance.
      // A cut Graft or cage opens it the same way, outside any move.
      const forced = this.moveState.exposed;
      const opening =
        pose?.stage === "punish"
          ? pose.progress
          : pose === null && forced !== null && this.moveTick < forced.until
            ? (this.moveTick - forced.from) / Math.max(1, forced.until - forced.from)
            : null;
      if (pose?.stage === "tell") {
        ctx.rotate(-this.facing * 0.08 * pose.progress);
        if (pose.attackId === "plant-graft") ctx.scale(1, 1 - 0.16 * pose.progress);
      } else if (opening !== null) {
        drawExposedRing(ctx, this.hh, opening, A11Y.highContrast ? "#ffffff" : "#7fe3ff");
        ctx.rotate(this.facing * 0.2);
        ctx.scale(1.06, 0.8);
      }

      // Intro pose: the keeper rises out of the throne while the mantle opens.
      ctx.scale(lerp(0.9, 1, intro), lerp(0.72, 1, intro));
      ctx.translate(0, -this.hh * 2);

      ctx.strokeStyle = root;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 13;
      for (const side of [-1, 1]) {
        const open = lerp(0.55, 1, intro);
        ctx.beginPath();
        ctx.moveTo(side * 20, this.hh * 1.65);
        ctx.lineTo(side * 56, this.hh * 1.22);
        ctx.lineTo(side * 72, this.hh * 0.55);
        ctx.lineTo(side * (76 + 26 * open), -this.hh * 0.22);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(side * 54, this.hh * 1.3);
        ctx.lineTo(side * 96, this.hh * 1.72);
        ctx.lineTo(side * 132, this.hh * 1.86);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(side * 70, this.hh * 0.64);
        ctx.lineTo(side * (100 + 20 * open), this.hh * 0.18);
        ctx.lineTo(side * (116 + 35 * open), -this.hh * 0.52);
        ctx.stroke();
      }

      // Root-throne and partially absorbed humanoid keeper.
      ctx.fillStyle = root;
      ctx.beginPath();
      ctx.moveTo(-this.hw * 1.15, this.hh * 1.9);
      ctx.lineTo(-this.hw * 0.78, this.hh * 0.45);
      ctx.lineTo(0, this.hh * 0.18);
      ctx.lineTo(this.hw * 0.78, this.hh * 0.45);
      ctx.lineTo(this.hw * 1.15, this.hh * 1.9);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = THEME.ink;
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = this.flash > 0 ? "#fff" : this.color;
      ctx.fillRect(-this.hw * 0.48, this.hh * 0.12, this.hw * 0.96, this.hh * 1.24);
      ctx.strokeStyle = THEME.ink;
      ctx.lineWidth = 4;
      ctx.strokeRect(-this.hw * 0.48, this.hh * 0.12, this.hw * 0.96, this.hh * 1.24);
      ctx.beginPath();
      ctx.arc(0, -this.hh * 0.08, this.hw * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Long dormant limbs make the authored reach legible without implying an active tell.
      ctx.strokeStyle = this.flash > 0 ? "#fff" : this.color;
      ctx.lineWidth = 15;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * this.hw * 0.38, this.hh * 0.38);
        ctx.lineTo(side * this.hw * 0.82, this.hh * 0.8);
        ctx.lineTo(side * this.hw * 1.22, this.hh * 1.42);
        ctx.stroke();
      }

      // A plural mask-ring surrounds the keeper's face; gold nodes expose the graft seams.
      ctx.fillStyle = THEME.ink;
      for (const x of [-32, 0, 32]) {
        ctx.beginPath();
        ctx.arc(x, -this.hh * 0.12 - Math.abs(x) * 0.18, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = gold;
      for (const [x, y, radius] of [
        [-24, 22, 5],
        [24, 22, 5],
        [-37, 68, 4],
        [37, 68, 4],
        [0, 88, 6],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!GFX.low) {
        ctx.strokeStyle = gold;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 54, 46 + Math.sin(intro * Math.PI) * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
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
