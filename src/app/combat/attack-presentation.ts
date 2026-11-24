import type { AttackPresentationCue } from "../../gameplay/combat/attack-presentation-cue";
import {
  AttackPresentationDirector,
  type AttackPresentationDirectorPorts,
} from "../../presentation/combat/attack-presentation-director";
import { encodeAttackPresentationEffect } from "../../presentation/combat/attack-presentation-effect-codec";

/** The effects an attack is presented with: a world's particle system. */
export type AttackPresentationEffects = Pick<
  AttackPresentationDirectorPorts,
  "edgeTrace" | "contactMark" | "groundPulse" | "muzzleWedge" | "burst"
>;

/** The display settings an attack's presentation follows. */
export interface AttackPresentationSettings {
  readonly GFX: Readonly<{ low: boolean }>;
  readonly A11Y: Readonly<{ reducedMotion: boolean; highContrast: boolean }>;
  readonly THEME: Readonly<{ ink: string }>;
}

export interface AttackPresentationOptions {
  /** A change of scope (a new blade or replay) clears the director's duplicate check. */
  readonly scope: () => unknown;
  /** The simulation tick, for the duplicate check. */
  readonly tick: () => number;
  readonly effects: AttackPresentationEffects;
  readonly settings: AttackPresentationSettings;
  /** Records each presented attack as a cosmetic effect, while `active` says so. */
  readonly record?: Readonly<{ active: () => boolean; effect: (effect: string, x: number, y: number) => void }>;
}

/**
 * The attack presentation of a world. Live play, a replay's world and the older Ghost 2 playback each build
 * theirs here, over their own effects, so an attack looks the same in all three.
 */
export function createAttackPresentation(options: AttackPresentationOptions): AttackPresentationDirector {
  const { effects, settings, record } = options;
  return new AttackPresentationDirector({
    scope: options.scope,
    tick: options.tick,
    lowGraphics: () => settings.GFX.low,
    reducedMotion: () => settings.A11Y.reducedMotion,
    highContrast: () => settings.A11Y.highContrast,
    contrastColor: () => settings.THEME.ink,
    edgeTrace: (...args) => {
      effects.edgeTrace(...args);
    },
    contactMark: (...args) => {
      effects.contactMark(...args);
    },
    groundPulse: (...args) => {
      effects.groundPulse(...args);
    },
    muzzleWedge: (...args) => {
      effects.muzzleWedge(...args);
    },
    burst: (...args) => {
      effects.burst(...args);
    },
    ...(record === undefined
      ? {}
      : {
          record: (cue: AttackPresentationCue) => {
            if (record.active()) record.effect(encodeAttackPresentationEffect(cue), cue.x, cue.y);
          },
        }),
  });
}
