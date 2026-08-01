/**
 * Portable journal records for finale calls accepted by outward host adapters.
 *
 * These records describe adapter dispatch only. They do not claim equality of
 * rendered pixels, generated audio samples, or physical haptic-device output.
 */
export type FinaleOutwardCall =
  | Readonly<{ type: "world-zoom"; value: number }>
  | Readonly<{ type: "ring"; x: number; y: number; radius: number; color: string }>
  | Readonly<{ type: "burst"; x: number; y: number; dx: number; dy: number; count: number; color: string }>
  | Readonly<{ type: "flash"; amount: number }>
  | Readonly<{ type: "shake"; amount: number }>
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
  observer(Object.freeze(snapshot));
}
