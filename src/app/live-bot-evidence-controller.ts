import { createIndexedDbGhostVaultBackend } from "../ghost";
import { TearBotV3CanonicalEvidenceVault, type TearBotV3CanonicalEvaluationReportV1 } from "../agents/tearbot-v3-canonical-evaluation";
import type { BotEvidenceScreenView } from "../presentation/screens/contracts";

const HASH = /^[a-f0-9]{16}$/u;
export type BotEvidenceLoader = (factory: IDBFactory | undefined, reportHash: string | undefined) => Promise<TearBotV3CanonicalEvaluationReportV1 | undefined>;

async function loadExact(factory: IDBFactory | undefined, reportHash: string | undefined): Promise<TearBotV3CanonicalEvaluationReportV1 | undefined> {
  if (factory === undefined || reportHash === undefined || !HASH.test(reportHash)) return undefined;
  const backend = await createIndexedDbGhostVaultBackend(factory);
  return new TearBotV3CanonicalEvidenceVault(backend).get(reportHash);
}

/** C37's normal read-only view. The report identity is supplied by an outer
 * trusted route binding; this controller never scans, evaluates, or infers one. */
export class LiveBotEvidenceController {
  readonly #factory: IDBFactory | undefined; readonly #reportHash: () => string | undefined; readonly #load: BotEvidenceLoader;
  #view: BotEvidenceScreenView = Object.freeze({ id: "botevidence", status: "unavailable", subtitle: "exact local Game Agent evidence only", detail: "No exact retained Game Agent evaluation report is selected locally." });
  constructor(factory: IDBFactory | undefined, reportHash: () => string | undefined = () => undefined, load: BotEvidenceLoader = loadExact) { this.#factory = factory; this.#reportHash = reportHash; this.#load = load; }
  snapshot = (): BotEvidenceScreenView => this.#view;
  async refresh(): Promise<void> {
    try {
      const report = await this.#load(this.#factory, this.#reportHash());
      if (report === undefined) throw new Error("unavailable");
      this.#view = Object.freeze({ id: "botevidence", status: "ready", subtitle: "exact local Game Agent evidence only", detail: "Immutable Game Agent evaluation evidence; it is not a ladder placement, human comparison, or certification.", report: Object.freeze({
        reportHash: report.reportHash, planHash: report.planHash, artifactId: report.provenance.artifactId,
        approvalHash: report.provenance.approvalHash, promotionReceiptHash: report.provenance.promotionReceiptHash,
        artifactHash: report.provenance.artifactHash, activationHash: report.provenance.activationHash,
        candidatePayloadHash: report.provenance.candidatePayloadHash, episodes: report.distribution.episodes,
        completionRate: report.distribution.completionRate, meanTicks: report.distribution.meanTicks,
        maxTicksPerCase: report.distribution.maxTicksPerCase, placement: "unassigned", humanCalibration: "not-compared", certification: "not-certified",
      }) });
    } catch {
      this.#view = Object.freeze({ id: "botevidence", status: "unavailable", subtitle: "exact local Game Agent evidence only", detail: "No current exact retained Game Agent report is available. Missing, stale, or integrity-invalid evidence is not projected." });
    }
  }
}
