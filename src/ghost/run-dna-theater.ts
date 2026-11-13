import { parseGhostApplicationClockEvent, readGhostApplicationClockSchedule } from "./application-frame-events";
import type { GhostReadCapsule } from "./capsule-reader";
import { calculateRunDna, type GhostRunDna } from "./player-experiences";
import { readGhostReplayRunContext } from "./replay-admission";
import {
  RUN_DNA_CAPTURE_POLICY,
  RUN_DNA_MANEUVERS,
  type NativeRunDnaCapture,
} from "../gameplay/runtime/run-dna-observer";

const METRICS = [
  "attacks",
  "combatTicks",
  "misses",
  "movingTicks",
  "damageTaken",
  "maxHp",
  "distinctManeuvers",
  "availableManeuvers",
] as const;
type MetricName = (typeof METRICS)[number];

export interface GhostRunDnaTheaterProjection {
  readonly available: boolean;
  readonly formulaVersion: "run-dna-v1";
  readonly evidenceCustody: string;
  readonly sourceMetrics: Readonly<Record<MetricName, number | undefined>>;
  readonly dimensions?: Partial<GhostRunDna["dimensions"]>;
  readonly nativePolicy?: string;
  readonly unavailable: readonly string[];
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function nativeCapture(
  value: unknown,
  capsule: GhostReadCapsule,
  entryTick: number,
  metrics: Readonly<Record<MetricName, number | undefined>>,
): NativeRunDnaCapture["capture"] {
  const c = object(value),
    context = readGhostReplayRunContext(capsule.manifest.provenance);
  const fields = [
    "version",
    "policy",
    "runId",
    "sessionId",
    "originTick",
    "endTick",
    "scheduledThrough",
    "skippedTicks",
    "observedTicks",
    "terminalTick",
    "complete",
    "invalid",
    "resolved",
    "censored",
    "successful",
    "available",
    "used",
  ];
  if (
    !c ||
    Object.keys(c).some((key) => !fields.includes(key)) ||
    c.version !== 1 ||
    c.policy !== RUN_DNA_CAPTURE_POLICY ||
    context === undefined ||
    capsule.manifest.status !== "complete" ||
    capsule.manifest.provenance?.forkOrigin !== undefined ||
    c.runId !== context.run.id ||
    c.sessionId !== capsule.manifest.id ||
    c.originTick !== 0 ||
    c.complete !== true ||
    !Array.isArray(c.invalid) ||
    c.invalid.length !== 0
  )
    throw new TypeError("native capture identity, version or whole-run coverage is unavailable");
  for (const key of [
    "endTick",
    "scheduledThrough",
    "skippedTicks",
    "observedTicks",
    "terminalTick",
    "resolved",
    "censored",
    "successful",
  ]) {
    if (!Number.isSafeInteger(c[key]) || (c[key] as number) < 0)
      throw new TypeError("invalid native observation counters");
  }
  const counter = (key: string) => c[key] as number;
  const catalogue: readonly string[] = RUN_DNA_MANEUVERS;
  for (const key of ["available", "used"])
    if (
      !Array.isArray(c[key]) ||
      (c[key] as unknown[]).some((id) => typeof id !== "string" || !catalogue.includes(id)) ||
      new Set(c[key] as unknown[]).size !== (c[key] as unknown[]).length
    )
      throw new TypeError("invalid native maneuver catalogue");
  const available = c.available as string[],
    used = c.used as string[];
  if (
    used.some((id) => !available.includes(id)) ||
    available.length !== metrics.availableManeuvers ||
    used.length !== metrics.distinctManeuvers ||
    metrics.maxHp === undefined ||
    metrics.maxHp <= 0 ||
    metrics.attacks !== counter("resolved") + counter("censored") ||
    counter("resolved") !== counter("successful") + (metrics.misses ?? NaN) ||
    counter("endTick") !== entryTick ||
    counter("terminalTick") > capsule.maxTick ||
    counter("endTick") > counter("scheduledThrough") ||
    counter("scheduledThrough") > counter("terminalTick") ||
    counter("observedTicks") + counter("skippedTicks") !== counter("scheduledThrough") ||
    (metrics.combatTicks ?? Infinity) > counter("observedTicks") ||
    (metrics.movingTicks ?? Infinity) > (metrics.combatTicks ?? -1)
  )
    throw new TypeError("inconsistent native observation coverage");
  const terminalTick = counter("terminalTick");
  if (
    [
      ...capsule.tracks.commands,
      ...capsule.tracks.keyframes,
      ...capsule.tracks.rng,
      ...capsule.tracks.presentation,
    ].some((entry) => entry.tick > counter("endTick")) ||
    capsule.tracks.results.some(
      (entry) => entry.tick > terminalTick && object(entry.value)?.format === "tearghost-authoritative-receipt",
    )
  )
    throw new TypeError("gameplay commit after native terminal");
  const late = capsule.tracks.events.filter((entry) => entry.tick > terminalTick);
  if (capsule.maxTick > terminalTick) {
    if (late.length === 0) throw new TypeError("post-terminal endpoint lacks frame-tail witness");
    readGhostApplicationClockSchedule(capsule, context.run.id, context.simulation.applicationFrames?.version === 1);
    for (const entry of late) {
      const frame = parseGhostApplicationClockEvent(entry.value)?.payload;
      if (
        frame?.format !== "tearghost-application-frame" ||
        frame.kind !== "end" ||
        frame.runId !== c.runId ||
        frame.sessionId !== c.sessionId ||
        frame.beforeTick > terminalTick ||
        frame.afterTick !== entry.tick
      )
        throw new TypeError("unrecognized post-terminal housekeeping");
    }
    if (!late.some((entry) => entry.tick === capsule.maxTick))
      throw new TypeError("post-terminal endpoint exceeds its frame-tail witness");
  }
  const events = capsule.tracks.events.map((entry) => ({ tick: entry.tick, event: object(entry.value) }));
  const terminal = events.filter(
    ({ event }) =>
      event?.source === "engine" && ["run.completed", "run.defeated", "run.abandoned"].includes(event.type as string),
  );
  const matches = (event: Record<string, unknown> | undefined) => {
    const p = object(event?.payload);
    return (
      p?.runId === context.run.id &&
      p.mode === context.run.mode &&
      p.difficulty === context.run.difficulty &&
      p.weapon === context.run.weaponId
    );
  };
  if (
    terminal.length !== 1 ||
    terminal[0]?.tick !== c.terminalTick ||
    terminal[0]?.event?.phase !== "post-simulation-commit" ||
    !matches(terminal[0].event) ||
    !events.some(
      ({ tick, event }) => tick === 0 && event?.type === "run.started" && event.source === "engine" && matches(event),
    )
  )
    throw new TypeError("native capture requires its original run and terminal facts");
  return c as unknown as NativeRunDnaCapture["capture"];
}

function metricRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Readonly<Record<string, unknown>>;
  return record.kind === "run-dna-metrics-v1" &&
    typeof record.metrics === "object" &&
    record.metrics !== null &&
    !Array.isArray(record.metrics)
    ? (record.metrics as Readonly<Record<string, unknown>>)
    : undefined;
}

/** A read-only Theater projection. Only one declared, complete metrics result may feed Run DNA. */
export function projectGhostRunDnaTheater(capsule: GhostReadCapsule): GhostRunDnaTheaterProjection {
  const declarations = capsule.tracks.results.filter((entry) => metricRecord(entry.value) !== undefined);
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  const selected = metricRecord(declaration?.value);
  const sourceMetrics = Object.fromEntries(
    METRICS.map((name) => [
      name,
      typeof selected?.[name] === "number" && Number.isFinite(selected[name]) && selected[name] >= 0
        ? selected[name]
        : undefined,
    ]),
  ) as Record<MetricName, number | undefined>;
  const missing = METRICS.filter((name) => sourceMetrics[name] === undefined);
  const unavailable = [
    ...(declarations.length === 0 ? ["no declared run-dna-metrics-v1 result"] : []),
    ...(declarations.length > 1 ? ["ambiguous run-dna-metrics-v1 results"] : []),
    ...missing.map((name) => `missing declared metric: ${name}`),
  ];
  if (unavailable.length > 0)
    return Object.freeze({
      available: false,
      formulaVersion: "run-dna-v1",
      evidenceCustody: `verified capsule ${capsule.manifest.id}`,
      sourceMetrics: Object.freeze(sourceMetrics),
      unavailable: Object.freeze(unavailable),
    });
  const dna = calculateRunDna(sourceMetrics as Record<string, number>);
  const raw = object(declaration?.value);
  if (raw !== undefined && Object.hasOwn(raw, "capture")) {
    try {
      const capture = nativeCapture(raw.capture, capsule, declaration?.tick ?? -1, sourceMetrics);
      for (const name of METRICS.filter((name) => name !== "damageTaken" && name !== "maxHp"))
        if (!Number.isSafeInteger(sourceMetrics[name])) throw new TypeError("native counts must be integers");
      const dimensions: { -readonly [P in keyof GhostRunDna["dimensions"]]?: number } = { ...dna.dimensions };
      if (capture.censored > 0 || sourceMetrics.attacks === 0) {
        delete dimensions.precision;
        unavailable.push(
          capture.censored > 0
            ? `precision: ${String(capture.censored)} interrupted attack episodes`
            : "precision: no accepted attack episodes",
        );
      }
      if (sourceMetrics.combatTicks === 0) {
        delete dimensions.aggression;
        delete dimensions.mobility;
        unavailable.push("aggression/mobility: no eligible combat steps");
      }
      return Object.freeze({
        available: unavailable.length === 0,
        formulaVersion: dna.formulaVersion,
        evidenceCustody: `verified capsule ${capsule.manifest.id}`,
        nativePolicy: capture.policy,
        sourceMetrics: Object.freeze(sourceMetrics),
        dimensions: Object.freeze(dimensions),
        unavailable: Object.freeze(unavailable),
      });
    } catch (error) {
      return Object.freeze({
        available: false,
        formulaVersion: "run-dna-v1",
        evidenceCustody: `verified capsule ${capsule.manifest.id}`,
        sourceMetrics: Object.freeze(sourceMetrics),
        unavailable: Object.freeze([error instanceof Error ? error.message : "invalid native capture"]),
      });
    }
  }
  return Object.freeze({
    available: true,
    formulaVersion: dna.formulaVersion,
    evidenceCustody: `verified capsule ${capsule.manifest.id}`,
    sourceMetrics: Object.freeze(sourceMetrics),
    dimensions: dna.dimensions,
    unavailable: Object.freeze([]),
  });
}
