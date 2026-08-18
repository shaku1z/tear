import { describe, expect, it, vi } from "vitest";

import { FinaleController, type FinaleIntent } from "../../src/gameplay/campaign/finale-controller";
import {
  createFinaleRuntime,
  type FinaleCinematicChannel,
  type FinaleCinematicScript,
  type FinaleIntentPorts,
  type FinaleRuntimeState,
} from "../../src/gameplay/campaign/finale-runtime";

function state(): FinaleRuntimeState {
  const create = () => new FinaleController({
    anchorRadius: 20, worldZoom: 0.8, silence: 0.1, wound: 0.1, relics: 0.1,
    cutAutoAt: 0.2, cutAutoStep: 0.1, cutSpeed: 10, restorationMin: 0.1,
    epilogueReveal: 0.1, rewardHold: 0.1,
  });
  return {
    finale: null,
    finaleController: create(),
    resetFinale() { this.finale = null; this.finaleController = create(); },
    syncFinale() { this.finale = this.finaleController.state; return this.finale; },
  };
}

function intents(calls: string[], mutateVibration = false): FinaleIntentPorts {
  return {
    beginLifecycle: () => { calls.push("lifecycle"); }, clearCombat: () => { calls.push("clear"); },
    freezeVoid: () => { calls.push("freeze"); }, worldZoom: () => undefined,
    finalBlade: (active) => { calls.push(`blade:${String(active)}`); },
    ring: () => undefined,
    burst: (_x, _y, dx, dy) => { calls.push(`burst:${String(dx)}:${String(dy)}`); },
    flash: () => undefined, shake: () => undefined,
    vibrate: (pattern) => {
      if (mutateVibration) (pattern as number[])[0] = 999;
    },
    sound: (cue) => { calls.push(`sound:${cue}`); }, restoreStageZero: () => { calls.push("stage0"); },
    restorePlayer: () => { calls.push("restore-player"); }, voidMix: () => undefined,
    musicDuck: () => undefined, win: (campaign) => { calls.push(`win:${String(campaign)}`); },
  };
}

class SkipToCompletionCinema implements FinaleCinematicChannel {
  started = false;

  start<Context>(script: FinaleCinematicScript<Context>, context: Context): void {
    this.started = true;
    const director = { elapsed: 1, progress: 1, skipTo: () => true };
    script.onStart?.(context, director);
    script.onSkip?.(context, director);
    script.beats.find((beat) => beat.id === "restoration")?.onEnter?.(context, director);
    script.onComplete?.(context, director);
  }
}

describe("portable finale runtime", () => {
  it("owns campaign preparation, assisted skip, restoration, and terminal intent dispatch", () => {
    const owner = state();
    const cinema = new SkipToCompletionCinema();
    const calls: string[] = [];
    const prepareVictory = vi.fn(() => ({ isNew: true, earned: 50, coins: 10 }));
    const player = { x: 800, y: 300, vx: 12, vy: -8, onGround: true };
    const observed: (readonly FinaleIntent[])[] = [];
    const runtime = createFinaleRuntime({
      runtime: owner, cinema,
      run: () => ({ mode: "campaign", score: 900, runTime: 60, finalBossDeath: { x: 700, y: 250 } }),
      player: () => player, blade: () => ({ tipVX: 3, tipVY: 4 }), intents: intents(calls, true),
      observeIntents: (batch) => {
        observed.push(batch);
        calls.push(`observe:${batch[0]?.type ?? "empty"}`);
      },
      prepareVictory, win: (campaign) => { calls.push(`direct-win:${String(campaign)}`); },
      formatTime: () => "1:00", viewport: { width: 1600, height: 900 }, perfectColor: () => "#fff",
      reducedMotion: () => false, lowGraphics: () => false,
    });

    runtime.start();

    expect(cinema.started).toBe(true);
    expect(prepareVictory).toHaveBeenCalledWith(true, true);
    expect(player).toMatchObject({ vx: 0, vy: 0, onGround: false });
    expect(calls.slice(0, 2)).toEqual(["observe:begin-finale-lifecycle", "lifecycle"]);
    expect(calls.filter((entry) => entry === "burst:3:4")).toHaveLength(3);
    expect(calls).toEqual(expect.arrayContaining([
      "lifecycle", "clear", "freeze", "stage0", "restore-player", "blade:false", "win:true",
    ]));
    expect(observed).toEqual([
      [
        { type: "begin-finale-lifecycle" }, { type: "clear-combat" }, { type: "freeze-void" },
        { type: "world-zoom", value: 0.8 }, { type: "final-blade", active: true, restoredTrail: true },
      ],
      [{ type: "sound", cue: "final-silence" }],
      [
        { type: "ring", x: 632, y: 228, radius: 18, color: "#fff" },
        { type: "burst", x: 632, y: 228, dx: 3, dy: 4, count: 14, color: "#fff" },
        { type: "flash", amount: 0.135 }, { type: "shake", amount: 5 },
        { type: "sound", cue: "final-cut", index: 0 }, { type: "vibrate", pattern: [18, 24, 34] },
      ],
      [
        { type: "ring", x: 974, y: 334, radius: 18, color: "#fff" },
        { type: "burst", x: 974, y: 334, dx: 3, dy: 4, count: 14, color: "#fff" },
        { type: "flash", amount: 0.17 }, { type: "shake", amount: 7 },
        { type: "sound", cue: "final-cut", index: 1 }, { type: "vibrate", pattern: [18, 24, 34] },
      ],
      [
        { type: "ring", x: 808, y: 126, radius: 18, color: "#fff" },
        { type: "burst", x: 808, y: 126, dx: 3, dy: 4, count: 14, color: "#fff" },
        { type: "flash", amount: 0.20500000000000002 }, { type: "shake", amount: 9 },
        { type: "sound", cue: "final-cut", index: 2 }, { type: "vibrate", pattern: [24, 34, 62] },
      ],
      [
        { type: "restore-stage-zero" }, { type: "freeze-void" }, { type: "world-zoom", value: 1 },
        { type: "set-player-restoration", xMin: 20, xMax: 1580, yMax: 220, vy: 35 },
        { type: "sound", cue: "final-restore" },
      ],
      [{ type: "final-blade", active: false }, { type: "win-run", campaign: true }],
    ]);
    expect(observed.every((batch) => Object.isFrozen(batch) && batch.every(Object.isFrozen))).toBe(true);
    const vibration = observed[2]?.find((intent) => intent.type === "vibrate");
    expect(vibration?.type === "vibrate" && Object.isFrozen(vibration.pattern)).toBe(true);
    expect(owner.finale).toBeNull();
  });

  it("routes a non-campaign completion directly without launching a finale", () => {
    const owner = state();
    const cinema = new SkipToCompletionCinema();
    const win = vi.fn();
    const runtime = createFinaleRuntime({
      runtime: owner, cinema, run: () => ({ mode: "endless", score: 0, runTime: 0 }),
      player: () => ({ x: 0, y: 0, vx: 0, vy: 0, onGround: true }), blade: () => ({}),
      intents: intents([]), prepareVictory: vi.fn(() => ({ isNew: false, earned: 0, coins: 0 })),
      win, formatTime: () => "0:00", viewport: { width: 1600, height: 900 },
      perfectColor: () => "#fff", reducedMotion: () => false, lowGraphics: () => false,
    });

    runtime.start();

    expect(win).toHaveBeenCalledWith(false);
    expect(cinema.started).toBe(false);
    expect(owner.finale).toBeNull();
  });
});
