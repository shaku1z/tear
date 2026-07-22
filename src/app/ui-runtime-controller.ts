import {
  coordinateUiFrame,
  coordinateUiPointer,
  stepUiTab,
  type UiActionButton,
  type UiSemanticAction,
} from "./ui-action-coordinator";

export interface InteractiveUiButton extends UiActionButton {
  readonly action: () => void;
}

export interface UiRuntimeInput {
  readonly mode: "mouse" | "keyboard" | "gamepad" | "touch";
  readonly mouseX: number;
  readonly mouseY: number;
  readonly ui: Readonly<{ pageUp: boolean; pageDown: boolean; tabPrev: boolean; tabNext: boolean }>;
  readonly pressed: ReadonlySet<string>;
  padBack: boolean;
  touchActive(): boolean;
  takeUIScroll(): Readonly<{ x: number; y: number }>;
  menuLeft(): boolean;
  menuRight(): boolean;
  menuUp(): boolean;
  menuDown(): boolean;
  menuPrev(): boolean;
  menuNext(): boolean;
  confirmPressed(): boolean;
  takeClick(): Readonly<{ x: number; y: number }> | null;
}

export interface UiRuntimePorts {
  readonly screen: () => string;
  readonly buttons: () => readonly InteractiveUiButton[];
  readonly focus: () => number;
  readonly setFocus: (value: number) => void;
  readonly scroll: () => number;
  readonly setScroll: (value: number) => void;
  readonly input: UiRuntimeInput;
  readonly playInterfaceSound: () => void;
  readonly chooseUpgrade: (index: number) => void;
  readonly chooseReserve: (index: number) => void;
  readonly rerollDraft: () => void;
}

type RuntimeUiAction = UiSemanticAction | Readonly<{ type: "activate-button"; index: number; source: "pointer" }>;

function activateSemanticAction(ports: UiRuntimePorts, action: RuntimeUiAction | null): boolean {
  if (action === null) return false;
  if (action.type === "choose-upgrade") ports.chooseUpgrade(action.index);
  else if (action.type === "choose-reserve") ports.chooseReserve(action.index);
  else if (action.type === "reroll-draft") ports.rerollDraft();
  else {
    const button = ports.buttons()[action.index];
    if (button !== undefined && button.enabled !== false) button.action();
  }
  return true;
}

/** Owns one complete non-gameplay UI input frame. */
export function handleUiRuntimeFrame(ports: UiRuntimePorts): void {
  if (ports.screen() === "playing") return;
  const input = ports.input;
  const wheel = input.takeUIScroll();
  const touch = input.touchActive();
  const decision = coordinateUiFrame({
    screen: ports.screen(), buttons: ports.buttons(), focus: ports.focus(), scroll: ports.scroll(),
    scrollY: wheel.y, pageUp: input.ui.pageUp, pageDown: input.ui.pageDown,
    pointer: { x: input.mouseX, y: input.mouseY }, touch,
    directions: { left: input.menuLeft(), right: input.menuRight(), up: input.menuUp(), down: input.menuDown() },
    previous: input.menuPrev(), next: input.menuNext(), pressed: input.pressed,
    padBack: input.padBack, confirm: input.confirmPressed(),
  });
  ports.setFocus(decision.focus);
  ports.setScroll(decision.scroll);
  if (decision.consumePadBack) input.padBack = false;
  if (decision.playUiSound) ports.playInterfaceSound();
  if (activateSemanticAction(ports, decision.action)) return;
  if (decision.pointer === "consume") { input.takeClick(); return; }
  if (decision.pointer !== "read") return;
  const pointer = coordinateUiPointer(ports.buttons(), ports.focus(), input.takeClick(), touch);
  ports.setFocus(pointer.focus);
  if (pointer.playUiSound) ports.playInterfaceSound();
  activateSemanticAction(ports, pointer.action);
}

export function stepRuntimeTab<Key>(
  tabs: readonly (readonly [Key, ...readonly unknown[]])[],
  current: Key,
  input: Pick<UiRuntimeInput, "ui">,
  playInterfaceSound: () => void,
  onChange?: (key: Key) => void,
): Key {
  const decision = stepUiTab(tabs, current, input.ui.tabPrev, input.ui.tabNext);
  if (!decision.changed) return current;
  playInterfaceSound();
  onChange?.(decision.key);
  return decision.key;
}

export function firstEnabledUiButton(buttons: readonly UiActionButton[]): number {
  return buttons.findIndex((button) => button.enabled !== false);
}
