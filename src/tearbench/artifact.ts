import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";
import type { TearBuildIdentityV1, TearFailureArtifactV1, TearScenarioV1 } from "./contracts";
import type { TearBenchRunResult } from "./runner";

export interface TearBenchConsoleEntry {
  readonly level: "debug" | "info" | "warning" | "error";
  readonly tick?: number;
  readonly message: string;
}

export interface TearBenchArtifactHooks {
  captureScreenshot?(name: string): string | undefined;
  captureReplay?(name: string, actions: readonly CommandEnvelope<GameAction>[]): string | undefined;
}

export interface TearBenchRunArtifactV1 {
  readonly format: "tearbench-run";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly createdAt: string;
  readonly build: TearBuildIdentityV1;
  readonly resolvedScenario: TearScenarioV1;
  readonly seed: string;
  readonly status: TearBenchRunResult["status"];
  readonly ticks: number;
  readonly actions: readonly CommandEnvelope<GameAction>[];
  readonly events: TearBenchRunResult["events"];
  readonly observations: TearBenchRunResult["observations"];
  readonly metrics: TearBenchRunResult["metrics"];
  readonly failures: TearBenchRunResult["failures"];
  readonly console: readonly TearBenchConsoleEntry[];
  readonly hashes: Readonly<{ semantic: string }>;
  readonly attachments: Readonly<Record<string, string>>;
  readonly rerun: Readonly<{ scenarioId: string; scenarioVersion: number; seed: string; actionTrace: string }>;
}

export function createRunArtifact(
  result: TearBenchRunResult,
  options: Readonly<{
    id: string;
    createdAt: string;
    build: TearBuildIdentityV1;
    console?: readonly TearBenchConsoleEntry[];
    hooks?: TearBenchArtifactHooks;
  }>,
): TearBenchRunArtifactV1 {
  const actionTrace = `${options.id}.actions.json`;
  const screenshot = options.hooks?.captureScreenshot?.(`${options.id}.png`);
  const replay = options.hooks?.captureReplay?.(`${options.id}.replay.json`, result.actions);
  return Object.freeze({
    format: "tearbench-run",
    schemaVersion: 1,
    id: options.id,
    createdAt: options.createdAt,
    build: options.build,
    resolvedScenario: result.scenario,
    seed: result.scenario.seed,
    status: result.status,
    ticks: result.ticks,
    actions: result.actions,
    events: result.events,
    observations: result.observations,
    metrics: result.metrics,
    failures: result.failures,
    console: Object.freeze([...(options.console ?? [])]),
    hashes: Object.freeze({ semantic: result.semanticHash }),
    attachments: Object.freeze({
      actionTrace,
      ...(screenshot === undefined ? {} : { screenshot }),
      ...(replay === undefined ? {} : { replay }),
    }),
    rerun: Object.freeze({
      scenarioId: result.scenario.id,
      scenarioVersion: result.scenario.version,
      seed: result.scenario.seed,
      actionTrace,
    }),
  });
}

export function failureFromRunArtifact(
  artifact: TearBenchRunArtifactV1,
  failure: TearFailureArtifactV1,
): Readonly<{ run: TearBenchRunArtifactV1; failure: TearFailureArtifactV1 }> {
  if (artifact.id !== failure.id) throw new TypeError("run and failure artifact IDs must match");
  return Object.freeze({ run: artifact, failure });
}
