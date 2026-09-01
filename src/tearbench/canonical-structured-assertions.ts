import type { TearObservationV1 } from "./contracts";

/**
 * Fail-closed assertions for source-owned surgical scenarios. These checks
 * consume only the structured observations emitted by the live runtime; they
 * do not infer identity from the scenario label or from pixels.
 */
export function assertCanonicalStructuredObservations(
  assertions: readonly string[],
  observations: readonly TearObservationV1[],
): void {
  for (const assertion of assertions) {
    const separator = assertion.indexOf("=");
    if (separator <= 0 || separator === assertion.length - 1) {
      throw new RangeError(`malformed canonical structured assertion: ${assertion}`);
    }
    const kind = assertion.slice(0, separator);
    const expected = assertion.slice(separator + 1);
    const matched = observations.some((observation) => {
      if (kind === "environment.field.kind") return observation.environment?.fields.some((field) => field.kind === expected) ?? false;
      if (kind === "environment.field.id") return observation.environment?.fields.some((field) => field.id === expected) ?? false;
      if (kind === "environment.field.state") return observation.environment?.fields.some((field) => field.state === expected) ?? false;
      if (kind === "entity.kind") return observation.entities.some((entity) => entity.kind === expected);
      if (kind === "entity.variantId") return observation.entities.some((entity) => entity.variantId === expected);
      if (kind === "boss.phase") return observation.diagnostics?.boss?.phase === expected;
      throw new RangeError(`unknown canonical structured assertion: ${assertion}`);
    });
    if (!matched) throw new Error(`canonical structured assertion failed: ${assertion}`);
  }
}
