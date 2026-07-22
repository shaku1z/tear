import type { LifecycleService, PlatformLifecycleEvent, Unsubscribe } from "./contracts";

export interface LifecycleController extends LifecycleService {
  emit(event: PlatformLifecycleEvent): void;
  setFocused(focused: boolean): void;
  setVisible(visible: boolean): void;
}

export function createLifecycleController(initial: { focused?: boolean; visible?: boolean } = {}): LifecycleController {
  let focused = initial.focused ?? true;
  let visible = initial.visible ?? true;
  const listeners = new Set<(event: PlatformLifecycleEvent) => void>();
  const emit = (event: PlatformLifecycleEvent) => {
    for (const listener of [...listeners]) listener(event);
  };
  return {
    get focused() { return focused; },
    get visible() { return visible; },
    subscribe(listener): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit,
    setFocused(next) {
      if (focused === next) return;
      focused = next;
      emit({ type: "focus-changed", focused });
    },
    setVisible(next) {
      if (visible === next) return;
      visible = next;
      emit({ type: "visibility-changed", visible });
    },
    loadingStarted() { return undefined; },
    loadingFinished() { return undefined; },
    gameplayStarted() { return undefined; },
    gameplayFinished() { return undefined; },
    happyMoment() { return undefined; },
  };
}
