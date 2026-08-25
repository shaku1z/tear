import { describe, expect, it } from "vitest";
import scenarioCatalog from "../../src/tearbench/canonical-scenarios.json";
import { BOSS_DEFINITIONS } from "../../src/gameplay/run/boss-definitions";
import { DIFFICULTY_IDS as GAME_DIFFICULTY_IDS } from "../../src/gameplay/run/difficulty-catalog";
import { MODE_IDS as GAME_MODE_IDS } from "../../src/gameplay/run/mode-catalog";
import { ENEMY_KIND_IDS as GAME_ENEMY_KIND_IDS } from "../../src/gameplay/run/content-director";
import { GAMEPLAY_EVENT_KIND_IDS as GAME_EVENT_KIND_IDS } from "../../src/gameplay/runtime/gameplay-events";
import { STAGES, STAGE_IDS as GAME_STAGE_IDS } from "../../src/gameplay/stages";
import { CANONICAL_UPGRADE_IDS as GAME_UPGRADE_IDS } from "../../src/gameplay/upgrades";
import { isRetiredWeaponSelection, WEAPON_IDS as GAME_WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import { getWeapon } from "../../src/gameplay/weapons";
import { canonicalObservationActions, canonicalObservationEnemyKind, canonicalObservationStage } from
  "../../src/tearbench/observation-identity";
import type { TearScenarioV1 } from "../../src/tearbench/contracts";
import { CANONICAL_ENGINEERING_SCENARIOS } from "../../src/tearbench/canonical-scenarios";
import { createProductionHeadlessEnvironment } from "../../src/tearbench/production-headless-environment";
import { PRODUCTION_UPGRADE_BY_ID } from "../../src/tearbench/progression-synthesis-policy";
import { validateTearContract } from "../../src/tearbench/validation";
import {
  BOSS_IDS,
  BOSS_REGISTRY,
  DIFFICULTY_IDS,
  DIFFICULTY_REGISTRY,
  ENTITY_KIND_REGISTRY,
  NATIVE_GAMEPLAY_EVENT_KIND_IDS,
  NATIVE_GAMEPLAY_EVENT_KIND_REGISTRY,
  RUN_MODE_IDS,
  RUN_MODE_REGISTRY,
  STAGE_IDS,
  STAGE_REGISTRY,
  UPGRADE_IDS,
  UPGRADE_REGISTRY,
  WEAPON_IDS,
  WEAPON_REGISTRY,
} from "../../src/tearbench/registries";

interface CurrentCatalogEntry {
  readonly id: string;
  readonly description: string;
  readonly subject: Readonly<{ kind: "gameplay" | "weapon" | "boss"; id: string }>;
  readonly start: Readonly<{ mode: string; difficulty: string; weapon: string; boss?: string }>;
  readonly backends: readonly ("live" | "headless")[];
  readonly tags: readonly string[];
  readonly maxTicks: number;
}

const currentCatalog = scenarioCatalog as unknown as readonly CurrentCatalogEntry[];

function assertProductionOwnerCoverage(label: string, source: readonly string[], covered: readonly string[]): void {
  const missing = source.filter((id) => !covered.includes(id));
  const retired = covered.filter((id) => !source.includes(id));
  if (missing.length > 0 || retired.length > 0) {
    throw new RangeError(`${label} coverage drift: missing ${missing.join(",") || "none"}; retired ${retired.join(",") || "none"}`);
  }
}

function materializeCurrentScenario(entry: CurrentCatalogEntry): TearScenarioV1 {
  return Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id: entry.id, version: 1, description: entry.description,
    stateClass: "recorded-canonical", executionClass: "engineering",
    seed: `current-catalog-${entry.id}`,
    start: Object.freeze({ mode: entry.start.mode, difficulty: entry.start.difficulty,
      weapon: entry.start.weapon, ...(entry.start.boss === undefined ? {} : { boss: entry.start.boss }) }) as TearScenarioV1["start"],
    maxTicks: entry.maxTicks,
    assertions: Object.freeze(["runtime.finite-state"] as const),
    tags: Object.freeze([...entry.tags]),
  });
}

describe("TearBench current-game catalog authority", () => {
  it("uses the production identity owners for every active registry", () => {
    expect(WEAPON_IDS).toBe(GAME_WEAPON_IDS);
    expect(RUN_MODE_IDS).toBe(GAME_MODE_IDS);
    expect(DIFFICULTY_IDS).toBe(GAME_DIFFICULTY_IDS);
    expect(STAGE_IDS).toBe(GAME_STAGE_IDS);
    expect(UPGRADE_IDS).toBe(GAME_UPGRADE_IDS);
    expect(NATIVE_GAMEPLAY_EVENT_KIND_IDS).toBe(GAME_EVENT_KIND_IDS);
    expect(BOSS_IDS).toEqual(BOSS_DEFINITIONS.map((definition) => definition.id));

    expect([...WEAPON_REGISTRY.ids]).toEqual([...GAME_WEAPON_IDS]);
    expect([...RUN_MODE_REGISTRY.ids]).toEqual([...GAME_MODE_IDS]);
    expect([...DIFFICULTY_REGISTRY.ids]).toEqual([...GAME_DIFFICULTY_IDS]);
    expect([...STAGE_REGISTRY.ids]).toEqual([...GAME_STAGE_IDS]);
    expect([...UPGRADE_REGISTRY.ids]).toEqual([...GAME_UPGRADE_IDS]);
    expect([...NATIVE_GAMEPLAY_EVENT_KIND_REGISTRY.ids]).toEqual([...GAME_EVENT_KIND_IDS]);
    expect([...BOSS_REGISTRY.ids]).toEqual(BOSS_DEFINITIONS.map((definition) => definition.id));
    expect(GAME_ENEMY_KIND_IDS.every((id) => ENTITY_KIND_REGISTRY.has(id))).toBe(true);
  });

  it("projects current stages, support subtypes, void wisps, and semantic capabilities consistently", () => {
    expect(canonicalObservationStage(0)).toBe("grounds");
    expect(() => canonicalObservationStage(99)).toThrow(/stage index/u);
    expect(canonicalObservationEnemyKind({ kind: "support", supportType: "mender" })).toBe("mender");
    expect(canonicalObservationEnemyKind({ kind: "wisp", isVoidWisp: true })).toBe("void-wisp");
    expect(canonicalObservationEnemyKind({ kind: "boss", bossId: "warden" })).toBe("warden");
    expect(() => canonicalObservationEnemyKind({ kind: "retired-enemy" })).toThrow(/unknown entity kind/u);
    expect(canonicalObservationActions("playing", "campaign", false)).not.toContain("pause");
    expect(canonicalObservationActions("playing", "campaign", true)).toContain("pause");
  });

  it("covers every production stage, authored boss, upgrade, and native event family", () => {
    assertProductionOwnerCoverage("stage", GAME_STAGE_IDS, STAGES.map((stage) => canonicalObservationStage(GAME_STAGE_IDS.indexOf(stage.id))));
    assertProductionOwnerCoverage("boss", BOSS_IDS, STAGES.map((stage) => stage.boss));
    assertProductionOwnerCoverage("upgrade", GAME_UPGRADE_IDS, [...PRODUCTION_UPGRADE_BY_ID.keys()]);
    assertProductionOwnerCoverage("native gameplay event", GAME_EVENT_KIND_IDS, NATIVE_GAMEPLAY_EVENT_KIND_REGISTRY.ids);

    expect(() => { assertProductionOwnerCoverage("boss", [...BOSS_IDS, "future-boss"], STAGES.map((stage) => stage.boss)); })
      .toThrow(/missing future-boss/u);
    expect(() => { assertProductionOwnerCoverage("stage", [...GAME_STAGE_IDS, "future-stage"], STAGES.map((stage) => stage.id)); })
      .toThrow(/missing future-stage/u);
    expect(() => { assertProductionOwnerCoverage("upgrade", [...GAME_UPGRADE_IDS, "future_upgrade"], [...PRODUCTION_UPGRADE_BY_ID.keys()]); })
      .toThrow(/missing future_upgrade/u);
    expect(() => { assertProductionOwnerCoverage("native gameplay event", [...GAME_EVENT_KIND_IDS, "future-event"],
      NATIVE_GAMEPLAY_EVENT_KIND_REGISTRY.ids); }).toThrow(/missing future-event/u);
  });

  it("validates every canonical entry against its current source-owned subject and backend", () => {
    expect(CANONICAL_ENGINEERING_SCENARIOS.map((scenario) => scenario.id))
      .toEqual(currentCatalog.map((entry) => entry.id));
    for (const entry of currentCatalog) {
      const materialized = CANONICAL_ENGINEERING_SCENARIOS.find((scenario) => scenario.id === entry.id);
      expect(materialized?.subject, entry.id).toEqual(entry.subject);
      expect(materialized?.backends, entry.id).toEqual(entry.backends);
      expect(validateTearContract(materializeCurrentScenario(entry)).ok, entry.id).toBe(true);
      expect(entry.tags, entry.id).toContain(entry.subject.id);
      expect(RUN_MODE_REGISTRY.has(entry.start.mode), entry.id).toBe(true);
      expect(DIFFICULTY_REGISTRY.has(entry.start.difficulty), entry.id).toBe(true);
      expect(WEAPON_REGISTRY.has(entry.start.weapon), entry.id).toBe(true);
      expect(entry.backends.length, entry.id).toBeGreaterThan(0);
      if (entry.subject.kind === "weapon") {
        expect(entry.start.weapon, entry.id).toBe(entry.subject.id);
        expect(entry.start.mode, `${entry.id} must describe its actual live evidence mode`).toBe("endless");
        const production = getWeapon(entry.subject.id);
        const expected = production.throwIdentity.toLowerCase().replace(/[^a-z0-9]/gu, "");
        const declared = `${entry.id} ${entry.tags.join(" ")}`.toLowerCase().replace(/[^a-z0-9]/gu, "");
        expect(declared, `${entry.id} must name the current production ${production.name} ${production.throwIdentity}`).toContain(expected);
      }
      if (entry.subject.kind === "boss") {
        expect(entry.start.boss, entry.id).toBe(entry.subject.id);
        expect(BOSS_REGISTRY.has(entry.subject.id), entry.id).toBe(true);
        expect(entry.backends, entry.id).toEqual(["live"]);
      }
    }
  });

  it("rejects mismatched current scenario subjects and invalid runtime backend authority", () => {
    const sword = CANONICAL_ENGINEERING_SCENARIOS.find((scenario) => scenario.subject.id === "sword");
    const sourceBoss = CANONICAL_ENGINEERING_SCENARIOS.find((scenario) => scenario.subject.kind === "boss");
    if (sword === undefined) throw new Error("the canonical Sword scenario is missing");
    if (sourceBoss === undefined) throw new Error("the canonical Source scenario is missing");

    expect(validateTearContract({ ...sword, subject: { kind: "weapon", id: "hammer" } }).ok).toBe(false);
    expect(validateTearContract({ ...sword, subject: { kind: "boss", id: "retired-boss" } }).ok).toBe(false);
    expect(validateTearContract({ ...sword, backends: [] }).ok).toBe(false);
    expect(validateTearContract({ ...sword, backends: ["headless", "retired-backend"] }).ok).toBe(false);
    expect(validateTearContract({ ...sourceBoss, subject: { kind: "gameplay", id: "boss-disguise" },
      backends: ["live", "headless"] }).ok).toBe(false);

    const environment = createProductionHeadlessEnvironment();
    expect(() => environment.reset({ ...sword, backends: ["live"] })).toThrow(/does not support headless/u);
    environment.dispose();
  });

  it("really resets and advances every declared current headless scenario", () => {
    for (const entry of currentCatalog.filter((candidate) => candidate.backends.includes("headless"))) {
      const environment = createProductionHeadlessEnvironment();
      try {
        const opening = environment.reset(materializeCurrentScenario(entry));
        const observed = environment.policyObservation();
        expect(observed.run, entry.id).toMatchObject({ mode: entry.start.mode,
          difficulty: entry.start.difficulty, weapon: entry.start.weapon, stage: "grounds" });
        const advanced = environment.step([{ type: "move", x: 1_000, y: 0 }]);
        expect(advanced.observation.tick, entry.id).toBe(1);
        if (advanced.observation.player === null || opening.player === null) {
          throw new Error(`canonical scenario ${entry.id} lost its source-owned player`);
        }
        expect(advanced.observation.player.x, entry.id).not.toBe(opening.player.x);
      } finally { environment.dispose(); }
    }
  });

  it("explicitly refuses the live-only Source encounter in headless execution", () => {
    const source = currentCatalog.find((entry) => entry.subject.kind === "boss" && entry.subject.id === "source");
    if (source === undefined) throw new Error("the current Source scenario is missing");
    const environment = createProductionHeadlessEnvironment();
    expect(() => environment.reset(materializeCurrentScenario(source))).toThrow(/natural opening/u);
    environment.dispose();
  });

  it("rejects retired weapon migrations and other stale content", () => {
    for (const retired of ["spear", "ringblade"]) {
      expect(isRetiredWeaponSelection(retired)).toBe(true);
      expect(WEAPON_REGISTRY.has(retired)).toBe(false);
      expect(() => WEAPON_REGISTRY.assert(retired)).toThrow(/unknown weapon id/u);
    }
    expect(() => BOSS_REGISTRY.assert("retired-boss")).toThrow(/unknown boss id/u);
    expect(() => STAGE_REGISTRY.assert("retired-stage")).toThrow(/unknown stage id/u);
    expect(() => UPGRADE_REGISTRY.assert("retired_upgrade")).toThrow(/unknown upgrade id/u);
    expect(() => NATIVE_GAMEPLAY_EVENT_KIND_REGISTRY.assert("retired-event")).toThrow(/unknown native gameplay event id/u);
    expect(() => RUN_MODE_REGISTRY.assert("debug")).toThrow(/unknown run mode id/u);
    expect(() => DIFFICULTY_REGISTRY.assert("legacy")).toThrow(/unknown difficulty id/u);
  });
});
