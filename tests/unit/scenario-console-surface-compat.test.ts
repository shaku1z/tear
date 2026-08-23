import { describe, expect, it } from "vitest";

import * as legacyBrowser from "../../src/tearbench/browser/state-forge-studio";
import * as legacyLive from "../../src/tearbench/browser/live-state-forge-studio-host";
import * as canonicalBrowser from "../../src/tearbench/browser/scenario-console";
import {
  LEGACY_SCENARIO_CONSOLE_QUERY,
  SCENARIO_CONSOLE_QUERY,
  SCENARIO_CONSOLE_QUERY_ALIASES,
  isScenarioConsoleRequested,
  normalizeScenarioConsoleSearch,
} from "../../src/tearbench/browser/scenario-console-route";
import {
  createScenarioConsoleForkSource,
  evaluateScenarioConsoleSource,
} from "../../src/tearbench/browser/scenario-console";
import {
  createStateForgeForkSource,
  evaluateStateForgeSource,
} from "../../src/tearbench/state-forge-studio-model";
import { stableVerificationHash } from "../../src/replay/hash";

const source = JSON.stringify({
  format: "tearsdl",
  schemaVersion: 1,
  id: "state-forge.live-sandbox",
  stateClass: "recorded-canonical",
  seed: "scenario-console-compat",
  start: { mode: "endless", difficulty: "normal", weapon: "greatsword", wave: 4 },
  state: { player: { hp: 80 }, run: { score: 40 } },
  constraints: { legalProgression: true },
  tags: ["state-forge", "developer", "disposable"],
  maxTicks: 3_600,
}, null, 2) + "\n";

describe("Scenario Console surface compatibility", () => {
  it("accepts canonical and legacy deep links and writes one canonical query", () => {
    expect(SCENARIO_CONSOLE_QUERY).toBe("scenario-console");
    expect(LEGACY_SCENARIO_CONSOLE_QUERY).toBe("stateforge");
    expect(SCENARIO_CONSOLE_QUERY_ALIASES).toEqual(["scenario-console", "stateforge"]);
    expect(isScenarioConsoleRequested("?scenario-console=1")).toBe(true);
    expect(isScenarioConsoleRequested("?stateforge=1")).toBe(true);
    expect(isScenarioConsoleRequested("?stateforge")).toBe(true);
    expect(isScenarioConsoleRequested("?stateforge=0")).toBe(false);
    expect(normalizeScenarioConsoleSearch("?test=1&stateforge=1")).toBe("?test=1&scenario-console=1");
    expect(normalizeScenarioConsoleSearch("?stateforge=0")).toBe("?stateforge=0");
  });

  it("keeps the old browser API as an exact facade target", () => {
    expect(canonicalBrowser.installScenarioConsole).toBe(legacyBrowser.installStateForgeStudio);
    expect(canonicalBrowser.createLiveScenarioConsoleHost).toBe(legacyLive.createLiveStateForgeStudioHost);
    expect(canonicalBrowser.installLiveScenarioConsole).toBe(legacyLive.installLiveStateForgeStudio);
  });

  it("produces equivalent evaluations through canonical and legacy model names", () => {
    const legacy = evaluateStateForgeSource(source);
    const canonical = evaluateScenarioConsoleSource(source);
    expect(canonical).toEqual(legacy);
    expect(canonical.resolved?.resolvedHash).toBe(stableVerificationHash(JSON.parse(source)));
  });

  it("preserves TearSDL fixture bytes and fork/hash behavior", () => {
    const legacyFork = createStateForgeForkSource(source, "state-forge.imported-child", { player: { hp: 61 } });
    const canonicalFork = createScenarioConsoleForkSource(source, "state-forge.imported-child", { player: { hp: 61 } });
    expect(canonicalFork).toBe(legacyFork);
    expect(stableVerificationHash(JSON.parse(canonicalFork))).toBe(stableVerificationHash(JSON.parse(legacyFork)));
    expect(JSON.parse(canonicalFork)).toMatchObject({
      id: "state-forge.imported-child",
      extends: "state-forge.live-sandbox",
      state: { player: { hp: 61 }, run: { score: 40 } },
    });
  });
});
