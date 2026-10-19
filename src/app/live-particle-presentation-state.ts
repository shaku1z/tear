import type { ParticleSystem } from "../presentation/particles";
import { parseParticlePresentationCheckpoint, type ParticlePresentationCheckpoint, type ParticlePresentationPolicy } from "../tearbench/particle-presentation-checkpoint";

export interface LiveParticlePresentationState {
  capture(): ParticlePresentationCheckpoint;
  /** Accepts only detached, parsed candidate data. Does not emit or reset other owners. */
  restore(value: ParticlePresentationCheckpoint | undefined): void;
}

/** Retains the concrete world's FX owner/list and current user settings. */
export function createLiveParticlePresentationState(fx: ParticleSystem, policy: () => ParticlePresentationPolicy): LiveParticlePresentationState {
  return Object.freeze({
    capture: () => {
      const current = policy();
      const snapshot = parseParticlePresentationCheckpoint({ version: 1, list: fx.list, view: fx.view,
        replacementCursor: fx._replacementCursor, policy: { effects: { highBudget: current.effects.highBudget,
          lowBudget: current.effects.lowBudget, cullMargin: current.effects.cullMargin },
          lowGraphics: current.lowGraphics, reducedMotion: current.reducedMotion } });
      if (snapshot === undefined) throw new Error("particle capture is missing");
      return snapshot;
    },
    restore: (value: ParticlePresentationCheckpoint | undefined) => {
      // Clone before mutation. Prepared checkpoints are frozen data; installed
      // particles remain mutable for normal update and budget replacement.
      const list = value?.list.map((particle) => ({ ...particle })) ?? [];
      const view = value?.view === undefined || value.view === null ? null : { ...value.view };
      fx.list.length = 0;
      for (const particle of list) fx.list.push(particle);
      if (view === null) fx.view = null;
      else if (fx.view === null) fx.view = view;
      else Object.assign(fx.view, view);
      fx._replacementCursor = value?.replacementCursor ?? 0;
    },
  });
}
