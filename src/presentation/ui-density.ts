import { INTERFACE_ACCESSIBILITY, cssToLogical } from "../domain/interface-accessibility";
import type { TokenSnapshot } from "./ui-contracts";

/** What the density depends on: the input owner and the live CSS-per-logical scale. */
export interface DensityProfile {
  readonly touch: boolean;
  readonly cssPerLogicalPixel: number;
}

/** The touch profile's comfortable minimums on large touch screens (tablets, touch laptops). */
const TOUCH_TYPE_BUMP: Readonly<Record<string, number>> = {
  micro: 3,
  caption: 3,
  label: 3,
  body: 3,
  lead: 3,
  title: 2,
  h2: 2,
  h1: 2,
};
const TOUCH_METRICS: Readonly<Record<string, number>> = {
  btnH: 60,
  btnW: 320,
  chipH: 38,
  chipW: 116,
  settingsRowH: 66,
  settingsControlW: 272,
  settingsControlH: 54,
  settingsStepperW: 60,
  minTarget: 48,
  listRowH: 48,
};
const TEXT_ROLES = ["micro", "caption", "label", "body", "lead", "title", "h2", "h1", "display"] as const;
const TARGET_METRICS = ["btnH", "chipH", "settingsControlH", "settingsStepperW", "minTarget", "listRowH"] as const;

/**
 * Derives the live token values from the authored (desktop) tokens.
 *
 * Desktop keeps the authored values. Touch applies the comfortable touch bump, then
 * guarantees the physical floors: every text role renders at or above
 * `minTouchTextCssPx` and every interactive metric at or above `minTouchTargetCssPx`
 * at the current scale. Above the floor the type ramp keeps half of its authored
 * steps, so hierarchy survives on a phone without titles eating the screen.
 * One rule for every size: a tablet resolves to the plain touch profile, a phone in
 * landscape to the compact one. `floors: false` yields the plain touch profile for a
 * screen whose composition has not adopted the compact layout yet.
 */
export function densityTokens(base: TokenSnapshot, profile: DensityProfile, floors = true): TokenSnapshot {
  const type = { ...base.type },
    metric = { ...base.metric };
  if (!profile.touch) return { type, metric };
  if (!floors) {
    for (const role of TEXT_ROLES) type[role] = (base.type[role] ?? 0) + (TOUCH_TYPE_BUMP[role] ?? 0);
    return { type, metric: Object.assign(metric, TOUCH_METRICS) };
  }
  const floor = cssToLogical(INTERFACE_ACCESSIBILITY.minTouchTextCssPx, profile.cssPerLogicalPixel);
  const target = cssToLogical(INTERFACE_ACCESSIBILITY.minTouchTargetCssPx, profile.cssPerLogicalPixel);
  const micro = base.type.micro ?? 0;
  for (const role of TEXT_ROLES) {
    const authored = base.type[role] ?? micro;
    type[role] = Math.max(authored + (TOUCH_TYPE_BUMP[role] ?? 0), floor + Math.ceil((authored - micro) / 2));
  }
  Object.assign(metric, TOUCH_METRICS);
  for (const key of TARGET_METRICS) metric[key] = Math.max(metric[key] ?? 0, target);
  metric.settingsRowH = Math.max(metric.settingsRowH ?? 0, target + (base.metric.btnGap ?? 0));
  return { type, metric };
}

/** True when the derived profile is tighter than the plain touch bump (a phone in landscape). */
export function isCompactDensity(profile: DensityProfile): boolean {
  if (!profile.touch) return false;
  return (
    cssToLogical(INTERFACE_ACCESSIBILITY.minTouchTargetCssPx, profile.cssPerLogicalPixel) > (TOUCH_METRICS.btnH ?? 0)
  );
}
