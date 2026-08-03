import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import type { TearAcademyCandidateCustodyStore } from "./academy-candidate-custody";
import type { TearAcademyCandidateQualityStore } from "./academy-candidate-quality";

const CURATION_KEY_PREFIX = "academy-candidate-curation:v1:";

export type TearAcademyCandidateCurationDisposition = "curation-approved" | "needs-correction" | "rejected";
export type TearAcademyCandidateCorrectionKind = "metadata" | "label" | "quality";

/** A durable human decision over an assessed source, not a corpus sample or split assignment. */
export interface TearAcademyCandidateCurationDecisionV1 {
  readonly format: "tear-academy-candidate-curation-decision";
  readonly schemaVersion: 1;
  readonly candidateHash: string;
  readonly custodyRecordHash: string;
  readonly assessmentHash: string;
  readonly disposition: TearAcademyCandidateCurationDisposition;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly rationale: string;
  readonly tags: readonly string[];
  /** Requested corrections are immutable instructions, never edits to source evidence. */
  readonly corrections: readonly Readonly<{ kind: TearAcademyCandidateCorrectionKind; detail: string }> [];
  readonly decisionHash: string;
}

export interface TearAcademyCandidateCurationRequest {
  readonly candidateHash: string;
  readonly assessmentHash: string;
  readonly disposition: TearAcademyCandidateCurationDisposition;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly rationale: string;
  readonly tags: readonly string[];
  readonly corrections?: readonly Readonly<{ kind: TearAcademyCandidateCorrectionKind; detail: string }> [];
}

export interface TearAcademyCandidateCurationInventoryV1 {
  readonly decisions: readonly TearAcademyCandidateCurationDecisionV1[];
  readonly rejectedKeys: readonly string[];
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timestamp(value: unknown): value is string {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function curationKey(candidateHash: string): string {
  return `${CURATION_KEY_PREFIX}${candidateHash}`;
}

function validTags(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= 16 && value.every((tag) => nonEmpty(tag) && tag.length <= 96)
    && new Set(value).size === value.length;
}

function validCorrections(value: unknown): value is readonly Readonly<{ kind: TearAcademyCandidateCorrectionKind; detail: string }>[] {
  return Array.isArray(value) && value.length <= 16 && value.every((correction) => correction !== null
    && typeof correction === "object" && !Array.isArray(correction)
    && ["metadata", "label", "quality"].includes(String((correction as Record<string, unknown>).kind))
    && nonEmpty((correction as Record<string, unknown>).detail)
    && String((correction as Record<string, unknown>).detail).length <= 1_024);
}

function decisionHash(value: Omit<TearAcademyCandidateCurationDecisionV1, "decisionHash">): string {
  return stableVerificationHash(value);
}

function freezeDecision(value: Omit<TearAcademyCandidateCurationDecisionV1, "decisionHash">): TearAcademyCandidateCurationDecisionV1 {
  return Object.freeze({
    ...value, tags: Object.freeze([...value.tags]),
    corrections: Object.freeze(value.corrections.map((entry) => Object.freeze({ ...entry }))),
    decisionHash: decisionHash(value),
  });
}

function parseDecision(value: string): TearAcademyCandidateCurationDecisionV1 {
  const source: unknown = JSON.parse(value);
  if (source === null || typeof source !== "object" || Array.isArray(source)) throw new TypeError("invalid Academy curation decision");
  const entry = source as Record<string, unknown>;
  if (entry.format !== "tear-academy-candidate-curation-decision" || entry.schemaVersion !== 1
    || !/^[a-f0-9]{16}$/u.test(String(entry.candidateHash)) || !/^[a-f0-9]{16}$/u.test(String(entry.custodyRecordHash))
    || !/^[a-f0-9]{16}$/u.test(String(entry.assessmentHash))
    || !["curation-approved", "needs-correction", "rejected"].includes(String(entry.disposition))
    || !nonEmpty(entry.reviewer) || !timestamp(entry.reviewedAt) || !nonEmpty(entry.rationale)
    || !validTags(entry.tags) || !validCorrections(entry.corrections) || !nonEmpty(entry.decisionHash)) {
    throw new TypeError("invalid Academy curation decision");
  }
  const typed = entry as unknown as Omit<TearAcademyCandidateCurationDecisionV1, "decisionHash"> & { decisionHash: string };
  if (typed.disposition === "needs-correction" && typed.corrections.length === 0) {
    throw new TypeError("C31 correction decision requires an immutable correction request");
  }
  if (typed.disposition !== "needs-correction" && typed.corrections.length !== 0) {
    throw new TypeError("C31 non-correction decision cannot edit source evidence");
  }
  const { decisionHash: recordedHash, ...draft } = typed;
  if (recordedHash !== decisionHash(draft)) throw new TypeError("Academy curation decision integrity mismatch");
  return freezeDecision(draft);
}

/**
 * C31's human review/correction ledger. Approval only authorizes later
 * governance to consider the source; it does not construct a sample, assign a
 * split, expose a manifest, or make data visible to trainer code.
 */
export class TearAcademyCandidateCurationStore {
  readonly #backend: GhostVaultBackend;
  readonly #custody: TearAcademyCandidateCustodyStore;
  readonly #quality: TearAcademyCandidateQualityStore;

  constructor(
    backend: GhostVaultBackend,
    custody: TearAcademyCandidateCustodyStore,
    quality: TearAcademyCandidateQualityStore,
  ) {
    if (custody.backend() !== backend || quality.backend() !== backend) {
      throw new TypeError("C31 curation, quality, and custody must share one Vault backend");
    }
    this.#backend = backend;
    this.#custody = custody;
    this.#quality = quality;
  }

  /** Shared only with adjacent C31 split/manifests for the same local Vault boundary. */
  backend(): GhostVaultBackend { return this.#backend; }

  async decide(input: TearAcademyCandidateCurationRequest): Promise<TearAcademyCandidateCurationDecisionV1> {
    if (!/^[a-f0-9]{16}$/u.test(input.candidateHash) || !/^[a-f0-9]{16}$/u.test(input.assessmentHash)
      || !["curation-approved", "needs-correction", "rejected"].includes(input.disposition)
      || !nonEmpty(input.reviewer) || !timestamp(input.reviewedAt) || !nonEmpty(input.rationale)
      || !validTags(input.tags) || !validCorrections(input.corrections ?? [])) {
      throw new TypeError("invalid C31 curation decision");
    }
    const corrections = input.corrections ?? [];
    if ((input.disposition === "needs-correction") !== (corrections.length > 0)) {
      throw new TypeError("C31 curation correction disposition does not match its correction requests");
    }
    const custody = await this.#custody.get(input.candidateHash);
    const assessment = await this.#quality.get(input.candidateHash);
    if (custody?.status !== "held" || !custody.privacyRetention.authorizedActorIds.includes(input.reviewer)
      || assessment?.disposition !== "review-required"
      || assessment.assessmentHash !== input.assessmentHash || assessment.custodyRecordHash !== custody.recordHash
      || !(await this.#custody.held(input.reviewedAt)).some((entry) => entry.candidateHash === input.candidateHash)) {
      throw new RangeError("C31 curation requires an authorized review of exact held assessed custody");
    }
    if (await this.#backend.get("analysis", curationKey(input.candidateHash)) !== undefined) {
      throw new TypeError(`Academy candidate curation already exists: ${input.candidateHash}`);
    }
    const decision = freezeDecision({
      format: "tear-academy-candidate-curation-decision", schemaVersion: 1,
      candidateHash: custody.candidateHash, custodyRecordHash: custody.recordHash, assessmentHash: assessment.assessmentHash,
      disposition: input.disposition, reviewer: input.reviewer, reviewedAt: input.reviewedAt,
      rationale: input.rationale, tags: Object.freeze([...input.tags]),
      corrections: Object.freeze(corrections.map((entry) => Object.freeze({ ...entry }))),
    });
    await this.#backend.commit([Object.freeze({ store: "analysis", key: curationKey(decision.candidateHash), value: JSON.stringify(decision) })]);
    return decision;
  }

  async get(candidateHash: string): Promise<TearAcademyCandidateCurationDecisionV1 | undefined> {
    const stored = await this.#backend.get("analysis", curationKey(candidateHash));
    return stored === undefined ? undefined : parseDecision(stored);
  }

  /** Later corpus/manifests must read this view so revoked/expired custody disappears before use. */
  async active(at: string): Promise<readonly TearAcademyCandidateCurationDecisionV1[]> {
    if (!timestamp(at)) throw new TypeError("C31 curation query requires a valid timestamp");
    const held = new Map((await this.#custody.held(at)).map((entry) => [entry.candidateHash, entry]));
    const inventory = await this.inventory();
    return Object.freeze(inventory.decisions.filter((decision) => {
      const custody = held.get(decision.candidateHash);
      return custody?.recordHash === decision.custodyRecordHash;
    }));
  }

  async inventory(): Promise<TearAcademyCandidateCurationInventoryV1> {
    const decisions: TearAcademyCandidateCurationDecisionV1[] = [];
    const rejectedKeys: string[] = [];
    for (const key of await this.#backend.keys("analysis")) {
      if (!key.startsWith(CURATION_KEY_PREFIX)) continue;
      const stored = await this.#backend.get("analysis", key);
      if (stored === undefined) continue;
      try { decisions.push(parseDecision(stored)); }
      catch { rejectedKeys.push(key); }
    }
    return Object.freeze({
      decisions: Object.freeze(decisions.sort((left, right) => left.candidateHash.localeCompare(right.candidateHash))),
      rejectedKeys: Object.freeze(rejectedKeys.sort()),
    });
  }
}
