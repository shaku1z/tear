import type { TearBuildTarget } from "./contracts";

/**
 * What a build tells the player about their data, and where. One row per build target, so a new target
 * is a compile error until it says what it keeps: Settings, the first-run notice and the statistics
 * gate all read this table and nothing else.
 */
export interface PrivacyStance {
  /** The page that explains what the build collects; null when the build keeps nothing outside the browser. */
  readonly privacyUrl: string | null;
  /** Terms of service the build links to; null when there are none to link. */
  readonly termsUrl: string | null;
  /** A line shown in place of links, for a build that sends nothing anywhere. */
  readonly note: string | null;
  /**
   * The build sends anonymous run statistics and so offers the Settings switch and the first-run notice.
   * Only a build with its own cloud can; the portal and local builds send nothing to Firebase.
   */
  readonly sendsStatistics: boolean;
}

/** Our own page, served from the standalone build's origin. */
export const OWN_PRIVACY_PAGE = "/privacy";

const PORTAL_TERMS_PAGE = "https://www.crazygames.com/terms-and-conditions";
const PORTAL_PRIVACY_PAGE = "https://www.crazygames.com/privacy";

const STANCES: Readonly<Record<TearBuildTarget, PrivacyStance>> = Object.freeze({
  standalone: { privacyUrl: OWN_PRIVACY_PAGE, termsUrl: null, note: null, sendsStatistics: true },
  crazygames: { privacyUrl: PORTAL_PRIVACY_PAGE, termsUrl: PORTAL_TERMS_PAGE, note: null, sendsStatistics: false },
  itch: { privacyUrl: null, termsUrl: null, note: "Progress is stored only in this browser.", sendsStatistics: false },
});

export function privacyStanceFor(target: TearBuildTarget): PrivacyStance {
  return STANCES[target];
}
