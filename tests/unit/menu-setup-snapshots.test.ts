import { describe, expect, it } from "vitest";
import { buildMenuSnapshot, buildSetupSnapshot } from "../../src/presentation/menu-setup-snapshots";
import { BOSS_ROSTER } from "../../src/gameplay/run/content-director";
import { CONFIG } from "../../src/config/game-config";
import { createSurfaceAvailability } from "../../src/domain/surface-availability";

const RELEASE = createSurfaceAvailability("release");
const ENGINEERING = createSurfaceAvailability("engineering");
const modes = [{ id: "endless", label: "Endless", blurb: "forever" }];
const difficulties = [{ id: "normal", label: "Normal", desc: "fair", mods: { score: 1, coin: 1 } }];
const weapons = [{ id: "blade", name: "Blade", blurb: "cut", tags: ["fast"], throwIdentity: "return" }];
const setupInput = (selectedMode: string, surfaces: typeof RELEASE) => ({ selectedMode, selectedDifficulty: "normal", selectedWeapon: "blade",
  selectedBoss: "shuffle", startGlyph: "▢", modes: CONFIG.modes, difficulties, weapons, bosses: BOSS_ROSTER, surfaces,
  best: { wave: 0, score: 0 }, formatTime: String });
describe("menu/setup snapshots", () => {
  it("projects identity and selected defaults", () => {
    expect(buildMenuSnapshot({ username: "Ada", campaignEmblem: true, signedIn: true, coins: 1, shards: 2, unlocked: 3,
      selectedMode: "endless", selectedDifficulty: "normal", modes, difficulties, biome: "Grounds", pendingFinale: false, surfaces: RELEASE }).playerName).toBe("◇ Ada");
    const input = { username: "Guest", campaignEmblem: false, signedIn: false, coins: 0, shards: 0, unlocked: 0,
      selectedMode: "tutorial", selectedDifficulty: "normal", modes, difficulties, biome: "Grounds", pendingFinale: false, surfaces: RELEASE };
    expect(buildMenuSnapshot({ ...input, tutorialDone: 0 }).practiceAvailable).toBeUndefined();
    expect(buildMenuSnapshot({ ...input, tutorialDone: 1 }).practiceAvailable).toBe(true);
    expect(buildMenuSnapshot({ ...input, tutorialDone: 0.5 }).practiceAvailable).toBeUndefined();
  });
  it("offers the engineering menu routes only in the engineering channel", () => {
    const input = { username: "Guest", campaignEmblem: false, signedIn: false, coins: 0, shards: 0, unlocked: 0,
      selectedMode: "endless", selectedDifficulty: "normal", modes, difficulties, biome: "Grounds", pendingFinale: false };
    expect(buildMenuSnapshot({ ...input, surfaces: RELEASE }).engineeringRoutes).toBeUndefined();
    expect(buildMenuSnapshot({ ...input, surfaces: ENGINEERING }).engineeringRoutes).toBe(true);
  });
  it("projects weapon identity and best summary", () => {
    const view = buildSetupSnapshot({ selectedMode: "endless", selectedDifficulty: "normal", selectedWeapon: "blade", selectedBoss: "shuffle",
      startGlyph: "▢", modes, difficulties, weapons: [{ id: "blade", name: "Blade", blurb: "cut", tags: ["fast"], throwIdentity: "return",
        ratings: { handling: 5, impact: 3, reach: 4, difficulty: 2 }, weaknesses: ["armor"] }],
      bosses: [], surfaces: RELEASE, best: { wave: 2, score: 10 }, formatTime: String, tutorialDone: 1 });
    expect(view.practiceAvailable).toBe(true);
    expect(view.startSummary).toBe("ENDLESS · NORMAL · BLADE");
    expect(view.startGlyph).toBe("▢");
    expect(view.weapons[0]?.detail).toBe("Handling 5 · Impact 3 · Reach 4 · Difficulty 2\nWeak: armor");
  });
  it("offers Rootbound through the canonical Boss Test roster in engineering builds", () => {
    const view = buildSetupSnapshot({ selectedMode: "bossonly", selectedDifficulty: "normal", selectedWeapon: "blade", selectedBoss: "rootbound",
      startGlyph: "▢", modes: [{ id: "bossonly", label: "Boss Test", blurb: "bosses", debug: true }], difficulties,
      weapons: [{ id: "blade", name: "Blade", blurb: "cut", tags: ["fast"], throwIdentity: "return" }],
      bosses: BOSS_ROSTER, surfaces: ENGINEERING, best: { wave: 0, score: 0 }, formatTime: String });
    expect(view.bossChoices?.find((choice) => choice.id === "rootbound")).toEqual({
      id: "rootbound", label: "THE ROOTBOUND", selected: true,
    });
  });
  it("hides Boss Test, Enemy Test, the boss picker and Seed-Locked Race in the release channel", () => {
    const release = buildSetupSnapshot(setupInput("endless", RELEASE));
    expect(release.modes.map((mode) => mode.id)).toEqual(["campaign", "endless", "gauntlet", "playground", "tutorial"]);
    expect(release.modes.some((mode) => mode.debug === true)).toBe(false);
    expect(release.raceAvailable).toBeUndefined();
    // A stale engineering selection renders no engineering control and no picker.
    const stale = buildSetupSnapshot(setupInput("bossonly", RELEASE));
    expect(stale.bossChoices).toBeUndefined();
    expect(stale.raceAvailable).toBeUndefined();
    expect(stale.modes.some((mode) => mode.selected)).toBe(false);
  });
  it("keeps the engineering setup rows unchanged in the engineering channel", () => {
    const engineering = buildSetupSnapshot(setupInput("bossonly", ENGINEERING));
    expect(engineering.modes.filter((mode) => mode.debug === true).map((mode) => mode.id)).toEqual(["bossonly", "sandbox"]);
    expect(engineering.bossChoices?.[0]).toEqual({ id: "shuffle", label: "SHUFFLE", selected: true });
    expect(engineering.raceAvailable).toBe(true);
    expect(buildSetupSnapshot(setupInput("playground", ENGINEERING)).raceAvailable).toBeUndefined();
  });
});
