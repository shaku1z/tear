import type { GhostChaseView } from "../../ghost/live-ghost-reference-data";
export interface GhostChaseUi {
  font(size: number, bold?: boolean): string;
  readonly t: Readonly<{
    type: Readonly<{ micro: number }>;
    color: Readonly<{ cinema: string; cinemaInk: string; accent: string }>;
  }>;
}

/** Paint only. All coordinates come from the settled reference world. */
export function drawLiveGhostReference(canvas: CanvasRenderingContext2D, view: GhostChaseView): void {
  const pose = view.pose;
  if (!pose) return;
  canvas.save();
  try {
    canvas.globalAlpha = 0.36;
    canvas.strokeStyle = "#13c4d6";
    canvas.fillStyle = "#13c4d6";
    canvas.lineWidth = 2;
    canvas.fillRect(
      pose.player.x - pose.player.hw,
      pose.player.y - pose.player.hh,
      pose.player.hw * 2,
      pose.player.hh * 2,
    );
    canvas.beginPath();
    canvas.moveTo(pose.blade.x, pose.blade.y);
    canvas.lineTo(pose.blade.tipX, pose.blade.tipY);
    canvas.stroke();
  } finally {
    canvas.restore();
  }
}
export function drawLiveGhostSplits(
  canvas: CanvasRenderingContext2D,
  view: GhostChaseView,
  width: number,
  ui: GhostChaseUi,
): void {
  if (view.raceRole !== "reference" && !view.active && !view.message) return;
  const signed = (n: number | undefined, unit = "") =>
    n === undefined ? "unavailable" : `${n >= 0 ? "+" : ""}${n.toFixed(unit === "s" ? 2 : 0)}${unit}`;
  canvas.save();
  try {
    const w = Math.min(620, width - 32),
      x = (width - w) / 2;
    if (view.raceRole === "reference") {
      canvas.globalAlpha = 0.9;
      canvas.fillStyle = ui.t.color.cinema;
      canvas.fillRect(x, 112, w, 44);
      canvas.globalAlpha = 1;
      canvas.fillStyle = ui.t.color.cinemaInk;
      canvas.textAlign = "center";
      canvas.font = ui.font(ui.t.type.micro);
      canvas.fillText("SEED-LOCKED RACE REFERENCE \u00b7 NEW REFERENCE RUN \u00b7 NONCOMPETITIVE", width / 2, 130);
      canvas.fillText("Shared seed and offers \u00b7 no competitor selected", width / 2, 148);
      return;
    }

    canvas.globalAlpha = 0.9;
    canvas.fillStyle = ui.t.color.cinema;
    canvas.fillRect(x, 112, w, 92);
    canvas.globalAlpha = 1;
    canvas.fillStyle = ui.t.color.cinemaInk;
    canvas.textAlign = "center";
    canvas.font = ui.font(ui.t.type.micro);
    canvas.fillText(
      `${view.raceRole ? `SEED-LOCKED RACE ${view.raceRole.toUpperCase()}` : "CHASE"} · ${!view.active ? "REFERENCE OFF" : view.visible ? "VISIBLE" : "HIDDEN"} · ${view.actor ?? "unknown"} attribution · NONCOMPETITIVE`,
      width / 2,
      130,
    );
    canvas.fillText(
      `TIME ${signed(view.time, "s")}  SCORE ${signed(view.score)}  HP ${signed(view.hp)}  WAVE ${signed(view.wave)}`,
      width / 2,
      150,
    );
    canvas.fillText(
      `HP live ${view.ownHp ?? "unavailable"} / reference ${view.referenceHp ?? "unavailable"} · ${view.split ?? "No shared completed split yet"}`,
      width / 2,
      170,
    );
    canvas.fillText(view.message, width / 2, 190, w - 20);
  } finally {
    canvas.restore();
  }
}
