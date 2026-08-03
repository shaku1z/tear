import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import { assessAcademyCandidateEligibility, type TearAcademyCandidateDeclarationV1 } from "./academy-candidate-admission";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCandidateCurationStore } from "./academy-candidate-curation";
import type { TearAcademyCandidateQualityStore } from "./academy-candidate-quality";
import type { TearAcademyCandidateSplitStore, TearAcademyDatasetSplitV1 } from "./academy-candidate-splits";

const SAMPLE_KEY = "academy-reviewed-sample:v1:";
export interface TearAcademyReviewedSampleV1 {
  readonly format: "tear-academy-reviewed-sample"; readonly schemaVersion: 1; readonly candidateHash: string; readonly custodyRecordHash: string; readonly assessmentHash: string; readonly curationDecisionHash: string; readonly split: TearAcademyDatasetSplitV1; readonly splitAssignmentHash: string; readonly source: Readonly<{ capsuleId: string; rootIntegrity: string; fromTick: 0; toTick: number; actionHash: string; terminalAnchorHash: string }>; readonly tracks: TearAcademyCandidateDeclarationV1["trackBundle"]; readonly recordedAt: string; readonly actor: string; readonly sampleHash: string;
}
function ne(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0; }
function time(v: unknown): v is string { return ne(v) && Number.isFinite(Date.parse(v)); }
function key(hash: string): string { return `${SAMPLE_KEY}${hash}`; }
function sampleHash(value: Omit<TearAcademyReviewedSampleV1, "sampleHash">): string { return stableVerificationHash(value); }
/** Durable C31 reviewed evidence. This is a sample record only; trainer-facing corpus publication remains a separate boundary. */
export class TearAcademyReviewedSampleStore {
  readonly #backend: GhostVaultBackend; readonly #custody: TearAcademyCandidateCustodyStore; readonly #quality: TearAcademyCandidateQualityStore; readonly #curation: TearAcademyCandidateCurationStore; readonly #splits: TearAcademyCandidateSplitStore;
  constructor(backend: GhostVaultBackend, custody: TearAcademyCandidateCustodyStore, quality: TearAcademyCandidateQualityStore, curation: TearAcademyCandidateCurationStore, splits: TearAcademyCandidateSplitStore) { this.#backend = backend; this.#custody = custody; this.#quality = quality; this.#curation = curation; this.#splits = splits; }
  async materialize(declaration: TearAcademyCandidateDeclarationV1, recordedAt: string, actor: string): Promise<TearAcademyReviewedSampleV1> {
    const admission = assessAcademyCandidateEligibility(declaration); const tracks = declaration.trackBundle;
    if (admission.disposition !== "eligible" || admission.candidateHash === null || tracks === undefined || !time(recordedAt) || !ne(actor)) throw new RangeError("C31 reviewed sample requires an eligible verified declaration");
    const custody = await this.#custody.get(admission.candidateHash); const quality = await this.#quality.get(admission.candidateHash); const curation = await this.#curation.get(admission.candidateHash); const split = await this.#splits.get(admission.candidateHash);
    if (custody?.status !== "held" || !custody.privacyRetention.authorizedActorIds.includes(actor) || custody.declarationHash !== stableVerificationHash(declaration) || quality?.disposition !== "review-required" || curation?.disposition !== "curation-approved" || split?.custodyRecordHash !== custody.recordHash || split.assessmentHash !== quality.assessmentHash || split.curationDecisionHash !== curation.decisionHash || !(await this.#curation.active(recordedAt)).some((entry) => entry.candidateHash === admission.candidateHash)) throw new RangeError("C31 reviewed sample requires active curated assigned custody");
    if (await this.#backend.get("analysis", key(admission.candidateHash)) !== undefined) throw new TypeError("Academy reviewed sample already exists");
    const draft = { format: "tear-academy-reviewed-sample" as const, schemaVersion: 1 as const, candidateHash: admission.candidateHash, custodyRecordHash: custody.recordHash, assessmentHash: quality.assessmentHash, curationDecisionHash: curation.decisionHash, split: split.split, splitAssignmentHash: split.assignmentHash, source: custody.source.capsuleRange, tracks, recordedAt, actor };
    const sample = Object.freeze({ ...draft, source: Object.freeze({ ...draft.source }), tracks: Object.freeze(structuredClone(tracks)), sampleHash: sampleHash(draft) });
    await this.#backend.commit([Object.freeze({ store: "analysis", key: key(sample.candidateHash), value: JSON.stringify(sample) })]); return sample;
  }
  async get(candidateHash: string): Promise<TearAcademyReviewedSampleV1 | undefined> { const value = await this.#backend.get("analysis", key(candidateHash)); if (value === undefined) return undefined; const raw: unknown = JSON.parse(value); if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("invalid Academy reviewed sample"); const entry = raw as TearAcademyReviewedSampleV1; const { sampleHash: recorded, ...draft } = entry; if (!ne(recorded) || recorded !== sampleHash(draft)) throw new TypeError("Academy reviewed sample integrity mismatch"); return Object.freeze(entry); }
}
