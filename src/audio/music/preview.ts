/**
 * Song preview on the MUSIC screen.
 *
 * While a work id is set, the shell/menu slot plays that work instead of the
 * player's menu music. Leaving the MUSIC screen clears it. Kept as a tiny store
 * (like the loadout) so the screen never imports the audio backend.
 */

let previewWorkId: string | null = null;
const listeners = new Set<() => void>();

export function setMusicPreview(workId: string | null): void {
  const next = workId === "" ? null : workId;
  if (next === previewWorkId) return;
  previewWorkId = next;
  for (const listener of listeners) listener();
}

export function getMusicPreview(): string | null {
  return previewWorkId;
}

export function onMusicPreviewChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
