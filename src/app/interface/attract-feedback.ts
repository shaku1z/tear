import { createParticleSystem } from "../../presentation/particles";
import { createPlayer, type PlayerDependencies } from "../../gameplay/entities/player";

/** The decorative menu owns its sink and real Player closure independently of live FX. */
export function createLiveAttractFeedback(options: Omit<PlayerDependencies, "FX"> & Readonly<{
  random: () => number;
  reducedMotion: () => boolean;
}>) {
  const FX = createParticleSystem({ effects: options.CONFIG.effects, lowGraphics: () => options.GFX.low,
    reducedMotion: options.reducedMotion, random: options.random });
  return Object.freeze({ FX, Player: createPlayer({ ...options, FX }) });
}
