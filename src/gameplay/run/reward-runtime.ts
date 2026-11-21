import {
  RewardSelectionController,
  transitionRewardSelection,
  type DraftRoller,
  type RewardChoice,
  type RewardSelectionIntent,
  type RewardSelectionSnapshot,
  type RewardSelectionTransition,
} from "./reward-selection";
import type { RunMode } from "./session";
import { legalSeedRaceUpgrade, type SeedRaceRun } from "./seed-locked-draft";

export interface RewardTransitionRun<TChoice extends RewardChoice> {
  wave: number;
  specialBlock: number;
  specialsOffered: number;
  reservedUpgrade: TChoice | null;
  readonly mods: {
    draftRerolls: number;
    readonly tier: Readonly<Record<string, number>>;
  };
}

export interface RewardRuntimeRun<TChoice extends RewardChoice> extends RewardTransitionRun<TChoice> {
  readonly beatThisRun?: Readonly<{ codeHash: string }>;
  readonly seedRace?: SeedRaceRun;
  readonly mode: RunMode;
  readonly mods: RewardTransitionRun<TChoice>["mods"] & {
    readonly expandedDraft?: boolean;
    readonly reservePick?: boolean;
    readonly owned: Readonly<Record<string, number>>;
  };
}

export interface RewardTransitionPorts<TChoice extends RewardChoice> {
  applyUpgrade(choice: TChoice): void;
  tierUp(choice: TChoice): void;
  ghostLoadout(choiceId: string, tier: number, wave: number): void;
  ghostEvent(event: "pickup" | "tierup"): void;
  consumeInput(): void;
  resetUi(intent: Extract<RewardSelectionIntent<TChoice>, { type: "reset-ui" }>): void;
  setScreen(screen: "draft" | "reserve" | "tierup" | "playing"): void;
  startNextWave(): void;
  requestPointer(): void;
}

export function executeRewardTransition<TChoice extends RewardChoice>(
  transition: RewardSelectionTransition<TChoice>,
  run: RewardTransitionRun<TChoice>,
  ports: RewardTransitionPorts<TChoice>,
): void {
  const snapshot = transition.snapshot;
  run.mods.draftRerolls = snapshot.rerolls;
  run.specialBlock = snapshot.specialBlock;
  run.specialsOffered = snapshot.specialsOffered;
  run.reservedUpgrade = snapshot.reservedChoice;
  for (const intent of transition.intents) {
    switch (intent.type) {
      case "apply-upgrade":
        ports.applyUpgrade(intent.choice);
        break;
      case "tier-up":
        ports.tierUp(intent.choice);
        break;
      case "ghost-loadout":
        ports.ghostLoadout(intent.choiceId, run.mods.tier[intent.choiceId] ?? 1, run.wave);
        break;
      case "ghost-event":
        ports.ghostEvent(intent.event);
        break;
      case "consume-input":
        ports.consumeInput();
        break;
      case "reset-ui":
        ports.resetUi(intent);
        break;
      case "set-screen":
        ports.setScreen(intent.screen);
        break;
      case "start-next-wave":
        ports.startNextWave();
        break;
      case "request-pointer":
        ports.requestPointer();
        break;
    }
  }
}

export type RewardDecision =
  Readonly<{ kind: "draft" | "reserve" | "tier"; index: number }> | Readonly<{ kind: "reroll" }>;

export interface RewardRuntime<TChoice extends RewardChoice> {
  readonly decide: (decision: RewardDecision, recordedSequence?: number) => void;
  readonly legal: (choice: TChoice) => boolean;
  readonly selection: RewardSelectionController<TChoice> | null;
  readonly snapshot: () => RewardSelectionSnapshot<TChoice> | null;
  readonly restore: (snapshot: RewardSelectionSnapshot<TChoice> | null) => void;
  readonly reset: () => void;
  readonly openDraft: () => void;
  readonly openTier: (choices: readonly TChoice[]) => void;
  readonly reroll: () => void;
  readonly selectDraft: (index: number) => void;
  readonly selectReserve: (index: number) => void;
  readonly selectTier: (index: number) => void;
}

export interface RewardRuntimeOptions<TChoice extends RewardChoice> {
  readonly beforeDecision?: (decision: RewardDecision, before: RewardSelectionSnapshot<TChoice>) => number;
  /** Sees every decision that changes the reward, before it applies (the live replay tap records it). */
  readonly observeDecision?: (decision: RewardDecision, before: RewardSelectionSnapshot<TChoice>) => void;
  readonly run: () => RewardRuntimeRun<TChoice>;
  readonly roll: DraftRoller<TChoice>;
  readonly transitionPorts: RewardTransitionPorts<TChoice>;
}

/** Owns reward-controller replacement and every portable draft/reserve/tier transition. */
export function createRewardRuntime<TChoice extends RewardChoice>(
  options: RewardRuntimeOptions<TChoice>,
): RewardRuntime<TChoice> {
  let selection: RewardSelectionController<TChoice> | null = null,
    decisionSequence = 0;
  const create = (): RewardSelectionController<TChoice> => {
    const run = options.run();
    const controller = new RewardSelectionController<TChoice>({
      ...(run.seedRace === undefined ? {} : { seedLocked: run.seedRace.shared.draft }),
      mode: run.mode,
      expandedDraft: run.mods.expandedDraft === true,
      reservePick: run.mods.reservePick === true,
      rerolls: run.mods.draftRerolls,
      specialBlock: run.specialBlock,
      specialsOffered: run.specialsOffered,
      reservedChoice: run.reservedUpgrade,
    });
    if (run.seedRace !== undefined || run.beatThisRun !== undefined)
      controller.restore({ ...controller.snapshot(), decisionSequence });
    return controller;
  };
  const execute = (transition: ReturnType<RewardSelectionController<TChoice>["dispatch"]>): void => {
    executeRewardTransition(transition, options.run(), options.transitionPorts);
  };
  const decide = (decision: RewardDecision, recordedSequence?: number): void => {
    if (selection === null) return;
    const before = selection.snapshot();
    const event =
      decision.kind === "reroll"
        ? { type: "reroll" as const, roll: options.roll }
        : decision.kind === "draft"
          ? {
              type: "select-draft" as const,
              index: decision.index,
              legal: (choice: TChoice) => legalSeedRaceUpgrade(choice, options.run().mods.owned),
            }
          : decision.kind === "reserve"
            ? { type: "select-reserve" as const, index: decision.index }
            : { type: "select-tier-up" as const, index: decision.index };
    const result = transitionRewardSelection(before, event);
    if (result.snapshot === before) return;
    options.observeDecision?.(decision, before);
    if (before.seedLocked !== undefined || options.run().beatThisRun !== undefined) {
      const next = recordedSequence ?? options.beforeDecision?.(decision, before) ?? decisionSequence + 1;
      if (!Number.isSafeInteger(next) || next <= decisionSequence)
        throw new TypeError("Race decision frontier must advance");
      decisionSequence = next;
      const snapshot = Object.freeze({ ...result.snapshot, decisionSequence });
      selection.restore(snapshot);
      execute({ ...result, snapshot });
    } else {
      selection.restore(result.snapshot);
      execute(result);
    }
  };
  return {
    decide,
    legal: (choice) => options.run().seedRace === undefined || legalSeedRaceUpgrade(choice, options.run().mods.owned),
    get selection() {
      return selection;
    },
    snapshot: () => selection?.snapshot() ?? null,
    restore: (snapshot) => {
      if (snapshot === null) {
        selection = null;
        return;
      }
      decisionSequence = snapshot.decisionSequence ?? 0;
      selection = create();
      selection.restore(snapshot);
    },
    reset: () => {
      decisionSequence = 0;
      selection = create();
    },
    openDraft: () => {
      selection = create();
      execute(selection.openDraft(options.run().wave, options.roll));
    },
    openTier: (choices) => {
      selection = create();
      execute(selection.openTierUp(choices));
    },
    reroll: () => {
      decide({ kind: "reroll" });
    },
    selectDraft: (index) => {
      decide({ kind: "draft", index });
    },
    selectReserve: (index) => {
      decide({ kind: "reserve", index });
    },
    selectTier: (index) => {
      decide({ kind: "tier", index });
    },
  };
}
