export * from "../../gameplay/environment/bloom-well-presentation-facts";

import type { BloomWellPresentationFacts } from "../../gameplay/environment/bloom-well-presentation-facts";

/** Draws immutable Bloom Well facts without participating in force or lifecycle state. */
export function renderBloomWellPresentation(
  canvas: CanvasRenderingContext2D,
  facts: BloomWellPresentationFacts,
  timeSeconds: number,
): void {
  const geometry = facts.geometry;
  const radius = geometry.radius ?? Math.max(12, (geometry.w ?? 80) / 2);
  const centerX = geometry.radius === undefined ? geometry.x + (geometry.w ?? radius * 2) / 2 : geometry.x;
  const bottom = geometry.radius === undefined ? geometry.y + (geometry.h ?? radius * 2) : geometry.y + radius;
  const top = geometry.radius === undefined ? geometry.y : geometry.y - radius;
  const height = Math.max(radius * 2, bottom - top);
  const warning = facts.state === "warning" || facts.state === "scheduled";
  const active = facts.state === "active";
  const cooldown = facts.state === "cooldown";
  if (!warning && !active && !cooldown) return;
  const pulse = facts.motionScale === 0 ? 1 : 1 - 0.18 * facts.flashScale + Math.sin(timeSeconds * 5) * 0.18 * facts.flashScale;
  canvas.save(); canvas.lineCap = "round";
  canvas.strokeStyle = facts.highContrast ? "#4b00d1" : "#e4c95a";
  canvas.lineWidth = facts.highContrast ? 5 : (warning ? 3 : 2);
  canvas.globalAlpha = cooldown ? 0.28 : pulse;
  canvas.setLineDash(warning ? [12, 8] : []);
  canvas.beginPath(); canvas.ellipse(centerX, bottom, radius, Math.max(10, radius * 0.22), 0, 0, Math.PI * 2); canvas.stroke();
  canvas.setLineDash([]);
  if (active) {
    const column = canvas.createLinearGradient(centerX, top, centerX, bottom);
    column.addColorStop(0, "rgba(228,201,90,0)");
    column.addColorStop(0.55, facts.highContrast ? "rgba(75,0,209,0.20)" : "rgba(134,205,178,0.24)");
    column.addColorStop(1, facts.highContrast ? "rgba(75,0,209,0.34)" : "rgba(228,201,90,0.26)");
    canvas.globalAlpha = 1; canvas.fillStyle = column; canvas.fillRect(centerX - radius, top, radius * 2, height);
  }
  if (!facts.lowGraphics) {
    canvas.fillStyle = facts.highContrast ? "#4b00d1" : "#f2dc7c";
    const petals = facts.motionScale === 0 ? 3 : 6;
    for (let index = 0; index < petals; index += 1) {
      const phase = index * 1.047 + timeSeconds * facts.motionScale;
      const x = centerX + Math.cos(phase) * radius * (0.35 + index * 0.07);
      const y = bottom - 18 - (index / Math.max(1, petals - 1)) * height * 0.76;
      canvas.save(); canvas.translate(x, y); canvas.rotate(phase * 0.5); canvas.fillRect(-4, -2, 8, 4); canvas.restore();
    }
  }
  if (facts.highContrast) {
    canvas.globalAlpha = 0.9; canvas.strokeRect(centerX - radius, top, radius * 2, height);
  }
  canvas.restore();
}
