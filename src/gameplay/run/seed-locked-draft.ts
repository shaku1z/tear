import { SeededRandom } from "../../domain/random";
import { stableVerificationHash } from "../../replay/hash";
import { UPGRADES, rollUpgrades, type UpgradeDefinition } from "../upgrades";

export interface SeedLockedDraft {
  readonly policy: "seed-locked-common-offers.v1";
  readonly seed: number;
  readonly catalogHash: string;
}
export interface SeedRaceShared {
  readonly format: "tear-seed-race";
  readonly version: 1;
  readonly mode: "endless" | "campaign" | "gauntlet" | "bossonly";
  readonly difficulty: "easy" | "normal" | "hard" | "extreme" | "onehit";
  readonly weapon: string;
  readonly boss: string;
  readonly seed: number;
  readonly metaRanks: Readonly<Record<string, number>>;
  readonly variantDiscovery: readonly string[];
  readonly headstartId: string | null;
  readonly initialBuildHash: string;
  readonly baselineHash: string;
  readonly build: Readonly<{
    version: string;
    revision: string;
    target: string;
    rulesetVersion: string;
    contentHash: string;
    configHash: string;
  }>;
  readonly draft: SeedLockedDraft;
}
export interface SeedRaceRun {
  readonly shared: SeedRaceShared;
  readonly sharedHash: string;
  readonly role: "reference" | "challenger";
  readonly source?: Readonly<{ id: string; root: string; manifestHash: string }>;
}
export const seedRaceCatalogHash = (): string =>
  stableVerificationHash(
    UPGRADES.map((upgrade) => ({
      id: upgrade.id,
      unique: upgrade.unique,
      maxStacks: upgrade.maxStacks ?? null,
      tiers: upgrade.tiers?.length ?? 0,
      rare: upgrade.rare === true,
    })),
  );
export function readSeedLockedDraft(value: unknown): SeedLockedDraft | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid shared draft declaration");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
    Reflect.ownKeys(descriptors).some((key) => {
      const descriptor = typeof key === "string" ? descriptors[key] : undefined;
      return descriptor === undefined || !("value" in descriptor);
    })
  )
    throw new TypeError("Shared draft requires plain data");
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join() !== "catalogHash,policy,seed" ||
    v.policy !== "seed-locked-common-offers.v1" ||
    !Number.isSafeInteger(v.seed) ||
    Number(v.seed) < 1 ||
    Number(v.seed) > 0xffff_ffff ||
    v.catalogHash !== seedRaceCatalogHash()
  )
    throw new TypeError("Invalid shared draft declaration");
  return Object.freeze({ ...v }) as unknown as SeedLockedDraft;
}

/** Coordinate-local streams never consume game RNG or depend on a player's build/picks. */
export function rollSeedLockedDraft(spec: SeedLockedDraft, wave: number, ordinal: number, count: number) {
  readSeedLockedDraft(spec);
  if (
    !Number.isSafeInteger(spec.seed) ||
    spec.seed < 1 ||
    spec.seed > 0xffff_ffff ||
    spec.catalogHash !== seedRaceCatalogHash() ||
    !Number.isSafeInteger(wave) ||
    wave < 1 ||
    wave > 1_000_000 ||
    !Number.isSafeInteger(ordinal) ||
    ordinal < 0 ||
    ordinal > 64 ||
    ![3, 4].includes(count)
  )
    throw new TypeError("Invalid common draft coordinate or catalog");
  const block = Math.floor((wave - 1) / 10);
  let specials = 0,
    choices: UpgradeDefinition[] = [],
    forceSpecial = false;
  const roll = (at: number, reroll: number, force: boolean, excludeIds: readonly string[]) =>
    rollUpgrades(count, null, {
      random: new SeededRandom(`seed-locked-common-offers.v1:${String(spec.seed)}:${String(at)}:${String(reroll)}`),
      forceSpecial: force,
      excludeIds,
    });
  for (let at = block * 10 + 1; at <= wave; at++) {
    const needed = 2 - specials,
      draftsLeft = Math.max(1, 10 - (((at - 1) % 10) + 1));
    forceSpecial = needed > 0 && draftsLeft <= needed;
    choices = roll(at, 0, forceSpecial, []);
    specials += choices.filter((choice) => choice.tiers !== undefined).length;
  }
  for (let reroll = 1; reroll <= ordinal; reroll++)
    choices = roll(
      wave,
      reroll,
      forceSpecial,
      choices.map((choice) => choice.id),
    );
  return Object.freeze({ choices: Object.freeze(choices), specialBlock: block, specialsOffered: specials });
}
export function legalSeedRaceUpgrade(
  choice: Readonly<{ id: string; unique?: boolean; maxStacks?: number }>,
  owned: Readonly<Record<string, number>>,
): boolean {
  return (
    !(choice.unique === true && (owned[choice.id] ?? 0) > 0) &&
    !(choice.maxStacks !== undefined && (owned[choice.id] ?? 0) >= choice.maxStacks)
  );
}
/** Current source-owned view facts, never a replacement for selection-time validation. */
export function seedRaceLegality(
  owned: Readonly<Record<string, number>>,
  choices: readonly Readonly<{ id: string }>[],
  reserved: Readonly<{ id: string }> | null,
) {
  const legal = (choice: Readonly<{ id: string }>) => {
    const definition = UPGRADES.find((candidate) => candidate.id === choice.id);
    if (!definition) throw new TypeError("Unknown race choice");
    return legalSeedRaceUpgrade(definition, owned);
  };
  return Object.freeze({
    common: Object.freeze(choices.map(legal)),
    carried: reserved === null ? null : legal(reserved),
  });
}
