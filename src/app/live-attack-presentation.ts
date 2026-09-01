import type { AttackPresentationCue } from "../gameplay/combat/attack-presentation-cue";
import { AttackPresentationDirector } from "../presentation/combat/attack-presentation-director";
import { encodeAttackPresentationEffect } from "../presentation/combat/attack-presentation-effect-codec";

export interface LiveAttackPresentationOptions {
  readonly scope: () => unknown;
  readonly tick: () => number;
  readonly lowGraphics: () => boolean;
  readonly reducedMotion: () => boolean;
  readonly highContrast: () => boolean;
  readonly contrastColor: () => string;
  readonly edgeTrace: (x1: number, y1: number, x2: number, y2: number, thickness: number, life: number, color: string) => void;
  readonly contactMark: (x: number, y: number, tangentX: number, tangentY: number, length: number, thickness: number, life: number, color: string) => void;
  readonly groundPulse: (x: number, y: number, normalX: number, normalY: number, halfWidth: number, life: number, color: string) => void;
  readonly muzzleWedge: (x: number, y: number, directionX: number, directionY: number, length: number, halfWidth: number, life: number, color: string) => void;
  readonly burst: (x: number, y: number, dx: number, dy: number, count: number, color: string) => void;
  readonly shouldRecord: () => boolean;
  readonly recordEffect: (effect: string, x: number, y: number) => void;
}

/** Live presentation composition plus its versioned, cosmetic replay projection. */
export function createLiveAttackPresentation(options: LiveAttackPresentationOptions): AttackPresentationDirector {
  return new AttackPresentationDirector({ ...options,
    record: (cue: AttackPresentationCue) => {
      if (options.shouldRecord()) options.recordEffect(encodeAttackPresentationEffect(cue), cue.x, cue.y);
    } });
}
