import type { TearCanonicalScenarioV1, TearScenarioV1 } from "./contracts";
import { PALE_CANONICAL_STATE_SETUP_SCENARIOS } from "./pale-state-setup-scenarios";
import { resolveTearSdl, type TearSdlDocumentV1 } from "./tearsdl";
import type { TearClassARuntimeEnvironment } from "./live-runtime-contracts";

export type PaleCanonicalScenarioId = keyof typeof PALE_CANONICAL_STATE_SETUP_SCENARIOS;

const documents = PALE_CANONICAL_STATE_SETUP_SCENARIOS;

/** Returns the source-owned State Setup document for a TC-9 canonical ID. */
export function paleCanonicalDocumentForScenario(id: string): TearSdlDocumentV1 | undefined {
  return documents[id as PaleCanonicalScenarioId];
}

/**
 * Launches a canonical scenario through its real live reset or State Setup
 * path. Pale surgical scenarios never fall back to a natural reset: an absent
 * document is an explicit error, while ordinary scenarios retain the existing
 * natural live path.
 */
export function launchCanonicalLiveScenario(environment: TearClassARuntimeEnvironment, scenario: TearScenarioV1): void {
  const document = paleCanonicalDocumentForScenario(scenario.id);
  if (document === undefined) {
    environment.reset(scenario);
    return;
  }
  const resolved = resolveTearSdl(document);
  if (resolved.scenario.id !== scenario.id || resolved.scenario.seed !== scenario.seed) {
    throw new Error(`Pale canonical State Setup document identity does not match scenario ${scenario.id}`);
  }
  const result = environment.buildResolvedScenario(resolved);
  if (!result.ok) throw new Error(`Pale canonical State Setup launch failed for ${scenario.id}`);
}

/** Source-owned descriptor check used by canonical catalog materialization. */
export function assertPaleCanonicalStateSetupDocument(id: string, seed: string, stateClass?: string): void {
  const document = paleCanonicalDocumentForScenario(id);
  if (document === undefined) throw new RangeError(`unknown Pale canonical State Setup document: ${id}`);
  if (
    document.id !== id ||
    document.seed !== seed ||
    (stateClass !== undefined && document.stateClass !== stateClass)
  ) {
    throw new RangeError(`Pale canonical State Setup document ${id} has a mismatched seed or identity`);
  }
}

export function isPaleCanonicalScenario(scenario: TearCanonicalScenarioV1): boolean {
  return paleCanonicalDocumentForScenario(scenario.id) !== undefined;
}
