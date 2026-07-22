import type { LegacyAppScreen } from "./legacy-state-controller";

export type ScreenRenderer = () => void;
export type ScreenRendererRegistry = Readonly<Record<LegacyAppScreen, ScreenRenderer>>;

const menuScreens: ReadonlySet<LegacyAppScreen> = new Set([
  "menu", "shop", "codex", "setup", "profile", "settings", "achievements",
  "leaderboards", "rename",
]);

const worldScreens: ReadonlySet<LegacyAppScreen> = new Set([
  "playing", "draft", "reserve", "tierup", "paused", "confirmquit", "gameover",
  "win", "continue", "pgmenu", "pglab",
]);

export function isMenuScreen(screen: LegacyAppScreen): boolean {
  return menuScreens.has(screen);
}

export function isWorldScreen(screen: LegacyAppScreen): boolean {
  return worldScreens.has(screen);
}

/** Single exhaustive dispatch point; individual screens only render and enqueue actions. */
export function renderRegisteredScreen(screen: LegacyAppScreen, registry: ScreenRendererRegistry): void {
  registry[screen]();
}
