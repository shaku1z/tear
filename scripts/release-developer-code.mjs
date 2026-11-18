import { readFileSync } from "node:fs";
import { createSelectorResolver, parseRoles } from "./architecture/selectors.mjs";

/**
 * Developer and test code must not reach a release bundle. Which modules are developer-only is
 * the role below in config/architecture-roles.json: the one list, also used by the source rule
 * `engineering.lazy-channel` (pnpm check:architecture). The Vite config asks this module about
 * every chunk of a release build and fails the build on a match, so the verdict comes from the
 * bundler's own module list, not from searching the output for text.
 */
export const DEVELOPER_ONLY_ROLE = "@release.developer-only";

/** `src/...` for a bundler module id inside this repository's source tree, otherwise undefined. */
export function sourcePathOfModule(id) {
  const normalized = id.replaceAll("\\", "/").replace(/[?#].*$/u, "");
  if (normalized.includes("/node_modules/")) return undefined;
  const start = normalized.lastIndexOf("/src/");
  return start < 0 ? undefined : normalized.slice(start + 1);
}

/** A predicate over `src/...` paths, read from the role map. */
export function loadDeveloperOnlyMatcher(rolesFile = new URL("../config/architecture-roles.json", import.meta.url)) {
  const resolver = createSelectorResolver(parseRoles(JSON.parse(readFileSync(rolesFile, "utf8"))));
  return (file) => resolver.matches(DEVELOPER_ONLY_ROLE, file);
}

/**
 * The developer-only modules that contribute code to a bundle. `modules` is each chunk's
 * `[module id, rendered length]` pairs. A module the bundler kept in its list but shook down
 * to nothing (rendered length 0) ships no code and is not reported.
 */
export function developerModulesInBundle(modules, isDeveloperOnly) {
  const found = new Set();
  for (const [id, renderedLength] of modules) {
    const file = sourcePathOfModule(id);
    if (file !== undefined && renderedLength > 0 && isDeveloperOnly(file)) found.add(file);
  }
  return [...found].sort();
}
