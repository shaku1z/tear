/**
 * The one keyboard binding table: every action the keyboard performs, mapped to the
 * physical keys (`KeyboardEvent.code`) that perform it. The input adapter, the frame
 * coordinator, the Playground, the menus and the prompt vocabulary all read this
 * table at the moment they need it and never keep a copy, so rebinding a key later
 * means writing to this table and nothing else.
 *
 * Codes are physical positions: on an AZERTY keyboard `KeyQ` is the key labelled A.
 * Labels name the US QWERTY legend (see `keyCodeLabel`).
 */

/** Where a binding is live. A screen is a set of contexts (see `KEYBOARD_SCREENS`). */
export type KeyboardContext =
  "play" | "tutorial" | "playground" | "menu" | "playground-menu" | "replay" | "everywhere" | "engineering";

export interface KeyboardBinding {
  /** Physical keys. Without `named`, a prompt names the first one. */
  readonly codes: readonly string[];
  readonly context: KeyboardContext;
  /** The codes a prompt names, in that order, when it is not just the first (every one is in `codes`). */
  readonly named?: readonly string[];
  /** The codes are an ordered range (1–8): a prompt names the first and last. */
  readonly range?: boolean;
}

const digits = (count: number): readonly string[] =>
  Array.from({ length: count }, (_, index) => `Digit${String(index + 1)}`);

const BINDINGS = {
  // ---- play: a run, the Tutorial and the Playground ----
  "move-left": { codes: ["KeyA", "ArrowLeft"], context: "play" },
  "move-right": { codes: ["KeyD", "ArrowRight"], context: "play" },
  /** Up also aims a dash; held down drops through a platform and aims a dash down. */
  "move-up": { codes: ["KeyW", "ArrowUp"], context: "play" },
  "move-down": { codes: ["KeyS", "ArrowDown"], context: "play" },
  jump: { codes: ["KeyW", "Space", "ArrowUp"], context: "play", named: ["KeyW", "Space"] },
  dash: { codes: ["ShiftLeft", "ShiftRight"], context: "play" },
  /** Throw a held blade, recall a thrown one: the keyboard twin of the right mouse button. */
  throw: { codes: ["KeyE"], context: "play" },
  /** Hold to draw the tether in: the keyboard twin of the left mouse button. */
  tether: { codes: ["KeyQ"], context: "play" },
  /** Escape also releases pointer lock, which pauses through the lost-capture rule. */
  pause: { codes: ["Escape", "KeyP"], context: "play", named: ["Escape", "KeyP"] },
  "skip-lesson": { codes: ["KeyN"], context: "tutorial" },
  "playground-menu": { codes: ["Tab"], context: "playground" },
  abilities: { codes: ["KeyU"], context: "playground" },
  "quick-spawn": { codes: digits(8), context: "playground", range: true },
  "spawn-dummy": { codes: ["KeyT"], context: "playground" },
  "summon-boss": { codes: ["KeyB"], context: "playground" },
  "summon-echo": { codes: ["KeyM"], context: "playground" },
  "clear-enemies": { codes: ["KeyK"], context: "playground" },
  heal: { codes: ["KeyH"], context: "playground" },
  "clip-start": { codes: ["BracketLeft"], context: "engineering" },
  "clip-stop": { codes: ["BracketRight"], context: "engineering" },

  // ---- menus ----
  "menu-up": { codes: ["ArrowUp", "KeyW"], context: "menu" },
  "menu-down": { codes: ["ArrowDown", "KeyS"], context: "menu" },
  "menu-left": { codes: ["ArrowLeft", "KeyA"], context: "menu" },
  "menu-right": { codes: ["ArrowRight", "KeyD"], context: "menu" },
  /** Prompts say SPACE (owner, 2026-11-19); Enter is first because the pad's A button presses it. */
  confirm: { codes: ["Enter", "NumpadEnter", "Space"], context: "menu", named: ["Space"] },
  back: { codes: ["Escape", "Backspace"], context: "menu" },
  "tab-prev": { codes: ["KeyQ"], context: "menu" },
  "tab-next": { codes: ["KeyE"], context: "menu" },
  "page-up": { codes: ["PageUp"], context: "menu" },
  "page-down": { codes: ["PageDown"], context: "menu" },
  /** Pick the nth card of a draft, reserve or tier-up choice. */
  choose: { codes: digits(4), context: "menu", range: true },
  reroll: { codes: ["KeyR"], context: "menu" },
  /** The Playground menu also closes on Escape (`back`). */
  "close-menu": { codes: ["Tab"], context: "playground-menu" },

  // ---- replay viewer (it consumes these before the menu reads them) ----
  "replay-toggle": { codes: ["Space"], context: "replay" },
  "replay-back": { codes: ["ArrowLeft"], context: "replay" },
  "replay-forward": { codes: ["ArrowRight"], context: "replay" },

  // ---- everywhere ----
  fullscreen: { codes: ["KeyF"], context: "everywhere" },
} as const satisfies Readonly<Record<string, KeyboardBinding>>;

export type KeyboardAction = keyof typeof BINDINGS;

export const KEYBOARD_BINDINGS: Readonly<Record<KeyboardAction, KeyboardBinding>> = BINDINGS;

export const KEYBOARD_ACTIONS = Object.freeze(Object.keys(BINDINGS)) as readonly KeyboardAction[];

/** The contexts live on each screen; within one screen no key may mean two things. */
export const KEYBOARD_SCREENS: Readonly<Record<string, readonly KeyboardContext[]>> = Object.freeze({
  run: ["play", "everywhere", "engineering"],
  tutorial: ["play", "tutorial", "everywhere", "engineering"],
  playground: ["play", "playground", "everywhere", "engineering"],
  menu: ["menu", "everywhere"],
  "playground-menu": ["menu", "playground-menu", "everywhere"],
  replay: ["replay", "everywhere"],
});

/**
 * Keys that deliberately do two things on one screen, with the reason. W and Up are
 * both "up" (dash aim) and jump, as the game has always played.
 */
export const KEYBOARD_SHARED_KEYS: readonly Readonly<{ actions: readonly KeyboardAction[]; why: string }>[] =
  Object.freeze([{ actions: ["jump", "move-up"], why: "Up jumps and aims a dash up." }]);

export function keyCodes(action: KeyboardAction): readonly string[] {
  return KEYBOARD_BINDINGS[action].codes;
}

export function bindsKey(action: KeyboardAction, code: string): boolean {
  return KEYBOARD_BINDINGS[action].codes.includes(code);
}

/** True when any key bound to the action is in the set (held keys or this frame's presses). */
export function anyKeyIn(keys: ReadonlySet<string>, action: KeyboardAction): boolean {
  return KEYBOARD_BINDINGS[action].codes.some((code) => keys.has(code));
}

/** True when any key bound to an action of the context is in the set. */
export function anyContextKeyIn(keys: ReadonlySet<string>, context: KeyboardContext): boolean {
  return KEYBOARD_ACTIONS.some((action) => KEYBOARD_BINDINGS[action].context === context && anyKeyIn(keys, action));
}

/** The index of the first key of an ordered range (`quick-spawn`, `choose`) in the set, below `limit`. */
export function rangeKeyIn(keys: ReadonlySet<string>, action: KeyboardAction, limit = Infinity): number | null {
  const codes = KEYBOARD_BINDINGS[action].codes;
  for (let index = 0; index < Math.min(limit, codes.length); index += 1) {
    const code = codes[index];
    if (code !== undefined && keys.has(code)) return index;
  }
  return null;
}

const SPECIAL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  Space: "SPACE",
  ShiftLeft: "SHIFT",
  ShiftRight: "SHIFT",
  Escape: "ESC",
  Enter: "ENTER",
  NumpadEnter: "ENTER",
  Backspace: "BACKSPACE",
  Tab: "TAB",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  PageUp: "PG UP",
  PageDown: "PG DN",
  BracketLeft: "[",
  BracketRight: "]",
});

/** The US QWERTY legend of a physical key: `KeyE` is "E", `Digit1` is "1", `ShiftLeft` is "SHIFT". */
export function keyCodeLabel(code: string): string {
  const special = SPECIAL_LABELS[code];
  if (special !== undefined) return special;
  const letter = /^Key([A-Z])$/u.exec(code)?.[1];
  if (letter !== undefined) return letter;
  const digit = /^Digit(\d)$/u.exec(code)?.[1];
  return digit ?? code.toUpperCase();
}

/** What a prompt calls the action's keys: "E", "W / SPACE", "1–8". */
export function keyboardLabel(action: KeyboardAction): string {
  const binding = KEYBOARD_BINDINGS[action];
  const codes = binding.codes;
  if (binding.range === true && codes.length > 1)
    return `${keyCodeLabel(codes[0] ?? "")}–${keyCodeLabel(codes.at(-1) ?? "")}`;
  const labels: string[] = [];
  for (const code of binding.named ?? codes.slice(0, 1)) {
    const label = keyCodeLabel(code);
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.join(" / ");
}

/** Every key used twice on one screen that `KEYBOARD_SHARED_KEYS` does not explain; `bindings` defaults to the table. */
export function keyboardCollisions(
  bindings: Readonly<Record<KeyboardAction, KeyboardBinding>> = KEYBOARD_BINDINGS,
): readonly Readonly<{
  screen: string;
  code: string;
  actions: readonly string[];
}>[] {
  const collisions: { screen: string; code: string; actions: string[] }[] = [];
  const shared = (actions: readonly string[]): boolean =>
    KEYBOARD_SHARED_KEYS.some((entry) =>
      actions.every((action) => (entry.actions as readonly string[]).includes(action)),
    );
  for (const [screen, contexts] of Object.entries(KEYBOARD_SCREENS)) {
    const byCode = new Map<string, string[]>();
    for (const action of KEYBOARD_ACTIONS) {
      const binding = bindings[action];
      if (!contexts.includes(binding.context)) continue;
      for (const code of new Set(binding.codes)) byCode.set(code, [...(byCode.get(code) ?? []), action]);
    }
    for (const [code, actions] of byCode)
      if (actions.length > 1 && !shared(actions)) collisions.push({ screen, code, actions });
  }
  return collisions;
}
