/**
 * Portable journal records for finale calls accepted by outward host adapters.
 *
 * These records describe adapter dispatch only. They do not claim equality of
 * rendered pixels, generated audio samples, or physical haptic-device output.
 */
export interface FinaleParticleEmissionReceipt {
  readonly accepted: boolean;
  readonly requested: number;
  readonly emitted: number;
  readonly rejected: Readonly<{ culled: number; budget: number }>;
  readonly listDelta: number;
}

export interface FinaleWorldZoomState {
  readonly current: number;
  readonly target: number;
}

/** Deterministic camera state observed around one successful host mutation. */
export interface FinaleWorldZoomReceipt {
  readonly requested: number;
  readonly immediate: boolean;
  readonly before: FinaleWorldZoomState;
  readonly after: FinaleWorldZoomState;
}

/** Deterministic max-aggregation state observed around one successful host mutation. */
export interface FinaleMaximumFeelReceipt {
  readonly requested: number;
  readonly before: number;
  readonly after: number;
  readonly aggregation: "maximum";
}

export type FinaleOutwardCall =
  | Readonly<{ type: "world-zoom"; value: number; receipt: FinaleWorldZoomReceipt }>
  | Readonly<{
    type: "ring"; x: number; y: number; radius: number; color: string;
    receipt: FinaleParticleEmissionReceipt;
  }>
  | Readonly<{
    type: "burst"; x: number; y: number; dx: number; dy: number; count: number; color: string;
    receipt: FinaleParticleEmissionReceipt;
  }>
  | Readonly<{ type: "flash"; amount: number; receipt: FinaleMaximumFeelReceipt }>
  | Readonly<{ type: "shake"; amount: number; receipt: FinaleMaximumFeelReceipt }>
  | Readonly<{ type: "vibrate"; pattern: readonly number[] }>
  | Readonly<{
    type: "sound";
    cue: "final-cut" | "final-relic" | "final-restore" | "final-silence";
    index: number;
  }>
  | Readonly<{ type: "void-mix"; amount: number; duration: number }>
  | Readonly<{ type: "music-duck"; amount: number; duration: number }>;

export type FinaleOutwardCallObserver = (call: FinaleOutwardCall) => void;

/** Publishes one immutable, data-only snapshot to an optional test observer. */
export function observeFinaleOutwardCall(
  observer: FinaleOutwardCallObserver | undefined,
  call: FinaleOutwardCall,
): void {
  if (observer === undefined) return;
  const snapshot = structuredClone(call);
  if (snapshot.type === "vibrate") Object.freeze(snapshot.pattern);
  if (snapshot.type === "ring" || snapshot.type === "burst") {
    Object.freeze(snapshot.receipt.rejected);
    Object.freeze(snapshot.receipt);
  }
  if (snapshot.type === "world-zoom") {
    Object.freeze(snapshot.receipt.before);
    Object.freeze(snapshot.receipt.after);
    Object.freeze(snapshot.receipt);
  }
  if (snapshot.type === "flash" || snapshot.type === "shake") Object.freeze(snapshot.receipt);
  observer(Object.freeze(snapshot));
}
