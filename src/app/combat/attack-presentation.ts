import {
  AttackPresentationDirector,
  type AttackPresentationDirectorPorts,
} from "../../presentation/combat/attack-presentation-director";

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
}

/**
 * The attack presentation of a world. Live play and a replay's world each build theirs here, over their own
 * effects, so an attack looks the same in both.
 */
export function createAttackPresentation(options: AttackPresentationOptions): AttackPresentationDirector {
  const { effects, settings } = options;
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
  });
}
