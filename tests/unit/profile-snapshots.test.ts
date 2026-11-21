import { describe, expect, it } from "vitest";
import { buildProfileSnapshot } from "../../src/presentation/profile-snapshots";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";
import { resolveCosmeticStyles } from "../../src/presentation/cosmetic-styles";
import type { Loadout } from "../../src/domain/cosmetic-types";

function snapshot(rows: number, scroll: number, inset: number, tab = "vault", wearing: Loadout = {}) {
  // Passing a fixture variable keeps the pre-fix behavioral run executable:
  // the old production function ignores the inset and returns its old clamp.
  const input: Parameters<typeof buildProfileSnapshot>[0] & { replayListInset: number } = {
    cosmetics: resolveCosmeticStyles(COSMETIC_CATALOG, wearing, false),
    tab,
    tabs: [[tab, tab.toUpperCase()]],
    signedIn: false,
    firebase: false,
    canSignIn: false,
    canRename: false,
    hasCustomName: false,
    renameCooldownDays: 0,
    authRetryPrompt: false,
    signInLabel: "",
    username: "Guest",
    displayName: "",
    coins: 0,
    shards: 0,
    unlockedCount: 0,
    totalAchievements: 0,
    records: [],
    stats: [],
    message: "",
    height: 900,
    scroll,
    replays: Array.from({ length: rows }, (_, index) => ({ id: String(index), title: "Ghost", detail: "Complete" })),
    achievements: [],
    unlocked: () => false,
    categoryIcon: () => "",
    rarityColor: () => "",
    stages: [],
    bosses: [],
    stat: () => 0,
    formatTime: String,
    difficultyAccent: () => "",
    replayListInset: inset,
  };
  return buildProfileSnapshot(input);
}
describe("Profile archive list viewport", () => {
  it("C39 projection: computes the four-row archive viewport before clamping scroll and projecting both hints", () => {
    const result = snapshot(4, 20, 120);
    // Visible list: 900 - 440 (header, tabs, notice line, footer) - 120 inset = 340; four 96 px rows scroll by 44.
    expect(result.maximumScroll).toBe(44);
    expect(result.view.canScrollUp).toBe(true);
    expect(result.view.canScrollDown).toBe(true);
    const end = snapshot(4, 100, 120);
    expect(end.maximumScroll).toBe(44);
    expect(end.view.canScrollUp).toBe(true);
    expect(end.view.canScrollDown).toBe(false);
  });
  it("does not add phantom scrolling to an empty or one-row Vault", () => {
    for (const rows of [0, 1]) {
      const result = snapshot(rows, 100, 120);
      expect(result.maximumScroll).toBe(0);
      expect(result.view.canScrollUp).toBe(false);
      expect(result.view.canScrollDown).toBe(false);
    }
  });
  it("preserves the ordinary replay viewport when no inset is requested", () => {
    const result = snapshot(6, 20, 0, "replays");
    expect(result.maximumScroll).toBe(116);
    expect(result.view.canScrollUp).toBe(true);
    expect(result.view.canScrollDown).toBe(true);
  });
});

describe("Profile passport look", () => {
  it("carries no look while the player wears neither a title nor a banner", () => {
    expect(snapshot(0, 0, 0, "stats").view.passport?.look).toBeUndefined();
  });

  it("carries only the worn parts: the title text and the banner colours and pattern", () => {
    expect(snapshot(0, 0, 0, "stats", { title: "title_wanderer" }).view.passport?.look).toEqual({ title: "WANDERER" });
    expect(snapshot(0, 0, 0, "stats", { banner: "banner_nightfall" }).view.passport?.look).toEqual({
      banner: { colors: ["#1b2130", "#7a4ff0"], pattern: "split" },
    });
  });
});
