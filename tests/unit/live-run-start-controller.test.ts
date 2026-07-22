import { describe, expect, it } from "vitest";
import { LiveRunStartController } from "../../src/gameplay/run/live-run-start-controller";

describe("LiveRunStartController", () => {
  it("owns the ordered replacement-to-play transaction and deterministic identities", () => {
    const events: string[] = [];
    let installedSeed = 0;
    const controller = new LiveRunStartController({
      replaceActiveRun: () => events.push("replace"),
      initializeWorld: () => {
        events.push("world");
        return {
          weaponId: "blade",
          mods: {},
          scaling: { coin: 1, score: 1, enemyHp: 1, enemyCount: 1 },
          achievementSnapshot: [],
        };
      },
      resetAuthoritativeClocks: () => events.push("clocks"),
      finishWorldReset: () => events.push("finish-world"),
      createRunSeed: () => 12345,
      resetRunRandom: () => events.push("random"),
      installSession: (session) => { installedSeed = session.runSeed; events.push("install"); },
      startLifecycle: (id) => events.push(`lifecycle:${id}`),
      exposeDebugState: () => events.push("debug"),
      updateProgressionTracking: () => events.push("progression"),
      startRecording: () => events.push("recording"),
      configureMode: () => events.push("mode"),
      applyMetaProgression: () => events.push("meta"),
      activateOpeningContent: () => events.push("content"),
      enterPlayingState: () => events.push("playing"),
      beginMusic: () => events.push("music"),
      requestPointerLock: () => events.push("lock"),
    });

    const session = controller.start("endless", "normal");
    expect(installedSeed).toBe(12345);
    expect(session.voidSeed).toBeGreaterThan(0);
    expect(events).toEqual([
      "replace", "world", "clocks", "random", "install", "finish-world", "lifecycle:run-9ix", "debug",
      "progression", "recording", "mode", "meta", "content", "playing", "music", "lock",
    ]);
  });
});
