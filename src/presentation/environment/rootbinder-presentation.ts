import type { RootbinderPresentationFacts } from "../../gameplay/environment/rootbinder-presentation-facts";

/** Sizes of the Rootbinder's marks, in pixels. */
const NODE = Object.freeze({ walking: 7, planted: 11, contrastExtra: 2, windupRing: 30, uprootedCross: 9 });

/** Draws only immutable Rootbinder facts; no environment or gameplay state is mutated here. */
export function renderRootbinderPresentation(
  canvas: CanvasRenderingContext2D,
  facts: RootbinderPresentationFacts,
): void {
  const contrast = facts.highContrast;
  const source = facts.sourceNode;
  const radius = (facts.planted ? NODE.planted : NODE.walking) + (contrast ? NODE.contrastExtra : 0);
  canvas.save();
  canvas.lineCap = "round";
  canvas.lineWidth = contrast ? 4 : 2;
  canvas.strokeStyle = contrast ? "#00ff9d" : "#5be08e";
  for (const root of facts.roots) {
    const points = root.points;
    const first = points?.[0];
    if (points === undefined || first === undefined || points.length < 2) continue;
    canvas.beginPath();
    canvas.moveTo(first.x, first.y);
    for (const point of points.slice(1)) canvas.lineTo(point.x, point.y);
    canvas.stroke();
  }
  if (facts.windup > 0) {
    // The warning that roots are coming: a dashed ring that closes on the Rootbinder as it plants.
    canvas.strokeStyle = contrast ? "#ffffff" : "#f2d45c";
    canvas.setLineDash([8, 6]);
    canvas.beginPath();
    canvas.arc(source.x, source.y, radius + NODE.windupRing * (1 - facts.windup), 0, Math.PI * 2);
    canvas.stroke();
    canvas.setLineDash([]);
  }
  canvas.fillStyle = contrast ? "#fff200" : "#d7ad22";
  canvas.strokeStyle = contrast ? "#111111" : "#fff1a3";
  canvas.beginPath();
  canvas.arc(source.x, source.y, radius, 0, Math.PI * 2);
  canvas.fill();
  if (contrast) canvas.stroke();
  if (facts.uprooted) {
    const arm = NODE.uprootedCross;
    canvas.strokeStyle = contrast ? "#ff3b30" : "#d95151";
    canvas.beginPath();
    canvas.moveTo(source.x - arm, source.y - arm);
    canvas.lineTo(source.x + arm, source.y + arm);
    canvas.moveTo(source.x + arm, source.y - arm);
    canvas.lineTo(source.x - arm, source.y + arm);
    canvas.stroke();
  }
  canvas.restore();
}
