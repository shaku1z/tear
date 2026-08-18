import type { TearArtifactSample } from "./headless";
import type { ProductionHeadlessTerminalArtifact } from "./production-headless-environment";

export type ProductionHeadlessAcademyIntakeReceipt = Readonly<{
  kind: "accepted" | "backpressured" | "closed";
  queued: number;
  capacity: number;
  sequence?: number;
}>;

export interface ProductionHeadlessAcademyIntakeItem {
  readonly format: "tearbench-production-headless-academy-intake";
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly episodeId: string;
  readonly tick: number;
  readonly artifact: ProductionHeadlessTerminalArtifact;
}

export interface ProductionHeadlessAcademyIntakeSnapshot {
  readonly capacity: number;
  readonly queued: number;
  readonly accepted: number;
  readonly backpressured: number;
  readonly closed: number;
  readonly isClosed: boolean;
}

function terminalArtifact(value: unknown): ProductionHeadlessTerminalArtifact {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Academy intake accepts only a production terminal artifact");
  }
  const artifact = value as Partial<ProductionHeadlessTerminalArtifact>;
  const scenario = artifact.scenario;
  const terminal = artifact.terminal;
  if (artifact.format !== "tearbench-production-headless-terminal" || artifact.schemaVersion !== 1
    || scenario === undefined || typeof scenario.id !== "string" || scenario.id.trim().length === 0
    || terminal === undefined || !Number.isSafeInteger(terminal.tick) || terminal.tick < 1
    || typeof terminal.semanticHash !== "string" || !/^[a-f0-9]{16}$/u.test(terminal.semanticHash)
    || typeof terminal.terminated !== "boolean" || typeof terminal.truncated !== "boolean") {
    throw new TypeError("Academy intake received an invalid production terminal artifact");
  }
  return Object.freeze(structuredClone(artifact)) as ProductionHeadlessTerminalArtifact;
}

/**
 * Ephemeral C30 handoff for real terminal artifacts. It intentionally holds no
 * consent, provenance, review, corpus, storage, retry, or recovery policy:
 * C31 owns those decisions before anything can enter an Academy dataset.
 */
export class ProductionHeadlessAcademyIntake {
  readonly #capacity: number;
  readonly #items: ProductionHeadlessAcademyIntakeItem[] = [];
  #sequence = 0;
  #accepted = 0;
  #backpressured = 0;
  #closed = 0;
  #isClosed = false;

  constructor(capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1_024) {
      throw new RangeError("Academy intake capacity must be between 1 and 1024");
    }
    this.#capacity = capacity;
  }

  offer(sample: TearArtifactSample): ProductionHeadlessAcademyIntakeReceipt {
    const tick = sample.tick;
    const episodeId = sample.episodeId;
    if (typeof tick !== "number" || !Number.isSafeInteger(tick) || tick < 1 || episodeId.trim().length === 0) {
      throw new TypeError("Academy intake requires a terminal artifact sample coordinate");
    }
    if (this.#isClosed) {
      this.#closed += 1;
      return Object.freeze({ kind: "closed", queued: this.#items.length, capacity: this.#capacity });
    }
    if (this.#items.length >= this.#capacity) {
      this.#backpressured += 1;
      return Object.freeze({ kind: "backpressured", queued: this.#items.length, capacity: this.#capacity });
    }
    const artifact = terminalArtifact(sample.artifact);
    if (tick !== artifact.terminal.tick) {
      throw new TypeError("Academy intake terminal tick does not match its sample coordinate");
    }
    const item = Object.freeze({
      format: "tearbench-production-headless-academy-intake" as const, schemaVersion: 1 as const,
      sequence: ++this.#sequence, episodeId, tick, artifact,
    });
    this.#items.push(item);
    this.#accepted += 1;
    return Object.freeze({ kind: "accepted", queued: this.#items.length, capacity: this.#capacity, sequence: item.sequence });
  }

  take(limit = this.#capacity): readonly ProductionHeadlessAcademyIntakeItem[] {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError("Academy intake take limit must be non-negative");
    return Object.freeze(this.#items.splice(0, Math.min(limit, this.#items.length)));
  }

  close(): void { this.#isClosed = true; }

  snapshot(): ProductionHeadlessAcademyIntakeSnapshot {
    return Object.freeze({
      capacity: this.#capacity, queued: this.#items.length, accepted: this.#accepted,
      backpressured: this.#backpressured, closed: this.#closed, isClosed: this.#isClosed,
    });
  }
}
