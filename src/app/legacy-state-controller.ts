export type LegacyAppScreen =
  | "menu" | "setup" | "playing" | "paused" | "draft" | "reserve" | "tierup"
  | "settings" | "continue" | "gameover" | "win" | "replay" | "confirmquit"
  | "shop" | "codex" | "profile" | "achievements" | "leaderboards" | "rename"
  | "pgmenu" | "pglab";

export interface LegacyAppSnapshot {
  readonly screen: LegacyAppScreen;
  readonly previous: LegacyAppScreen | null;
  readonly runId: string | null;
  readonly settingsReturn: LegacyAppScreen;
  readonly replayReturn: LegacyAppScreen;
  readonly revision: number;
}

export interface LegacyTransitionContext {
  readonly runId?: string;
  readonly returnTo?: LegacyAppScreen;
}

export const LEGACY_APP_SCREENS = Object.freeze([
  "menu", "setup", "playing", "paused", "draft", "reserve", "tierup", "settings", "continue",
  "gameover", "win", "replay", "confirmquit", "shop", "codex", "profile", "achievements",
  "leaderboards", "rename", "pgmenu", "pglab",
] as const satisfies readonly LegacyAppScreen[]);

export const LEGAL_LEGACY_TRANSITIONS: Readonly<Record<LegacyAppScreen, readonly LegacyAppScreen[]>> = Object.freeze({
  menu: ["setup", "playing", "profile", "shop", "achievements", "leaderboards", "codex", "settings", "rename", "replay"],
  setup: ["menu", "playing", "rename"],
  playing: ["menu", "paused", "draft", "reserve", "tierup", "continue", "gameover", "win", "pgmenu", "pglab", "rename"],
  paused: ["playing", "settings", "confirmquit", "rename"],
  draft: ["playing", "reserve", "rename"],
  reserve: ["playing", "rename"],
  tierup: ["playing", "rename"],
  settings: ["menu", "paused", "codex", "rename"],
  continue: ["playing", "gameover", "rename"],
  gameover: ["menu", "playing", "replay", "rename"],
  win: ["menu", "playing", "replay", "rename"],
  replay: ["menu", "profile", "leaderboards", "gameover", "win", "rename"],
  confirmquit: ["paused", "menu", "rename"],
  shop: ["menu", "rename"],
  codex: ["menu", "rename"],
  profile: ["menu", "setup", "achievements", "replay", "rename"],
  achievements: ["menu", "rename"],
  leaderboards: ["menu", "profile", "replay", "rename"],
  rename: LEGACY_APP_SCREENS.filter((screen) => screen !== "rename"),
  pgmenu: ["playing", "pglab", "rename"],
  pglab: ["playing", "pgmenu", "rename"],
});

export class IllegalLegacyAppTransitionError extends Error {
  constructor(readonly from: LegacyAppScreen, readonly to: LegacyAppScreen) {
    super(`Illegal legacy application transition: ${from} -> ${to}`);
    this.name = "IllegalLegacyAppTransitionError";
  }
}

function ensureScreen(value: LegacyAppScreen, label: string): LegacyAppScreen {
  if (!LEGACY_APP_SCREENS.includes(value)) throw new TypeError(`${label} is not a recognized application screen`);
  return value;
}

/** Authoritative owner for the classic shell while its render functions remain string-oriented. */
export class LegacyAppStateController {
  #snapshot: LegacyAppSnapshot = Object.freeze({
    screen: "menu",
    previous: null,
    runId: null,
    settingsReturn: "menu",
    replayReturn: "menu",
    revision: 0,
  });

  get screen(): LegacyAppScreen { return this.#snapshot.screen; }
  get settingsReturn(): LegacyAppScreen { return this.#snapshot.settingsReturn; }
  get replayReturn(): LegacyAppScreen { return this.#snapshot.replayReturn; }
  snapshot(): LegacyAppSnapshot { return this.#snapshot; }

  transition(to: LegacyAppScreen, context: LegacyTransitionContext = {}): LegacyAppScreen {
    ensureScreen(to, "to");
    const current = this.#snapshot;
    if (to === current.screen) return current.screen;
    if (!LEGAL_LEGACY_TRANSITIONS[current.screen].includes(to)) {
      throw new IllegalLegacyAppTransitionError(current.screen, to);
    }
    let settingsReturn = current.settingsReturn;
    let replayReturn = current.replayReturn;
    if (to === "settings") {
      const requested = context.returnTo;
      settingsReturn = requested === undefined
        ? (current.screen === "rename" ? current.settingsReturn : current.screen)
        : ensureScreen(requested, "settings return");
    } else if (current.screen === "settings" && to === settingsReturn) {
      settingsReturn = "menu";
    }
    if (to === "replay") replayReturn = ensureScreen(context.returnTo ?? current.screen, "replay return");
    else if (current.screen === "replay" && to !== "rename") {
      if (to !== replayReturn) throw new IllegalLegacyAppTransitionError(current.screen, to);
      replayReturn = "menu";
    }
    const runId = context.runId ?? current.runId;
    this.#snapshot = Object.freeze({
      screen: to,
      previous: current.screen,
      runId,
      settingsReturn,
      replayReturn,
      revision: current.revision + 1,
    });
    return to;
  }

  canTransition(to: LegacyAppScreen): boolean {
    return to === this.screen || LEGAL_LEGACY_TRANSITIONS[this.screen].includes(to);
  }
}
