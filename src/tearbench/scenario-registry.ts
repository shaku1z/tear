import type { TearScenarioV1 } from "./contracts";
import { validateTearContract } from "./validation";

export class TearScenarioRegistry {
  readonly #scenarios = new Map<string, TearScenarioV1>();

  register(scenario: TearScenarioV1): void {
    const validation = validateTearContract(scenario);
    if (!validation.ok || validation.value.kind !== "scenario") {
      const details = validation.ok ? "contract is not a scenario" : validation.issues.map((entry) => `${entry.path}: ${entry.message}`).join("; ");
      throw new TypeError(`invalid Tear scenario: ${details}`);
    }
    const existing = this.#scenarios.get(scenario.id);
    if (existing !== undefined && existing.version >= scenario.version) {
      throw new RangeError(`scenario ${scenario.id} version must increase beyond ${String(existing.version)}`);
    }
    this.#scenarios.set(scenario.id, Object.freeze(scenario));
  }

  get(id: string): TearScenarioV1 {
    const scenario = this.#scenarios.get(id);
    if (scenario === undefined) throw new RangeError(`unknown Tear scenario: ${id}`);
    return scenario;
  }

  list(): readonly TearScenarioV1[] {
    return Object.freeze([...this.#scenarios.values()].sort((left, right) => left.id.localeCompare(right.id)));
  }
}
