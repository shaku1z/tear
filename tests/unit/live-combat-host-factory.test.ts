import { describe, expect, it } from "vitest";

import type { CombatEntityRuntimeHooks } from "../../src/gameplay/combat/combat-entity-runtime";
import type { LiveCollisionPhaseHost } from "../../src/gameplay/combat/live-collision-phase";
import type { LiveKillHost } from "../../src/gameplay/combat/live-kill-runtime";
import type { LiveOpeningPhaseHost } from "../../src/gameplay/combat/live-opening-phase";
import { createLiveCombatHost } from "../../src/app/live-combat-host-factory";
import type { LiveFrameRuntimeOptions } from "../../src/app/live-frame-runtime";
import type { RuntimeFrameCoordinatorOptions } from "../../src/app/runtime-frame-coordinator";
import type { RuntimeFrameDriver } from "../../src/app/runtime-frame-driver";

describe("live combat host factory", () => {
  it("wraps the portable combat core and starts only one browser frame loop", () => {
    let starts = 0;
    const host = createLiveCombatHost<{ readonly tick: number }>({
      frameDriver: { start: () => { starts += 1; } } as unknown as RuntimeFrameDriver,
      combatEntities: {} as CombatEntityRuntimeHooks,
      kill: {} as LiveKillHost,
      createCombat: () => ({
        opening: {} as LiveOpeningPhaseHost,
        collision: {} as LiveCollisionPhaseHost,
        advanceClock: () => undefined,
        captureProtection: () => undefined,
        applyProtection: () => undefined,
      }),
      authoritative: {
        actionPort: { apply: () => undefined },
        snapshot: (tick) => Object.freeze({ tick }),
      },
      createFrame: () => ({} as LiveFrameRuntimeOptions),
      createCoordinator: () => ({} as RuntimeFrameCoordinatorOptions),
    });

    expect(host.simulation).toBe(host.simulationRuntime.scheduler);
    expect(host.authoritativeInput).toBe(host.simulationRuntime.input);
    expect(host.authoritativeStep).toBe(host.simulationRuntime.authoritativeStep);
    expect(host.combatEntityRuntime).toBeTruthy();
    expect(host.combatRuntime).toBeTruthy();
    expect(host.killRuntime).toBeTruthy();

    host.startFrameLoop();
    host.startFrameLoop();
    expect(starts).toBe(1);
  });
});
