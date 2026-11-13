import { readFileSync } from "node:fs";

/**
 * The release targets and their constraints, defined once in
 * config/build-targets.json and read by the Vite config, the build, packaging,
 * reproducibility and budget scripts.
 */
export const BUILD_TARGETS = Object.freeze(
  JSON.parse(readFileSync(new URL("../config/build-targets.json", import.meta.url), "utf8")),
);

export const BUILD_TARGET_NAMES = Object.freeze(Object.keys(BUILD_TARGETS));

export function buildTarget(name) {
  const target = BUILD_TARGETS[name];
  if (target === undefined) throw new Error(`unknown build target: ${String(name)}`);
  return target;
}

/** A Vite mode names a target (`itch`) or a target's test build (`test-standalone`). */
export function resolveBuildMode(mode) {
  for (const name of BUILD_TARGET_NAMES) {
    const target = BUILD_TARGETS[name];
    if (mode === name) return Object.freeze({ name, target, testBuild: false });
    if (target.testMode !== null && mode === target.testMode) return Object.freeze({ name, target, testBuild: true });
  }
  return undefined;
}

export const BUILD_MODES = Object.freeze(
  BUILD_TARGET_NAMES.flatMap((name) => [
    name,
    ...(BUILD_TARGETS[name].testMode === null ? [] : [BUILD_TARGETS[name].testMode]),
  ]),
);
