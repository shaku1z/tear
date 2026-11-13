import type { AudioDispatchReceipt } from "../../audio/audio-dispatch-receipts";
import type { FinaleIntent } from "../../gameplay/campaign/finale-controller";
import type { FinaleOutwardCall } from "../../gameplay/campaign/finale-outward-call";
import {
  createOutcomeChronologyJournal,
  type OutcomeChronologyJournal,
} from "../../gameplay/run/outcome-chronology-journal";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";

export interface LiveTestBuildJournals {
  readonly finaleIntentBatches: readonly (readonly FinaleIntent[])[];
  readonly finaleOutwardCalls: readonly FinaleOutwardCall[];
  readonly audioDispatchReceipts: readonly AudioDispatchReceipt[];
  /** Present only in test builds. */
  readonly outcomeChronology: OutcomeChronologyJournal | null;
  readonly observeFinaleIntents: (intents: readonly FinaleIntent[]) => void;
  readonly observeFinaleOutwardCall: (call: FinaleOutwardCall) => void;
}

/**
 * Observation journals that TearBench reads in test builds. Release builds keep
 * the journals empty: no audio observer is installed and no chronology exists.
 */
export function createLiveTestBuildJournals(
  sfx: Pick<GameRuntimeDependencies["SFX"], "observeDispatchReceipts">,
): LiveTestBuildJournals {
  const finaleIntentBatches: (readonly FinaleIntent[])[] = [];
  const finaleOutwardCalls: FinaleOutwardCall[] = [];
  const audioDispatchReceipts: AudioDispatchReceipt[] = [];
  if (__TEAR_TEST_BUILD__)
    sfx.observeDispatchReceipts((receipt) => {
      audioDispatchReceipts.push(receipt);
    });
  const outcomeChronology = __TEAR_TEST_BUILD__ ? createOutcomeChronologyJournal() : null;
  return Object.freeze({
    finaleIntentBatches,
    finaleOutwardCalls,
    audioDispatchReceipts,
    outcomeChronology,
    observeFinaleIntents: (intents: readonly FinaleIntent[]) => {
      finaleIntentBatches.push(intents);
    },
    observeFinaleOutwardCall: (call: FinaleOutwardCall) => {
      finaleOutwardCalls.push(call);
      outcomeChronology?.record({ type: "finale-outward", call });
    },
  });
}
