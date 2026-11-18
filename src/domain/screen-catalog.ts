/**
 * The one authoritative catalog of application screens.
 *
 * Every screen type, list and guard in the game is derived from this table:
 * the application screen type and its legal transitions, the release or
 * engineering channel (and so the screen's surface id), what the frame draws
 * under it, its touch density, and the confirm and pointer settle rules for
 * screens that interrupt play. Adding a screen is one entry here; the compiler
 * then asks for its renderer.
 *
 * It lives in the domain layer so the application shell, presentation, Ghost
 * replay admission and the surface policy can all read it.
 */

/** Release screens ship to players; engineering screens exist only where the engineering surfaces are admitted. */
export type ScreenChannel = "release" | "engineering";

/**
 * What the frame draws under the screen: the menu backdrop (the attract
 * scene, with the menu entrance ease), the live world, or neither.
 */
export type ScreenFrame = "menu" | "world" | "standalone";

/**
 * Touch density: "compact" screens take the phone floors at every touch
 * density, "phone" screens only at phone density, "touch" screens keep the
 * plain touch profile (see docs/DESIGN_SYSTEM.md).
 */
export type ScreenDensity = "compact" | "phone" | "touch";

export interface ScreenFacts<Screen extends string = string> {
  readonly channel: ScreenChannel;
  readonly frame: ScreenFrame;
  readonly density: ScreenDensity;
  /**
   * The screen interrupts play: keyboard, controller and number-key confirm
   * act only once confirm was released since it opened and the settle window
   * has passed.
   */
  readonly confirmArming?: true;
  /** A reward or results screen: a click aimed at the arena must not choose, so pointers also wait for the settle window. */
  readonly pointerSettle?: true;
  /** Drawn on the paper sheet, so the controller toast sits in the sheet footer. */
  readonly sheet?: true;
  /** The shared scroll resets when the screen is entered. */
  readonly resetScrollOnEnter?: true;
  /** The screens this one may transition to. "every-other-screen" is the rename overlay's return edge. */
  readonly transitions: readonly Screen[] | "every-other-screen";
}

const CATALOG = {
  menu: {
    channel: "release",
    frame: "menu",
    density: "compact",
    transitions: [
      "setup",
      "playing",
      "profile",
      "shop",
      "achievements",
      "leaderboards",
      "codex",
      "settings",
      "music",
      "rename",
      "replay",
    ],
  },
  setup: {
    channel: "release",
    frame: "menu",
    density: "compact",
    sheet: true,
    transitions: ["menu", "playing", "rename"],
  },
  playing: {
    channel: "release",
    frame: "world",
    density: "compact",
    transitions: [
      "menu",
      "paused",
      "draft",
      "reserve",
      "tierup",
      "continue",
      "gameover",
      "win",
      "pgmenu",
      "pglab",
      "rename",
    ],
  },
  paused: {
    channel: "release",
    frame: "world",
    density: "compact",
    confirmArming: true,
    // A paused Playground opens its menu on the tab left open (ABILITIES is screen pglab):
    // the route for touch and controller players.
    transitions: ["playing", "pgmenu", "pglab", "settings", "confirmquit", "rename"],
  },
  draft: {
    channel: "release",
    frame: "world",
    density: "compact",
    confirmArming: true,
    pointerSettle: true,
    resetScrollOnEnter: true,
    transitions: ["playing", "reserve", "rename"],
  },
  reserve: {
    channel: "release",
    frame: "world",
    density: "compact",
    confirmArming: true,
    pointerSettle: true,
    resetScrollOnEnter: true,
    transitions: ["playing", "rename"],
  },
  tierup: {
    channel: "release",
    frame: "world",
    density: "compact",
    confirmArming: true,
    pointerSettle: true,
    resetScrollOnEnter: true,
    transitions: ["playing", "rename"],
  },
  settings: {
    channel: "release",
    frame: "menu",
    density: "compact",
    sheet: true,
    transitions: ["menu", "paused", "codex", "rename"],
  },
  continue: {
    channel: "release",
    frame: "world",
    density: "compact",
    confirmArming: true,
    pointerSettle: true,
    transitions: ["playing", "gameover", "rename"],
  },
  gameover: {
    channel: "release",
    frame: "world",
    density: "compact",
    confirmArming: true,
    pointerSettle: true,
    transitions: ["menu", "playing", "replay", "rename"],
  },
  win: {
    channel: "release",
    frame: "world",
    density: "compact",
    confirmArming: true,
    pointerSettle: true,
    transitions: ["menu", "playing", "replay", "rename"],
  },
  replay: {
    channel: "release",
    frame: "standalone",
    density: "touch",
    transitions: ["menu", "profile", "leaderboards", "gameover", "win", "playing", "rename"],
  },
  confirmquit: {
    channel: "release",
    frame: "world",
    density: "compact",
    confirmArming: true,
    transitions: ["paused", "menu", "rename"],
  },
  shop: {
    channel: "release",
    frame: "menu",
    density: "phone",
    sheet: true,
    resetScrollOnEnter: true,
    transitions: ["menu", "rename"],
  },
  codex: { channel: "release", frame: "menu", density: "phone", sheet: true, transitions: ["menu", "rename"] },
  profile: {
    channel: "release",
    frame: "menu",
    density: "phone",
    sheet: true,
    transitions: ["menu", "setup", "achievements", "replay", "rename"],
  },
  achievements: { channel: "release", frame: "menu", density: "phone", sheet: true, transitions: ["menu", "rename"] },
  leaderboards: {
    channel: "release",
    frame: "menu",
    density: "phone",
    sheet: true,
    transitions: ["menu", "profile", "replay", "rename"],
  },
  music: { channel: "release", frame: "menu", density: "phone", sheet: true, transitions: ["menu", "rename"] },
  rename: { channel: "release", frame: "menu", density: "touch", transitions: "every-other-screen" },
  pgmenu: { channel: "release", frame: "world", density: "phone", transitions: ["playing", "pglab", "rename"] },
  pglab: { channel: "release", frame: "world", density: "phone", transitions: ["playing", "pgmenu", "rename"] },
} as const;

/** Every application screen. */
export type AppScreen = keyof typeof CATALOG;

/** The catalog, checked: every transition names a catalogued screen. */
export const SCREEN_CATALOG: Readonly<Record<AppScreen, ScreenFacts<AppScreen>>> = Object.freeze(CATALOG);

/** Every application screen, in catalog order. */
export const APP_SCREENS: readonly AppScreen[] = Object.freeze(Object.keys(SCREEN_CATALOG) as AppScreen[]);

export function isAppScreen(value: string): value is AppScreen {
  return Object.hasOwn(SCREEN_CATALOG, value);
}

/** The catalogued facts of a screen, or undefined for a name that is not an application screen. */
export function screenFacts(screen: string): ScreenFacts<AppScreen> | undefined {
  return isAppScreen(screen) ? SCREEN_CATALOG[screen] : undefined;
}

/** The legal transitions out of each screen. */
export const LEGAL_TRANSITIONS: Readonly<Record<AppScreen, readonly AppScreen[]>> = Object.freeze(
  Object.fromEntries(
    APP_SCREENS.map((screen) => {
      const { transitions } = SCREEN_CATALOG[screen];
      return [
        screen,
        Object.freeze(
          transitions === "every-other-screen" ? APP_SCREENS.filter((other) => other !== screen) : [...transitions],
        ),
      ];
    }),
  ) as Record<AppScreen, readonly AppScreen[]>,
);

/** True for a screen drawn over the menu backdrop. */
export const isMenuScreen = (screen: string): boolean => screenFacts(screen)?.frame === "menu";

/** True for a screen drawn over the live world. */
export const isWorldScreen = (screen: string): boolean => screenFacts(screen)?.frame === "world";

/** The touch density of a screen; an unknown name keeps the plain touch profile. */
export const screenDensity = (screen: string): ScreenDensity => screenFacts(screen)?.density ?? "touch";

export const screenNeedsConfirmArming = (screen: string): boolean => screenFacts(screen)?.confirmArming === true;

export const screenNeedsPointerSettle = (screen: string): boolean => screenFacts(screen)?.pointerSettle === true;

export const isSheetScreen = (screen: string): boolean => screenFacts(screen)?.sheet === true;

export const screenResetsScrollOnEnter = (screen: string): boolean => screenFacts(screen)?.resetScrollOnEnter === true;
