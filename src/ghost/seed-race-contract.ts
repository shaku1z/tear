import { isObject, isRecord } from "../domain/records";
import { META_RANK_LIMITS } from "../gameplay/progression/meta";
import { WEAPON_IDS } from "../gameplay/weapon-selection";
import { BOSS_ROSTER } from "../gameplay/run/content-director";
import { VERDANT_VARIANT_IDS } from "../gameplay/variants";
import { UPGRADES } from "../gameplay/upgrades";
import type { SeedRaceRun, SeedRaceShared } from "../gameplay/run/seed-locked-draft";
import { seedRaceCatalogHash, seedRaceLegality } from "../gameplay/run/seed-locked-draft";
import { stableVerificationHash } from "../domain/hash";
const HASH = /^[a-f0-9]{16}$/u;
function closed(value: Record<string, unknown>, names: string): boolean {
  const fields = names.split(" ");
  return Object.keys(value).length === fields.length && fields.every((key) => Object.hasOwn(value, key));
}
function hash(value: unknown): value is string {
  return typeof value === "string" && HASH.test(value);
}
/** No historical source is inferred to have agreed to race rules. */
export function readSeedRaceRun(value: unknown): SeedRaceRun | undefined {
  if (value === undefined) return undefined;
  assertRaceData(value);
  if (
    !isRecord(value) ||
    !closed(value, value.role === "challenger" ? "shared sharedHash role source" : "shared sharedHash role") ||
    typeof value.role !== "string" ||
    !["reference", "challenger"].includes(value.role) ||
    !isRecord(value.shared)
  )
    throw new TypeError("Invalid seed race declaration");
  const s = value.shared;
  if (
    !closed(
      s,
      "format version mode difficulty weapon boss seed metaRanks variantDiscovery headstartId initialBuildHash baselineHash build draft",
    ) ||
    s.format !== "tear-seed-race" ||
    s.version !== 1 ||
    typeof s.mode !== "string" ||
    !["endless", "campaign", "gauntlet", "bossonly"].includes(s.mode) ||
    typeof s.difficulty !== "string" ||
    !["easy", "normal", "hard", "extreme", "onehit"].includes(s.difficulty) ||
    typeof s.weapon !== "string" ||
    !(WEAPON_IDS as readonly string[]).includes(s.weapon) ||
    typeof s.boss !== "string" ||
    !(s.boss === "shuffle" || (s.mode === "bossonly" && BOSS_ROSTER.some((b) => b.id === s.boss))) ||
    !Number.isSafeInteger(s.seed) ||
    Number(s.seed) < 1 ||
    Number(s.seed) > 0xffff_ffff ||
    !isRecord(s.metaRanks) ||
    Object.keys(s.metaRanks).length > 64 ||
    Object.entries(s.metaRanks).some(
      ([id, rank]) =>
        id === "greed" ||
        !Object.hasOwn(META_RANK_LIMITS, id) ||
        !Number.isSafeInteger(rank) ||
        Number(rank) < 0 ||
        Number(rank) > META_RANK_LIMITS[id as keyof typeof META_RANK_LIMITS],
    ) ||
    !Array.isArray(s.variantDiscovery) ||
    new Set(s.variantDiscovery).size !== s.variantDiscovery.length ||
    s.variantDiscovery.some(
      (id) => typeof id !== "string" || !(VERDANT_VARIANT_IDS as readonly string[]).includes(id),
    ) ||
    (s.variantDiscovery.length > 0 && s.mode !== "endless" && s.mode !== "gauntlet") ||
    (Number(s.metaRanks.headstart ?? 0) > 0
      ? !UPGRADES.some((u) => u.id === s.headstartId && !u.unique)
      : s.headstartId !== null) ||
    !hash(s.initialBuildHash) ||
    !hash(s.baselineHash) ||
    !isRecord(s.build) ||
    !closed(s.build, "version revision target rulesetVersion contentHash configHash") ||
    Object.values(s.build).some((v) => typeof v !== "string" || !v) ||
    !isRecord(s.draft) ||
    !closed(s.draft, "policy seed catalogHash") ||
    s.draft.policy !== "seed-locked-common-offers.v1" ||
    s.draft.seed !== s.seed ||
    s.draft.catalogHash !== seedRaceCatalogHash() ||
    !hash(value.sharedHash) ||
    stableVerificationHash(s) !== value.sharedHash
  )
    throw new TypeError("Invalid seed race shared contract");
  if (
    value.role === "challenger" &&
    (!isRecord(value.source) ||
      !closed(value.source, "id root manifestHash") ||
      typeof value.source.id !== "string" ||
      !value.source.id ||
      value.source.id.length > 256 ||
      !hash(value.source.root) ||
      !hash(value.source.manifestHash))
  )
    throw new TypeError("Invalid race source linkage");
  return freezeRaceData(structuredClone(value)) as unknown as SeedRaceRun;
}
export function declareSeedRace(shared: SeedRaceShared): SeedRaceRun {
  const result = readSeedRaceRun({ shared, sharedHash: stableVerificationHash(shared), role: "reference" });
  if (result === undefined) throw new TypeError("Race declaration missing");
  return result;
}

/** Source-owned mechanics only: no position, actor IDs, private profile, UI or race self-reference. */
export function seedRaceInitialBuildHash(state: Readonly<Record<string, unknown>>): string {
  const run = state["tear.run.v1"],
    player = state["tear.player.v1"],
    blade = state["tear.blade.v1"];
  if (!isRecord(run) || !isRecord(player) || !isRecord(blade)) throw new TypeError("Race initial actors unavailable");
  const select = (source: Record<string, unknown>, keys: readonly string[]) =>
    Object.fromEntries(keys.map((key) => [key, source[key] ?? null]));
  return stableVerificationHash({
    configuration: state["tear.configuration.v1"],
    mods: run.mods,
    player: select(player, [
      "maxHp",
      "maxShield",
      "maxDashCharges",
      "shopRevives",
      "dashMomentumMult",
      "airborneDmgMult",
      "secondBreathDuration",
      "hazardDmgMult",
      "oneHit",
    ]),
    blade: select(blade, ["throwCooldownMult", "recallWindow", "weaponId"]),
    weapon: run.weaponId,
  });
}

function assertRaceData(value: unknown, depth = 0): void {
  if (depth > 12) throw new TypeError("Race data is too deep");
  if (
    value === null ||
    (typeof value === "string" && value.length <= 1024) ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return;
  if (
    !isObject(value) ||
    (Array.isArray(value)
      ? Object.getPrototypeOf(value) !== Array.prototype
      : Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError("Race requires plain data");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length > 256 ||
    (Array.isArray(value) &&
      (Object.keys(value).length !== value.length ||
        Array.from({ length: value.length }, (_, i) => i).some((i) => !Object.hasOwn(value, i))))
  )
    throw new TypeError("Race data is not bounded and dense");
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor)) throw new TypeError("Race accessors are unsupported");
    if (Array.isArray(value) && key === "length") continue;
    assertRaceData(descriptor.value, depth + 1);
  }
}
function freezeRaceData<T>(value: T): T {
  if (isObject(value)) {
    for (const child of Object.values(value)) freezeRaceData(child);
    Object.freeze(value);
  }
  return value;
}
/** Validate source-bound run/entitlement/projection relations before either host installs candidates. */
export function validateSeedRaceState(state: Readonly<Record<string, unknown>>): void {
  const run = state["tear.run.v1"];
  if (!isRecord(run)) return;
  const race = readSeedRaceRun(run.seedRace);
  if (!race) return;
  const shared = race.shared,
    mods = run.mods,
    reward = state["tear.reward.v1"];
  if (
    !isRecord(mods) ||
    run.runSeed !== shared.seed ||
    run.mode !== shared.mode ||
    (run.diff ?? run.difficulty) !== shared.difficulty ||
    run.weaponId !== shared.weapon ||
    stableVerificationHash(run.variantDiscovery ?? []) !== stableVerificationHash(shared.variantDiscovery) ||
    mods.reservePick !== Boolean(shared.metaRanks.reserve) ||
    mods.expandedDraft !== Boolean(shared.metaRanks.expanded) ||
    !Number.isSafeInteger(mods.draftRerolls) ||
    Number(mods.draftRerolls) < 0 ||
    Number(mods.draftRerolls) > (shared.metaRanks.reroll ?? 0) ||
    (isRecord(reward) &&
      isRecord(reward.selection) &&
      stableVerificationHash(reward.selection.seedLocked ?? null) !== stableVerificationHash(shared.draft))
  )
    throw new TypeError("Race run differs from declared setup or entitlements");
  if (
    !isRecord(reward) ||
    !isRecord(reward.selection) ||
    !isRecord(mods.owned) ||
    !Array.isArray(reward.selection.choices)
  )
    throw new TypeError("Race reward projection unavailable");
  const choice = (v: unknown): { id: string } => {
    if (!isRecord(v) || typeof v.id !== "string") throw new TypeError("Invalid race choice");
    return { id: v.id };
  };
  const legality = seedRaceLegality(
    mods.owned as Record<string, number>,
    reward.selection.choices.map(choice),
    reward.selection.reservedChoice === null ? null : choice(reward.selection.reservedChoice),
  );
  if (
    stableVerificationHash(reward.raceLegality) !== stableVerificationHash(legality) ||
    Number(reward.selection.rerollOrdinal) + Number(mods.draftRerolls) > (shared.metaRanks.reroll ?? 0)
  )
    throw new TypeError("Race reward legality or budget differs from current build");
  if (run.tick === 0 && seedRaceInitialBuildHash(state) !== shared.initialBuildHash)
    throw new TypeError("Race opening build differs from source declaration");
}
