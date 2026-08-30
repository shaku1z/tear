import type { RootbinderPresentationFacts } from "../../gameplay/environment/rootbinder-presentation-facts";

/** Draws only immutable Rootbinder facts; no environment or gameplay state is mutated here. */
export function renderRootbinderPresentation(canvas: CanvasRenderingContext2D, facts: RootbinderPresentationFacts): void {
  const contrast = facts.highContrast;
  const sourceRadius = facts.state === "planted" || facts.state === "link-warning" || facts.state === "linked" ? 11 : 7;
  canvas.save();
  canvas.lineCap = "round";
  canvas.lineWidth = contrast ? 4 : 2;
  canvas.fillStyle = contrast ? "#fff200" : "#d7ad22";
  canvas.strokeStyle = contrast ? "#111111" : "#fff1a3";
  const source = facts.sourceNode;
  canvas.beginPath(); canvas.arc(source.x, source.y, sourceRadius + (contrast ? 2 : 0), 0, Math.PI * 2); canvas.fill();
  if (contrast) { canvas.stroke(); }
  const drawSegments = (segments: readonly Readonly<{ x: number; y: number; points?: readonly Readonly<{ x: number; y: number }>[] }>[], color: string, dashed: boolean): void => {
    canvas.strokeStyle = color; canvas.setLineDash(dashed ? [8, 6] : []);
    for (const segment of segments) {
      const points = segment.points;
      if (points === undefined || points.length < 2) continue;
      const first = points[0];
      if (first === undefined) continue;
      canvas.beginPath(); canvas.moveTo(first.x, first.y);
      for (const point of points.slice(1)) canvas.lineTo(point.x, point.y);
      canvas.stroke();
    }
  };
  drawSegments(facts.warningGeometry, contrast ? "#ffffff" : "#f2d45c", true);
  drawSegments(facts.activeSegments, contrast ? "#00ff9d" : "#5be08e", false);
  if (facts.severFeedback.length > 0) {
    canvas.strokeStyle = contrast ? "#ff3b30" : "#d95151"; canvas.setLineDash([]);
    canvas.beginPath(); canvas.moveTo(source.x - 9, source.y - 9); canvas.lineTo(source.x + 9, source.y + 9);
    canvas.moveTo(source.x + 9, source.y - 9); canvas.lineTo(source.x - 9, source.y + 9); canvas.stroke();
  }
  canvas.restore();
}
