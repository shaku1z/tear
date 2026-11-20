import type { PrivacyStance } from "./privacy-stance";

/** The player's Settings choice about anonymous run statistics; the settings controller writes it. */
export interface StatisticsChoice {
  share: boolean;
}

/** The choice starts on: statistics are opt-out, and the first-run notice says so. */
export function createStatisticsChoice(): StatisticsChoice {
  return { share: true };
}

/** What a run statistic needs before it is sent. */
export interface StatisticsGate {
  readonly stance: PrivacyStance;
  readonly choice: StatisticsChoice;
  /** Whether the player has been shown the first-run notice that says statistics are sent. */
  readonly noticeAcknowledged: () => boolean;
}

/**
 * True only when the build sends statistics at all, the player has not turned them off, and the player
 * has seen the notice that says they are on. Every one of the three must hold, so a build that cannot
 * show the notice sends nothing.
 */
export function statisticsAllowed(gate: StatisticsGate): boolean {
  return gate.stance.sendsStatistics && gate.choice.share && gate.noticeAcknowledged();
}
