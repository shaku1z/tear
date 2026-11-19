/**
 * The player's keyboard remap: a new primary key for some of the play actions. The live
 * binding table is the defaults with the remap applied, so every reader of the table
 * (input, prompts, the controls guide) follows a rebind with no edit of its own.
 *
 * A remap names one key per action, the one prompts show first; the action's other
 * default keys stay (the arrows keep moving when A is rebound). Pause is not rebindable:
 * Escape also releases the pointer lock and backs out of menus.
 */
import {
  KEYBOARD_DEFAULTS,
  keyboardCollisions,
  useKeyboardBindings,
  type KeyboardAction,
  type KeyboardBinding,
  type KeyboardTable,
} from "./keyboard-bindings";

export const REBINDABLE_ACTIONS = Object.freeze([
  "move-left",
  "move-right",
  "move-up",
  "move-down",
  "jump",
  "dash",
  "throw",
  "tether",
] as const satisfies readonly KeyboardAction[]);

export type RebindableAction = (typeof REBINDABLE_ACTIONS)[number];

/** The primary key the player chose per action; an action left out keeps its default. */
export type KeyboardRemap = Readonly<Partial<Record<RebindableAction, string>>>;

export type RebindOutcome =
  | Readonly<{ kind: "unchanged" | "assigned"; remap: KeyboardRemap }>
  /** The key was another action's primary: the two actions traded keys. */
  | Readonly<{ kind: "swapped"; remap: KeyboardRemap; with: RebindableAction }>
  /** The key already means something else on a screen where the action is live. */
  | Readonly<{ kind: "refused"; remap: KeyboardRemap; by: KeyboardAction }>;

/** A `KeyboardEvent.code` shape: `KeyJ`, `Digit5`, `ShiftLeft`, `Numpad0`, `Semicolon`. */
const KEY_CODE = /^[A-Z][A-Za-z0-9]{0,23}$/u;

export function isRebindableAction(action: string): action is RebindableAction {
  return (REBINDABLE_ACTIONS as readonly string[]).includes(action);
}

const defaultPrimary = (action: RebindableAction): string => KEYBOARD_DEFAULTS[action].codes[0] ?? "";

export function primaryKey(remap: KeyboardRemap, action: RebindableAction): string {
  return remap[action] ?? defaultPrimary(action);
}

function rebound(binding: KeyboardBinding, primary: string): KeyboardBinding {
  const old = binding.codes[0];
  const codes = [primary, ...binding.codes.filter((code) => code !== old && code !== primary)];
  if (binding.named === undefined) return Object.freeze({ ...binding, codes });
  const named = [...new Set(binding.named.map((code) => (code === old ? primary : code)))];
  return Object.freeze({ ...binding, codes, named });
}

/** The defaults with the remap applied. */
export function remappedBindings(remap: KeyboardRemap): KeyboardTable {
  if (REBINDABLE_ACTIONS.every((action) => remap[action] === undefined)) return KEYBOARD_DEFAULTS;
  const table: Record<string, KeyboardBinding> = { ...KEYBOARD_DEFAULTS };
  for (const action of REBINDABLE_ACTIONS) {
    const primary = remap[action];
    if (primary !== undefined) table[action] = rebound(KEYBOARD_DEFAULTS[action], primary);
  }
  return Object.freeze(table);
}

/** Drops entries that restate a default, so a saved remap names only what the player changed. */
function trimmed(remap: Partial<Record<RebindableAction, string>>): KeyboardRemap {
  const kept: Partial<Record<RebindableAction, string>> = {};
  for (const action of REBINDABLE_ACTIONS) {
    const code = remap[action];
    if (code !== undefined && code !== defaultPrimary(action)) kept[action] = code;
  }
  return Object.freeze(kept);
}

/**
 * Makes `code` the action's primary key. Another action's primary trades places with it;
 * any other key already in use on a screen where the action is live is refused.
 */
export function rebindKey(remap: KeyboardRemap, action: RebindableAction, code: string): RebindOutcome {
  if (!KEY_CODE.test(code)) return Object.freeze({ kind: "refused", remap, by: action });
  const current = primaryKey(remap, action);
  if (code === current) return Object.freeze({ kind: "unchanged", remap });
  const other = REBINDABLE_ACTIONS.find((candidate) => candidate !== action && primaryKey(remap, candidate) === code);
  const next = trimmed({ ...remap, [action]: code, ...(other === undefined ? {} : { [other]: current }) });
  const collisions = keyboardCollisions(remappedBindings(next));
  const collision = collisions.find((entry) => entry.code === code) ?? collisions[0];
  if (collision !== undefined) {
    const by = collision.actions.find((name) => name !== action && name !== other) ?? collision.actions[0] ?? action;
    return Object.freeze({ kind: "refused", remap, by: by as KeyboardAction });
  }
  return other === undefined
    ? Object.freeze({ kind: "assigned", remap: next })
    : Object.freeze({ kind: "swapped", remap: next, with: other });
}

/**
 * A remap read from storage: unknown actions and malformed codes are dropped, and a remap
 * that would give one key two meanings on a screen is dropped whole (the defaults stand).
 */
export function sanitizeKeyboardRemap(value: unknown): KeyboardRemap {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
  const kept: Partial<Record<RebindableAction, string>> = {};
  for (const [action, code] of Object.entries(value as Record<string, unknown>))
    if (isRebindableAction(action) && typeof code === "string" && KEY_CODE.test(code)) kept[action] = code;
  const remap = trimmed(kept);
  return keyboardCollisions(remappedBindings(remap)).length === 0 ? remap : Object.freeze({});
}

/** Makes the remap live for every reader of the binding table. */
export function applyKeyboardRemap(remap: KeyboardRemap): void {
  useKeyboardBindings(remappedBindings(remap));
}
