import { stableVerificationHash } from "../replay/hash";

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
  readonly graveyardCases: readonly string[];
  readonly journeyCheckpoint: string;
  readonly baseComparison: string;
  readonly interactionMatrices: readonly string[];
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

export function selectDiffAwareEvidence(
  changedFiles: readonly string[],
  routes: readonly EvidenceRoute[],
): EvidenceSelection {
  const normalized = changedFiles.map((file) => file.replaceAll("\\", "/"));
  const selected = routes.filter((route) =>
    normalized.some((file) => route.prefixes.some((prefix) => file.startsWith(prefix))));
  const effective = selected.length === 0 ? routes.filter((route) => route.id === "shared-runtime") : selected;
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

export const TEAR_INTERACTION_MATRICES = Object.freeze({
  browser: Object.freeze(["chromium"]),
  input: Object.freeze(["keyboard-mouse", "touch", "controller"]),
  platform: Object.freeze(["standalone", "crazygames"]),
  viewport: Object.freeze(["desktop", "small-desktop", "tablet-landscape", "phone-portrait"]),
  frameRate: Object.freeze([30, 60, 144]),
  network: Object.freeze(["online", "offline", "slow", "interrupted"]),
  interruption: Object.freeze(["blur", "visibility-hidden", "controller-disconnect", "resume"]),
  performance: Object.freeze(["desktop", "constrained"]),
  longRun: Object.freeze(["five-cycle", "1000-environment", "10000-episode"]),
});

export interface ReleaseEvidenceResult {
  readonly id: string;
  readonly status: "passed" | "failed" | "unsupported";
  readonly artifact: string;
}

export interface TearReleaseCertificate {
  readonly format: "tear-release-certificate";
  readonly schemaVersion: 1;
  readonly commit: string;
  readonly status: "certified" | "rejected";
  readonly evidence: readonly ReleaseEvidenceResult[];
  readonly affectedArbitraryStatesCovered: boolean;
  readonly fullJourneysCovered: boolean;
  readonly preservationManifestHash: string;
  readonly certificateHash: string;
}

const REQUIRED_RELEASE_EVIDENCE = Object.freeze([
  "full-check", "deterministic-scenarios", "graveyard", "browser-journeys",
  "base-comparison", "historical-replays", "interaction-matrices",
]);

export function certifyTearRelease(input: Readonly<{
  commit: string;
  evidence: readonly ReleaseEvidenceResult[];
  affectedArbitraryStatesCovered: boolean;
  fullJourneysCovered: boolean;
  preservation: TearPreservationManifest;
}>): TearReleaseCertificate {
  const byId = new Map(input.evidence.map((entry) => [entry.id, entry]));
  const passed = REQUIRED_RELEASE_EVIDENCE.every((id) => byId.get(id)?.status === "passed")
    && input.affectedArbitraryStatesCovered
    && input.fullJourneysCovered
    && input.preservation.goldenReplays.length > 0;
  const data = {
    commit: input.commit,
    status: passed ? "certified" as const : "rejected" as const,
    evidence: Object.freeze(input.evidence.map((entry) => Object.freeze({ ...entry }))),
    affectedArbitraryStatesCovered: input.affectedArbitraryStatesCovered,
    fullJourneysCovered: input.fullJourneysCovered,
    preservationManifestHash: input.preservation.manifestHash,
  };
  return Object.freeze({
    format: "tear-release-certificate",
    schemaVersion: 1,
    ...data,
    certificateHash: stableVerificationHash(data),
  });
}
