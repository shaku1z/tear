type AudioContextConstructor = new(contextOptions?: AudioContextOptions) => AudioContext;

interface AudioWindow extends Window {
  readonly AudioContext?: AudioContextConstructor;
  readonly webkitAudioContext?: AudioContextConstructor;
  readonly Tone?: { getContext?(): { readonly rawContext?: AudioContext } };
}

export interface BrowserAudioContextHandoff {
  /** Capture the one browser context while transient user activation is live. */
  capture(): AudioContext | null;
  /** Return the captured context while it remains usable. */
  captured(): AudioContext | null;
  /** Release the captured context when this application composition ends. */
  dispose(): void;
}

/**
 * One browser-context handoff owned by one application composition. Creation is
 * deliberately lazy so node-side receipt tests can construct their facade
 * without a browser global or an AudioContext.
 */
export function createBrowserAudioContextHandoff(browserWindow?: Window): BrowserAudioContextHandoff {
  let captured: AudioContext | null = null;
  const usable = (): AudioContext | null => captured?.state === "closed" ? null : captured;

  return Object.freeze({
    capture(): AudioContext | null {
      const existing = usable();
      if (existing !== null) return existing;
      const audioWindow = (browserWindow ?? window) as AudioWindow;
      const shared = audioWindow.Tone?.getContext?.().rawContext;
      const Constructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
      if (shared === undefined && Constructor === undefined) return null;
      captured = shared ?? (Constructor === undefined ? null : new Constructor());
      if (captured === null) return null;
      void captured.resume().catch(() => { /* The runtime reports activation failures. */ });
      return captured;
    },
    captured: usable,
    dispose(): void {
      const context = captured;
      captured = null;
      if (context !== null && context.state !== "closed") void context.close().catch(() => undefined);
    },
  });
}
