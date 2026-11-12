import type { AppScreen } from "./app-state-controller";

export type ScreenRenderer = () => void;
export type ScreenRendererRegistry = Readonly<Record<AppScreen, ScreenRenderer>>;

const menuScreens: ReadonlySet<AppScreen> = new Set([
  "menu", "shop", "codex", "setup", "profile", "settings", "achievements",
  "leaderboards", "rename", "academy", "foundry", "ghostlab", "botevidence",
]);

const worldScreens: ReadonlySet<AppScreen> = new Set([
  "playing", "draft", "reserve", "tierup", "paused", "confirmquit", "gameover",
  "win", "continue", "pgmenu", "pglab",
]);

export function isMenuScreen(screen: AppScreen): boolean {
  return menuScreens.has(screen);
}

export function isWorldScreen(screen: AppScreen): boolean {
  return worldScreens.has(screen);
}

/** Single exhaustive dispatch point; individual screens only render and enqueue actions. */
export function renderRegisteredScreen(screen: AppScreen, registry: ScreenRendererRegistry): void {
  registry[screen]();
}
