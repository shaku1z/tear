import { describe, expect, it } from "vitest";

import {
  DECLARED_ONE_FRAME_BOUNDARIES,
  evaluateTearStateValidity,
  forgeBladeAbilityState,
  forgeBossFrameState,
  forgeOneFrameBoundaryStates,
  forgeUiDeviceState,
  forgeWaveState,
  type TearSdlDocumentV1,
} from "../../src/tearbench";

const base: TearSdlDocumentV1 = {
  format: "tearsdl",
  schemaVersion: 1,
  id: "forge-base",
  stateClass: "surgical-valid",
  seed: "23",
  start: { mode: "endless", difficulty: "hard", weapon: "hammer", wave: 1 },
  state: {},
  constraints: { legalProgression: true },
};

describe("State Forge validity and exact factories", () => {
  it("keeps structural validity, reachability, and population plausibility independent", () => {
    const invalid = evaluateTearStateValidity({
      stateClass: "plausible-population",
      start: base.start,
      state: { playerHp: 120, playerMaxHp: 100, profileId: "hammer-control" },
      populationModel: { id: "consented-v2", consented: true, sampleCount: 4_000, acceptedProfileIds: ["sword-rush"] },
    });
    expect(invalid.structural.valid).toBe(false);
    expect(invalid.reachability.reachable).toBe(true);
    expect(invalid.plausibility).toMatchObject({ plausible: false, provisional: false, modelId: "consented-v2" });

    const adversarial = evaluateTearStateValidity({
      stateClass: "adversarial-impossible",
      start: base.start,
      state: { corruptionProfile: "nan-pressure" },
    });
    expect(adversarial.structural.valid).toBe(true);
    expect(adversarial.reachability.reachable).toBe(false);
  });

  it("authors exact wave, composition, boss attack, blade, ability, UI, and device state", () => {
    const wave = forgeWaveState(base, 99, [
      { kind: "armored", count: 4, hpScale: 3 },
      { kind: "warden", count: 1 },
    ]);
    expect(wave.start.wave).toBe(99);
    expect(wave.state?.enemyComposition).toHaveLength(2);

    const boss = forgeBossFrameState(wave, "warden", "enraged", "mortar", 37);
    expect(boss).toMatchObject({
      start: { boss: "warden", bossPhase: "enraged" },
      state: { boss: { attack: "mortar", frame: 37 } },
    });

    const blade = forgeBladeAbilityState(boss, { state: "returning", x: 400, y: 220 }, {
      slam: { active: false, cooldownTicks: 1 },
    });
    const ui = forgeUiDeviceState(blade, { screen: "paused", focusedId: "resume" }, {
      kind: "gamepad", width: 1280, height: 720,
    });
    expect(ui.state).toMatchObject({
      blade: { state: "returning" },
      abilities: { slam: { cooldownTicks: 1 } },
      ui: { focusedId: "resume" },
      device: { kind: "gamepad" },
    });
  });

  it("materializes every declared one-frame boundary as before/at/after states", () => {
    const states = DECLARED_ONE_FRAME_BOUNDARIES.flatMap((boundary) =>
      forgeOneFrameBoundaryStates(base, boundary));
    expect(states).toHaveLength(DECLARED_ONE_FRAME_BOUNDARIES.length * 3);
    expect(new Set(states.map((entry) => entry.id)).size).toBe(states.length);
    for (const state of states) expect(evaluateTearStateValidity({
      stateClass: state.stateClass,
      start: state.start,
      ...(state.state === undefined ? {} : { state: state.state }),
      ...(state.constraints === undefined ? {} : { constraints: state.constraints }),
    }).structural.valid).toBe(true);
  });
});
