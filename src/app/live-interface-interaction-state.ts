import type { CanvasUiButton } from "../presentation/screens/button-layer";
import type { InteractiveUiButton } from "./ui-runtime-controller";

export type LiveInterfaceButton = CanvasUiButton & InteractiveUiButton;

export interface LiveInterfaceInteractionState {
  readonly buttons: () => LiveInterfaceButton[];
  readonly enqueue: (button: LiveInterfaceButton) => void;
  readonly resetButtons: () => void;
  readonly focus: () => number;
  readonly setFocus: (value: number) => void;
  readonly scroll: () => number;
  readonly setScroll: (value: number) => void;
  readonly hoverAnimations: () => Record<string, number>;
}

/** Owns the mutable controls, focus, scroll, and hover state for the live UI frame. */
export function createLiveInterfaceInteractionState(): LiveInterfaceInteractionState {
  let buttons: LiveInterfaceButton[] = [];
  let focus = -1;
  let scroll = 0;
  const hoverAnimations: Record<string, number> = {};
  return Object.freeze({
    buttons: (): LiveInterfaceButton[] => buttons,
    enqueue: (button: LiveInterfaceButton): void => { buttons.push(button); },
    resetButtons: (): void => { buttons = []; },
    focus: (): number => focus,
    setFocus: (value: number): void => { focus = value; },
    scroll: (): number => scroll,
    setScroll: (value: number): void => { scroll = value; },
    hoverAnimations: (): Record<string, number> => hoverAnimations,
  });
}
