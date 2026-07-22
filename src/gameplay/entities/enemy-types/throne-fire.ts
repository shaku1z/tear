import type { ArenaZone, EnemyDependencies } from "../enemy-contracts";

export function createThroneFireRuntime(dependencies: EnemyDependencies) {
  const { CONFIG, SFX, clamp } = dependencies;
  // THRONE FIRE is a single deterministic sequencer shared by Aldric and the Source's
    // copied ground cycle. Pattern A (even columns) is always the documented opener:
    // 2.2s stable -> 0.8s warning for B -> atomic B commit, then the inverse.
    interface ThroneFireOwner {
      zones: ArenaZone[];
      fireZones: ArenaZone[];
      seams?: ArenaZone[];
      firePattern: number;
      fireState: string;
      fireClock: number;
      fireWarnStep: number;
      zoneCycleT: number;
    }

    function syncThroneFire(owner: ThroneFireOwner) {
      const seams = owner.seams ?? [];
      owner.zones = owner.fireZones.concat(seams);
    }
    function applyThroneFire(owner: ThroneFireOwner) {
      const warning = owner.fireState === "warning";
      const warnDur = Math.max(0.001, CONFIG.aldric.fireWarn);
      const warnK = warning ? clamp(1 - owner.fireClock / warnDur, 0, 1) : 0;
      for (const z of owner.fireZones) {
        z.on = z.patternIndex === owner.firePattern;
        z.nextOn = z.patternIndex === (owner.firePattern ^ 1);
        z.warn = warning && z.nextOn;
        z.warnK = z.warn ? warnK : 0;
      }
      owner.zoneCycleT = owner.fireClock;   // legacy/debug clock now mirrors the explicit state
      syncThroneFire(owner);
    }
    function playThroneFireWarning(owner: ThroneFireOwner) {
      if (owner.fireState !== "warning") return;
      const k = clamp(1 - owner.fireClock / Math.max(0.001, CONFIG.aldric.fireWarn), 0, 1);
      const thresholds = [0, 0.42, 0.78];
      while (owner.fireWarnStep < 2 && k + 1e-6 >= (thresholds[owner.fireWarnStep + 1] ?? Infinity)) {
        owner.fireWarnStep++;
        if (SFX.aldricFireWarn) SFX.aldricFireWarn(owner.fireWarnStep);
      }
    }
    function startThroneFire(owner: ThroneFireOwner, preservePattern: boolean) {
      const C = CONFIG.aldric, colW = CONFIG.view.w / C.fireCols;
      if (!preservePattern || !Number.isInteger(owner.firePattern)) owner.firePattern = 0;
      owner.firePattern &= 1;
      owner.fireState = "stable";
      owner.fireClock = Math.max(0.001, C.fireCycle - C.fireWarn);
      owner.fireWarnStep = -1;
      owner.fireZones = [];
      for (let i = 0; i < C.fireCols; i++) owner.fireZones.push({
        kind: "fire", x: (i + 0.5) * colW, w: colW, patternIndex: i & 1,
        on: false, nextOn: false, warn: false, warnK: 0,
        dmg: CONFIG.warden.zoneTick, tickCd: CONFIG.warden.zoneTickCd,
      });
      applyThroneFire(owner);
    }
    function clearThroneFire(owner: ThroneFireOwner, preservePattern: boolean) {
      owner.fireZones = [];
      owner.fireState = "idle"; owner.fireClock = 0; owner.zoneCycleT = 0; owner.fireWarnStep = -1;
      if (!preservePattern) owner.firePattern = 0;
      syncThroneFire(owner);
    }
    function tickThroneFire(owner: ThroneFireOwner, dt: number) {
      if (!owner.fireZones.length || owner.fireState === "idle") return;
      const C = CONFIG.aldric, stableDur = Math.max(0.001, C.fireCycle - C.fireWarn), warnDur = Math.max(0.001, C.fireWarn);
      let remaining = Math.max(0, dt), guard = 0;
      while (remaining > 0 && guard++ < 8) {
        const slice = Math.min(remaining, Math.max(0, owner.fireClock));
        owner.fireClock -= slice; remaining -= slice;
        if (owner.fireState === "warning") playThroneFireWarning(owner);
        if (owner.fireClock > 1e-8) break;
        if (owner.fireState === "stable") {
          owner.fireState = "warning"; owner.fireClock = warnDur; owner.fireWarnStep = -1;
          playThroneFireWarning(owner);
        } else {
          owner.firePattern ^= 1; owner.fireState = "stable"; owner.fireClock = stableDur; owner.fireWarnStep = -1;
          if (SFX.aldricIgnite) SFX.aldricIgnite();
        }
        applyThroneFire(owner);
      }
      applyThroneFire(owner);
    }

  return Object.freeze({ applyThroneFire, clearThroneFire, startThroneFire, tickThroneFire });
}

export type ThroneFireRuntime = ReturnType<typeof createThroneFireRuntime>;
