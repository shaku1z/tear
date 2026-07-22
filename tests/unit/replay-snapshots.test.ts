import { describe, expect, it } from "vitest";
import { buildReplayScreenSnapshot } from "../../src/presentation/replay-snapshots";

describe("replay presentation snapshot", () => {
  it("projects transport, chapters, metadata and loadout", () => {
    const view = buildReplayScreenSnapshot({ data: { name: "Ada", wave: 3, score: 10, loadout: [{ id: "cut", n: 2 }] },
      modeLabel: "ENDLESS", playback: { t: 2, playing: false, speed: 1 }, duration: 10, progress: 0.2,
      stageName: "Grounds", wave: 2, chapters: [{ t: 5, boss: true }], infoVisible: true,
      upgrades: [{ id: "cut", name: "CUT", desc: "", cat: "offense" }], categories: { offense: { name: "OFFENSE", color: "#f00" } },
      fallbackCategory: { name: "UTILITY", color: "#000" }, specialColor: "#fc0", formatTime: String });
    expect(view.title).toBe("Ada");
    expect(view.chapters).toEqual([{ fraction: 0.5, boss: true }]);
    expect(view.loadout?.[0]?.footer).toBe("×2");
  });
});
