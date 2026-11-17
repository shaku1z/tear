/**
 * Song preview on the MUSIC screen.
 *
 * While a work id is set, the shell/menu slot plays that work instead of the
 * player's menu music. Leaving the MUSIC screen clears it. Kept as a tiny store
 * (like the loadout) so the screen never imports the audio backend.
 *
 * The queue is the collection the preview started from; stepping moves through it.
 */

let previewWorkId: string | null = null;
let queue: readonly string[] = [];
const listeners = new Set<() => void>();

export function setMusicPreview(workId: string | null, from?: readonly string[]): void {
  const next = workId === "" ? null : workId;
  if (from) queue = Object.freeze([...from]);
  if (next === null) queue = [];
  if (next === previewWorkId) return;
  previewWorkId = next;
  for (const listener of listeners) listener();
}

export function getMusicPreview(): string | null {
  return previewWorkId;
}

/** The songs ◀◀/▶▶ step through: the collection the current preview started from. */
export function getMusicQueue(): readonly string[] {
  return queue;
}

/** Preview the next (1) or previous (-1) song of the queue, wrapping at its ends. */
export function stepMusicPreview(delta: number): void {
  if (queue.length === 0) return;
  const at = previewWorkId === null ? -1 : queue.indexOf(previewWorkId);
  const index = at < 0 ? (delta > 0 ? 0 : queue.length - 1) : (at + delta + queue.length) % queue.length;
  setMusicPreview(queue[index] ?? null);
}

export function onMusicPreviewChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
