import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import type { TearDaggerCorrectionCaptureV1 } from "./dagger-correction-capture";
import { TEAR_POLICY_FEATURE_WIDTH_V1 } from "./policy-feature-vector";

const REVIEW_KEY = "dagger-correction-review:v1:";
const HASH = /^[a-f0-9]{16}$/u;

export type TearDaggerCorrectionDisposition = "accepted" | "rejected";

export interface TearDaggerCorrectionReviewV1 {
  readonly format: "tear-dagger-correction-review";
  readonly schemaVersion: 1;
  readonly captureHash: string;
  readonly correctionHash: string;
  readonly artifactHash: string;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly disposition: TearDaggerCorrectionDisposition;
  readonly rationale: string;
  readonly reviewHash: string;
}

export interface TearDaggerCorrectionReviewRequestV1 {
  readonly capture: TearDaggerCorrectionCaptureV1;
  readonly correctionHash: string;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly disposition: TearDaggerCorrectionDisposition;
  readonly rationale: string;
}

function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function timestamp(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)); }
function reviewKey(captureHash: string, correctionHash: string): string { return `${REVIEW_KEY}${captureHash}:${correctionHash}`; }
function captureValid(capture: TearDaggerCorrectionCaptureV1): boolean {
  const { captureHash, ...draft } = capture;
  return HASH.test(captureHash) && captureHash === stableVerificationHash(draft)
    && capture.corrections.every((correction) => {
      const { correctionHash, ...candidate } = correction;
      return HASH.test(correctionHash) && correctionHash === stableVerificationHash(candidate)
        && correction.features.length === TEAR_POLICY_FEATURE_WIDTH_V1 && correction.features.every(Number.isFinite);
    });
}
function parse(value: unknown): TearDaggerCorrectionReviewV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid DAgger correction review");
  const review = value as Record<string, unknown>;
  if (review.format !== "tear-dagger-correction-review" || review.schemaVersion !== 1 || !HASH.test(String(review.captureHash))
    || !HASH.test(String(review.correctionHash)) || !HASH.test(String(review.artifactHash)) || !text(review.reviewer)
    || !timestamp(review.reviewedAt) || !["accepted", "rejected"].includes(String(review.disposition)) || !text(review.rationale)
    || !HASH.test(String(review.reviewHash))) throw new TypeError("invalid DAgger correction review");
  const typed = review as unknown as TearDaggerCorrectionReviewV1;
  const { reviewHash, ...draft } = typed;
  if (reviewHash !== stableVerificationHash(draft)) throw new TypeError("DAgger correction review integrity mismatch");
  return Object.freeze(structuredClone(typed));
}

/** Immutable local human-review ledger; unreviewed or rejected corrections cannot be consumed downstream. */
export class TearDaggerCorrectionReviewStore {
  readonly #backend: GhostVaultBackend;
  readonly #authorizedReviewers: readonly string[];

  constructor(backend: GhostVaultBackend, authorizedReviewers: readonly string[]) {
    if (authorizedReviewers.length < 1 || authorizedReviewers.some((reviewer) => !text(reviewer)) || new Set(authorizedReviewers).size !== authorizedReviewers.length) {
      throw new TypeError("DAgger correction review requires named authorized reviewers");
    }
    this.#backend = backend; this.#authorizedReviewers = Object.freeze([...authorizedReviewers]);
  }

  async decide(input: TearDaggerCorrectionReviewRequestV1): Promise<TearDaggerCorrectionReviewV1> {
    if (!captureValid(input.capture) || !HASH.test(input.correctionHash) || !this.#authorizedReviewers.includes(input.reviewer)
      || !timestamp(input.reviewedAt) || !["accepted", "rejected"].includes(input.disposition) || !text(input.rationale)) {
      throw new TypeError("invalid DAgger correction review request");
    }
    const correction = input.capture.corrections.find((entry) => entry.correctionHash === input.correctionHash);
    if (correction === undefined) throw new RangeError("DAgger review correction is not in its immutable capture");
    const key = reviewKey(input.capture.captureHash, correction.correctionHash), existing = await this.#backend.get("analysis", key);
    if (existing !== undefined) return parse(JSON.parse(existing));
    const draft = { format: "tear-dagger-correction-review" as const, schemaVersion: 1 as const,
      captureHash: input.capture.captureHash, correctionHash: correction.correctionHash, artifactHash: input.capture.artifact.hash,
      reviewer: input.reviewer, reviewedAt: input.reviewedAt, disposition: input.disposition, rationale: input.rationale };
    const review = Object.freeze({ ...draft, reviewHash: stableVerificationHash(draft) });
    await this.#backend.commit(Object.freeze([
      { store: "analysis", key, value: JSON.stringify(review) },
      { store: "indexes", key: `dagger-correction-review:${review.artifactHash}:${review.reviewHash}`, value: JSON.stringify({ disposition: review.disposition }) },
    ]));
    return review;
  }

  async get(captureHash: string, correctionHash: string): Promise<TearDaggerCorrectionReviewV1 | undefined> {
    if (!HASH.test(captureHash) || !HASH.test(correctionHash)) throw new TypeError("DAgger correction review hash is invalid");
    const key = reviewKey(captureHash, correctionHash), raw = await this.#backend.get("analysis", key);
    if (raw === undefined) return undefined;
    try { return parse(JSON.parse(raw)); }
    catch (error) {
      await this.#backend.put("quarantine", key, JSON.stringify(Object.freeze({ format: "dagger-correction-review-quarantine", schemaVersion: 1, key, raw, reason: error instanceof Error ? error.message : String(error) })));
      return undefined;
    }
  }
}
