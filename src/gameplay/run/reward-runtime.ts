import {
  RewardSelectionController,
  type DraftRoller,
  type RewardChoice,
  type RewardSelectionIntent,
  type RewardSelectionSnapshot,
  type RewardSelectionTransition,
} from "./reward-selection";
import type { RunMode } from "./session";

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
      case "apply-upgrade": ports.applyUpgrade(intent.choice); break;
      case "tier-up": ports.tierUp(intent.choice); break;
      case "ghost-loadout": ports.ghostLoadout(intent.choiceId, run.mods.tier[intent.choiceId] ?? 1, run.wave); break;
      case "ghost-event": ports.ghostEvent(intent.event); break;
      case "consume-input": ports.consumeInput(); break;
      case "reset-ui": ports.resetUi(intent); break;
      case "set-screen": ports.setScreen(intent.screen); break;
      case "start-next-wave": ports.startNextWave(); break;
      case "request-pointer": ports.requestPointer(); break;
    }
  }
}

export interface RewardRuntime<TChoice extends RewardChoice> {
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
  readonly run: () => RewardRuntimeRun<TChoice>;
  readonly roll: DraftRoller<TChoice>;
  readonly transitionPorts: RewardTransitionPorts<TChoice>;
}

/** Owns reward-controller replacement and every portable draft/reserve/tier transition. */
export function createRewardRuntime<TChoice extends RewardChoice>(
  options: RewardRuntimeOptions<TChoice>,
): RewardRuntime<TChoice> {
  let selection: RewardSelectionController<TChoice> | null = null;
  const create = (): RewardSelectionController<TChoice> => {
    const run = options.run();
    return new RewardSelectionController({
      mode: run.mode, expandedDraft: run.mods.expandedDraft === true,
      reservePick: run.mods.reservePick === true, rerolls: run.mods.draftRerolls,
      specialBlock: run.specialBlock, specialsOffered: run.specialsOffered,
      reservedChoice: run.reservedUpgrade,
    });
  };
  const execute = (transition: ReturnType<RewardSelectionController<TChoice>["dispatch"]>): void => {
    executeRewardTransition(transition, options.run(), options.transitionPorts);
  };
  return {
    get selection() { return selection; },
    snapshot: () => selection?.snapshot() ?? null,
    restore: (snapshot) => {
      if (snapshot === null) { selection = null; return; }
      selection = create(); selection.restore(snapshot);
    },
    reset: () => { selection = create(); },
    openDraft: () => { selection = create(); execute(selection.openDraft(options.run().wave, options.roll)); },
    openTier: (choices) => { selection = create(); execute(selection.openTierUp(choices)); },
    reroll: () => { if (selection !== null) execute(selection.reroll(options.roll)); },
    selectDraft: (index) => { if (selection !== null) execute(selection.selectDraft(index)); },
    selectReserve: (index) => { if (selection !== null) execute(selection.selectReserve(index)); },
    selectTier: (index) => { if (selection !== null) execute(selection.selectTierUp(index)); },
  };
}
