export type NavigationDirection = "left" | "right" | "up" | "down";

export interface FocusableRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly enabled?: boolean;
}

export function enabledButtonIndexes(buttons: readonly FocusableRect[]): readonly number[] {
  return buttons.flatMap((button, index) => button.enabled === false ? [] : [index]);
}

/**
 * Resolves directional focus using geometry instead of declaration order.
 * The secondary-axis penalty keeps navigation within a visual row or column
 * while still allowing movement through irregular card grids.
 */
export function findDirectionalFocus(
  buttons: readonly FocusableRect[],
  enabled: readonly number[],
  currentIndex: number,
  direction: NavigationDirection,
): number | null {
  const current = buttons[currentIndex];
  if (current === undefined) return null;

  const currentX = current.x + current.w / 2;
  const currentY = current.y + current.h / 2;
  let bestIndex: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const index of enabled) {
    if (index === currentIndex) continue;
    const candidate = buttons[index];
    if (candidate === undefined || candidate.enabled === false) continue;
    const dx = candidate.x + candidate.w / 2 - currentX;
    const dy = candidate.y + candidate.h / 2 - currentY;
    let primary: number;
    let secondary: number;

    switch (direction) {
      case "left":
        if (dx >= -4) continue;
        primary = -dx;
        secondary = Math.abs(dy);
        break;
      case "right":
        if (dx <= 4) continue;
        primary = dx;
        secondary = Math.abs(dy);
        break;
      case "up":
        if (dy >= -4) continue;
        primary = -dy;
        secondary = Math.abs(dx);
        break;
      case "down":
        if (dy <= 4) continue;
        primary = dy;
        secondary = Math.abs(dx);
        break;
    }

    const score = primary + secondary * 2.2;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}
