import { describe, expect, it } from "vitest";
import {
  publishedBestiaryEntries,
  ENEMY_BESTIARY_COPY,
  BOSS_BESTIARY_COPY,
} from "../../src/presentation/bestiary-catalog";
import { buildBestiaryView } from "../../src/presentation/codex-snapshots";
import { BOSS_ROSTER, ENEMY_IDENTITY_IDS, PUBLISHED_ENEMY_IDENTITY_IDS } from "../../src/gameplay/run/content-director";
import { BOSS_IDENTITY_IDS } from "../../src/gameplay/run/boss-definitions";
import { menuMusicRow } from "../../src/presentation/menu-setup-snapshots";
import {
  buildRankedLeaderboardSnapshot,
  buildFeedLeaderboardSnapshot,
} from "../../src/presentation/leaderboard-snapshots";
import { replayClock } from "../../src/presentation/replay-snapshots";

describe("codex bestiary derivation", () => {
  const entries = publishedBestiaryEntries();

  it("lists exactly the published enemy identities, then the published bosses", () => {
    const enemies = entries.filter((entry) => entry.boss !== true).map((entry) => entry.id);
    const bosses = entries.filter((entry) => entry.boss === true).map((entry) => entry.id);
    expect(enemies).toEqual([...PUBLISHED_ENEMY_IDENTITY_IDS]);
    expect(new Set(bosses)).toEqual(new Set(BOSS_ROSTER.map((boss) => boss.id)));
  });

  it("includes the newer content and excludes unpublished preview content", () => {
    const ids = entries.map((entry) => entry.id);
    expect(ids).toEqual(
      expect.arrayContaining(["rootbinder", "rootbound", "source", "warden", "colossus", "aldric", "echo"]),
    );
    expect(ids).not.toContain("rimehound");
    expect(ids).not.toContain("white-hart");
    expect(JSON.stringify(entries)).not.toMatch(/Pale Traverse|PALE TRAVERSE|White Hart|Rime/u);
  });

  it("takes boss names and stage lines from the source catalogs", () => {
    for (const boss of BOSS_ROSTER) expect(entries.find((entry) => entry.id === boss.id)?.name).toBe(boss.name);
    expect(entries.find((entry) => entry.id === "warden")?.role).toBe("STAGE 1 · GROUNDS");
    expect(entries.find((entry) => entry.id === "source")?.role).toMatch(/^STAGE \d · TEAR$/u);
  });

  it("names only published variants, never the family's base form", () => {
    const charger = entries.find((entry) => entry.id === "charger");
    expect(charger?.variants).toContain("Brawler");
    expect(charger?.variants).not.toMatch(/^Charger/u);
    expect(charger?.variants ?? "").not.toContain("Rime Runner");
  });

  it("has player copy for every canonical identity (compile-time Records, checked at runtime too)", () => {
    for (const id of ENEMY_IDENTITY_IDS) expect(ENEMY_BESTIARY_COPY[id].desc.length).toBeGreaterThan(20);
    for (const id of BOSS_IDENTITY_IDS) expect(BOSS_BESTIARY_COPY[id].length).toBeGreaterThan(20);
  });

  it("projects stable ids into cards and filters by category", () => {
    const view = buildBestiaryView("boss", {}, "#f00", "#0ff", (entry) => ({
      stats: [{ label: "HP", value: entry.id }],
    }));
    expect(view.cards.every((card) => card.boss === true)).toBe(true);
    expect(view.cards.map((card) => card.id)).toContain("bestiary:rootbound");
    expect(view.cards.find((card) => card.id === "bestiary:source")?.previewId).toBe("creature:source");
    expect(view.cards[0]?.stats).toEqual([{ label: "HP", value: "warden" }]);
  });
});

describe("menu and replay player wording", () => {
  it("labels the music row MUSIC with the track or a plain empty state", () => {
    expect(menuMusicRow({ workId: "", title: "—", channelId: null, channelName: null, tier: 0 })).toEqual({
      label: "MUSIC",
      detail: "nothing playing yet",
    });
    expect(menuMusicRow({ workId: "w", title: "Fillet", channelId: "calm", channelName: "Calm", tier: 2 })).toEqual({
      label: "MUSIC",
      detail: "FILLET · CALM",
    });
  });

  it("formats simulation ticks as m:ss", () => {
    expect(replayClock(0)).toBe("0:00");
    expect(replayClock(120)).toBe("0:01");
    expect(replayClock(120 * 75)).toBe("1:15");
  });
});

describe("leaderboard states", () => {
  const common = { tabs: [["global", "GLOBAL"]] as const, tab: "global", message: "", height: 900, scroll: 0 };
  const ranked = (overrides: Partial<Parameters<typeof buildRankedLeaderboardSnapshot>[0]>) =>
    buildRankedLeaderboardSnapshot({
      ...common,
      cloudAvailable: true,
      loading: false,
      data: [],
      modes: [{ id: "endless", label: "Endless" }],
      difficulties: [{ id: "normal", label: "Normal" }],
      mode: "endless",
      difficulty: "normal",
      localBest: { wave: 0, score: 0 },
      rowView: () => ({ id: "x", title: "x", detail: "x" }),
      ...overrides,
    }).view.status;

  it("distinguishes account, loading, offline, empty and ready", () => {
    expect(ranked({ cloudAvailable: false })).toBe("signin");
    expect(ranked({ loading: true })).toBe("loading");
    expect(ranked({ failed: true })).toBe("offline");
    expect(ranked({})).toBe("empty");
    expect(ranked({ data: [{ name: "A", wave: 3, score: 10 }] })).toBe("ready");
    expect(
      buildFeedLeaderboardSnapshot({ ...common, cloudAvailable: true, loading: false, failed: true, rows: [] }).view
        .status,
    ).toBe("offline");
  });
});
