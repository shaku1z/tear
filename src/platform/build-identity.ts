import type { TearBuildTarget } from "./contracts";

/** Which build this is. Composition builds one and hands it to everything that shows or records it. */
export interface BuildIdentity {
  readonly version: string;
  /** The source revision the build was made from (a full commit hash). */
  readonly revision: string;
  readonly target: TearBuildTarget;
}

/** Seven characters name a commit unambiguously in a repository this size and fit a settings row. */
export const SHORT_REVISION_LENGTH = 7;

/** The one text the game shows for its build, in Settings and on the error screen: `v0.1.0 · 820e8e9`. */
export function formatBuildLabel(build: BuildIdentity): string {
  return `v${build.version} · ${build.revision.slice(0, SHORT_REVISION_LENGTH)}`;
}
