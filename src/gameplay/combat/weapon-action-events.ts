import type { BladeWeaponEvent } from "../entities/blade-contracts";
import { bindRunDnaShot, runDnaObserver } from "../runtime/run-dna-observer";
import { riftlockRoundCue, slingReleaseCue, type AttackPresentationCue } from "./attack-presentation-cue";

/** The fields a Riftlock round is given when it is fired. */
export interface WeaponRound {
  setFamily(family: string): unknown;
  playerOwned: boolean;
  weaponId: string;
  attackId: number;
  throwId: number;
  remote: boolean;
  secondary: boolean;
  kind: string;
  r: number;
  life: number;
  dmg: number;
  tint: string;
  unparryable: boolean;
  counterplay: string;
}

/** The tuning weapon actions read. */
export interface WeaponActionTuning {
  readonly razorRadius: number;
  readonly razorLife: number;
  readonly maxReleaseSpeed: number;
  readonly projectileSpeed: number;
  readonly perfectColor: string;
}

/** The weapon-action tuning of a game configuration. */
export function weaponActionTuning(
  config: Readonly<{
    weapons: Readonly<{
      riftlock: Readonly<{ razorRadius: number; razorLife: number }>;
      chainblade: Readonly<{ maxReleaseSpeed: number }>;
    }>;
    proj: Readonly<{ speed: number }>;
    colors: Readonly<{ perfect: string }>;
  }>,
): WeaponActionTuning {
  return {
    razorRadius: config.weapons.riftlock.razorRadius,
    razorLife: config.weapons.riftlock.razorLife,
    maxReleaseSpeed: config.weapons.chainblade.maxReleaseSpeed,
    projectileSpeed: config.proj.speed,
    perfectColor: config.colors.perfect,
  };
}

export interface WeaponActionPorts {
  readonly blade: () => object;
  readonly tuning: () => WeaponActionTuning;
  readonly createRound: (x: number, y: number, vx: number, vy: number) => WeaponRound;
  readonly addRound: (round: WeaponRound) => void;
  readonly weaponEffect: (weaponId: "chainblade", effect: "slingRelease") => void;
  readonly presentAttack: (cue: AttackPresentationCue) => void;
  readonly log: (type: BladeWeaponEvent["type"], detail: Readonly<Record<string, unknown>>) => void;
}

/**
 * Applies the events a blade's weapon actions raised this tick: the Chainblade's sling release and Riftlock
 * rounds. Play and a replay's world both apply them here, so a round is the same projectile and every action
 * is presented the same way in both.
 */
export function applyWeaponActionEvents(events: readonly BladeWeaponEvent[], ports: WeaponActionPorts): void {
  for (const event of events) {
    const tuning = ports.tuning();
    if (event.type === "slingRelease") {
      ports.weaponEffect("chainblade", "slingRelease");
      ports.presentAttack(slingReleaseCue(event, tuning.maxReleaseSpeed));
      ports.log(event.type, { attackId: event.attackId, throwId: event.throwId });
      continue;
    }
    const blade = ports.blade();
    const round = ports.createRound(event.x, event.y, event.vx, event.vy);
    round.setFamily("weaponProjectile");
    round.playerOwned = true;
    round.weaponId = "riftlock";
    bindRunDnaShot(round, blade, event.attackId, event.secondary, event.throwId);
    if (!event.secondary) runDnaObserver(blade)?.end(`shot:${String(event.attackId)}`);
    round.attackId = event.attackId;
    round.throwId = event.throwId;
    round.remote = event.remote;
    round.secondary = event.secondary;
    round.kind = "razor";
    round.r = tuning.razorRadius;
    round.life = tuning.razorLife;
    round.dmg = event.damage;
    round.tint = tuning.perfectColor;
    round.unparryable = true;
    round.counterplay = "weapon";
    ports.addRound(round);
    ports.presentAttack(riftlockRoundCue(event, tuning.projectileSpeed));
    ports.log(event.type, {
      attackId: event.attackId,
      throwId: event.throwId,
      remote: event.remote,
      secondary: event.secondary,
    });
  }
}
