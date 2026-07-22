import type { FinaleWorldSnapshot, LegacyWorldRenderContext } from "./contracts";
import { clamp } from "./primitives";

export function createFinaleRenderer(context: LegacyWorldRenderContext) {
  const canvas = context.canvas;

  return function finaleWorld(layer: "rear" | "front", snapshot: FinaleWorldSnapshot): void {
    const time = context.timeSeconds;
    const motion = context.reducedMotion ? 0.08 : 1;
    canvas.save();
    if (layer === "rear") {
      const woundAmount = snapshot.phase === "silence" ? 0.18 : 1;
      canvas.globalAlpha = 0.16 + 0.18 * woundAmount;
      canvas.fillStyle = snapshot.restoredColor ? "#7257a8" : "#17111f";
      const count = context.lowGraphics ? 8 : snapshot.fragmentCap;
      for (let index = 0; index < count; index++) {
        const angle = index * 2.399;
        const active = snapshot.phase === "wound" || snapshot.phase === "relics" || snapshot.phase === "cut";
        const drift = time * (active ? 9 + index % 4 : 2) * motion;
        const radius = 34 + (index % 5) * 23 + drift;
        const x = snapshot.origin.x + Math.cos(angle) * radius;
        const y = snapshot.origin.y + Math.sin(angle) * radius * 0.58 - drift * 0.24;
        canvas.save();
        canvas.translate(x, y);
        canvas.rotate(angle + time * 0.08 * motion * (index % 2 === 1 ? 1 : -1));
        canvas.fillRect(-12 - (index % 3) * 4, -8, 24 + (index % 3) * 8, 16 + (index % 2) * 8);
        canvas.restore();
      }
      if (snapshot.restoredColor && !snapshot.restoring) {
        for (let index = 0; index < snapshot.stageAccents.length; index++) {
          canvas.globalAlpha = (0.035 + snapshot.cutFlash * 0.022) * (context.lowGraphics ? 0.7 : 1);
          canvas.fillStyle = snapshot.stageAccents[index] ?? "#fff";
          canvas.fillRect(index * context.width / snapshot.stageAccents.length, 70, context.width / snapshot.stageAccents.length + 1, context.height - 140);
        }
      }
      const tearAlpha = snapshot.tearClosed ? Math.max(0, 1 - snapshot.restoreAmount * 2) : 1;
      if (tearAlpha > 0) {
        canvas.globalAlpha = tearAlpha * 0.55; canvas.strokeStyle = snapshot.perfectColor; canvas.lineWidth = context.lowGraphics ? 4 : 7;
        if (!context.lowGraphics) { canvas.shadowColor = snapshot.perfectColor; canvas.shadowBlur = 22; }
        canvas.beginPath(); canvas.moveTo(context.width / 2, 58);
        for (let index = 1; index <= 10; index++) {
          canvas.lineTo(context.width / 2 + (index % 2 === 1 ? 18 : -13) * tearAlpha, 58 + index * 70);
        }
        canvas.stroke(); canvas.shadowBlur = 0;
      }
      if (snapshot.restoredGravity || snapshot.restoring) {
        const amount = snapshot.restoring ? snapshot.restoreAmount : 0.18;
        for (let index = 0; index < snapshot.stageAccents.length; index++) {
          const x = ((index * 360 + amount * 260) % (context.width + 420)) - 210;
          canvas.globalAlpha = (0.06 + 0.08 * Math.sin(Math.PI * amount)) * (context.lowGraphics ? 0.65 : 1);
          canvas.fillStyle = snapshot.stageAccents[index] ?? "#fff";
          canvas.beginPath();
          canvas.moveTo(x - 170, snapshot.groundY); canvas.lineTo(x - 90, 560 - (index % 2) * 65);
          canvas.lineTo(x + 10, 620 - (index % 3) * 55); canvas.lineTo(x + 150, 520 + (index % 2) * 55);
          canvas.lineTo(x + 210, snapshot.groundY); canvas.closePath(); canvas.fill();
        }
      }
    }
    for (let index = 0; index < snapshot.anchors.length; index++) {
      const anchor = snapshot.anchors[index];
      if (!anchor) continue;
      const rear = anchor.depth < 0.75;
      if ((layer === "rear") !== rear || anchor.cut) continue;
      const active = index === snapshot.severedIndex && snapshot.phase === "cut";
      const pulse = context.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 7 + index);
      canvas.globalAlpha = active ? 0.68 + pulse * 0.28 : 0.18;
      canvas.strokeStyle = context.highContrast && active ? "#fff36b" : snapshot.perfectColor;
      canvas.lineWidth = active ? (context.highContrast ? 7 : 4) : 2;
      canvas.beginPath(); canvas.arc(anchor.x, anchor.y, anchor.radius * anchor.depth * (1 + pulse * 0.06), 0, Math.PI * 2); canvas.stroke();
      canvas.beginPath(); canvas.moveTo(anchor.x - anchor.radius * 0.55, anchor.y + anchor.radius * 0.64);
      canvas.lineTo(anchor.x - 5, anchor.y - anchor.radius * 0.72); canvas.lineTo(anchor.x + 8, anchor.y + 4);
      canvas.lineTo(anchor.x + anchor.radius * 0.55, anchor.y - anchor.radius * 0.62); canvas.stroke();
    }
    if (layer === "front" && snapshot.relicProgress > 0 && snapshot.relicProgress < 1.05 && snapshot.blade) {
      for (let index = 0; index < 4; index++) {
        const start = index * 0.18;
        const amount = clamp((snapshot.relicProgress - start) / 0.34);
        const eased = 1 - (1 - amount) * (1 - amount);
        const sourceX = context.reducedMotion ? snapshot.blade.x : (index % 2 === 1 ? context.width + 70 : -70);
        const sourceY = context.reducedMotion ? snapshot.blade.y : 170 + index * 145;
        const x = sourceX + (snapshot.blade.x - sourceX) * eased;
        const y = sourceY + (snapshot.blade.y - sourceY) * eased;
        canvas.globalAlpha = 0.22 + 0.78 * (1 - amount * 0.35);
        canvas.fillStyle = snapshot.relicColors[index] ?? snapshot.perfectColor;
        canvas.beginPath(); canvas.arc(x, y, 7 + 6 * (1 - amount), 0, Math.PI * 2); canvas.fill();
      }
    }
    canvas.restore();
  };
}
