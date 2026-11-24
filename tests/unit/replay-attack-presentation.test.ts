/**
 * A replay's world presents an attack as play does: its combat hands play's attack presentation
 * (src/app/combat/attack-presentation.ts) the cues play's does, so a hit, a meteor or a round leaves the same
 * marks in the replay's effects. Before, the replay's world had no attack presentation: a Hammer meteor left no
 * ground pulse and a Riftlock round no muzzle wedge.
 */
import { describe, expect, it, vi } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { EnvelopeSequencer } from "../../src/domain/envelopes";
import { createAttackPresentation } from "../../src/app/combat/attack-presentation";
import { createProductionCombatPhases } from "../../src/app/world/detached/combat-phases";
import { createProductionCombatSimulation } from "../../src/app/world/detached/combat-simulation";
import { createProductionReplayWorld } from "../../src/app/world/detached/world-factory";
import { riftlockRoundCue, worldImpactCue } from "../../src/gameplay/combat/attack-presentation-cue";
import { scenarioRunSeed } from "../../src/gameplay/run/run-start-choices";

const kinds = (list: readonly { type: string }[]) => list.map((particle) => particle.type);

describe("a replay's world presents an attack as play does", () => {
  it("a Hammer meteor leaves play's ground pulse", () => {
    const replay = createProductionReplayWorld({
      runSeed: scenarioRunSeed("replay-attack-presentation:meteor"),
      weaponId: "hammer",
      enemies: [{ id: "charger", x: 410, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 }],
    });
    const phases = createProductionCombatPhases(replay);
    Object.assign(replay.world.state.blade() as object, { vx: 1200, vy: 900, throwDmg: 80 });
    replay.effects.list.length = 0;
    phases.collision.lobExplode(410, CONFIG.world.groundY - CONFIG.enemy.h / 2);
    expect(kinds(replay.effects.list)).toContain("groundPulse");
  });

  it("a Riftlock round leaves play's muzzle wedge", () => {
    const sequence = new EnvelopeSequencer();
    const replay = createProductionReplayWorld({
      runSeed: scenarioRunSeed("replay-attack-presentation:round"),
      weaponId: "riftlock",
    });
    const core = createProductionCombatSimulation<Record<string, unknown>>(replay, { snapshot: (tick) => ({ tick }) });
    core.simulationRuntime.reset(0);
    replay.effects.list.length = 0;
    core.simulationRuntime.advanceOne([
      sequence.command(1, { type: "aim", turn: 0, magnitude: 1 } as const),
      sequence.command(1, { type: "weapon", intent: "primary", phase: "pressed" } as const),
    ]);
    expect(kinds(replay.effects.list)).toContain("muzzleWedge");
  });

  it("records a presented attack only while recording is on", () => {
    let recording = false;
    const effect = vi.fn();
    const presentation = createAttackPresentation({
      scope: () => "run",
      tick: () => 0,
      effects: { edgeTrace: vi.fn(), contactMark: vi.fn(), groundPulse: vi.fn(), muzzleWedge: vi.fn(), burst: vi.fn() },
      settings: { GFX: { low: false }, A11Y: { reducedMotion: false, highContrast: false }, THEME: { ink: "#000" } },
      record: { active: () => recording, effect },
    });
    const round = { x: 10, y: 20, vx: 900, vy: 0, damage: 1, attackId: 1, throwId: 0, remote: false };
    presentation.emit(riftlockRoundCue({ ...round, type: "razorRound", secondary: false }, CONFIG.proj.speed));
    expect(effect).not.toHaveBeenCalled();
    recording = true;
    presentation.emit(riftlockRoundCue({ ...round, attackId: 2, type: "razorRound", secondary: false }, 900));
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it("presents a world impact only for the Hammer's meteor and the Greatsword's wheel cut", () => {
    const blade = { attackId: 3, x: 100, y: 800, vx: 0, vy: 1200 };
    expect(worldImpactCue("hammer", "meteor", blade, 2000)?.variant).toBe("meteor");
    expect(worldImpactCue("greatsword", "wheelCut", blade, 2000)?.variant).toBe("wheelCut");
    expect(worldImpactCue("sword", "meteor", blade, 2000)).toBeNull();
    expect(worldImpactCue("hammer", undefined, blade, 2000)).toBeNull();
  });
});
