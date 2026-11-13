export type LiveHumanInputDevice = "keyboard-mouse" | "touch";
/** Records only browser-trusted user edges; dispatched TearBench input is excluded. */
export function createLiveHumanInputProvenance(target: Window): Readonly<{ reset(): void; device(): LiveHumanInputDevice | undefined; dispose(): void }> {
  let current: LiveHumanInputDevice | undefined;
  const keyboard = (event: KeyboardEvent) => { if (event.isTrusted) current = "keyboard-mouse"; };
  const mouse = (event: MouseEvent) => { if (event.isTrusted) current = "keyboard-mouse"; };
  const touch = (event: TouchEvent) => { if (event.isTrusted) current = "touch"; };
  target.addEventListener("keydown", keyboard, true); target.addEventListener("mousedown", mouse, true); target.addEventListener("touchstart", touch, true);
  return Object.freeze({ reset: () => { current = undefined; }, device: () => current, dispose: () => { target.removeEventListener("keydown", keyboard, true); target.removeEventListener("mousedown", mouse, true); target.removeEventListener("touchstart", touch, true); } });
}
