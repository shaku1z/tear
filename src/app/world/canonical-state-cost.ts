import { DeferredCanonicalState } from "../../gameplay/runtime/authoritative-step";

/** The counting half of the diagnostics monitor. */
export interface CanonicalStateCostCounter {
  count(name: string, delta?: number): void;
}

/**
 * Test-build cost accounting for one authoritative capture: it counts the
 * capture now and, only if a consumer reads the state, the projection and its
 * duration. Callers reach it only under `__TEAR_TEST_BUILD__`, so release
 * bundles neither count nor contain the counter names.
 */
export function countCanonicalStateCost<State>(
  captured: DeferredCanonicalState<State>,
  counter: CanonicalStateCostCounter,
): DeferredCanonicalState<State> {
  counter.count("authoritativeCaptures");
  return new DeferredCanonicalState(() => {
    const startedAt = performance.now();
    const state = captured.state;
    counter.count("authoritativeSnapshots");
    counter.count("authoritativeSnapshotMs", performance.now() - startedAt);
    return state;
  });
}
