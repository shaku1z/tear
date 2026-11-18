/**
 * The one way Tear runs a property test (fast-check). A property states a rule
 * that must hold for every input; fast-check tries many generated inputs and,
 * on a failure, shrinks the input to a small one that still fails.
 *
 * Every property file is named `<area>.property.test.ts`, lives in `tests/unit/`
 * and calls `checkProperty` instead of `fc.assert`, so every run uses the same
 * seed, the same run budget and the same failure report.
 *
 * - The seed is fixed (`DEFAULT_PROPERTY_SEED`), so CI and every machine try the
 *   same inputs and a pass or failure is repeatable. `TEAR_PROPERTY_SEED`
 *   changes it for a local search.
 * - The run budget is set by what the property costs (`PROPERTY_RUNS`).
 *   `TEAR_PROPERTY_SCALE` multiplies every budget for a deeper local search.
 * - A failure prints the seed, the path to the shrunk input, the input itself
 *   and the command that replays exactly that input (`TEAR_PROPERTY_PATH`).
 */
import fc from "fast-check";
import { expect } from "vitest";

export const DEFAULT_PROPERTY_SEED = 1117;

/** Inputs tried per property: pure functions of data are cheap, runs of the game are not. */
export const PROPERTY_RUNS = Object.freeze({ data: 200, simulation: 6 });
export type PropertyBudget = keyof typeof PROPERTY_RUNS;

export interface PropertySettings {
  readonly seed: number;
  readonly scale: number;
  readonly path: string | undefined;
}

function wholeNumber(name: string, text: string, minimum: number): number {
  const value = Number(text);
  if (!/^-?\d+$/u.test(text.trim()) || !Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a whole number of at least ${String(minimum)}, not "${text}"`);
  }
  return value;
}

/** Reads the overrides; an unreadable override fails the run instead of being ignored. */
export function propertySettings(environment: NodeJS.ProcessEnv = process.env): PropertySettings {
  const seed = environment.TEAR_PROPERTY_SEED,
    scale = environment.TEAR_PROPERTY_SCALE,
    path = environment.TEAR_PROPERTY_PATH;
  if (path !== undefined && !/^\d+(:\d+)*$/u.test(path)) {
    throw new RangeError(`TEAR_PROPERTY_PATH must look like "12:0:3", not "${path}"`);
  }
  if (path !== undefined && seed === undefined) {
    throw new RangeError("TEAR_PROPERTY_PATH replays one input and needs the TEAR_PROPERTY_SEED it was found with");
  }
  return Object.freeze({
    seed: seed === undefined ? DEFAULT_PROPERTY_SEED : wholeNumber("TEAR_PROPERTY_SEED", seed, -(2 ** 31)),
    scale: scale === undefined ? 1 : wholeNumber("TEAR_PROPERTY_SCALE", scale, 1),
    path,
  });
}

function quoted(text: string): string {
  return `"${text.replaceAll('"', '\\"')}"`;
}

/** The commands that replay one failing input of the current test. */
export function replayCommands(seed: number, path: string, testPath: string | undefined, testName: string | undefined) {
  const file =
    testPath === undefined ? "<property file>" : testPath.replaceAll("\\", "/").replace(/^.*?(tests\/)/u, "$1");
  const filter = testName === undefined ? "" : ` -t ${quoted(testName)}`;
  const run = `pnpm exec vitest run ${file}${filter}`;
  return [
    `Bash:       TEAR_PROPERTY_SEED=${String(seed)} TEAR_PROPERTY_PATH=${path} ${run}`,
    `PowerShell: $env:TEAR_PROPERTY_SEED = "${String(seed)}"; $env:TEAR_PROPERTY_PATH = "${path}"; ${run}; ` +
      "Remove-Item Env:TEAR_PROPERTY_SEED, Env:TEAR_PROPERTY_PATH",
  ];
}

function parameters<Ts>(budget: PropertyBudget, settings: PropertySettings): fc.Parameters<Ts> {
  const { testPath, currentTestName } = expect.getState();
  return {
    seed: settings.seed,
    numRuns: PROPERTY_RUNS[budget] * settings.scale,
    ...(settings.path === undefined ? {} : { path: settings.path }),
    reporter(details) {
      if (!details.failed) return;
      const report = fc.defaultReportMessage(details);
      const failure = details.errorInstance;
      const reason = failure instanceof Error ? failure.message : String(failure);
      const replay =
        details.counterexamplePath === null
          ? []
          : [
              "",
              "Replay this input:",
              ...replayCommands(details.seed, details.counterexamplePath, testPath, currentTestName),
            ];
      throw new Error([report, "", `Failure: ${reason}`, ...replay].join("\n"), { cause: failure });
    },
  };
}

/** Checks a property that returns or throws synchronously. */
export function checkProperty<Ts>(property: fc.IProperty<Ts>, budget: PropertyBudget = "data"): void {
  fc.assert(property, parameters<Ts>(budget, propertySettings()));
}

/** Checks a property whose body is async (`fc.asyncProperty`). */
export async function checkAsyncProperty<Ts>(
  property: fc.IAsyncProperty<Ts>,
  budget: PropertyBudget = "data",
): Promise<void> {
  await fc.assert(property, parameters<Ts>(budget, propertySettings()));
}

export { fc };
