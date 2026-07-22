import { describe, expect, it, vi } from "vitest";
import { LivePendingFinaleController, type PendingFinalePort } from "../../src/app/live-pending-finale-controller";

function harness() {
  const record = { weapon: "hammer", diff: "hard" as const, wave: 50, score: 900, time: 125,
    log: [{ wave: 50, time: 125, kills: 20, peak: 4 }], isNew: true, earned: 12, coins: 44,
    best: { wave: 50, score: 800, time: 130 } };
  const run = { wave: 0, score: 0, runTime: 0, waveLog: [], spawnQueue: [1, 2] as unknown[] };
  const player = { x: 0, y: 0, hh: 24, vx: 2, vy: 3, onGround: false };
  const calls: string[] = [];
  let selected = "sword";
  const port: PendingFinalePort = {
    pending: () => record, selectedWeapon: () => selected, selectWeapon: (id) => { selected = id; calls.push(`weapon:${id}`); },
    startCampaign: (difficulty) => { calls.push(`start:${difficulty}`); },
    cancelCinematic: (reason) => { calls.push(`cancel:${reason}`); }, run: () => run, player: () => player,
    stageCount: () => 6, loadStage: (index) => { calls.push(`stage:${String(index)}`); },
    clearCombat: () => { calls.push("clear"); }, groundY: () => 700, viewport: () => ({ width: 1600, height: 900 }),
    recording: () => true, stopRecording: (reason) => { calls.push(`recording:${reason}`); }, coins: () => 30,
    clearPending: () => { calls.push("pending"); }, achievementTracking: () => true,
    pushCloud: () => { calls.push("cloud"); }, terminateVictory: () => { calls.push("victory"); },
    presentClaimed: (result) => { calls.push(`present:${String(result.score)}`); },
    launchFinale: (death) => { calls.push(`finale:${String(death.x)}:${String(death.y)}`); },
  };
  return { controller: new LivePendingFinaleController(port), calls, player, run, selected: () => selected };
}

describe("live pending finale controller", () => {
  it("claims a persisted result with exactly-once cleanup and grounded presentation", () => {
    const { controller, calls, player, run, selected } = harness();
    expect(controller.claim()).toBe(true);
    expect(selected()).toBe("hammer");
    expect(run).toMatchObject({ wave: 50, score: 900, runTime: 125,
      waveLog: [{ wave: 50, time: 125, kills: 20, peak: 4 }], spawnQueue: [],
      _victoryPrepared: { isNew: true, earned: 12, coins: 44 } });
    expect(player).toEqual({ x: 800, y: 676, hh: 24, vx: 0, vy: 0, onGround: true });
    expect(calls).toEqual(["weapon:hammer", "start:hard", "cancel:claim-final-cut", "stage:0", "clear",
      "recording:claimedFinale", "pending", "cloud", "victory", "present:900"]);
  });

  it("resumes the final cut at the last stage without prematurely clearing persistence", () => {
    const { controller, calls } = harness();
    expect(controller.resume()).toBe(true);
    expect(calls).toEqual(["weapon:hammer", "start:hard", "cancel:resume-final-cut", "stage:5", "clear",
      "recording:resumedFinale", "finale:800:342"]);
  });

  it("is a no-op when no pending record exists", () => {
    const pending = vi.fn(() => null);
    const fail = vi.fn();
    const controller = new LivePendingFinaleController({
      pending, selectedWeapon: () => "sword", selectWeapon: fail, startCampaign: fail,
      cancelCinematic: fail, run: fail, player: fail, stageCount: () => 0, loadStage: fail,
      clearCombat: fail, groundY: () => 0, viewport: () => ({ width: 0, height: 0 }), recording: () => false,
      stopRecording: fail, coins: () => 0, clearPending: fail, achievementTracking: () => false,
      pushCloud: fail, terminateVictory: fail, presentClaimed: fail, launchFinale: fail,
    });
    expect(controller.claim()).toBe(false);
    expect(controller.resume()).toBe(false);
    expect(pending).toHaveBeenCalledTimes(2);
    expect(fail).not.toHaveBeenCalled();
  });
});
