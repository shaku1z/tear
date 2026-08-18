import type { GhostReadCapsule } from "../ghost/capsule-reader";
import { createGhostProductionReplayComparison, type GhostProductionReplayComparison } from "../ghost/production-replay-comparison";
import type { ReplayScreenView } from "../presentation/screens/contracts";
import type { LegacyAppScreen } from "./legacy-state-controller";

export interface GhostComparisonScreenServices {
  readonly render: (view: ReplayScreenView) => void;
}

interface GhostComparisonContext {
  readonly comparison: GhostProductionReplayComparison;
  readonly from: LegacyAppScreen;
  occurrenceIndex: number;
}

/**
 * Player-facing C29 comparison controller. It owns only selection and
 * occurrence navigation; every shown result was reconstructed by the source
 * capsule's verified production replay session.
 */
export function createGhostComparisonScreenAdapter(services: GhostComparisonScreenServices) {
  let context: GhostComparisonContext | undefined;

  const view = (): ReplayScreenView | undefined => {
    if (context === undefined) return undefined;
    const selected = context.comparison.occurrences[context.occurrenceIndex];
    if (selected === undefined) return undefined;
    const total = context.comparison.occurrences.length;
    return Object.freeze({
      id: "replay",
      title: "GHOST 3 COMPARISON",
      detail: `VERIFIED SOURCE SIMULATION · ${String(context.comparison.runs.length)} RUNS`,
      paused: true,
      speed: 1,
      elapsed: `EVENT ${String(context.occurrenceIndex + 1)}`,
      duration: `EVENT ${String(total)}`,
      progress: total <= 1 ? 1 : context.occurrenceIndex / (total - 1),
      score: `OCCURRENCE ${String(selected.occurrence + 1)}`,
      comparison: Object.freeze({
        eventType: selected.eventType,
        occurrence: selected.occurrence + 1,
        index: context.occurrenceIndex,
        total,
        runs: selected.runs,
      }),
      infoVisible: false,
    });
  };

  return Object.freeze({
    open(capsules: readonly GhostReadCapsule[], from: LegacyAppScreen): boolean {
      try {
        context = { comparison: createGhostProductionReplayComparison(capsules), from, occurrenceIndex: 0 };
        return true;
      } catch {
        context = undefined;
        return false;
      }
    },
    render(): void { const snapshot = view(); if (snapshot !== undefined) services.render(snapshot); },
    exit(): LegacyAppScreen | undefined { const from = context?.from; context = undefined; return from; },
    stepOccurrence(direction: -1 | 1): void {
      if (context === undefined) return;
      context.occurrenceIndex = Math.max(0, Math.min(context.comparison.occurrences.length - 1, context.occurrenceIndex + direction));
    },
    restart(): void { if (context !== undefined) context.occurrenceIndex = 0; },
    status(): Readonly<{ paused: boolean; speed: number; infoVisible: boolean; progress: number; from: LegacyAppScreen }> | null {
      if (context === undefined) return null;
      const total = context.comparison.occurrences.length;
      return Object.freeze({ paused: true, speed: 1, infoVisible: false,
        progress: total <= 1 ? 1 : context.occurrenceIndex / (total - 1), from: context.from });
    },
  });
}
