export interface CommandEnvelope<TCommand> {
  readonly kind: "command";
  readonly id: number;
  readonly tick: number;
  readonly command: TCommand;
}

export interface DomainEventEnvelope<TEvent> {
  readonly kind: "domain-event";
  readonly id: number;
  readonly tick: number;
  readonly causedByCommandId?: number;
  readonly event: TEvent;
}

export class EnvelopeSequencer {
  #nextId: number;
  #lastTick: number;

  constructor(nextId = 1, lastTick = 0) {
    if (!Number.isSafeInteger(nextId) || nextId < 1) throw new RangeError("nextId must be a positive safe integer");
    if (!Number.isSafeInteger(lastTick) || lastTick < 0) throw new RangeError("lastTick must be a non-negative safe integer");
    this.#nextId = nextId;
    this.#lastTick = lastTick;
  }

  get nextId(): number {
    return this.#nextId;
  }

  get lastTick(): number {
    return this.#lastTick;
  }

  reset(nextId = 1, lastTick = 0): void {
    if (!Number.isSafeInteger(nextId) || nextId < 1) throw new RangeError("nextId must be a positive safe integer");
    if (!Number.isSafeInteger(lastTick) || lastTick < 0) throw new RangeError("lastTick must be a non-negative safe integer");
    this.#nextId = nextId;
    this.#lastTick = lastTick;
  }

  command<TCommand>(tick: number, command: TCommand): CommandEnvelope<TCommand> {
    this.#acceptTick(tick);
    return Object.freeze({ kind: "command", id: this.#nextId++, tick, command });
  }

  event<TEvent>(tick: number, event: TEvent, causedByCommandId?: number): DomainEventEnvelope<TEvent> {
    if (causedByCommandId !== undefined && (!Number.isSafeInteger(causedByCommandId) || causedByCommandId < 1 || causedByCommandId >= this.#nextId)) {
      throw new RangeError("causedByCommandId must refer to an earlier envelope");
    }
    this.#acceptTick(tick);
    const envelope: DomainEventEnvelope<TEvent> = causedByCommandId === undefined
      ? { kind: "domain-event", id: this.#nextId++, tick, event }
      : { kind: "domain-event", id: this.#nextId++, tick, causedByCommandId, event };
    return Object.freeze(envelope);
  }

  #acceptTick(tick: number): void {
    if (!Number.isSafeInteger(tick) || tick < this.#lastTick) {
      throw new RangeError("tick must be a non-negative safe integer and cannot move backwards");
    }
    this.#lastTick = tick;
  }
}

export function hasMonotonicEnvelopes(envelopes: readonly Readonly<{ id: number; tick: number }>[]): boolean {
  let previousId = 0;
  let previousTick = 0;
  for (const envelope of envelopes) {
    if (!Number.isSafeInteger(envelope.id) || envelope.id <= previousId) return false;
    if (!Number.isSafeInteger(envelope.tick) || envelope.tick < previousTick) return false;
    previousId = envelope.id;
    previousTick = envelope.tick;
  }
  return true;
}
