import { stableVerificationHash } from "../replay/hash";
import evidencePolicy from "./evidence-policy.json";

export type TearSuiteCadence = "local" | "pull-request" | "nightly" | "weekly-endurance" | "release-candidate";

export interface HistoricalRuntimePackage {
  readonly buildId: string;
  readonly packageHash: string;
  readonly verificationProfile: string;
  readonly playback: "exact" | "semantic" | "visual-only";
  readonly status: "supported" | "retired";
}

export interface PreservationAlias {
  readonly alias: string;
  readonly targetId: string;
}

export interface PreservationTombstone {
  readonly id: string;
  readonly reason: string;
  readonly replacementId?: string;
}

export interface MigrationFixture {
  readonly id: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly inputHash: string;
  readonly expectedHash: string;
}

export interface GoldenReplayFixture {
  readonly id: string;
  readonly buildId: string;
  readonly capsuleRootHash: string;
  readonly expectedStatus: "verified" | "unsupported" | "visual-only";
}

export interface TearPreservationManifest {
  readonly schemaVersion: 1;
  readonly runtimes: readonly HistoricalRuntimePackage[];
  readonly aliases: readonly PreservationAlias[];
  readonly tombstones: readonly PreservationTombstone[];
  readonly migrations: readonly MigrationFixture[];
  readonly goldenReplays: readonly GoldenReplayFixture[];
  readonly manifestHash: string;
}

export function createPreservationManifest(
  input: Omit<TearPreservationManifest, "schemaVersion" | "manifestHash">,
): TearPreservationManifest {
  const unique = (values: readonly string[], label: string): void => {
    if (new Set(values).size !== values.length) throw new TypeError(`${label} must be unique`);
  };
  unique(input.runtimes.map((entry) => entry.buildId), "historical build IDs");
  unique(input.aliases.map((entry) => entry.alias), "stable aliases");
  unique(input.tombstones.map((entry) => entry.id), "tombstones");
  unique(input.migrations.map((entry) => entry.id), "migration fixture IDs");
  unique(input.goldenReplays.map((entry) => entry.id), "golden replay IDs");
  const activeIds = new Set([
    ...input.runtimes.map((entry) => entry.buildId),
    ...input.aliases.map((entry) => entry.alias),
  ]);
  for (const tombstone of input.tombstones) {
    if (activeIds.has(tombstone.id)) throw new TypeError(`tombstoned ID cannot be reused: ${tombstone.id}`);
  }
  const aliasTargets = new Map(input.aliases.map((entry) => [entry.alias, entry.targetId]));
  for (const alias of input.aliases) {
    const visited = new Set([alias.alias]);
    let target: string | undefined = alias.targetId;
    while (target !== undefined && aliasTargets.has(target)) {
      if (visited.has(target)) throw new TypeError(`alias cycle includes ${target}`);
      visited.add(target);
      target = aliasTargets.get(target);
    }
    if (target === undefined || !input.runtimes.some((runtime) => runtime.buildId === target)) {
      throw new TypeError(`alias target is not a preserved runtime: ${alias.alias}`);
    }
  }
  for (const replay of input.goldenReplays) {
    const runtime = input.runtimes.find((entry) => entry.buildId === replay.buildId);
    if (replay.expectedStatus === "verified" && runtime?.status !== "supported") {
      throw new TypeError(`verified golden replay lacks a supported runtime: ${replay.id}`);
    }
  }
  const data = {
    runtimes: Object.freeze(input.runtimes.map((entry) => Object.freeze({ ...entry }))),
    aliases: Object.freeze(input.aliases.map((entry) => Object.freeze({ ...entry }))),
    tombstones: Object.freeze(input.tombstones.map((entry) => Object.freeze({ ...entry }))),
    migrations: Object.freeze(input.migrations.map((entry) => Object.freeze({ ...entry }))),
    goldenReplays: Object.freeze(input.goldenReplays.map((entry) => Object.freeze({ ...entry }))),
  };
  return Object.freeze({
    schemaVersion: 1,
    ...data,
    manifestHash: stableVerificationHash(data),
  });
}

export function resolvePreservedRuntime(
  manifest: TearPreservationManifest,
  buildOrAlias: string,
): Readonly<{ status: "supported" | "retired" | "tombstoned" | "unsupported"; buildId?: string; reason: string }> {
  const tombstone = manifest.tombstones.find((entry) => entry.id === buildOrAlias);
  if (tombstone !== undefined) {
    return Object.freeze({
      status: "tombstoned",
      ...(tombstone.replacementId === undefined ? {} : { buildId: tombstone.replacementId }),
      reason: tombstone.reason,
    });
  }
  let buildId = buildOrAlias;
  const visited = new Set<string>();
  while (!visited.has(buildId)) {
    visited.add(buildId);
    const alias = manifest.aliases.find((entry) => entry.alias === buildId);
    if (alias === undefined) break;
    buildId = alias.targetId;
  }
  const runtime = manifest.runtimes.find((entry) => entry.buildId === buildId);
  if (runtime === undefined) return Object.freeze({ status: "unsupported", reason: "historical runtime is not preserved" });
  return Object.freeze({ status: runtime.status, buildId: runtime.buildId, reason: `${runtime.playback} playback package preserved` });
}

export const OPERATIONAL_METRICS = Object.freeze([
  "recorder.health", "storage.pressure", "replay.drift", "verification.success",
  "seek.latency", "practice.success", "scenario.compile", "policy.calibration",
] as const);
export type OperationalMetricName = typeof OPERATIONAL_METRICS[number];

export interface OperationalMetricSample {
  readonly name: OperationalMetricName;
  readonly value: number;
  readonly warningBelow?: number;
  readonly warningAbove?: number;
}

export function buildOperationalDashboard(samples: readonly OperationalMetricSample[]): Readonly<{
  status: "healthy" | "warning" | "incomplete";
  cards: readonly Readonly<{ name: OperationalMetricName; value?: number; status: "healthy" | "warning" | "missing" }>[];
}> {
  const cards = OPERATIONAL_METRICS.map((name) => {
    const sample = [...samples].reverse().find((entry) => entry.name === name);
    if (sample === undefined) return Object.freeze({ name, status: "missing" as const });
    const warning = (sample.warningBelow !== undefined && sample.value < sample.warningBelow)
      || (sample.warningAbove !== undefined && sample.value > sample.warningAbove);
    return Object.freeze({ name, value: sample.value, status: warning ? "warning" as const : "healthy" as const });
  });
  return Object.freeze({
    status: cards.some((card) => card.status === "missing")
      ? "incomplete"
      : cards.some((card) => card.status === "warning") ? "warning" : "healthy",
    cards: Object.freeze(cards),
  });
}

export interface EvidenceRoute {
  readonly id: string;
  readonly prefixes: readonly string[];
  readonly scenarios: readonly string[];
  readonly specialized?: boolean;
  readonly owner?: string;
  readonly requiredScenarios?: readonly string[];
  readonly reducedDisposition?: string;
  readonly graveyardCases: readonly string[];
  readonly journeyCheckpoint: string;
  readonly baseComparison: string;
  readonly interactionMatrices: readonly string[];
  /** Dynamic catalog expansion is executable-selector-only. */
  readonly scenarioSubjects?: readonly string[];
  readonly buildTargets?: readonly string[];
  readonly capabilityClaims?: readonly string[];
}

export interface EvidenceSelection {
  readonly changedFiles: readonly string[];
  readonly routes: readonly string[];
  readonly scenarios: readonly string[];
  readonly graveyardCases: readonly string[];
  readonly journeyCheckpoints: readonly string[];
  readonly baseComparisons: readonly string[];
  readonly interactionMatrices: readonly string[];
  readonly unrelatedUnitTestsAreGameplayEvidence: false;
}

/** The executable Node selector remains the sole route/policy authority. */
export const TEAR_EVIDENCE_SELECTOR_AUTHORITY = "scripts/tearbench.mjs" as const;

function normalizedRepositoryPath(value: string, label: string): string {
  const normalized = value.replaceAll("\\", "/").trim().replace(/^\.\//u, "");
  if (normalized.length === 0 || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)
    || normalized.split("/").includes("..")) {
    throw new TypeError(`${label} must be a repository-relative path: ${value}`);
  }
  return normalized;
}

function prefixOwnsPath(prefix: string, file: string): boolean {
  const normalizedPrefix = normalizedRepositoryPath(prefix, "route prefix").replace(/\/+$/u, "");
  return file === normalizedPrefix || file.startsWith(`${normalizedPrefix}/`);
}

export function selectDiffAwareEvidence(
  changedFiles: readonly string[],
  routes: readonly EvidenceRoute[],
): EvidenceSelection {
  // Compatibility projection only: scripts/tearbench.mjs is the executable
  // selector authority. Keep this adapter's conservative union/fallback shape
  // aligned with that selector; it must not become a second route policy.
  const routeIds = routes.map((route) => route.id);
  if (new Set(routeIds).size !== routeIds.length) throw new TypeError("evidence route IDs must be unique");
  const fallback = routes.filter((route) => route.id === "shared-runtime");
  if (fallback.length !== 1) throw new TypeError("exactly one shared-runtime fallback route is required");
  for (const route of routes) {
    if ((route.scenarioSubjects?.length ?? 0) > 0) {
      throw new TypeError(`route ${route.id} has dynamic scenario subjects; use ${TEAR_EVIDENCE_SELECTOR_AUTHORITY}`);
    }
    for (const prefix of route.prefixes) normalizedRepositoryPath(prefix, `route ${route.id} prefix`);
  }
  const normalized = [...new Set(changedFiles.map((file) => normalizedRepositoryPath(file, "changed file")))].sort();
  const selected = routes.filter((route) =>
    normalized.some((file) => route.prefixes.some((prefix) => prefixOwnsPath(prefix, file))));
  const unmatched = normalized.filter((file) =>
    !routes.some((route) => route.prefixes.some((prefix) => prefixOwnsPath(prefix, file))));
  const effective = (selected.length === 0 || unmatched.length > 0)
    ? [...selected, ...fallback.filter((route) => !selected.includes(route))] : selected;
  const collect = (pick: (route: EvidenceRoute) => readonly string[]): readonly string[] =>
    Object.freeze([...new Set(effective.flatMap((route) => [...pick(route)]))].sort());
  return Object.freeze({
    changedFiles: Object.freeze(normalized),
    routes: Object.freeze(effective.map((route) => route.id).sort()),
    scenarios: collect((route) => route.scenarios),
    graveyardCases: collect((route) => route.graveyardCases),
    journeyCheckpoints: collect((route) => [route.journeyCheckpoint]),
    baseComparisons: collect((route) => [route.baseComparison]),
    interactionMatrices: collect((route) => route.interactionMatrices),
    unrelatedUnitTestsAreGameplayEvidence: false,
  });
}

export const TEAR_SUITE_PROFILES = Object.freeze({
  local: Object.freeze(["typecheck", "lint:focused", "scenario:focused"]),
  "pull-request": Object.freeze(["scenario:diff", "graveyard:diff", "journey:checkpoint", "comparison:base"]),
  nightly: Object.freeze(["unit:all", "scenario:all", "browser:all", "headless:population"]),
  "weekly-endurance": Object.freeze(["long-run:10000", "quota:stress", "replay:cross-version", "policy:calibration"]),
  "release-candidate": Object.freeze(["check:full", "journey:all", "state:affected", "preservation:golden", "certificate"]),
} as const satisfies Readonly<Record<TearSuiteCadence, readonly string[]>>);

/** Compatibility projection of the single JSON policy authority consumed by the executable selector. */
export const TEAR_INTERACTION_MATRICES = Object.freeze(Object.fromEntries(
  Object.entries(evidencePolicy.matrices).map(([id, policy]) => [id, Object.freeze([...policy.variants])]),
));
