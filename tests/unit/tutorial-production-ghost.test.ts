import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { productionGhostPath, recordProductionGhostTrace } from "../../src/gameplay/training/tutorial-production-ghost";

describe("tutorial production ghost traces", () => {
  it("samples the real Player physics deterministically", () => {
    const events = [{ at: 0, duration: 0.6, right: true }, { at: 0.2, jump: true }] as const;
    expect(recordProductionGhostTrace(CONFIG, 1.4, events)).toEqual(recordProductionGhostTrace(CONFIG, 1.4, events));
  });

  it("uses the runtime jump and dash model rather than an eased actor path", () => {
    const jump = productionGhostPath(CONFIG, "JUMP", 3);
    const dash = productionGhostPath(CONFIG, "DASH", 3);
    expect(Math.min(...jump.map((frame) => frame[2]))).toBeLessThan(-100);
    const dashPeakSpeed = Math.max(...dash.slice(1).map((frame, index) => {
      const previous = dash[index];
      return previous === undefined ? 0 : Math.abs(frame[1] - previous[1]) / (frame[0] - previous[0]);
    }));
    expect(dashPeakSpeed).toBeGreaterThan(CONFIG.player.moveSpeed);
  });
});
