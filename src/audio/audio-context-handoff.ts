type AudioContextConstructor = new(contextOptions?: AudioContextOptions) => AudioContext;

interface AudioWindow extends Window {
  readonly AudioContext?: AudioContextConstructor;
  readonly webkitAudioContext?: AudioContextConstructor;
  readonly Tone?: { getContext?(): { readonly rawContext?: AudioContext } };
}

let captured: AudioContext | null = null;

/** Captures the sole browser context synchronously while transient activation is live. */
export function captureAudioContextFromUserGesture(browserWindow: Window = window): AudioContext | null {
  if (captured !== null && captured.state !== "closed") return captured;
  const audioWindow = browserWindow as AudioWindow;
  const shared = audioWindow.Tone?.getContext?.().rawContext;
  const Constructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (shared === undefined && Constructor === undefined) return null;
  captured = shared ?? (Constructor === undefined ? null : new Constructor());
  if (captured === null) return null;
  void captured.resume().catch(() => { /* The runtime reports activation failures. */ });
  return captured;
}

export function capturedAudioContext(): AudioContext | null {
  return captured?.state === "closed" ? null : captured;
}

export function disposeCapturedAudioContext(): void {
  const context = captured;
  captured = null;
  if (context !== null && context.state !== "closed") void context.close().catch(() => undefined);
}
