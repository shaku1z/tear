/**
 * Load milestones as User Timing marks (`tear:<milestone>`), recorded once per
 * page: the first drawn frame, the end of platform loading (the menu accepts
 * input) and the first gameplay start. The load profile and budget test read
 * them from release builds, so they carry no engineering data and cost one
 * `performance.mark` each.
 */
export type StartupMilestone = "first-frame" | "loading-finished" | "gameplay-start";

const recorded = new Set<StartupMilestone>();

export function markStartupMilestone(milestone: StartupMilestone): void {
  if (recorded.has(milestone)) return;
  recorded.add(milestone);
  try {
    globalThis.performance.mark(`tear:${milestone}`);
  } catch {
    /* A page without User Timing (or a node test) simply records nothing. */
  }
}
