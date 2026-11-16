/**
 * The page's fullscreen button. Fullscreen is optional: iPhone Safari has no element fullscreen
 * (no requestFullscreen or exitFullscreen, and fullscreenElement is undefined), and browsers may
 * refuse a request, so a press there does nothing instead of throwing.
 */
export function bindFullscreenButton(document: Document): void {
  const wrapper = document.getElementById("wrap");
  const button = document.getElementById("fs");
  if (button === null || wrapper === null) return;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFullscreen(document, wrapper);
  });
}

type FullscreenDocument = Partial<Pick<Document, "fullscreenElement" | "exitFullscreen">>;
type FullscreenElement = Partial<Pick<Element, "requestFullscreen">>;

export function toggleFullscreen(document: FullscreenDocument, element: FullscreenElement): void {
  try {
    const pending = document.fullscreenElement == null ? element.requestFullscreen?.() : document.exitFullscreen?.();
    pending?.catch(() => undefined);
  } catch {
    /* Fullscreen is optional. */
  }
}
