export type BuildTargetName = "standalone" | "crazygames" | "itch";

export interface BuildTargetLimits {
  readonly maxUnpackedBytes: number;
  readonly maxFiles: number;
  readonly maxFileBytes: number | null;
  readonly maxPathLength: number | null;
}

export interface BuildTargetDefinition {
  readonly description: string;
  readonly entry: BuildTargetName;
  /** False where the portal supplies fullscreen and forbids a custom control (CrazyGames). */
  readonly fullscreenButton: boolean;
  /**
   * False leaves the mobile-only modules (`release.mobile-only` in config/architecture-roles.json) out
   * of the build and shows a touch-only device a computer-only line; the target's test build and
   * `vite dev` keep them. Mobile is paused (owner, 2026-11-19; plans/MOBILE_LATER.md).
   */
  readonly mobile: boolean;
  readonly base: string;
  /** A second output of the test build, served below a path on the preview origin (null: none). */
  readonly previewDev: { readonly mode: string; readonly output: string; readonly env: string } | null;
  /** Which of the music encodes (`opus-<profile>/`) the build keeps; itch.io uses the CrazyGames encode. */
  readonly audioProfile: "standalone" | "crazygames";
  readonly serviceWorker: boolean;
  readonly portalSdkScript: string | null;
  readonly cloudflareHeaders: boolean;
  readonly pruneUnrequestedFiles: boolean;
  readonly forbiddenModules: readonly string[];
  readonly testMode: string | null;
  readonly package: { readonly path: string; readonly maxArchiveBytes: number } | null;
  readonly limits: BuildTargetLimits | null;
}

export declare const BUILD_TARGETS: Readonly<Record<BuildTargetName, BuildTargetDefinition>>;
export declare const BUILD_TARGET_NAMES: readonly BuildTargetName[];
export declare const BUILD_MODES: readonly string[];
export declare function buildTarget(name: BuildTargetName): BuildTargetDefinition;
export declare function resolveBuildMode(
  mode: string,
): { readonly name: BuildTargetName; readonly target: BuildTargetDefinition; readonly testBuild: boolean } | undefined;
