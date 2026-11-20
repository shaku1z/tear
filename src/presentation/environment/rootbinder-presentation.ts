import { bossTellProgress, type BossTell } from "../../gameplay/entities/boss-tells";
import type { RootbinderPresentationFacts } from "../../gameplay/environment/rootbinder-presentation-facts";
import { BOSS_TELL_INK } from "../enemies/renderers/boss-tell-renderer";

/** Sizes of the Rootbinder's marks, in pixels. */
const NODE = Object.freeze({ walking: 7, planted: 11, contrastExtra: 2, windupRing: 30, uprootedCross: 9 });

/** The snare mark: how flat the ring lies on the ground, how much wider it starts, and its roots when it closes. */
const SNARE_MARK = Object.freeze({
  flatten: 0.3,
  startScale: 1.6,
  backingWidth: 9,
  inkWidth: 4,
  roots: 5,
  rootRise: 0.9,
});

/**
 * A snare mark, drawn over the floor from its tell: a ring on the ground that closes to the marked width as the
 * warning runs out, then roots standing in it while it can still catch. Dark under bright, so it reads on any ground.
 */
function drawSnareTell(canvas: CanvasRenderingContext2D, tell: BossTell, highContrast: boolean): void {
  const progress = bossTellProgress(tell);
  const active = tell.stage === "active";
  const groundY = tell.y + tell.hh;
  const ink = active ? BOSS_TELL_INK.active : BOSS_TELL_INK.warning;
  const strokes = [
    [highContrast ? "#000000" : BOSS_TELL_INK.backing, SNARE_MARK.backingWidth],
    [highContrast && !active ? "#ffffff" : ink, SNARE_MARK.inkWidth],
  ] as const;
  canvas.save();
  canvas.setLineDash([]);
  canvas.lineCap = "round";
  for (const [color, width] of strokes) {
    canvas.strokeStyle = color;
    canvas.lineWidth = width;
    // The marked area itself, steady, so the player sees exactly where not to stand.
    canvas.beginPath();
    canvas.ellipse(tell.x, groundY, tell.hw, tell.hw * SNARE_MARK.flatten, 0, 0, Math.PI * 2);
    canvas.stroke();
    if (active) {
      for (let index = 0; index < SNARE_MARK.roots; index += 1) {
        const x = tell.x - tell.hw + ((index + 0.5) * tell.hw * 2) / SNARE_MARK.roots;
        canvas.beginPath();
        canvas.moveTo(x, groundY);
        canvas.lineTo(x, groundY - tell.hh * 2 * SNARE_MARK.rootRise);
        canvas.stroke();
      }
    } else {
      const scale = SNARE_MARK.startScale - (SNARE_MARK.startScale - 1) * progress;
      canvas.setLineDash([10, 8]);
      canvas.beginPath();
      canvas.ellipse(tell.x, groundY, tell.hw * scale, tell.hw * scale * SNARE_MARK.flatten, 0, 0, Math.PI * 2);
      canvas.stroke();
      canvas.setLineDash([]);
    }
  }
  canvas.restore();
}

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
  for (const tell of facts.snareTells) drawSnareTell(canvas, tell, contrast);
}
