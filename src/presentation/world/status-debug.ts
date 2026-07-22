import type {
  DebugPlatformSnapshot, EnemyStatusSnapshot, LegacyWorldRenderContext, PantheonDebugSnapshot, WorldBounds,
} from "./contracts";
import { clamp } from "./primitives";

export function createStatusDebugRenderers(context: LegacyWorldRenderContext) {
  const canvas = context.canvas;

  function enemyStatus(snapshot: EnemyStatusSnapshot): void {
    const now = context.timeSeconds * 1000;
    canvas.save();
    if (snapshot.bleedStacks > 0) {
      const amount = clamp(snapshot.bleedStacks / Math.max(1, snapshot.bleedMaximum));
      canvas.globalAlpha = 0.16 + 0.10 * amount + 0.05 * Math.sin(now / 110);
      canvas.fillStyle = snapshot.bleedColor;
      canvas.beginPath();
      canvas.ellipse(snapshot.x, snapshot.y, snapshot.halfWidth + 6, snapshot.halfHeight + 6, 0, 0, Math.PI * 2);
      canvas.fill();
    }
    if (snapshot.burnTime > 0) {
      canvas.globalAlpha = 0.14 + 0.07 * Math.sin(now / 90);
      canvas.fillStyle = snapshot.burnColor;
      canvas.beginPath();
      canvas.ellipse(snapshot.x, snapshot.y, snapshot.halfWidth + 5, snapshot.halfHeight + 5, 0, 0, Math.PI * 2);
      canvas.fill();
      const flameCount = 5;
      const base = snapshot.y - snapshot.halfHeight;
      for (let index = 0; index < flameCount; index++) {
        const x = snapshot.x - snapshot.halfWidth + (index + 0.5) * (snapshot.halfWidth * 2 / flameCount);
        const flame = Math.sin(now / 70 + index * 1.9) * 0.5 + 0.5;
        canvas.globalAlpha = 0.55 + 0.35 * flame;
        canvas.fillStyle = index % 2 === 1 ? "#ffce33" : snapshot.burnColor;
        canvas.beginPath();
        canvas.moveTo(x - 5, base);
        canvas.quadraticCurveTo(x, base - (12 + flame * 18), x + 5, base);
        canvas.closePath();
        canvas.fill();
      }
    }
    if (snapshot.markTime > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 100);
      const margin = 5 + pulse * 4;
      const length = 8;
      const x0 = snapshot.x - snapshot.halfWidth - margin;
      const x1 = snapshot.x + snapshot.halfWidth + margin;
      const y0 = snapshot.y - snapshot.halfHeight - margin;
      const y1 = snapshot.y + snapshot.halfHeight + margin;
      canvas.globalAlpha = 0.55 + 0.45 * pulse;
      canvas.strokeStyle = snapshot.markColor;
      canvas.lineWidth = 2.2;
      canvas.beginPath();
      canvas.moveTo(x0, y0 + length); canvas.lineTo(x0, y0); canvas.lineTo(x0 + length, y0);
      canvas.moveTo(x1 - length, y0); canvas.lineTo(x1, y0); canvas.lineTo(x1, y0 + length);
      canvas.moveTo(x1, y1 - length); canvas.lineTo(x1, y1); canvas.lineTo(x1 - length, y1);
      canvas.moveTo(x0 + length, y1); canvas.lineTo(x0, y1); canvas.lineTo(x0, y1 - length);
      canvas.stroke();
    }
    canvas.globalAlpha = 1;
    canvas.restore();
  }

  function rect(bounds: WorldBounds): void {
    canvas.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
  }

  function platform(snapshot: DebugPlatformSnapshot, broken: boolean): void {
    canvas.strokeStyle = broken
      ? (snapshot.state === "reforming" ? "#55ff9a" : "#ff6b6b")
      : (snapshot.isVoid ? "#13c4d6" : "#e8a32e");
    canvas.fillStyle = canvas.strokeStyle;
    canvas.globalAlpha = 0.85;
    if (broken) canvas.setLineDash([7, 5]);
    canvas.strokeRect(snapshot.x, snapshot.y, snapshot.w, snapshot.h);
    if (broken) canvas.setLineDash([]);
    canvas.fillText(`${snapshot.id}${snapshot.state ? `:${snapshot.state}` : ""}`, snapshot.x + snapshot.w / 2, snapshot.y - 4);
    if (snapshot.lane && snapshot.chunkId !== undefined) {
      canvas.fillText(`${snapshot.lane} · chunk ${String(snapshot.chunkId)}`, snapshot.x + snapshot.w / 2, snapshot.y + snapshot.h + 15);
    }
  }

  function pantheonDebug(snapshot: PantheonDebugSnapshot): void {
    if (!snapshot.enabled) return;
    canvas.save();
    if (snapshot.paintedBounds) {
      canvas.setLineDash([10, 7]); canvas.lineWidth = 2; canvas.strokeStyle = "#ff4fd8"; canvas.globalAlpha = 0.9;
      rect(snapshot.paintedBounds);
    }
    if (snapshot.visibleBounds) {
      canvas.setLineDash([]); canvas.lineWidth = 3; canvas.strokeStyle = "#31e6ff"; canvas.globalAlpha = 0.95;
      rect(snapshot.visibleBounds);
    }
    canvas.setLineDash([]); canvas.textAlign = "center"; canvas.textBaseline = "bottom";
    canvas.font = "bold 11px 'Courier New', monospace";
    const visible = snapshot.visibleBounds;
    const painted = snapshot.paintedBounds;
    if (visible && painted) {
      const mapX = visible.left + 24, mapY = visible.top + 24, mapW = 190, mapH = 104;
      const paintedWidth = painted.right - painted.left, paintedHeight = painted.bottom - painted.top;
      const insetX = mapX + (visible.left - painted.left) / paintedWidth * mapW;
      const insetY = mapY + (visible.top - painted.top) / paintedHeight * mapH;
      const insetW = (visible.right - visible.left) / paintedWidth * mapW;
      const insetH = (visible.bottom - visible.top) / paintedHeight * mapH;
      canvas.globalAlpha = 0.72; canvas.fillStyle = "#080914"; canvas.fillRect(mapX - 8, mapY - 8, mapW + 16, mapH + 30);
      canvas.globalAlpha = 0.95; canvas.strokeStyle = "#ff4fd8"; canvas.setLineDash([5, 4]); canvas.lineWidth = 2;
      canvas.strokeRect(mapX, mapY, mapW, mapH);
      canvas.setLineDash([]); canvas.strokeStyle = "#31e6ff"; canvas.strokeRect(insetX, insetY, insetW, insetH);
      canvas.fillStyle = "#ff4fd8"; canvas.textBaseline = "top"; canvas.fillText("PAINT", mapX + 24, mapY + mapH + 7);
      canvas.fillStyle = "#31e6ff"; canvas.fillText("VISIBLE", mapX + mapW - 38, mapY + mapH + 7);
      canvas.textBaseline = "bottom";
    }
    for (const item of snapshot.platforms) platform(item, false);
    for (const item of snapshot.brokenPlatforms) platform(item, true);
    canvas.lineWidth = 2; canvas.setLineDash([6, 5]);
    for (const window of snapshot.transferWindows) {
      canvas.fillStyle = "rgba(255,243,107,0.08)";
      canvas.fillRect(window.x0, snapshot.sourceUpperY - 34, window.x1 - window.x0, snapshot.sourceLowerY - snapshot.sourceUpperY + 68);
    }
    canvas.strokeStyle = "#fff36b";
    for (const connection of snapshot.connections) {
      canvas.beginPath(); canvas.moveTo(connection.a.x, connection.a.y); canvas.lineTo(connection.b.x, connection.b.y); canvas.stroke();
    }
    canvas.setLineDash([]);
    for (const projectile of snapshot.projectiles) {
      canvas.strokeStyle = projectile.family === "sweeper" ? "#d45ee8" : "#ff944d"; canvas.globalAlpha = 0.9;
      canvas.beginPath(); canvas.arc(projectile.x, projectile.y, projectile.radius + 7, 0, Math.PI * 2); canvas.stroke();
      canvas.fillStyle = canvas.strokeStyle;
      canvas.fillText(`${projectile.family}:${projectile.counterplay}${projectile.sweeperState ? `:${projectile.sweeperState}` : ""}`,
        projectile.x, projectile.y - projectile.radius - 10);
    }
    for (const enemy of snapshot.enemies) {
      canvas.strokeStyle = "#55ff9a"; canvas.globalAlpha = 0.9;
      for (const geometry of enemy.geometry) {
        canvas.lineWidth = Math.max(1, (geometry.radius ?? 0) * 2);
        canvas.beginPath(); canvas.moveTo(geometry.a.x, geometry.a.y); canvas.lineTo(geometry.b.x, geometry.b.y); canvas.stroke();
      }
      canvas.lineWidth = 2;
      for (const zone of enemy.zones) if (zone.nextOn || zone.warningAmount > 0) {
        const width = zone.width || snapshot.defaultZoneWidth;
        canvas.strokeStyle = "#fff36b"; canvas.globalAlpha = 0.95;
        canvas.strokeRect(zone.x - width / 2, snapshot.groundY - 44, width, 44);
      }
    }
    canvas.restore();
  }

  return { enemyStatus, pantheonDebug };
}
