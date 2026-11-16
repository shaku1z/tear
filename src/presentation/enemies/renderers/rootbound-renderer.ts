import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import type { BossAttackPose } from "../../../gameplay/entities/boss-attack-runner";
import { drawBossTells } from "./boss-tell-renderer";
import type { EnemyRendererRuntime } from "./enemy-renderer-runtime";
import type { RenderInstance } from "./enemy-renderer-types";

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
      return;
  }
}

/** Rootbound's silhouette, its moves and Choir echoes. Warning areas are drawn from its tells. */
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
      drawBossTells(runtime, ctx, this.tells());
      if (this.memoryChoirStage)
        for (const manifestation of this.memoryChoirManifestations) {
          const active = this.memoryChoirManifestationActive(manifestation);
          const centerX = manifestation.x + manifestation.w / 2;
          const centerY = manifestation.y + manifestation.h / 2;
          ctx.save();
          ctx.globalAlpha = this.memoryChoirStage === "afterimage" ? 0.3 : active ? 0.82 : 0.58;
          ctx.strokeStyle = A11Y.highContrast ? "#fff36b" : gold;
          ctx.fillStyle = A11Y.highContrast ? "#ffffff" : "#5d765e";
          ctx.lineWidth = A11Y.highContrast ? 5 : 3;
          ctx.beginPath();
          ctx.arc(centerX, centerY - manifestation.h * 0.22, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(centerX - 16, centerY - manifestation.h * 0.08, 32, manifestation.h * 0.42);
          ctx.beginPath();
          ctx.moveTo(centerX - 16, centerY);
          ctx.lineTo(centerX - 42, centerY + manifestation.h * 0.24);
          ctx.moveTo(centerX + 16, centerY);
          ctx.lineTo(centerX + 42, centerY + manifestation.h * 0.24);
          ctx.stroke();
          ctx.restore();
        }
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
      if (pose !== null) {
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
      // Leans into a wind-up, sags while exposed after a heavy move.
      if (pose?.stage === "tell") ctx.rotate(-this.facing * 0.08 * pose.progress);
      else if (pose?.stage === "punish") ctx.scale(1, 0.9);

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
      this.drawHpBar(ctx);
    },
  });
}
