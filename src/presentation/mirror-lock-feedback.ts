/** Simulation-invoked feedback shared by Canvas and detached worlds; no drawing. */
export function createMirrorLockFeedback(
  effects: { burst(x: number, y: number, dx: number, dy: number, count: number, color: string): void },
  random: () => number,
) {
  return (x: number, y: number, color: string): void => {
    effects.burst(
      x + (random() * 2 - 1) * 7,
      y + (random() * 2 - 1) * 7,
      random() * 2 - 1,
      random() * 2 - 1 - 0.3,
      3,
      random() < 0.5 ? "#ffffff" : color,
    );
  };
}
