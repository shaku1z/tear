import type { GhostReadCapsule } from "./capsule-reader";
import { calculateRunDna, type GhostRunDna } from "./player-experiences";

const METRICS = ["attacks", "combatTicks", "misses", "movingTicks", "damageTaken", "maxHp", "distinctManeuvers", "availableManeuvers"] as const;
type MetricName = (typeof METRICS)[number];

export interface GhostRunDnaTheaterProjection {
  readonly available: boolean;
  readonly formulaVersion: "run-dna-v1";
  readonly evidenceCustody: string;
  readonly sourceMetrics: Readonly<Record<MetricName, number | undefined>>;
  readonly dimensions?: GhostRunDna["dimensions"];
  readonly unavailable: readonly string[];
}

function metricRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Readonly<Record<string, unknown>>;
  return record.kind === "run-dna-metrics-v1" && typeof record.metrics === "object" && record.metrics !== null
    && !Array.isArray(record.metrics) ? record.metrics as Readonly<Record<string, unknown>> : undefined;
}

/** A read-only Theater projection. Only one declared, complete metrics result may feed Run DNA. */
export function projectGhostRunDnaTheater(capsule: GhostReadCapsule): GhostRunDnaTheaterProjection {
  const declarations = capsule.tracks.results.map((entry) => metricRecord(entry.value)).filter((value): value is Readonly<Record<string, unknown>> => value !== undefined);
  const selected = declarations.length === 1 ? declarations[0] : undefined;
  const sourceMetrics = Object.fromEntries(METRICS.map((name) => [name,
    typeof selected?.[name] === "number" && Number.isFinite(selected[name]) && selected[name] >= 0 ? selected[name] : undefined,
  ])) as Record<MetricName, number | undefined>;
  const missing = METRICS.filter((name) => sourceMetrics[name] === undefined);
  const unavailable = [
    ...(declarations.length === 0 ? ["no declared run-dna-metrics-v1 result"] : []),
    ...(declarations.length > 1 ? ["ambiguous run-dna-metrics-v1 results"] : []),
    ...missing.map((name) => `missing declared metric: ${name}`),
  ];
  if (unavailable.length > 0) return Object.freeze({ available: false, formulaVersion: "run-dna-v1",
    evidenceCustody: `verified capsule ${capsule.manifest.id}`, sourceMetrics: Object.freeze(sourceMetrics), unavailable: Object.freeze(unavailable) });
  const dna = calculateRunDna(sourceMetrics as Record<string, number>);
  return Object.freeze({ available: true, formulaVersion: dna.formulaVersion, evidenceCustody: `verified capsule ${capsule.manifest.id}`,
    sourceMetrics: Object.freeze(sourceMetrics), dimensions: dna.dimensions, unavailable: Object.freeze([]) });
}
