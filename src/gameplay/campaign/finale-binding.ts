import type { FinaleConfig, FinaleStartInput, FinaleState } from "./finale-controller";
import { isRecord } from "../../domain/records";

export interface FinaleBindingV1 {
  readonly version: 1;
  readonly input: FinaleStartInput;
  readonly state: FinaleState;
}

function data(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (
    !isRecord(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).some((key) => typeof key !== "string" || !fields.includes(key)) ||
    Object.values(Object.getOwnPropertyDescriptors(value)).some((entry) => !("value" in entry))
  )
    throw new TypeError("Invalid finale binding data");
  return value;
}
const number = (value: unknown, min = -1e7, max = 1e7): boolean =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
export function parseFinaleConfig(value: unknown): FinaleConfig {
  const names = [
    "anchorRadius",
    "worldZoom",
    "silence",
    "wound",
    "relics",
    "cutAutoAt",
    "cutAutoStep",
    "cutSpeed",
    "restorationMin",
    "epilogueReveal",
    "rewardHold",
  ];
  const config = data(value, [...names, "fragmentCap"]);
  if (names.some((key) => !number(config[key], 0, 100000))) throw new TypeError("Invalid finale configuration");
  return structuredClone(config) as unknown as FinaleConfig;
}
function point(value: unknown, sourceDeath = false): void {
  // Live finalBossDeath retains the Source presentation color with its position.
  const p = data(value, sourceDeath ? ["x", "y", "color"] : ["x", "y"]);
  if (!number(p.x) || !number(p.y) || (p.color !== undefined && (typeof p.color !== "string" || p.color.length > 128)))
    throw new TypeError("Invalid finale point");
}

/** Strict fresh behavior data. Missing historical controller state is never inferred. */
export function parseFinaleBinding(value: unknown): FinaleBindingV1 {
  const saved = data(value, ["version", "input", "state"]);
  if (saved.version !== 1) throw new TypeError("Unsupported finale binding version");
  const input = data(saved.input, [
    "campaign",
    "recovered",
    "death",
    "rememberedDeath",
    "prepared",
    "player",
    "viewport",
    "score",
    "formattedTime",
    "perfectColor",
    "reducedMotion",
    "lowGraphics",
  ]);
  const prepared = data(input.prepared, ["isNew", "earned", "coins", "best", "wave", "score", "time"]);
  // PreparedVictory contains additional scoring-owned data; only its display flag is consumed here.
  if (
    input.campaign !== true ||
    typeof input.recovered !== "boolean" ||
    typeof prepared.isNew !== "boolean" ||
    !number(input.score, 0) ||
    typeof input.formattedTime !== "string" ||
    input.formattedTime.length > 128 ||
    typeof input.perfectColor !== "string" ||
    input.perfectColor.length > 128 ||
    [input.reducedMotion, input.lowGraphics].some((v) => v !== undefined && typeof v !== "boolean")
  )
    throw new TypeError("Invalid finale input");
  point(input.player);
  if (input.death !== undefined) point(input.death, true);
  if (input.rememberedDeath !== undefined) point(input.rememberedDeath, true);
  const viewport = data(input.viewport, ["width", "height"]);
  if (!number(viewport.width, 1, 16384) || !number(viewport.height, 1, 16384))
    throw new TypeError("Invalid finale viewport");
  const state = data(saved.state, [
    "origin",
    "anchors",
    "severed",
    "phase",
    "relicProgress",
    "relicSounds",
    "restore",
    "landed",
    "cutFlash",
    "restoring",
    "restoredColor",
    "restoredGravity",
    "tearClosed",
    "prepared",
  ]);
  point(state.origin);
  if (
    !Array.isArray(state.anchors) ||
    state.anchors.length !== 3 ||
    !Number.isSafeInteger(state.severed) ||
    !number(state.severed, 0, 3) ||
    !["silence", "wound", "relics", "cut", "restoration", "epilogue", "reward"].includes(String(state.phase)) ||
    !number(state.relicProgress, 0, 1) ||
    !Number.isSafeInteger(state.relicSounds) ||
    !number(state.relicSounds, 0, 4) ||
    !number(state.restore, 0, 1) ||
    !number(state.cutFlash, 0, 1) ||
    ["landed", "restoring", "restoredColor", "restoredGravity", "tearClosed"].some(
      (key) => typeof state[key] !== "boolean",
    )
  )
    throw new TypeError("Invalid finale state");
  state.anchors.forEach((value, index) => {
    const a = data(value, ["x", "y", "r", "depth", "cut", "auto"]);
    if (
      !number(a.x) ||
      !number(a.y) ||
      !number(a.r, 1, 4096) ||
      !number(a.depth, 0, 1) ||
      a.cut !== index < Number(state.severed) ||
      (a.auto !== undefined && typeof a.auto !== "boolean")
    )
      throw new TypeError("Invalid finale anchor");
  });
  const statePrepared = data(state.prepared, Object.keys(prepared));
  if (
    statePrepared.isNew !== prepared.isNew ||
    state.restoredColor !== Number(state.severed) >= 1 ||
    state.restoredGravity !== Number(state.severed) >= 2 ||
    state.tearClosed !== (Number(state.severed) === 3)
  )
    throw new TypeError("Incoherent finale flags");
  return structuredClone(value) as FinaleBindingV1;
}
