import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION, type TearScenarioV1 } from "./contracts";
import { TearScenarioRegistry } from "./scenario-registry";
import scenarioCatalog from "./canonical-scenarios.json";

const base = (
  id: string,
  description: string,
  tags: readonly string[],
  maxTicks = 1_440,
): TearScenarioV1 => Object.freeze({
  format: TEAR_CONTRACT_FORMAT,
  kind: "scenario",
  schemaVersion: TEAR_CONTRACT_VERSION,
  id,
  version: 1,
  description,
  stateClass: "surgical-valid",
  executionClass: "engineering",
  seed: "1001",
  start: Object.freeze({ mode: "campaign", difficulty: "normal", weapon: "sword", stage: "grounds", wave: 1 }),
  maxTicks,
  assertions: Object.freeze([
    "runtime.finite-state", "player.finite-transform", "blade.finite-transform",
    "entity.unique-id", "entity.valid-owner", "player.valid-health", "world.legal-bounds",
    "wave.valid-completion", "boss.valid-phase", "ui.valid-focus",
    "runtime.pause-freezes-simulation", "runtime.no-softlock", "replay.monotonic-time",
    "test.production-isolation",
  ] as const),
  tags: Object.freeze(tags),
});

export const CANONICAL_ENGINEERING_SCENARIOS = Object.freeze([
  ...scenarioCatalog.map((entry) => base(entry.id, entry.description, entry.tags, entry.maxTicks)),
] as const);

export function createCanonicalScenarioRegistry(): TearScenarioRegistry {
  const registry = new TearScenarioRegistry();
  for (const scenario of CANONICAL_ENGINEERING_SCENARIOS) registry.register(scenario);
  return registry;
}
