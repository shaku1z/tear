export interface LegacyAudioLifecycle {
  readonly listenerCount: number;
  readonly visibilityTransitions: Readonly<{ readonly hidden: number; readonly visible: number }>;
  uninstall(): void;
}

interface LegacyAudioLifecycleOptions {
  readonly resume: () => void;
  readonly setVisibilityMuted: (muted: boolean) => void;
  readonly disposeAudio: () => void;
  readonly onUninstalled: () => void;
}

export function installLegacyAudioLifecycle(
  options: LegacyAudioLifecycleOptions,
  browserWindow: Window = window,
  documentLike: Document = document,
): LegacyAudioLifecycle {
  const visibilityTransitions = { hidden: 0, visible: 0 };
  const start = () => { options.resume(); };
  const visibility = () => {
    if (documentLike.hidden) visibilityTransitions.hidden++;
    else visibilityTransitions.visible++;
    options.setVisibilityMuted(documentLike.hidden);
  };
  const uninstall = () => {
    browserWindow.removeEventListener("pointerdown", start);
    browserWindow.removeEventListener("keydown", start);
    documentLike.removeEventListener("visibilitychange", visibility);
    browserWindow.removeEventListener("pagehide", pagehide);
    options.onUninstalled();
  };
  const pagehide = (event: PageTransitionEvent) => {
    if (event.persisted) return;
    uninstall();
    options.disposeAudio();
  };
  browserWindow.addEventListener("pointerdown", start);
  browserWindow.addEventListener("keydown", start);
  documentLike.addEventListener("visibilitychange", visibility);
  browserWindow.addEventListener("pagehide", pagehide);
  return Object.freeze({ listenerCount: 4, visibilityTransitions, uninstall });
}
