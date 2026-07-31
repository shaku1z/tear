import type { TearPhysicalInput } from "../live-runtime-contracts";

/** Browser-only Class-C adapter; semantic routing stays in the portable core. */
export function emitLiveTearBenchPhysicalInput(
  input: TearPhysicalInput,
  target: Readonly<{ window: Window; canvas: HTMLCanvasElement; width: number; height: number }>,
): void {
  if (input.type === "key") {
    target.window.dispatchEvent(new KeyboardEvent(input.phase === "pressed" ? "keydown" : "keyup", {
      code: input.code, bubbles: true,
    }));
    return;
  }
  const rectangle = target.canvas.getBoundingClientRect();
  const clientX = rectangle.left + input.x / target.width * rectangle.width;
  const clientY = rectangle.top + input.y / target.height * rectangle.height;
  const pointerPhase = input.phase === "pressed" ? "pointerdown" : "pointerup";
  const mousePhase = input.phase === "pressed" ? "mousedown" : "mouseup";
  // Browsers do not synthesize the matching mouse/click sequence for a bridge
  // pointer event, so this adapter explicitly delivers the normal device flow.
  target.canvas.dispatchEvent(new PointerEvent(pointerPhase, { clientX, clientY, button: input.button, bubbles: true }));
  target.canvas.dispatchEvent(new MouseEvent(mousePhase, { clientX, clientY, button: input.button, bubbles: true }));
  if (input.phase === "released" && input.button === 0) {
    target.canvas.dispatchEvent(new MouseEvent("click", { clientX, clientY, button: 0, bubbles: true }));
  }
}
