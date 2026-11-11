/**
 * The HTML loading state (#boot in index.html) covers the page while the
 * application chunks download. The canvas takes over once it has drawn its first
 * frame; a boot failure before then is reported by the inline handler in
 * index.html instead of leaving a black page.
 */
export function dismissBootScreen(document: Document): void {
  document.getElementById("boot")?.remove();
  document.documentElement.dataset.booted = "true";
}
