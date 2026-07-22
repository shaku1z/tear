import type { RunMode } from "./session";

export interface RewardChoice {
  readonly id: string;
  readonly cat?: string;
  readonly tiers?: readonly unknown[];
}

export type RewardSelectionPhase = "idle" | "draft" | "reserve" | "tierup" | "complete";

export interface RewardSelectionOptions<TChoice extends RewardChoice> {
  readonly mode: RunMode;
  readonly expandedDraft?: boolean;
  readonly reservePick?: boolean;
  readonly rerolls?: number;
  readonly specialBlock?: number;
  readonly specialsOffered?: number;
  readonly reservedChoice?: TChoice | null;
}

export interface RewardSelectionSnapshot<TChoice extends RewardChoice> {
  readonly phase: RewardSelectionPhase;
  readonly mode: RunMode;
  readonly wave: number;
  readonly choices: readonly TChoice[];
  readonly reserveChoices: readonly TChoice[];
  readonly reservedChoice: TChoice | null;
  readonly expandedDraft: boolean;
  readonly reservePick: boolean;
  readonly rerolls: number;
  readonly specialBlock: number;
  readonly specialsOffered: number;
  readonly revision: number;
}

export interface DraftRollRequest {
  readonly count: number;
  readonly forceSpecial: boolean;
  readonly excludeIds: readonly string[];
}

export type DraftRoller<TChoice extends RewardChoice> = (request: DraftRollRequest) => readonly TChoice[];

export type RewardSelectionIntent<TChoice extends RewardChoice> =
  | Readonly<{ type: "apply-upgrade"; choice: TChoice }>
  | Readonly<{ type: "tier-up"; choice: TChoice }>
  | Readonly<{ type: "ghost-loadout"; choiceId: string; event: "pickup" | "tierup" }>
  | Readonly<{ type: "ghost-event"; event: "pickup" | "tierup" }>
  | Readonly<{ type: "consume-input" }>
  | Readonly<{ type: "reset-ui"; enter: boolean; focus: boolean; scroll: boolean }>
  | Readonly<{ type: "set-screen"; screen: "draft" | "reserve" | "tierup" | "playing" }>
  | Readonly<{ type: "start-next-wave" }>
  | Readonly<{ type: "request-pointer" }>;

export type RewardSelectionEvent<TChoice extends RewardChoice> =
  | Readonly<{ type: "open-draft"; wave: number; roll: DraftRoller<TChoice> }>
  | Readonly<{ type: "reroll"; roll: DraftRoller<TChoice> }>
  | Readonly<{ type: "select-draft"; index: number }>
  | Readonly<{ type: "select-reserve"; index: number }>
  | Readonly<{ type: "open-tier-up"; choices: readonly TChoice[] }>
  | Readonly<{ type: "select-tier-up"; index: number }>;

export interface RewardSelectionTransition<TChoice extends RewardChoice> {
  readonly snapshot: RewardSelectionSnapshot<TChoice>;
  readonly intents: readonly RewardSelectionIntent<TChoice>[];
}

const NO_INTENTS = Object.freeze([]) as readonly RewardSelectionIntent<never>[];

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer`);
  return value;
}

function positiveWave(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError("wave must be a positive integer");
  return value;
}

function immutableSnapshot<TChoice extends RewardChoice>(
  snapshot: Omit<RewardSelectionSnapshot<TChoice>, "choices" | "reserveChoices"> & {
    readonly choices: readonly TChoice[];
    readonly reserveChoices: readonly TChoice[];
  },
): RewardSelectionSnapshot<TChoice> {
  return Object.freeze({ ...snapshot, choices: Object.freeze([...snapshot.choices]), reserveChoices: Object.freeze([...snapshot.reserveChoices]) });
}

function transition<TChoice extends RewardChoice>(
  snapshot: RewardSelectionSnapshot<TChoice>,
  changes: Partial<RewardSelectionSnapshot<TChoice>>,
  intents: readonly RewardSelectionIntent<TChoice>[],
): RewardSelectionTransition<TChoice> {
  return Object.freeze({
    snapshot: immutableSnapshot({ ...snapshot, ...changes, revision: snapshot.revision + 1 }),
    intents: Object.freeze([...intents]),
  });
}

function noChange<TChoice extends RewardChoice>(snapshot: RewardSelectionSnapshot<TChoice>): RewardSelectionTransition<TChoice> {
  return Object.freeze({ snapshot, intents: NO_INTENTS });
}

function isTraining(mode: RunMode): boolean { return mode === "tutorial" || mode === "playground"; }
function isSpecial(choice: RewardChoice): boolean { return choice.tiers !== undefined; }
function specialCount(choices: readonly RewardChoice[]): number { return choices.filter(isSpecial).length; }

function completionIntents<TChoice extends RewardChoice>(mode: RunMode): readonly RewardSelectionIntent<TChoice>[] {
  return [
    ...(!isTraining(mode) ? [{ type: "start-next-wave" } as const] : []),
    { type: "set-screen", screen: "playing" },
    { type: "request-pointer" },
  ];
}

function rollDraft<TChoice extends RewardChoice>(
  snapshot: RewardSelectionSnapshot<TChoice>, wave: number, roller: DraftRoller<TChoice>, excludeIds: readonly string[],
): Pick<RewardSelectionSnapshot<TChoice>, "wave" | "choices" | "reservedChoice" | "specialBlock" | "specialsOffered"> {
  const block = Math.floor((wave - 1) / 10);
  const specialBlock = snapshot.specialBlock === block ? snapshot.specialBlock : block;
  const offeredBefore = snapshot.specialBlock === block ? snapshot.specialsOffered : 0;
  const localWave = ((wave - 1) % 10) + 1;
  const draftsLeft = Math.max(1, 10 - localWave);
  const needed = 2 - offeredBefore;
  const count = snapshot.expandedDraft ? 4 : 3;
  const rolled = [...roller({ count, forceSpecial: needed > 0 && draftsLeft <= needed, excludeIds: Object.freeze([...excludeIds]) })];
  if (rolled.length > count) throw new RangeError("draft roller returned more choices than requested");

  const reserved = snapshot.reservedChoice;
  if (reserved && !rolled.some((choice) => choice.id === reserved.id) && rolled.length > 0) {
    let replacement = rolled.length - 1;
    for (let index = 0; index < rolled.length; index++) {
      const candidate = rolled[index];
      if (candidate && !isSpecial(candidate)) replacement = index;
    }
    rolled[replacement] = reserved;
  }
  return {
    wave, choices: rolled, reservedChoice: null, specialBlock,
    specialsOffered: offeredBefore + specialCount(rolled),
  };
}

export function initialRewardSelectionSnapshot<TChoice extends RewardChoice>(
  options: RewardSelectionOptions<TChoice>,
): RewardSelectionSnapshot<TChoice> {
  return immutableSnapshot({
    phase: "idle", mode: options.mode, wave: 0, choices: [], reserveChoices: [],
    reservedChoice: options.reservedChoice ?? null,
    expandedDraft: options.expandedDraft === true, reservePick: options.reservePick === true,
    rerolls: nonNegativeInteger(options.rerolls ?? 0, "rerolls"),
    specialBlock: options.specialBlock ?? -1,
    specialsOffered: nonNegativeInteger(options.specialsOffered ?? 0, "specialsOffered"), revision: 0,
  });
}

export function transitionRewardSelection<TChoice extends RewardChoice>(
  snapshot: RewardSelectionSnapshot<TChoice>, event: RewardSelectionEvent<TChoice>,
): RewardSelectionTransition<TChoice> {
  if (event.type === "open-draft") {
    const wave = positiveWave(event.wave);
    return transition(snapshot, {
      phase: "draft", reserveChoices: [], ...rollDraft(snapshot, wave, event.roll, []),
    }, [{ type: "set-screen", screen: "draft" }]);
  }
  if (event.type === "reroll") {
    if (snapshot.phase !== "draft" || snapshot.rerolls === 0) return noChange(snapshot);
    const adjusted = immutableSnapshot({
      ...snapshot,
      specialsOffered: Math.max(0, snapshot.specialsOffered - specialCount(snapshot.choices)),
    });
    return transition(snapshot, {
      rerolls: snapshot.rerolls - 1,
      ...rollDraft(adjusted, positiveWave(snapshot.wave), event.roll, snapshot.choices.map((choice) => choice.id)),
    }, [{ type: "reset-ui", enter: true, focus: true, scroll: false }]);
  }
  if (event.type === "select-draft") {
    if (snapshot.phase !== "draft") return noChange(snapshot);
    const choice = snapshot.choices[event.index];
    const intents: RewardSelectionIntent<TChoice>[] = [];
    if (choice) intents.push(
      { type: "apply-upgrade", choice },
      { type: "ghost-loadout", choiceId: choice.id, event: "pickup" },
      { type: "ghost-event", event: "pickup" },
    );
    intents.push({ type: "consume-input" });
    const reserveChoices = choice && snapshot.reservePick && !isTraining(snapshot.mode)
      ? snapshot.choices.filter((_, index) => index !== event.index) : [];
    if (reserveChoices.length > 0) return transition(snapshot, { phase: "reserve", reserveChoices }, [
      ...intents, { type: "set-screen", screen: "reserve" },
      { type: "reset-ui", enter: false, focus: true, scroll: false },
    ]);
    return transition(snapshot, { phase: "complete", reserveChoices: [] }, [...intents, ...completionIntents<TChoice>(snapshot.mode)]);
  }
  if (event.type === "select-reserve") {
    if (snapshot.phase !== "reserve") return noChange(snapshot);
    return transition(snapshot, {
      phase: "complete", reservedChoice: event.index >= 0 ? snapshot.reserveChoices[event.index] ?? null : null,
      reserveChoices: [],
    }, [{ type: "consume-input" }, ...completionIntents<TChoice>(snapshot.mode)]);
  }
  if (event.type === "open-tier-up") {
    return transition(snapshot, {
      phase: "tierup", choices: event.choices, reserveChoices: [],
    }, [{ type: "set-screen", screen: "tierup" }, { type: "reset-ui", enter: false, focus: false, scroll: true }]);
  }
  if (snapshot.phase !== "tierup") return noChange(snapshot);
  const choice = snapshot.choices[event.index];
  const intents: RewardSelectionIntent<TChoice>[] = [];
  if (choice) intents.push(
    { type: "tier-up", choice },
    { type: "ghost-loadout", choiceId: choice.id, event: "tierup" },
    { type: "ghost-event", event: "tierup" },
  );
  intents.push({ type: "consume-input" }, ...completionIntents<TChoice>(snapshot.mode));
  return transition(snapshot, { phase: "complete" }, intents);
}

export function eligibleTierChoices<TChoice extends RewardChoice>(
  catalog: readonly TChoice[], owned: Readonly<Record<string, number>>, tiers: Readonly<Record<string, number>>,
): readonly TChoice[] {
  const eligible: TChoice[] = [];
  for (const id of Object.keys(owned)) {
    const choice = catalog.find((candidate) => candidate.id === id);
    if (!choice?.tiers) continue;
    const current = tiers[id] ?? 1;
    if (current - 1 < choice.tiers.length) eligible.push(choice);
  }
  eligible.sort((left, right) => (left.cat ?? "") < (right.cat ?? "") ? -1 : 1);
  return Object.freeze(eligible);
}

export class RewardSelectionController<TChoice extends RewardChoice> {
  #snapshot: RewardSelectionSnapshot<TChoice>;

  constructor(options: RewardSelectionOptions<TChoice>) { this.#snapshot = initialRewardSelectionSnapshot(options); }
  snapshot(): RewardSelectionSnapshot<TChoice> { return this.#snapshot; }
  dispatch(event: RewardSelectionEvent<TChoice>): RewardSelectionTransition<TChoice> {
    const result = transitionRewardSelection(this.#snapshot, event);
    this.#snapshot = result.snapshot;
    return result;
  }
  openDraft(wave: number, roll: DraftRoller<TChoice>): RewardSelectionTransition<TChoice> { return this.dispatch({ type: "open-draft", wave, roll }); }
  reroll(roll: DraftRoller<TChoice>): RewardSelectionTransition<TChoice> { return this.dispatch({ type: "reroll", roll }); }
  selectDraft(index: number): RewardSelectionTransition<TChoice> { return this.dispatch({ type: "select-draft", index }); }
  selectReserve(index: number): RewardSelectionTransition<TChoice> { return this.dispatch({ type: "select-reserve", index }); }
  openTierUp(choices: readonly TChoice[]): RewardSelectionTransition<TChoice> { return this.dispatch({ type: "open-tier-up", choices }); }
  selectTierUp(index: number): RewardSelectionTransition<TChoice> { return this.dispatch({ type: "select-tier-up", index }); }
}
