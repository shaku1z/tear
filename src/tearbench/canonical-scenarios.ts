import {
  TEAR_CONTRACT_FORMAT,
  TEAR_CONTRACT_VERSION,
  type TearScenarioBackendV1,
  type TearCanonicalScenarioV1,
  type TearScenarioSubjectV1,
} from "./contracts";
import { BOSS_REGISTRY, DIFFICULTY_REGISTRY, GAMEPLAY_SCENARIO_SUBJECT_REGISTRY,
  HEADLESS_GAMEPLAY_SCENARIO_SUBJECT_IDS, RUN_MODE_REGISTRY, WEAPON_REGISTRY,
  ENVIRONMENT_FIELD_SCENARIO_SUBJECT_REGISTRY, ENVIRONMENT_COMBAT_OBJECT_SCENARIO_SUBJECT_REGISTRY,
  INVARIANT_REGISTRY } from "./registries";
import { TearScenarioRegistry } from "./scenario-registry";
import scenarioCatalog from "./canonical-scenarios.json";
import { BLOOM_WELL_TIMING } from "../gameplay/environment/bloom-well";
import { ENVIRONMENT_OBJECT_DEFINITIONS } from "../gameplay/environment/environment-definitions";
import { BOSS_DEFINITIONS } from "../gameplay/run/boss-definitions";
import {
  AUTHORED_STAGES,
  STAGE_BOSS_HOME,
  STAGE_CONTENT_AVAILABILITY,
  STAGE_DISPLAY_NAMES,
  STAGE_PUBLICATION_STATE,
  stageDefinition,
  type StageId,
} from "../gameplay/stages";
import { stageEnvironmentMechanicKinds } from "../gameplay/environment/stage-environment-definitions";
import { effectiveInvariantIdsForScenario } from "./invariants";
import { assertPaleCanonicalStateForgeDocument, paleCanonicalDocumentForScenario } from "./pale-canonical-scenario-bridge";

type CanonicalCatalogEntry = (typeof scenarioCatalog)[number];
type CanonicalCatalogEntryWithStructuredAssertions = CanonicalCatalogEntry & {
  readonly structuredAssertions?: readonly string[];
};

const GENERIC_ENVIRONMENT_SUBJECT_IDS = new Set(["generic-field", "generic-combat-object"]);

function homeStageForBoss(bossId: string): StageId | undefined {
  const match = Object.entries(STAGE_BOSS_HOME).find(([, id]) => id === bossId);
  return match?.[0] as StageId | undefined;
}

function sourceEnvironmentMechanicKind(entry: CanonicalCatalogEntry): string {
  const category = entry.subject.kind === "environment-field" ? "field" : "combat-object";
  const matches = Object.values(ENVIRONMENT_OBJECT_DEFINITIONS)
    .filter((definition) => definition.category === category && entry.tags.includes(definition.kind));
  if (matches.length !== 1) {
    throw new RangeError(`canonical environment scenario ${entry.id} must name exactly one source-owned ${category} mechanic`);
  }
  const match = matches[0];
  if (match === undefined) throw new RangeError(`canonical environment scenario ${entry.id} has no source-owned ${category} mechanic`);
  return match.kind;
}

function assertSourceOwnedContent(entry: CanonicalCatalogEntry): void {
  if (!entry.tags.includes(entry.subject.id)) {
    throw new RangeError(`canonical scenario ${entry.id} must retain its source-owned subject tag`);
  }
  if (entry.subject.kind === "boss") {
    const homeStage = homeStageForBoss(entry.subject.id);
    if (homeStage === undefined) throw new RangeError(`canonical boss scenario ${entry.id} has no source-owned home stage`);
    if (stageDefinition(homeStage).boss !== entry.subject.id) {
      throw new RangeError(`canonical boss scenario ${entry.id} does not match its source-owned home stage`);
    }
    if (!entry.tags.includes(homeStage)) {
      throw new RangeError(`canonical boss scenario ${entry.id} must name its source-owned home stage`);
    }
    const publication = STAGE_CONTENT_AVAILABILITY[homeStage].published ? "published" : "preview";
    const previewTag = entry.tags.includes("unpublished-preview") || entry.tags.includes("engineering-only");
    if (publication === "preview" && !previewTag) {
      throw new RangeError(`canonical preview boss scenario ${entry.id} must remain explicitly unpublished`);
    }
    if (publication === "published" && previewTag) {
      throw new RangeError(`canonical published boss scenario ${entry.id} cannot carry preview-only tags`);
    }
  }
  if (entry.subject.kind === "environment-field" || entry.subject.kind === "environment-combat-object") {
    const specialized = !GENERIC_ENVIRONMENT_SUBJECT_IDS.has(entry.subject.id);
    const category = entry.subject.kind === "environment-field" ? "field" : "combat-object";
    const specializedTags = Object.values(ENVIRONMENT_OBJECT_DEFINITIONS)
      .filter((definition) => definition.category === category && entry.tags.includes(definition.kind));
    if (specialized) sourceEnvironmentMechanicKind(entry);
    else if (specializedTags.length > 0) {
      throw new RangeError(`generic environment scenario ${entry.id} cannot claim a specialized mechanic identity`);
    }
  }
  const stateForge = entry.stateForge;
  if (stateForge !== undefined) {
    if (typeof stateForge !== "object" || stateForge === null || typeof stateForge.documentId !== "string"
      || typeof entry.seed !== "string") {
      throw new RangeError(`canonical scenario ${entry.id} has malformed State Forge descriptor`);
    }
    if (stateForge.documentId !== entry.id) {
      throw new RangeError(`canonical scenario ${entry.id} State Forge document must use the canonical scenario ID`);
    }
    assertPaleCanonicalStateForgeDocument(stateForge.documentId, entry.seed, entry.stateClass);
    const document = paleCanonicalDocumentForScenario(stateForge.documentId);
    if (document === undefined) throw new RangeError(`canonical scenario ${entry.id} is missing its State Forge source document`);
    for (const field of ["stage", "wave", "boss", "bossPhase"] as const) {
      if (entry.start[field] !== document.start[field]) {
        throw new RangeError(`canonical scenario ${entry.id} ${field} disagrees with its State Forge source document`);
      }
    }
    if (entry.backends.length !== 1 || entry.backends[0] !== "live") {
      throw new RangeError(`canonical State Forge scenario ${entry.id} must be live-only`);
    }
    const tags = new Set(entry.tags);
    if (!tags.has("engineering-only") || !tags.has("unpublished-preview") || tags.has("published")
      || tags.has("headless") || tags.has("replay") || tags.has("seek")) {
      throw new RangeError(`canonical State Forge scenario ${entry.id} has an invalid publication/backend claim`);
    }
  }
}

export function materializeCanonicalScenario(
  entry: CanonicalCatalogEntry,
): TearCanonicalScenarioV1 {
  const surgicalFields = ["stage", "wave", "bossPhase"].filter((field) => Object.hasOwn(entry.start, field));
  if (surgicalFields.length > 0 && entry.stateForge === undefined) {
    throw new RangeError(`canonical scenario ${entry.id} requests exact ${surgicalFields.join(", ")} state; use State Forge`);
  }
  const unknownFields = Object.keys(entry.start).filter((field) =>
    !["mode", "difficulty", "weapon", "boss", "stage", "wave", "bossPhase"].includes(field));
  if (unknownFields.length > 0) {
    throw new RangeError(`canonical scenario ${entry.id} has unsupported start metadata: ${unknownFields.join(", ")}`);
  }
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
  if (entry.subject.kind === "gameplay") {
    const subject = GAMEPLAY_SCENARIO_SUBJECT_REGISTRY.assert(entry.subject.id);
    if (entry.backends.includes("headless")
      && !HEADLESS_GAMEPLAY_SCENARIO_SUBJECT_IDS.some((supported) => supported === subject)) {
      throw new RangeError(`canonical gameplay scenario ${entry.id} has no supported headless subject transition`);
    }
  }
  if (entry.subject.kind === "environment-field") ENVIRONMENT_FIELD_SCENARIO_SUBJECT_REGISTRY.assert(entry.subject.id);
  if (entry.subject.kind === "environment-combat-object") ENVIRONMENT_COMBAT_OBJECT_SCENARIO_SUBJECT_REGISTRY.assert(entry.subject.id);
  // Registry errors retain their precise legacy diagnostics before source-owner
  // projections validate tags, homes, and specialized mechanic identities.
  assertSourceOwnedContent(entry);
  if (entry.subject.kind === "environment-field" && entry.subject.id === "verdant-bloom-well") {
    if (entry.backends.length !== 1 || entry.backends[0] !== "live") {
      throw new RangeError(`canonical scenario ${entry.id} Bloom Well evidence is live-only; headless execution is unsupported`);
    }
    if (entry.maxTicks !== BLOOM_WELL_TIMING.totalTicks) {
      throw new RangeError(`canonical scenario ${entry.id} must use the Bloom Well lifecycle horizon of ${String(BLOOM_WELL_TIMING.totalTicks)} ticks`);
    }
  }
  const environmentBossContext = entry.subject.kind === "environment-field"
    || entry.subject.kind === "environment-combat-object";
  const paleWhiteHartPhase = entry.subject.kind === "gameplay"
    && entry.id.startsWith("pale-white-hart-phase-");
  if (boss !== undefined && !environmentBossContext && !paleWhiteHartPhase
    && (entry.subject.kind !== "boss" || entry.subject.id !== boss)) {
    throw new RangeError(`canonical boss scenario ${entry.id} requires its matching authoritative boss subject`);
  }
  if (boss !== undefined && (mode !== "bossonly" || entry.backends.includes("headless"))) {
    throw new RangeError(`canonical boss scenario ${entry.id} requires the live bossonly backend`);
  }
  if (entry.backends.length === 0 || entry.backends.some((backend) => backend !== "live" && backend !== "headless")) {
    throw new RangeError(`canonical scenario ${entry.id} has no supported execution backend`);
  }
  const subject: TearScenarioSubjectV1 = entry.subject.kind === "weapon"
    ? Object.freeze({ kind: "weapon", id: WEAPON_REGISTRY.assert(entry.subject.id) })
    : entry.subject.kind === "boss"
      ? Object.freeze({ kind: "boss", id: BOSS_REGISTRY.assert(entry.subject.id) })
      : entry.subject.kind === "gameplay"
        ? Object.freeze({ kind: "gameplay", id: GAMEPLAY_SCENARIO_SUBJECT_REGISTRY.assert(entry.subject.id) })
        : entry.subject.kind === "environment-field"
          ? Object.freeze({ kind: "environment-field", id: ENVIRONMENT_FIELD_SCENARIO_SUBJECT_REGISTRY.assert(entry.subject.id) })
          : Object.freeze({ kind: "environment-combat-object", id: ENVIRONMENT_COMBAT_OBJECT_SCENARIO_SUBJECT_REGISTRY.assert(entry.subject.id) });
  const backends = Object.freeze([...entry.backends]) as readonly [TearScenarioBackendV1, ...TearScenarioBackendV1[]];
  const requestedAssertions = entry.assertions ?? [];
  for (const assertion of requestedAssertions) INVARIANT_REGISTRY.assert(assertion);
  const structuredAssertions = (entry as CanonicalCatalogEntryWithStructuredAssertions).structuredAssertions ?? [];
  if (entry.stateForge !== undefined && (structuredAssertions.length === 0
    || structuredAssertions.some((assertion) => typeof assertion !== "string" || assertion.trim() === ""))) {
    throw new RangeError(`canonical State Forge scenario ${entry.id} requires subject-specific structured assertions`);
  }
  const assertions = [...new Set([
    ...requestedAssertions,
    ...effectiveInvariantIdsForScenario({
    subject,
    assertions: [
      "runtime.finite-state", "player.finite-transform", "blade.finite-transform",
      "entity.unique-id", "entity.valid-owner", "player.valid-health", "replay.monotonic-time",
    ],
    }),
  ])] as readonly typeof INVARIANT_REGISTRY.ids[number][];
  return Object.freeze({
    format: TEAR_CONTRACT_FORMAT,
    kind: "scenario",
    schemaVersion: TEAR_CONTRACT_VERSION,
    id: entry.id,
    version: 1,
    description: entry.description,
    stateClass: (entry.stateClass ?? "recorded-canonical") as TearCanonicalScenarioV1["stateClass"],
    executionClass: "engineering",
    subject,
    backends,
    seed: entry.seed ?? "1001",
    start: Object.freeze({
      mode,
      difficulty,
      weapon,
      ...(entry.stateForge === undefined ? {} : {
        ...(entry.start.stage === undefined ? {} : { stage: entry.start.stage }),
        ...(entry.start.wave === undefined ? {} : { wave: entry.start.wave }),
        ...(entry.start.bossPhase === undefined ? {} : { bossPhase: entry.start.bossPhase }),
      }),
      ...(boss === undefined ? {} : { boss }),
    }),
    maxTicks: entry.maxTicks,
    // Only advertise assertions whose inputs exist in every declared backend.
    assertions,
    tags: Object.freeze(entry.tags),
  });
}

export const CANONICAL_ENGINEERING_SCENARIOS = Object.freeze([
  ...scenarioCatalog.map((entry) => materializeCanonicalScenario(entry)),
] as const);

/**
 * Read-only source projection consumed by authority tests and reporting. It
 * contains no independently authored IDs or display strings.
 */
export const CANONICAL_CONTENT_AUTHORITY = Object.freeze({
  stages: Object.freeze(AUTHORED_STAGES.map(({ id, name, boss }) => Object.freeze({
    id, displayName: name, boss, publication: STAGE_PUBLICATION_STATE[id],
  }))),
  bosses: Object.freeze(BOSS_DEFINITIONS.map(({ id, name }) => Object.freeze({
    id, displayName: name, homeStage: homeStageForBoss(id),
  }))),
  environmentMechanics: Object.freeze([...new Set(scenarioCatalog
    .filter((entry) => (entry.subject.kind === "environment-field" || entry.subject.kind === "environment-combat-object")
      && !GENERIC_ENVIRONMENT_SUBJECT_IDS.has(entry.subject.id))
    .map((entry) => sourceEnvironmentMechanicKind(entry)))]),
  stageEnvironmentMechanics: Object.freeze(Object.fromEntries(AUTHORED_STAGES.map(({ id }) => [
    id, stageEnvironmentMechanicKinds(id),
  ])) as Readonly<Record<StageId, readonly string[]>>),
  scenarios: Object.freeze(scenarioCatalog.map(({ id, subject }) => Object.freeze({
    id, subject: Object.freeze({ ...subject }),
  }))),
  stageDisplayNames: STAGE_DISPLAY_NAMES,
});

export function createCanonicalScenarioRegistry(): TearScenarioRegistry {
  const registry = new TearScenarioRegistry();
  for (const scenario of CANONICAL_ENGINEERING_SCENARIOS) registry.register(scenario);
  return registry;
}
