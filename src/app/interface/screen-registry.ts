import type { AppScreen } from "../../domain/screen-catalog";

export type ScreenRenderer = () => void;
export type ScreenRendererRegistry = Readonly<Record<AppScreen, ScreenRenderer>>;

/** Single exhaustive dispatch point; individual screens only render and enqueue actions. */
export function renderRegisteredScreen(screen: AppScreen, registry: ScreenRendererRegistry): void {
  registry[screen]();
}
