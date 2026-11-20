import type { ParticleSystem } from "../presentation/particles";
import {
  parseParticlePresentationCheckpoint,
  prepareParticlePresentationRestore,
  type ParticlePresentationCheckpoint,
  type ParticlePresentationPolicy,
  type PreparedParticlePresentationRestore,
} from "../gameplay/snapshot/particle-checkpoint";
import type { CosmeticEmissionRandom } from "../domain/cosmetic-emission-random";

export interface LiveParticlePresentationState {
  capture(): ParticlePresentationCheckpoint;
  prepare(
    value: ParticlePresentationCheckpoint | undefined,
    runSeed: number,
    tick: number,
  ): PreparedParticlePresentationRestore;
  /** Accepts only detached, parsed candidate data. Does not emit or reset other owners. */
  restore(value: PreparedParticlePresentationRestore): void;
}

/** Retains the concrete world's FX owner/list and current user settings. */
export function createLiveParticlePresentationState(
  fx: ParticleSystem,
  policy: () => ParticlePresentationPolicy,
  entropy: CosmeticEmissionRandom,
): LiveParticlePresentationState {
  return Object.freeze({
    capture: () => {
      const current = policy();
      const snapshot = parseParticlePresentationCheckpoint({
        version: 2,
        entropy: entropy.snapshot(),
        list: fx.list,
        view: fx.view,
        replacementCursor: fx._replacementCursor,
        policy: {
          effects: {
            highBudget: current.effects.highBudget,
            lowBudget: current.effects.lowBudget,
            cullMargin: current.effects.cullMargin,
          },
          lowGraphics: current.lowGraphics,
          reducedMotion: current.reducedMotion,
        },
      });
      if (snapshot === undefined) throw new Error("particle capture is missing");
      return snapshot;
    },
    prepare: prepareParticlePresentationRestore,
    restore: (prepared: PreparedParticlePresentationRestore) => {
      const value = prepared.presentation;
      // Clone before mutation. Prepared checkpoints are frozen data; installed
      // particles remain mutable for normal update and budget replacement.
      const list = value?.list.map((particle) => ({ ...particle })) ?? [];
      const view = value?.view === undefined || value.view === null ? null : { ...value.view };
      entropy.restore(prepared.entropy);
      fx.list.length = 0;
      for (const particle of list) fx.list.push(particle);
      if (view === null) fx.view = null;
      else if (fx.view === null) fx.view = view;
      else Object.assign(fx.view, view);
      fx._replacementCursor = value?.replacementCursor ?? 0;
    },
  });
}
