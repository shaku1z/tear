/** Where the player was on a screen they left: the focused control and the scroll offset. */
export interface ScreenPlace {
  /** The focused control's index on that screen; -1 when nothing was focused. */
  readonly focus: number;
  readonly scroll: number;
}

/** A screen the player left, with where they were on it. */
export interface ScreenVisit<Screen extends string = string> extends ScreenPlace {
  readonly screen: Screen;
}

export interface ScreenHistory<Screen extends string = string> {
  /** The screen BACK returns to: the one the current screen was opened from, if any. */
  readonly backTarget: () => Screen | undefined;
  /**
   * Records a screen change and returns the visit to restore, if any. Going to a screen already
   * in the history returns there: the screens opened after it are dropped and its visit is
   * returned, so its focus and scroll come back. Going anywhere else records the screen left.
   * A root (the main menu, play) starts the history over.
   */
  readonly move: (from: ScreenVisit<Screen>, to: Screen) => ScreenVisit<Screen> | undefined;
}

/** The longest chain of screens remembered; a chain this deep only comes from a loop. */
const DEPTH = 24;

/**
 * The one record of how the player got to the current screen, so every screen's BACK returns
 * where they came from and every return lands on the control they left from.
 */
export function createScreenHistory<Screen extends string>(roots: readonly Screen[]): ScreenHistory<Screen> {
  let visits: ScreenVisit<Screen>[] = [];
  return Object.freeze({
    backTarget: () => visits.at(-1)?.screen,
    move(from: ScreenVisit<Screen>, to: Screen): ScreenVisit<Screen> | undefined {
      let at = visits.length - 1;
      while (at >= 0 && visits[at]?.screen !== to) at -= 1;
      const visit = at >= 0 ? visits[at] : undefined;
      if (roots.includes(to)) visits = [];
      else if (at >= 0) visits = visits.slice(0, at);
      else visits = [...visits, from].slice(-DEPTH);
      return visit;
    },
  });
}
