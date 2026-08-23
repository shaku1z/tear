import { describe, expect, it } from "vitest";

import {
  GAME_AGENT_ACTIONS,
  GAME_AGENT_QUERY,
  GAME_AGENT_ROUTE,
  LEGACY_GAME_AGENT_ACTION_ALIASES,
  LEGACY_GAME_AGENT_QUERY_ALIASES,
  createGameAgentLadderEvaluationPlan,
  createGameAgentV3CanonicalEvaluationPlan,
} from "../../src/agents/game-agent";
import {
  LEGACY_RUN_MONITOR_ACTIONS,
  LEGACY_RUN_MONITOR_ACTION_ALIASES,
  RUN_MONITOR_ACTIONS,
  RUN_MONITOR_POLICY_JOURNAL_PREFIX,
  RUN_MONITOR_QUERY,
  RUN_MONITOR_ROUTE,
  createRunMonitor,
  normalizeAgentSurfaceSearch as normalizeRunMonitorSearch,
  requestedAgentSurface as requestedRunMonitorSurface,
} from "../../src/agents/run-monitor";
import {
  isAgentSurfaceRequested,
  normalizeAgentSurfaceSearch,
  resolveAgentSurfaceRoute,
  requestedAgentSurface,
} from "../../src/agents/surface-route";
import { createLiveWatchAgentHost } from "../../src/agents/live-watch-agent-host";
import { createTearBotLadderEvaluationPlan } from "../../src/agents/tearbot-ladder-evaluation";
import { createTearBotV3CanonicalEvaluationPlan } from "../../src/agents/tearbot-v3-canonical-evaluation";
import { LiveBotEvidenceController } from "../../src/app/live-bot-evidence-controller";
import { LivePlayerWatchController } from "../../src/app/live-player-watch-controller";
import { GameAgentEvidenceController } from "../../src/app/game-agent";
import { RunMonitorController } from "../../src/app/run-monitor";
import { stableVerificationHash } from "../../src/replay/hash";
import { compileTearBotLevel } from "../../src/agents/ladder-foundry";

const scenario = Object.freeze({
  format: "tear-contract" as const,
  kind: "scenario" as const,
  schemaVersion: 1 as const,
  id: "game-agent-compatibility",
  version: 1,
  description: "Game Agent compatibility fixture",
  stateClass: "recorded-canonical" as const,
  executionClass: "engineering" as const,
  seed: "game-agent-compatibility",
  start: Object.freeze({ mode: "endless" as const, difficulty: "normal" as const, weapon: "greatsword" as const }),
  maxTicks: 3,
  assertions: Object.freeze(["runtime.finite-state"] as const),
  tags: Object.freeze(["game-agent", "compatibility"]),
});

describe("Game Agent and Run Monitor compatibility facades", () => {
  it("normalizes canonical and legacy routes without enabling malformed flags", () => {
    expect(GAME_AGENT_ROUTE).toBe("game-agent");
    expect(RUN_MONITOR_ROUTE).toBe("run-monitor");
    expect(GAME_AGENT_QUERY).toBe("game-agent");
    expect(RUN_MONITOR_QUERY).toBe("run-monitor");
    expect(LEGACY_GAME_AGENT_QUERY_ALIASES).toEqual(["botevidence", "tearbot"]);
    expect(resolveAgentSurfaceRoute("botevidence")).toBe("game-agent");
    expect(resolveAgentSurfaceRoute("tearbot")).toBe("game-agent");
    expect(resolveAgentSurfaceRoute("watchagent")).toBe("run-monitor");
    expect(isAgentSurfaceRequested("?watchagent=1", "run-monitor")).toBe(true);
    expect(isAgentSurfaceRequested("?watchagent=0", "run-monitor")).toBe(false);
    expect(requestedAgentSurface("?test=1&watchagent=1")).toBe("run-monitor");
    expect(requestedRunMonitorSurface("?test=1&watchagent=1")).toBe("run-monitor");
    expect(normalizeAgentSurfaceSearch("?test=1&watchagent=1")).toBe("?test=1&run-monitor=1");
    expect(normalizeRunMonitorSearch("?test=1&botevidence=1")).toBe("?test=1&game-agent=1");
    expect(normalizeAgentSurfaceSearch("?watchagent=0")).toBe("?watchagent=0");
  });

  it("defines canonical actions while retaining the old action tokens as aliases", () => {
    expect(GAME_AGENT_ACTIONS).toEqual({ open: "game-agent.open" });
    expect(RUN_MONITOR_ACTIONS).toEqual({ open: "run-monitor.open", control: "run-monitor.control" });
    expect(LEGACY_RUN_MONITOR_ACTIONS).toEqual({ open: "ghostlab.open", control: "ghostlab.watch" });
    expect(LEGACY_GAME_AGENT_ACTION_ALIASES).toEqual(["replay.hub.open", "ghostlab.open"]);
    expect(LEGACY_RUN_MONITOR_ACTION_ALIASES).toEqual(["replay.hub.open", "replay.hub.watch", "ghostlab.open", "ghostlab.watch"]);
  });

  it("keeps canonical API and app facades on the exact legacy implementations", () => {
    expect(createRunMonitor).toBe(createLiveWatchAgentHost);
    expect(GameAgentEvidenceController).toBe(LiveBotEvidenceController);
    expect(RunMonitorController).toBe(LivePlayerWatchController);
    expect(createGameAgentLadderEvaluationPlan).toBe(createTearBotLadderEvaluationPlan);
    expect(createGameAgentV3CanonicalEvaluationPlan).toBe(createTearBotV3CanonicalEvaluationPlan);
  });

  it("preserves ladder and V3 plan bytes/hashes through canonical aliases", () => {
    const level = compileTearBotLevel(1);
    const ladderInput = {
      id: "compatibility-plan",
      maxTicksPerCase: 3,
      cases: [{ id: "one", scenario, scenarioHash: stableVerificationHash(scenario) }],
      levels: [{ level, policy: { kind: "scripted-profile" as const, profile: "competent" as const, lineageHash: "a".repeat(16) }, boundedRationality: { id: "bounded", reactionTicks: 0, actionErrorEvery: 0, observationFields: ["state"] } }],
    };
    const legacyLadder = createTearBotLadderEvaluationPlan(ladderInput);
    const canonicalLadder = createGameAgentLadderEvaluationPlan(ladderInput);
    expect(canonicalLadder).toEqual(legacyLadder);
    expect(JSON.stringify(canonicalLadder)).toBe(JSON.stringify(legacyLadder));
    expect(stableVerificationHash(canonicalLadder)).toBe(stableVerificationHash(legacyLadder));

    const v3Input = {
      id: "compatibility-v3-plan",
      candidate: { approvalHash: "b".repeat(16), artifactId: "artifact", artifactHash: "c".repeat(16), activationHash: "d".repeat(16) },
      cases: [{ id: "one", scenario, scenarioHash: stableVerificationHash(scenario) }],
      maxTicksPerCase: 3,
    };
    const legacyV3 = createTearBotV3CanonicalEvaluationPlan(v3Input);
    const canonicalV3 = createGameAgentV3CanonicalEvaluationPlan(v3Input);
    expect(canonicalV3).toEqual(legacyV3);
    expect(canonicalV3.planHash).toBe(legacyV3.planHash);
    expect(canonicalV3.format).toBe("tearbot-v3-canonical-evaluation-plan");
  });

  it("keeps the watch-policy journal prefix and authority boundary historical", () => {
    const historicalKey = `${RUN_MONITOR_POLICY_JOURNAL_PREFIX}timestamp:run-id`;
    expect(historicalKey).toBe("watch-policy:v1:timestamp:run-id");
    expect(RUN_MONITOR_POLICY_JOURNAL_PREFIX).toBe("watch-policy:v1:");
  });
});
