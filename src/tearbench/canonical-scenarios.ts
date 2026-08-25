import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION, type TearScenarioV1 } from "./contracts";
import { BOSS_REGISTRY, DIFFICULTY_REGISTRY, RUN_MODE_REGISTRY, WEAPON_REGISTRY } from "./registries";
import { TearScenarioRegistry } from "./scenario-registry";
import scenarioCatalog from "./canonical-scenarios.json";

type CanonicalCatalogEntry = (typeof scenarioCatalog)[number];

const base = (
  entry: CanonicalCatalogEntry,
): TearScenarioV1 => {
  const mode = RUN_MODE_REGISTRY.assert(entry.start.mode);
  const difficulty = DIFFICULTY_REGISTRY.assert(entry.start.difficulty);
  const weapon = WEAPON_REGISTRY.assert(entry.start.weapon);
  const boss = "boss" in entry.start ? BOSS_REGISTRY.assert(entry.start.boss) : undefined;
  if (entry.subject.kind === "weapon" && entry.subject.id !== weapon) {
    throw new RangeError(`canonical weapon scenario ${entry.id} starts with the wrong weapon`);
  }
  if (entry.subject.kind === "boss" && entry.subject.id !== boss) {
    throw new RangeError(`canonical boss scenario ${entry.id} starts with the wrong boss`);
  }
  if (boss !== undefined && (mode !== "bossonly" || entry.backends.includes("headless"))) {
    throw new RangeError(`canonical boss scenario ${entry.id} requires the live bossonly backend`);
  }
  if (entry.backends.length === 0 || entry.backends.some((backend) => backend !== "live" && backend !== "headless")) {
    throw new RangeError(`canonical scenario ${entry.id} has no supported execution backend`);
  }
  return Object.freeze({
    format: TEAR_CONTRACT_FORMAT,
    kind: "scenario",
    schemaVersion: TEAR_CONTRACT_VERSION,
    id: entry.id,
    version: 1,
    description: entry.description,
    stateClass: "recorded-canonical",
    executionClass: "engineering",
    seed: "1001",
    start: Object.freeze({ mode, difficulty, weapon, ...(boss === undefined ? {} : { boss }) }),
    maxTicks: entry.maxTicks,
    // Only advertise assertions whose inputs exist in every declared backend.
    assertions: Object.freeze([
      "runtime.finite-state", "player.finite-transform", "blade.finite-transform",
      "entity.unique-id", "entity.valid-owner", "player.valid-health", "replay.monotonic-time",
    ] as const),
    tags: Object.freeze(entry.tags),
  });
};

export const CANONICAL_ENGINEERING_SCENARIOS = Object.freeze([
  ...scenarioCatalog.map((entry) => base(entry)),
] as const);

export function createCanonicalScenarioRegistry(): TearScenarioRegistry {
  const registry = new TearScenarioRegistry();
  for (const scenario of CANONICAL_ENGINEERING_SCENARIOS) registry.register(scenario);
  return registry;
}
