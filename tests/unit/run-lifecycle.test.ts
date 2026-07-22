import { describe, expect, it } from "vitest";
import {
  IllegalRunLifecycleTransitionError,
  RUN_EVENTS_BY_PHASE,
  RUN_PHASES,
  RunLifecycleController,
  transitionRunLifecycle,
  type RunLifecycleEvent,
  type RunLifecycleSnapshot,
  type RunPhase,
} from "../../src/gameplay/run/lifecycle";

const EVENTS: readonly RunLifecycleEvent[] = [
  { type: "start", sessionId: "run-next" },
  { type: "activate-training" },
  { type: "prepare-wave", wave: 2, bossWave: false, activationDeferred: false },
  { type: "activate-wave" },
  { type: "clear-wave" },
  { type: "prepare-reward", reward: "draft" },
  { type: "begin-finale" },
  { type: "terminate", outcome: "quit" },
];

function snapshotAt(phase: RunPhase): RunLifecycleSnapshot {
  const wavePhase = ["wave-prepared", "wave-active", "wave-cleared", "reward-pending", "finale"].includes(phase);
  return Object.freeze({
    phase,
    sessionId: phase === "idle" ? null : "run-1",
    wave: wavePhase ? 1 : null,
    bossWave: wavePhase,
    activationDeferred: phase === "wave-prepared",
    reward: phase === "reward-pending" ? "boss" : null,
    outcome: phase === "terminated" ? "victory" : null,
    revision: 4,
  });
}

describe("run lifecycle transition contract", () => {
  it("exhaustively accepts declared events and rejects every undeclared event", () => {
    for (const phase of RUN_PHASES) {
      for (const event of EVENTS) {
        const action = () => transitionRunLifecycle(snapshotAt(phase), event);
        if (RUN_EVENTS_BY_PHASE[phase].includes(event.type)) expect(action, `${phase} + ${event.type}`).not.toThrow();
        else expect(action, `${phase} + ${event.type}`).toThrow(IllegalRunLifecycleTransitionError);
      }
    }
  });

  it("preserves campaign lore deferral before activating and clearing a boss wave", () => {
    const lifecycle = new RunLifecycleController();
    lifecycle.start("campaign-1");
    lifecycle.prepareWave(10, true, true);
    expect(lifecycle.snapshot()).toMatchObject({ phase: "wave-prepared", bossWave: true, activationDeferred: true });
    lifecycle.activateWave();
    lifecycle.clearWave();
    lifecycle.beginFinale();
    expect(lifecycle.snapshot()).toMatchObject({ phase: "finale", wave: 10, bossWave: true });
  });

  it("routes a cleared normal wave through reward and into the next prepared wave", () => {
    const lifecycle = new RunLifecycleController();
    lifecycle.start("endless-1");
    lifecycle.prepareWave(1, false, false);
    lifecycle.activateWave();
    lifecycle.clearWave();
    lifecycle.prepareReward("draft");
    lifecycle.prepareWave(2, false, false);
    expect(lifecycle.snapshot()).toMatchObject({ phase: "wave-prepared", wave: 2, reward: null });
  });

  it("models training, termination, and an intentional restart", () => {
    const lifecycle = new RunLifecycleController();
    lifecycle.start("training-1");
    lifecycle.activateTraining();
    lifecycle.terminate("quit");
    lifecycle.start("training-2");
    expect(lifecycle.snapshot()).toMatchObject({ phase: "preparing", sessionId: "training-2", outcome: null });
  });

  it("allows a recovered finale to replace the active campaign wave", () => {
    const lifecycle = new RunLifecycleController();
    lifecycle.start("recovered-campaign");
    lifecycle.prepareWave(50, true, true);
    lifecycle.activateWave();
    lifecycle.beginFinale();
    expect(lifecycle.phase).toBe("finale");
  });
});
