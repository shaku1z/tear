export function bindFullscreenButton(document: Document): void {
  const wrapper = document.getElementById("wrap");
  const button = document.getElementById("fs");
  if (button === null || wrapper === null) return;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (document.fullscreenElement === null) {
      void wrapper.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  });
}
