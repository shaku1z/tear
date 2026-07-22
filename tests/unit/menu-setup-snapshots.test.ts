import { describe, expect, it } from "vitest";
import { buildMenuSnapshot, buildSetupSnapshot } from "../../src/presentation/menu-setup-snapshots";

const modes = [{ id: "endless", label: "Endless", blurb: "forever" }];
const difficulties = [{ id: "normal", label: "Normal", desc: "fair", mods: { score: 1, coin: 1 } }];
describe("menu/setup snapshots", () => {
  it("projects identity and selected defaults", () => {
    expect(buildMenuSnapshot({ username: "Ada", campaignEmblem: true, signedIn: true, coins: 1, shards: 2, unlocked: 3,
      selectedMode: "endless", selectedDifficulty: "normal", modes, difficulties, biome: "Grounds", pendingFinale: false }).playerName).toBe("◇ Ada");
  });
  it("projects weapon identity and best summary", () => {
    const view = buildSetupSnapshot({ selectedMode: "endless", selectedDifficulty: "normal", selectedWeapon: "blade", selectedBoss: "shuffle",
      modes, difficulties, weapons: [{ id: "blade", name: "Blade", blurb: "cut", tags: ["fast"], throwIdentity: "return" }],
      bosses: [], livePlatform: false, best: { wave: 2, score: 10 }, formatTime: String });
    expect(view.startSummary).toBe("ENDLESS · NORMAL · BLADE");
  });
});
