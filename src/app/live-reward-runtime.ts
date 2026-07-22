import {
  RewardSelectionController,
  type DraftRoller,
  type RewardChoice,
  type RewardSelectionSnapshot,
} from "../gameplay/run/reward-selection";
import {
  executeRewardTransition,
  type LegacyRewardRun,
  type RewardTransitionPorts,
} from "./reward-transition-adapter";
import type { RunMode } from "../gameplay/run/session";

export interface LiveRewardRun<TChoice extends RewardChoice> extends LegacyRewardRun<TChoice> {
  readonly mode: RunMode;
  readonly mods: LegacyRewardRun<TChoice>["mods"] & {
    readonly expandedDraft?: boolean;
    readonly reservePick?: boolean;
    readonly owned: Readonly<Record<string, number>>;
  };
}

export interface LiveRewardRuntime<TChoice extends RewardChoice> {
  readonly selection: RewardSelectionController<TChoice> | null;
  readonly snapshot: () => RewardSelectionSnapshot<TChoice> | null;
  readonly reset: () => void;
  readonly openDraft: () => void;
  readonly openTier: (choices: readonly TChoice[]) => void;
  readonly reroll: () => void;
  readonly selectDraft: (index: number) => void;
  readonly selectReserve: (index: number) => void;
  readonly selectTier: (index: number) => void;
}

export interface LiveRewardRuntimeOptions<TChoice extends RewardChoice> {
  readonly run: () => LiveRewardRun<TChoice>;
  readonly roll: DraftRoller<TChoice>;
  readonly transitionPorts: RewardTransitionPorts<TChoice>;
}

/** Owns reward-controller replacement and every draft/reserve/tier transition. */
export function createLiveRewardRuntime<TChoice extends RewardChoice>(
  options: LiveRewardRuntimeOptions<TChoice>,
): LiveRewardRuntime<TChoice> {
  let selection: RewardSelectionController<TChoice> | null = null;
  const create = (): RewardSelectionController<TChoice> => {
    const run = options.run();
    return new RewardSelectionController({
      mode: run.mode,
      expandedDraft: run.mods.expandedDraft === true,
      reservePick: run.mods.reservePick === true,
      rerolls: run.mods.draftRerolls,
      specialBlock: run.specialBlock,
      specialsOffered: run.specialsOffered,
      reservedChoice: run.reservedUpgrade,
    });
  };
  const execute = (transition: ReturnType<RewardSelectionController<TChoice>["dispatch"]>): void => {
    executeRewardTransition(transition, options.run(), options.transitionPorts);
  };
  return {
    get selection() { return selection; },
    snapshot: () => selection?.snapshot() ?? null,
    reset: () => { selection = create(); },
    openDraft: () => { selection = create(); execute(selection.openDraft(options.run().wave, options.roll)); },
    openTier: (choices) => { selection = create(); execute(selection.openTierUp(choices)); },
    reroll: () => { if (selection !== null) execute(selection.reroll(options.roll)); },
    selectDraft: (index) => { if (selection !== null) execute(selection.selectDraft(index)); },
    selectReserve: (index) => { if (selection !== null) execute(selection.selectReserve(index)); },
    selectTier: (index) => { if (selection !== null) execute(selection.selectTierUp(index)); },
  };
}
