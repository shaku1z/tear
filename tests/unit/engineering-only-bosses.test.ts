import { describe, expect, it } from "vitest";

import { stableVerificationHash } from "../../src/domain/hash";
import { SeededRandom } from "../../src/domain/random";
import {
  BOSS_DEFINITIONS,
  ENGINEERING_ONLY_BOSS_IDS,
  isEngineeringOnlyBoss,
  runNamesEngineeringOnlyBoss,
} from "../../src/gameplay/run/boss-definitions";
import {
  BOSS_ROSTER,
  BOSS_TEST_ROSTER,
  pickMiniBoss,
  shuffledBossRoster,
} from "../../src/gameplay/run/content-director";
import { gauntletTrialOrder } from "../../src/gameplay/run/gauntlet-trials";
import { MODE_CATALOG } from "../../src/gameplay/run/mode-catalog";
import { ENTITY_KIND_IDS, REPLAY_CONTENT_HASH, REPLAY_CONTENT_KIND_IDS } from "../../src/gameplay/snapshot/codec-ids";
import { bossIdsAvailableOn, type ContentAvailabilitySurface } from "../../src/gameplay/stages";

/** The surfaces a released mode draws its bosses from. */
const RELEASED_SURFACES: readonly ContentAvailabilitySurface[] = ["adventure", "endless", "gauntlet", "published"];

describe("engineering-only bosses", () => {
  it("are the rebuilds that fight on another boss's stage, read from the definitions", () => {
    expect(ENGINEERING_ONLY_BOSS_IDS).toEqual(
      BOSS_DEFINITIONS.filter((definition) => "stageOf" in definition).map(({ id }) => id),
    );
    expect(ENGINEERING_ONLY_BOSS_IDS).toContain("rootbound-rebuild");
    expect(isEngineeringOnlyBoss("rootbound")).toBe(false);
    expect(isEngineeringOnlyBoss("not-a-boss")).toBe(false);
    expect(runNamesEngineeringOnlyBoss({ curBoss: "rootbound-rebuild" })).toBe(true);
    expect(runNamesEngineeringOnlyBoss({ curBoss: "warden", bossOrder: ["warden", "rootbound-rebuild"] })).toBe(true);
    expect(runNamesEngineeringOnlyBoss({ curBoss: "warden", bossOrder: ["warden", "echo"] })).toBe(false);
    expect(runNamesEngineeringOnlyBoss(undefined)).toBe(false);
  });

  it("cannot be reached from a released mode: only an explicit Boss Test pick, an engineering mode, names one", () => {
    const reachable = new Set<string>(BOSS_ROSTER.map(({ id }) => id));
    for (const surface of RELEASED_SURFACES) for (const id of bossIdsAvailableOn(surface)) reachable.add(id);
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const id of shuffledBossRoster(new SeededRandom(seed))) reachable.add(id);
      for (const id of gauntletTrialOrder(bossIdsAvailableOn("gauntlet"), new SeededRandom(seed))) reachable.add(id);
      reachable.add(pickMiniBoss(new SeededRandom(seed)));
    }
    for (const id of ENGINEERING_ONLY_BOSS_IDS) expect(reachable.has(id), id).toBe(false);

    for (const id of ENGINEERING_ONLY_BOSS_IDS) expect(BOSS_TEST_ROSTER.some((boss) => boss.id === id)).toBe(true);
    const bossPickers = MODE_CATALOG.filter((mode) => mode.bossOnly);
    expect(bossPickers.map(({ id }) => id)).toEqual(["bossonly"]);
    for (const mode of bossPickers) expect(mode.surface, mode.id).toBe("engineering");
  });

  it("stay out of the replay content hash, which covers every other entity kind", () => {
    expect(REPLAY_CONTENT_KIND_IDS).toEqual(
      ENTITY_KIND_IDS.filter((id) => !ENGINEERING_ONLY_BOSS_IDS.includes(id as never)),
    );
    for (const id of ENGINEERING_ONLY_BOSS_IDS) expect(REPLAY_CONTENT_KIND_IDS).not.toContain(id);
    expect(REPLAY_CONTENT_HASH).toBe(stableVerificationHash(REPLAY_CONTENT_KIND_IDS));
    expect(REPLAY_CONTENT_HASH).not.toBe(stableVerificationHash(ENTITY_KIND_IDS));
  });
});
