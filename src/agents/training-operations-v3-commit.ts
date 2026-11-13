import type { GhostVaultBackend, GhostVaultStore, GhostVaultWrite } from "../ghost";

export type TrainingOperationsV3Guard = Readonly<{ store: GhostVaultStore; key: string; expected?: string }>;
/** Internal composition hook: schedule/binding changes join the leaf receipt transaction. */
export type TrainingOperationsV3Continuation<T> = (receipt: T) => Readonly<{
  guards: readonly TrainingOperationsV3Guard[];
  writes: readonly GhostVaultWrite[];
}>;

export function trainingOperationsV3CommitParts<T>(receipt: T,
  guards: readonly TrainingOperationsV3Guard[], writes: readonly GhostVaultWrite[],
  continuation?: TrainingOperationsV3Continuation<T>,
): Readonly<{ guards: readonly TrainingOperationsV3Guard[]; writes: readonly GhostVaultWrite[] }> {
  const extra = continuation?.(receipt);
  const identities = new Set(writes.map((write) => `${write.store}:${write.key}`));
  for (const write of extra?.writes ?? []) {
    const identity = `${write.store}:${write.key}`;
    const prefixes = write.store === "analysis"
      ? ["foundry-job-schedule:v1:", "training-operations-execution-binding:v5:", "training-operations-execution-binding-current:v5:", "training-operations-execution-binding:v6:", "training-operations-execution-binding-current:v6:", "training-operations-scheduled-attempt:v1:"]
      : write.store === "indexes" ? ["foundry-job-schedule:", "training-operations-execution-binding:v5:", "training-operations-execution-binding:v6:"] : [];
    if (identities.has(identity) || typeof write.value !== "string" || !prefixes.some((prefix) => write.key.startsWith(prefix))
      || !extra?.guards.some((guard) => guard.store === write.store && guard.key === write.key)) {
      throw new RangeError("V3 continuation writes must be distinct, guarded derived records");
    }
    identities.add(identity);
  }
  const merged = [...guards, ...(extra?.guards ?? [])];
  const expected = new Map<string, string | undefined>();
  for (const guard of merged) {
    const identity = `${guard.store}:${guard.key}`;
    if (expected.has(identity) && expected.get(identity) !== guard.expected) throw new RangeError("V3 continuation authority conflicts");
    expected.set(identity, guard.expected);
  }
  return Object.freeze({ guards: Object.freeze(merged), writes: Object.freeze([...writes, ...(extra?.writes ?? [])]) });
}

/** An identical-successor join is success only while every unchanged guard and written byte still matches. */
export async function verifyTrainingOperationsV3Commit(backend: GhostVaultBackend,
  guards: readonly TrainingOperationsV3Guard[], writes: readonly GhostVaultWrite[],
): Promise<void> {
  const changed = new Set(writes.map((write) => `${write.store}:${write.key}`));
  await backend.commitIfMatches(Object.freeze([
    ...guards.filter((guard) => !changed.has(`${guard.store}:${guard.key}`)),
    ...writes.map((write) => ({ store: write.store, key: write.key, ...(write.value === undefined ? {} : { expected: write.value }) })),
  ]), Object.freeze([]));
}
