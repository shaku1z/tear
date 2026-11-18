import type { TearScenarioV1 } from "./contracts";
import { validateTearContract } from "./validation";

function requireNaturalScenario(value: TearScenarioV1): TearScenarioV1 {
  if (value.backends !== undefined && !value.backends.includes("headless")) {
    throw new RangeError(`scenario ${value.id} does not support headless execution`);
  }
  if (value.subject?.kind === "environment-field" || value.subject?.kind === "environment-combat-object") {
    throw new RangeError(`scenario ${value.id} is environment-owned and requires the live backend`);
  }
  if (value.stateClass !== "recorded-canonical") {
    throw new RangeError("production headless runs require recorded-canonical natural openings");
  }
  // A chosen boss is a natural opening in boss-only mode: the player picks one on the start screen.
  if (
    value.start.stage !== undefined ||
    (value.start.wave !== undefined && value.start.wave !== 1) ||
    (value.start.boss !== undefined && value.start.mode !== "bossonly") ||
    value.start.bossPhase !== undefined
  ) {
    throw new RangeError("production headless runs require a natural opening; use State Forge for surgical state");
  }
  return value;
}

/** Admits a scenario the production headless environment can start: a valid contract with a natural opening. */
export function requireProductionHeadlessScenario(value: unknown): TearScenarioV1 {
  const validated = validateTearContract(value);
  if (!validated.ok || validated.value.kind !== "scenario") {
    throw new TypeError(
      `invalid headless scenario: ${
        validated.ok
          ? "wrong contract kind"
          : validated.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")
      }`,
    );
  }
  return requireNaturalScenario(validated.value);
}
