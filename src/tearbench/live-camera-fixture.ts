/** Bounded Class A fixture; does not constrain production camera or settings. */
export function createLiveCameraEffectsFixture(
  apply: (effects: Readonly<{ zoom: number; shake: number }>) => void,
): (effects: Readonly<{ zoom: number; shake: number }>) => void {
  return (effects) => {
    if (!Number.isFinite(effects.zoom) || effects.zoom < 1 || effects.zoom > 1.14
      || !Number.isFinite(effects.shake) || effects.shake < 0 || effects.shake > 33) {
      throw new RangeError("Camera fixture exceeds audited Verdant envelope");
    }
    apply(effects);
  };
}
