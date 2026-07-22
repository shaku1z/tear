import { EnvelopeSequencer, type CommandEnvelope } from "../app/messages";
import type { GameAction } from "./game-action";
import { AIM_TURN_SCALE, INPUT_AXIS_SCALE, normalizeGameAction } from "./game-action";

export type SemanticInputListener = (envelope: CommandEnvelope<GameAction>) => void;

function axis(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(-1, Math.min(1, value)) * INPUT_AXIS_SCALE);
}

/**
 * Render/device events enter without a simulation timestamp and are sealed into
 * replay commands only when the fixed-step owner drains the next simulation tick.
 */
export class SemanticInputBuffer {
  readonly #pendingEdges: GameAction[] = [];
  readonly #listeners = new Set<SemanticInputListener>();
  readonly #sequencer: EnvelopeSequencer;
  #movement: Extract<GameAction, { type: "move" }> = Object.freeze({ type: "move", x: 0, y: 0 });
  #movementDirty = false;
  #aim: GameAction | undefined;
  #aimDirty = false;
  #recording = false;

  constructor(sequencer = new EnvelopeSequencer()) {
    this.#sequencer = sequencer;
  }

  get recording(): boolean {
    return this.#recording;
  }

  startRecording(): void {
    this.reset();
    this.#sequencer.reset();
    this.#recording = true;
  }

  stopRecording(): void {
    this.#recording = false;
    this.reset();
  }

  setMovement(x: number, y: number): void {
    if (!this.#recording) return;
    const next = Object.freeze({ type: "move" as const, x: axis(x), y: axis(y) });
    if (next.x === this.#movement.x && next.y === this.#movement.y) return;
    this.#movement = next;
    this.#movementDirty = true;
  }

  setAimVector(x: number, y: number): void {
    if (!this.#recording) return;
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < 1e-9) return;
    const radians = Math.atan2(y, x);
    const normalized = radians < 0 ? radians + Math.PI * 2 : radians;
    const turn = Math.round(normalized / (Math.PI * 2) * AIM_TURN_SCALE) % AIM_TURN_SCALE;
    if (this.#aim?.type === "aim" && this.#aim.turn === turn) return;
    this.#aim = Object.freeze({ type: "aim", turn });
    this.#aimDirty = true;
  }

  push(candidate: unknown): void {
    if (!this.#recording) return;
    const normalized = normalizeGameAction(candidate);
    if (!normalized.ok) throw new TypeError(normalized.reason);
    if (normalized.action.type === "move") {
      this.setMovement(normalized.action.x / INPUT_AXIS_SCALE, normalized.action.y / INPUT_AXIS_SCALE);
      return;
    }
    if (normalized.action.type === "aim") {
      if (this.#aim?.type !== "aim" || this.#aim.turn !== normalized.action.turn) {
        this.#aim = normalized.action;
        this.#aimDirty = true;
      }
      return;
    }
    this.#pendingEdges.push(normalized.action);
  }

  drain(tick: number): readonly CommandEnvelope<GameAction>[] {
    if (!this.#recording) return Object.freeze([]);
    const actions: GameAction[] = [];
    if (this.#movementDirty) actions.push(this.#movement);
    if (this.#aimDirty && this.#aim !== undefined) actions.push(this.#aim);
    actions.push(...this.#pendingEdges);
    this.#movementDirty = false;
    this.#aimDirty = false;
    this.#pendingEdges.length = 0;

    const envelopes = actions.map((action) => this.#sequencer.command(tick, action));
    for (const envelope of envelopes) for (const listener of this.#listeners) listener(envelope);
    return Object.freeze(envelopes);
  }

  subscribe(listener: SemanticInputListener): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  reset(): void {
    this.#pendingEdges.length = 0;
    this.#movement = Object.freeze({ type: "move", x: 0, y: 0 });
    this.#movementDirty = false;
    this.#aim = undefined;
    this.#aimDirty = false;
  }
}
