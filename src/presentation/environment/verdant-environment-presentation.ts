import type { EnvironmentPresentationSnapshot } from "../../gameplay/environment/presentation-snapshot";

export interface VerdantEnvironmentPresentationOptions {
  readonly highContrast: boolean;
  readonly reducedMotion: boolean;
  readonly lowGraphics: boolean;
  readonly timeSeconds: number;
  readonly flashScale: number;
}

function graftCenter(
  anchor: EnvironmentPresentationSnapshot["combatObjects"][number],
): Readonly<{ x: number; y: number; radius: number }> {
  const geometry = anchor.geometry;
  const radius = geometry.radius ?? Math.max(12, Math.min(geometry.w ?? 32, geometry.h ?? 32) / 2);
  return Object.freeze({
    x: geometry.radius === undefined ? geometry.x + (geometry.w ?? radius * 2) / 2 : geometry.x,
    y: geometry.radius === undefined ? geometry.y + (geometry.h ?? radius * 2) / 2 : geometry.y,
    radius,
  });
}

function drawGraftBotanicalResponse(
  canvas: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  integrityRatio: number,
  destroyed: boolean,
  options: VerdantEnvironmentPresentationOptions,
): void {
  const damage = Math.max(0, Math.min(1, 1 - integrityRatio));
  const leaves = options.lowGraphics ? 2 : destroyed ? 4 : damage > 0 ? 5 : 3;
  canvas.strokeStyle = options.highContrast ? "#ffffff" : destroyed ? "#d4b85f" : "#bce7c9";
  canvas.fillStyle = options.highContrast ? "#4b00d1" : destroyed ? "rgba(212,184,95,0.18)" : "rgba(79,132,76,0.42)";
  canvas.lineWidth = options.highContrast ? 5 : 2.5;
  canvas.beginPath();
  canvas.arc(x, y, radius * (0.56 + damage * 0.22), 0.18, Math.PI * 1.82);
  canvas.stroke();
  for (let index = 0; index < leaves; index += 1) {
    const angle = -2.45 + index * (4.9 / Math.max(1, leaves - 1));
    const inner = radius * (0.3 + damage * 0.08),
      outer = radius * (destroyed ? 0.92 : 0.68 + damage * 0.2);
    const sx = x + Math.cos(angle) * inner,
      sy = y + Math.sin(angle) * inner;
    const ex = x + Math.cos(angle) * outer,
      ey = y + Math.sin(angle) * outer;
    const bend = (index % 2 === 0 ? 1 : -1) * radius * 0.22;
    canvas.beginPath();
    canvas.moveTo(sx, sy);
    canvas.quadraticCurveTo((sx + ex) / 2 + bend, (sy + ey) / 2 - bend * 0.35, ex, ey);
    canvas.quadraticCurveTo((sx + ex) / 2 - bend * 0.18, (sy + ey) / 2 + bend * 0.22, sx, sy);
    if (!destroyed) canvas.fill();
    canvas.stroke();
  }
}

/** Draws future-compatible Graft/Regrowth facts already admitted by the environment kernel. */
export function renderVerdantEnvironmentPresentation(
  canvas: CanvasRenderingContext2D,
  snapshot: EnvironmentPresentationSnapshot,
  options: VerdantEnvironmentPresentationOptions,
): void {
  if (snapshot.stageId !== "verdant-sanctum") return;
  canvas.save();
  canvas.lineCap = "round";
  for (const field of snapshot.fields) {
    if (field.kind !== "rootline") continue;
    const { minX, maxX, minY, maxY } = field.bounds;
    const warning = field.state === "warning" || field.state === "scheduled";
    const settled = field.state === "expired" || field.state === "destroyed" || field.state === "cooldown";
    canvas.globalAlpha = settled ? 0.22 : warning ? 0.82 : 0.94;
    canvas.strokeStyle = options.highContrast ? "#fff36b" : "#d7b84c";
    canvas.fillStyle = options.highContrast ? "#ffffff" : "#244f3f";
    canvas.lineWidth = options.highContrast ? 6 : 4;
    // The boss's Rootline tell draws the warning; this draws the roots and what they leave behind.
    if (!warning) canvas.strokeRect(minX, minY, maxX - minX, maxY - minY);
    if (!warning && !settled) {
      const rootWidth = options.lowGraphics ? 90 : 58;
      canvas.beginPath();
      canvas.moveTo(minX, maxY);
      for (let x = minX; x <= maxX; x += rootWidth) {
        const next = Math.min(maxX, x + rootWidth);
        canvas.quadraticCurveTo(
          x + rootWidth * 0.45,
          minY + ((x / rootWidth) % 2 < 1 ? 0 : (maxY - minY) * 0.22),
          next,
          maxY,
        );
      }
      canvas.lineTo(maxX, maxY);
      canvas.closePath();
      canvas.fill();
      canvas.globalAlpha = 0.74;
      canvas.strokeStyle = options.highContrast ? "#ffffff" : "#43aa9b";
      canvas.lineWidth = 2;
      canvas.beginPath();
      canvas.moveTo(minX, minY + (maxY - minY) * 0.62);
      canvas.quadraticCurveTo(
        minX + (maxX - minX) * 0.48,
        minY + (maxY - minY) * 0.22,
        maxX,
        minY + (maxY - minY) * 0.58,
      );
      canvas.stroke();
    }
  }
  for (const boundary of snapshot.combatObjects) {
    if (boundary.kind !== "root-link" || boundary.rootCageId === undefined) continue;
    const { x, y, w = 0, h = 0 } = boundary.geometry;
    const warning = boundary.state === "warning" || boundary.state === "scheduled";
    canvas.globalAlpha = boundary.state === "destroyed" || boundary.state === "expired" ? 0.25 : warning ? 0.78 : 0.94;
    canvas.strokeStyle = options.highContrast ? "#ffffff" : "#d6c55b";
    canvas.fillStyle = options.highContrast ? "#3b007f" : "#425f37";
    canvas.lineWidth = options.highContrast ? 6 : 4;
    canvas.setLineDash(warning ? [14, 8] : []);
    canvas.strokeRect(x, y, w, h);
    canvas.setLineDash([]);
    if (!warning) canvas.fillRect(x, y, w, h);
    canvas.beginPath();
    canvas.moveTo(x, y);
    canvas.lineTo(x + w, y + h * 0.34);
    canvas.lineTo(x, y + h * 0.68);
    canvas.lineTo(x + w, y + h);
    canvas.stroke();
  }
  for (const anchor of snapshot.combatObjects) {
    if (anchor.kind !== "graft-anchor") continue;
    const { x, y, radius } = graftCenter(anchor);
    const warning = anchor.state === "warning" || anchor.state === "scheduled";
    const destroyed = anchor.state === "destroyed";
    const expired = anchor.state === "expired";
    const flash = Math.max(0, Math.min(1, options.flashScale));
    const pulse =
      options.reducedMotion || flash === 0 ? 1 : 1 - 0.18 * flash + Math.sin(options.timeSeconds * 6) * 0.18 * flash;
    canvas.globalAlpha = expired ? 0.22 : destroyed ? 0.64 : pulse;
    if (expired) {
      canvas.strokeStyle = options.highContrast ? "#ffffff" : "#315f45";
      canvas.lineWidth = options.highContrast ? 5 : 2;
      canvas.beginPath();
      canvas.moveTo(x - radius * 0.42, y + radius * 0.22);
      canvas.lineTo(x + radius * 0.42, y - radius * 0.22);
      canvas.stroke();
      continue;
    }
    const connection = anchor.connectionGeometry?.points;
    if (connection !== undefined && connection.length >= 2) {
      const first = connection[0];
      if (first !== undefined) {
        canvas.strokeStyle = options.highContrast ? "#ffffff" : "#d0b957";
        canvas.lineWidth = options.highContrast ? 5 : 3;
        canvas.setLineDash(warning ? [10, 7] : []);
        canvas.beginPath();
        canvas.moveTo(first.x, first.y);
        for (let index = 1; index < connection.length; index += 1) {
          const point = connection[index];
          if (point !== undefined) canvas.lineTo(point.x, point.y);
        }
        canvas.stroke();
        canvas.setLineDash([]);
      }
    }
    const typeColor =
      anchor.graftType === "bastion"
        ? "#6f8f78"
        : anchor.graftType === "mercy"
          ? "#d4b85f"
          : anchor.graftType === "haste"
            ? "#91bf62"
            : "#7fa96a";
    canvas.fillStyle = options.highContrast ? "#4b00d1" : typeColor;
    canvas.strokeStyle = options.highContrast ? "#ffffff" : "#e4c95a";
    canvas.lineWidth = options.highContrast ? 5 : 3;
    if (!destroyed) {
      canvas.beginPath();
      canvas.moveTo(x, y - radius);
      canvas.lineTo(x + radius, y);
      canvas.lineTo(x, y + radius);
      canvas.lineTo(x - radius, y);
      canvas.closePath();
      canvas.fill();
      canvas.stroke();
    }
    drawGraftBotanicalResponse(canvas, x, y, radius, anchor.integrityRatio, destroyed, options);
    if (destroyed) continue;
    if (anchor.graftType === "bastion")
      canvas.strokeRect(x - radius * 0.34, y - radius * 0.34, radius * 0.68, radius * 0.68);
    else if (anchor.graftType === "mercy") {
      canvas.beginPath();
      canvas.arc(x, y, radius * 0.34, 0, Math.PI * 2);
      canvas.stroke();
    } else if (anchor.graftType === "haste") {
      canvas.beginPath();
      canvas.moveTo(x - radius * 0.18, y - radius * 0.45);
      canvas.lineTo(x + radius * 0.12, y - radius * 0.05);
      canvas.lineTo(x - radius * 0.04, y + radius * 0.05);
      canvas.lineTo(x + radius * 0.18, y + radius * 0.45);
      canvas.stroke();
    }
    if (warning) {
      canvas.setLineDash([10, 7]);
      canvas.beginPath();
      canvas.arc(x, y, radius + 14, 0, Math.PI * 2);
      canvas.stroke();
      canvas.setLineDash([]);
    }
  }
  for (const route of snapshot.routes) {
    if (route.kind !== "regrowth-link" || route.points.length < 2) continue;
    const first = route.points[0];
    if (first === undefined) continue;
    const settled = route.state === "destroyed" || route.state === "expired";
    const warning = route.state === "warning" || route.state === "scheduled";
    canvas.globalAlpha = settled ? 0.22 : warning ? 0.9 : 0.82;
    canvas.strokeStyle = options.highContrast ? "#ffffff" : warning ? "#d4b85f" : "#234f3f";
    canvas.lineWidth = options.highContrast ? 7 : warning ? 6 : 8;
    canvas.setLineDash(warning ? [12, 8] : settled ? [3, 11] : []);
    canvas.beginPath();
    canvas.moveTo(first.x, first.y);
    for (let index = 1; index < route.points.length; index += 1) {
      const point = route.points[index];
      if (point !== undefined) canvas.lineTo(point.x, point.y);
    }
    canvas.stroke();
    canvas.setLineDash([]);
    if (!settled && !warning) {
      canvas.globalAlpha = 0.72;
      canvas.strokeStyle = options.highContrast ? "#ffffff" : "#43aa9b";
      canvas.lineWidth = options.lowGraphics ? 2 : 3;
      canvas.beginPath();
      canvas.moveTo(first.x, first.y);
      for (let index = 1; index < route.points.length; index += 1) {
        const point = route.points[index];
        if (point !== undefined) canvas.lineTo(point.x, point.y);
      }
      canvas.stroke();
      if (!options.lowGraphics) {
        canvas.globalAlpha = 0.52;
        canvas.strokeStyle = options.highContrast ? "#ffffff" : "#d4b85f";
        canvas.lineWidth = 1.5;
        canvas.beginPath();
        canvas.moveTo(first.x - 5, first.y + 6);
        for (let index = 1; index < route.points.length; index += 1) {
          const point = route.points[index];
          if (point !== undefined) canvas.lineTo(point.x - 5, point.y + 6);
        }
        canvas.stroke();
      }
    }
  }
  canvas.restore();
}
