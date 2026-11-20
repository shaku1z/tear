import { readFileSync } from "node:fs";
import { createSelectorResolver, parseRoles } from "./architecture/selectors.mjs";

/**
 * Code a release build must leave out, named by a role in config/architecture-roles.json: the one
 * list, also used by a source rule (pnpm check:architecture). The Vite config asks this module about
 * every chunk of a release build and fails the build on a match, so the verdict comes from the
 * bundler's own module list, not from searching the output for text.
 *
 * - Developer and test code (`engineering.lazy-channel`) never reaches a release bundle.
 * - Mobile-only code (`mobile.build-guarded`) never reaches the bundle of a target whose
 *   `mobile` is false in config/build-targets.json (mobile is paused; plans/MOBILE_LATER.md).
 */
export const DEVELOPER_ONLY_ROLE = "@release.developer-only";
export const MOBILE_ONLY_ROLE = "@release.mobile-only";

/** `src/...` for a bundler module id inside this repository's source tree, otherwise undefined. */
export function sourcePathOfModule(id) {
  const normalized = id.replaceAll("\\", "/").replace(/[?#].*$/u, "");
  if (normalized.includes("/node_modules/")) return undefined;
  const start = normalized.lastIndexOf("/src/");
  return start < 0 ? undefined : normalized.slice(start + 1);
}

/** A predicate over `src/...` paths for one role (`@release.…`), read from the role map. */
export function loadRoleMatcher(role, rolesFile = new URL("../config/architecture-roles.json", import.meta.url)) {
  const resolver = createSelectorResolver(parseRoles(JSON.parse(readFileSync(rolesFile, "utf8"))));
  return (file) => resolver.matches(role, file);
}

/** A predicate over `src/...` paths, read from the role map. */
export function loadDeveloperOnlyMatcher(rolesFile = undefined) {
  return loadRoleMatcher(DEVELOPER_ONLY_ROLE, rolesFile);
}

/**
 * The modules of a role that contribute code to a bundle. `modules` is each chunk's
 * `[module id, rendered length]` pairs. A module the bundler kept in its list but shook down
 * to nothing (rendered length 0) ships no code and is not reported.
 */
export function roleModulesInBundle(modules, inRole) {
  const found = new Set();
  for (const [id, renderedLength] of modules) {
    const file = sourcePathOfModule(id);
    if (file !== undefined && renderedLength > 0 && inRole(file)) found.add(file);
  }
  return [...found].sort();
}

/** The developer-only modules that contribute code to a bundle. */
export function developerModulesInBundle(modules, isDeveloperOnly) {
  return roleModulesInBundle(modules, isDeveloperOnly);
}
