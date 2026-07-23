import { stableVerificationHash } from "../replay/hash";
import type { TearCausalEventV1, TearSnapshotV1 } from "../tearbench/contracts";
import { resolveTearSdl, type TearSdlDocumentV1 } from "../tearbench/tearsdl";
import type { GhostEnvelopeV3 } from "./truth-kernel";

export type GhostCoachDomain =
  | "movement" | "blade" | "defense" | "targeting" | "draft" | "boss" | "run-management";

export type GhostCoachBaselineKind = "personal" | "peer-band" | "same-build" | "tearbot" | "expert";

export interface GhostCoachBaseline {
  readonly kind: GhostCoachBaselineKind;
  readonly id: string;
  readonly metric: string;
  readonly value: number;
  readonly sampleCount: number;
}

export interface GhostCoachDrillSpec {
  readonly id: string;
  readonly title: string;
  readonly targetSkill: GhostCoachDomain;
  readonly repetitions: number;
  readonly successMetric: string;
  readonly targetValue: number;
}

export interface GhostCoachFinding {
  readonly id: string;
  readonly domain: GhostCoachDomain;
  readonly range: Readonly<{ fromTick: number; toTick: number }>;
  readonly eventIds: readonly string[];
  readonly metrics: Readonly<Record<string, number>>;
  readonly confidence: number;
  readonly impact: number;
  readonly baseline: GhostCoachBaseline;
  readonly suggestedDrill: GhostCoachDrillSpec;
  readonly evidenceHash: string;
}

export interface GhostCoachingTracks {
  readonly ghost: GhostEnvelopeV3;
  readonly metrics: Readonly<Record<string, number>>;
  readonly buildId: string;
  readonly finalTick: number;
}

interface AnalyzerRule {
  readonly domain: GhostCoachDomain;
  readonly metric: string;
  readonly lowerIsBetter: boolean;
  readonly drillTitle: string;
}

const ANALYZER_RULES: readonly AnalyzerRule[] = Object.freeze([
  { domain: "movement", metric: "movement.idleRatio", lowerIsBetter: true, drillTitle: "Keep moving through threat lanes" },
  { domain: "blade", metric: "blade.missRatio", lowerIsBetter: true, drillTitle: "Deliberate blade contact arcs" },
  { domain: "defense", metric: "defense.damagePerMinute", lowerIsBetter: true, drillTitle: "Parry and disengage recovery" },
  { domain: "targeting", metric: "targeting.badSwitchRatio", lowerIsBetter: true, drillTitle: "Threat-ranked target locks" },
  { domain: "draft", metric: "draft.regret", lowerIsBetter: true, drillTitle: "Compare reachable draft branches" },
  { domain: "boss", metric: "boss.missedPunishRatio", lowerIsBetter: true, drillTitle: "Boss punish-window repetitions" },
  { domain: "run-management", metric: "run.resourceWasteRatio", lowerIsBetter: true, drillTitle: "Resource timing and route control" },
]);

function eventsForDomain(events: readonly TearCausalEventV1[], domain: GhostCoachDomain): readonly TearCausalEventV1[] {
  const prefixes: Readonly<Record<GhostCoachDomain, readonly string[]>> = {
    movement: ["player.jump", "player.dash", "player.fell"],
    blade: ["blade."],
    defense: ["combat.deflect", "combat.perfect", "player.damaged", "player.shield"],
    targeting: ["agent.target", "enemy.attack"],
    draft: ["draft.", "tier."],
    boss: ["boss."],
    "run-management": ["run.", "stage.", "wave."],
  };
  return Object.freeze(events.filter((event) => prefixes[domain].some((prefix) => event.type.startsWith(prefix))));
}

export function analyzeGhostCoaching(
  tracks: GhostCoachingTracks,
  baselines: readonly GhostCoachBaseline[],
): readonly GhostCoachFinding[] {
  const findings: GhostCoachFinding[] = [];
  const coachingSourceHash = stableVerificationHash({
    actions: tracks.ghost.actions,
    snapshotHashes: tracks.ghost.snapshots.map((snapshot) => snapshot.hashes.semantic),
    events: tracks.ghost.events,
  });
  for (const rule of ANALYZER_RULES) {
    const actual = tracks.metrics[rule.metric];
    const baseline = baselines.find((entry) => entry.metric === rule.metric);
    if (actual === undefined || baseline === undefined || !Number.isFinite(actual) || !Number.isFinite(baseline.value)) continue;
    const gap = rule.lowerIsBetter ? actual - baseline.value : baseline.value - actual;
    if (gap <= 0) continue;
    const events = eventsForDomain(tracks.ghost.events, rule.domain);
    const fromTick = events[0]?.tick ?? 0;
    const toTick = events.at(-1)?.tick ?? tracks.finalTick;
    const confidence = Math.min(1, 0.5 + Math.log10(Math.max(1, baseline.sampleCount)) / 4);
    const impact = Math.min(1, Math.abs(gap) / Math.max(0.001, Math.abs(baseline.value) + 0.1));
    const metrics = Object.freeze({ actual, baseline: baseline.value, gap });
    const drill: GhostCoachDrillSpec = Object.freeze({
      id: `${rule.domain}-${rule.metric.replaceAll(".", "-")}`,
      title: rule.drillTitle,
      targetSkill: rule.domain,
      repetitions: 5,
      successMetric: rule.metric,
      targetValue: baseline.value,
    });
    const identity = {
      coachingSourceHash,
      domain: rule.domain,
      range: { fromTick, toTick },
      eventIds: events.map((event) => event.id),
      metrics,
      baseline,
      drill,
    };
    findings.push(Object.freeze({
      id: `finding-${stableVerificationHash(identity)}`,
      domain: rule.domain,
      range: Object.freeze({ fromTick, toTick }),
      eventIds: Object.freeze(events.map((event) => event.id)),
      metrics,
      confidence,
      impact,
      baseline,
      suggestedDrill: drill,
      evidenceHash: stableVerificationHash(identity),
    }));
  }
  return Object.freeze(findings);
}

export interface GhostDraftCounterfactual {
  readonly choiceId: string;
  readonly meanOutcome: number;
  readonly standardError: number;
  readonly rolloutCount: number;
}

export interface GhostDraftRegret {
  readonly selectedChoiceId: string;
  readonly bestChoiceId: string;
  readonly estimatedRegret: number;
  readonly uncertainty95: number;
  readonly supported: boolean;
}

export function calculateDraftRegret(
  selectedChoiceId: string,
  counterfactuals: readonly GhostDraftCounterfactual[],
): GhostDraftRegret {
  const selected = counterfactuals.find((entry) => entry.choiceId === selectedChoiceId);
  if (selected === undefined) throw new TypeError("selected draft choice has no counterfactual rollout");
  const best = [...counterfactuals].sort((left, right) =>
    right.meanOutcome - left.meanOutcome || left.choiceId.localeCompare(right.choiceId))[0];
  if (best === undefined) throw new TypeError("draft regret requires counterfactual rollouts");
  const uncertainty95 = 1.96 * Math.hypot(selected.standardError, best.standardError);
  const estimatedRegret = Math.max(0, best.meanOutcome - selected.meanOutcome);
  return Object.freeze({
    selectedChoiceId,
    bestChoiceId: best.choiceId,
    estimatedRegret,
    uncertainty95,
    supported: estimatedRegret > uncertainty95 && selected.rolloutCount >= 30 && best.rolloutCount >= 30,
  });
}

export function selectOneFix(findings: readonly GhostCoachFinding[]): GhostCoachFinding | undefined {
  return [...findings].sort((left, right) =>
    right.confidence * right.impact - left.confidence * left.impact
    || left.id.localeCompare(right.id))[0];
}

export function compileFindingToDrill(
  finding: GhostCoachFinding,
  snapshot: TearSnapshotV1,
): TearSdlDocumentV1 {
  const run = snapshot.state["tear.run.v1"];
  const runRecord = typeof run === "object" && run !== null && !Array.isArray(run) ? run as Readonly<Record<string, unknown>> : {};
  const text = (key: string, fallback: string): string => typeof runRecord[key] === "string" ? runRecord[key] : fallback;
  const wave = runRecord.wave;
  const document: TearSdlDocumentV1 = Object.freeze({
    format: "tearsdl",
    schemaVersion: 1,
    id: `drill-${finding.id}`,
    stateClass: snapshot.stateClass,
    seed: snapshot.seed,
    start: Object.freeze({
      mode: text("mode", "campaign"),
      difficulty: text("difficulty", "normal"),
      weapon: text("weapon", "sword"),
      wave: typeof wave === "number" && Number.isSafeInteger(wave) ? wave : 1,
    }),
    state: Object.freeze({
      snapshotId: snapshot.id,
      targetSkill: finding.domain,
      availableActionsRequired: true,
      sourceRange: finding.range,
    }),
    constraints: Object.freeze({
      legalState: true,
      successMetric: finding.suggestedDrill.successMetric,
      targetValue: finding.suggestedDrill.targetValue,
    }),
    tags: Object.freeze(["coach-drill", finding.domain]),
    maxTicks: 3_600,
  });
  resolveTearSdl(document);
  return document;
}

export interface GhostSkillMeasurement {
  readonly at: string;
  readonly domain: GhostCoachDomain;
  readonly value: number;
  readonly drillId?: string;
}

export class GhostLongitudinalSkillGraph {
  readonly #measurements: GhostSkillMeasurement[] = [];

  add(measurement: GhostSkillMeasurement): void {
    if (!Number.isFinite(measurement.value)) throw new TypeError("skill measurement must be finite");
    this.#measurements.push(Object.freeze({ ...measurement }));
  }

  history(domain: GhostCoachDomain): readonly GhostSkillMeasurement[] {
    return Object.freeze(this.#measurements.filter((entry) => entry.domain === domain)
      .sort((left, right) => left.at.localeCompare(right.at)));
  }

  improvement(
    domain: GhostCoachDomain,
    lowerIsBetter: boolean,
    minimumDrillRepetitions = 3,
  ): Readonly<{ supported: boolean; delta: number; repetitions: number }> {
    const history = this.history(domain);
    const repetitions = history.filter((entry) => entry.drillId !== undefined).length;
    const first = history[0]?.value;
    const last = history.at(-1)?.value;
    const delta = first === undefined || last === undefined ? 0 : last - first;
    return Object.freeze({
      supported: repetitions >= minimumDrillRepetitions && (lowerIsBetter ? delta < 0 : delta > 0),
      delta,
      repetitions,
    });
  }
}

export interface GhostFindingExplainer {
  explain(finding: GhostCoachFinding): Promise<string>;
}

/** Language models receive complete findings and cannot add claims to the finding graph. */
export async function explainStructuredFinding(
  finding: GhostCoachFinding,
  explainer: GhostFindingExplainer,
): Promise<Readonly<{ finding: GhostCoachFinding; explanation: string }>> {
  return Object.freeze({ finding, explanation: await explainer.explain(finding) });
}
