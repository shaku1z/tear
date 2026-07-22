export interface BestScore {
  readonly wave: number;
  readonly score: number;
  readonly time: number;
}

export interface BestScoreCandidate extends BestScore {
  readonly mode: string;
  readonly difficulty: string;
}

interface ScoreStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

function nonnegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function decode(serialized: string | null): BestScore {
  if (serialized === null) return { wave: 0, score: 0, time: 0 };
  try {
    const value: unknown = JSON.parse(serialized);
    if (typeof value !== "object" || value === null) return { wave: 0, score: 0, time: 0 };
    const record = value as Record<string, unknown>;
    return {
      wave: nonnegative(record.wave),
      score: nonnegative(record.score),
      time: nonnegative(record.time),
    };
  } catch {
    return { wave: 0, score: 0, time: 0 };
  }
}

function key(mode: string, difficulty: string): string {
  return `tear_best_${mode}_${difficulty}`;
}

export class BestScoreRepository {
  readonly api = Object.freeze({
    read: (mode: string, difficulty: string): BestScore => this.read(mode, difficulty),
    record: (mode: string, difficulty: string, wave: number, score: number, time = 0): boolean => {
      try { return this.record({ mode, difficulty, wave, score, time }); } catch { return false; }
    },
  });

  constructor(private readonly store: ScoreStore) {}

  read(mode: string, difficulty: string): BestScore {
    return decode(this.store.get(key(mode, difficulty)));
  }

  record(candidate: BestScoreCandidate): boolean {
    const current = this.read(candidate.mode, candidate.difficulty);
    const improves = candidate.wave > current.wave
      || (candidate.wave === current.wave && candidate.score > current.score);
    if (!improves) return false;
    const value: BestScore = {
      wave: nonnegative(candidate.wave),
      score: nonnegative(candidate.score),
      time: nonnegative(candidate.time),
    };
    this.store.set(key(candidate.mode, candidate.difficulty), JSON.stringify(value));
    return true;
  }
}
