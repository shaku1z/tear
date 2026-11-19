import { bindsKey } from "../domain/keyboard-bindings";
import type { Capability, FullscreenService } from "./contracts";

/** Enters fullscreen, or leaves it when the page is already fullscreen. */
export function toggleFullscreen(service: FullscreenService): Promise<boolean> {
  return service.active ? service.exit() : service.enter();
}

export interface FullscreenControlsOptions {
  readonly document: Pick<Document, "getElementById">;
  readonly window: Pick<Window, "addEventListener">;
  /** The platform's fullscreen owner, read per press: CrazyGames reports it unavailable. */
  readonly fullscreen: () => Capability<FullscreenService>;
  /** A text field owns the keyboard (the rename field). */
  readonly textEntry: () => boolean;
}

/** True for a key event typed into an editable element, which must never toggle fullscreen. */
function typedIntoField(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA";
}

/**
 * Binds the page's two fullscreen controls, the #fs button and the fullscreen key, to the one
 * platform owner. Both run inside the input event so the browser sees a user gesture. Where
 * fullscreen is unavailable both do nothing (and the button is hidden by the chrome policy).
 */
export function bindFullscreenControls(options: FullscreenControlsOptions): void {
  const press = (): boolean => {
    const capability = options.fullscreen();
    if (!capability.available) return false;
    void toggleFullscreen(capability.service);
    return true;
  };
  options.document.getElementById("fs")?.addEventListener("click", (event) => {
    event.stopPropagation();
    press();
  });
  options.window.addEventListener("keydown", (event) => {
    if (event.repeat || !bindsKey("fullscreen", event.code)) return;
    // Ctrl+F and Cmd+F belong to the browser; typing an F belongs to the field.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (options.textEntry() || typedIntoField(event.target)) return;
    if (press()) event.preventDefault();
  });
}
