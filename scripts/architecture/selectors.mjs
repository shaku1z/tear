export const ROLES_FORMAT = "tear-architecture-roles.v1";

const REGEX_SPECIAL = new Set([..."\\^$.|+()[]{}"]);

function escapeCharacter(character) {
  return REGEX_SPECIAL.has(character) ? `\\${character}` : character;
}

function alternation(glob, start) {
  const end = glob.indexOf("}", start);
  if (end < 0) throw new Error(`unterminated "{" in glob ${glob}`);
  const choices = glob
    .slice(start + 1, end)
    .split(",")
    .map((choice) => [...choice].map(escapeCharacter).join(""));
  return { source: `(?:${choices.join("|")})`, next: end };
}

function starSource(glob, index) {
  if (glob[index + 1] !== "*") return { source: "[^/]*", next: index };
  if (glob[index + 2] === "/") return { source: "(?:[^/]+/)*", next: index + 2 };
  return { source: ".*", next: index + 1 };
}

/**
 * Converts a repository glob to an anchored expression. `*` stays inside one
 * path segment, `**\/` spans zero or more directories, a trailing `**` spans
 * the rest of the path, `?` is one character, and `{a,b}` is an alternation.
 */
export function globToRegExp(glob) {
  let source = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    let piece = { source: escapeCharacter(character), next: index };
    if (character === "*") piece = starSource(glob, index);
    else if (character === "?") piece = { source: "[^/]", next: index };
    else if (character === "{") piece = alternation(glob, index);
    source += piece.source;
    index = piece.next;
  }
  return new RegExp(`${source}$`, "u");
}

const compiled = new Map();
export function matchesGlob(glob, file) {
  let expression = compiled.get(glob);
  if (expression === undefined) {
    expression = globToRegExp(glob);
    compiled.set(glob, expression);
  }
  return expression.test(file);
}

export function isRoleReference(selector) {
  return selector.startsWith("@");
}

function checkRoleShape(name, role) {
  const problems = [];
  if (typeof role.purpose !== "string" || role.purpose.trim() === "") problems.push(`role ${name} needs a purpose`);
  for (const key of ["include", "exclude", "anticipate"]) {
    const value = role[key];
    if (value !== undefined && (!Array.isArray(value) || value.some((entry) => typeof entry !== "string"))) {
      problems.push(`role ${name}.${key} must be a list of strings`);
    }
  }
  if ((role.include ?? []).length + (role.anticipate ?? []).length === 0)
    problems.push(`role ${name} has no include pattern`);
  const unknown = Object.keys(role).filter((key) => !["purpose", "include", "exclude", "anticipate"].includes(key));
  if (unknown.length > 0) problems.push(`role ${name} has unknown keys: ${unknown.join(", ")}`);
  return problems;
}

/** Validates the document shape; path coverage is checked separately against the tree. */
export function parseRoles(document) {
  if (document?.format !== ROLES_FORMAT || document.roles === null || typeof document.roles !== "object") {
    throw new Error(`architecture roles must be a ${ROLES_FORMAT} document`);
  }
  const problems = Object.entries(document.roles).flatMap(([name, role]) => checkRoleShape(name, role));
  if (problems.length > 0) throw new Error(`invalid architecture roles:\n- ${problems.join("\n- ")}`);
  return document.roles;
}

/**
 * A resolver for selectors: `@role` names or repository globs. Membership is
 * decided by pattern, not by the files that exist, so a planted fixture path
 * inside a role's directory is judged like a real file.
 */
export function createSelectorResolver(roles) {
  const resolving = new Set();
  const matches = (selector, file) => {
    if (!isRoleReference(selector)) return matchesGlob(selector, file);
    const name = selector.slice(1);
    const role = roles[name];
    if (role === undefined) throw new Error(`unknown architecture role ${selector}`);
    if (resolving.has(name)) throw new Error(`architecture role ${selector} includes itself`);
    resolving.add(name);
    try {
      const included = [...(role.include ?? []), ...(role.anticipate ?? [])].some((entry) => matches(entry, file));
      return included && !(role.exclude ?? []).some((entry) => matches(entry, file));
    } finally {
      resolving.delete(name);
    }
  };
  const matchesAny = (selectors, file) => selectors.some((selector) => matches(selector, file));
  const members = (selectors, files) => files.filter((file) => matchesAny(selectors, file));
  return { matches, matchesAny, members };
}

function selectorCoverage(selector, files, resolver, where, roles) {
  if (isRoleReference(selector)) {
    const anticipatedOnly = (roles[selector.slice(1)]?.include ?? []).length === 0;
    return anticipatedOnly || resolver.members([selector], files).length > 0
      ? []
      : [`${where}: role ${selector} matches no file`];
  }
  return files.some((file) => matchesGlob(selector, file)) ? [] : [`${where}: "${selector}" matches no file`];
}

/**
 * Fail-closed coverage: every include/exclude pattern of every role and every
 * selector a rule or layer names must match at least one existing file. Only
 * patterns listed under a role's `anticipate` (guards for files that do not
 * exist yet) are exempt. Unused roles are errors so the map cannot rot.
 */
export function validateCoverage(roles, files, usages) {
  const resolver = createSelectorResolver(roles);
  const errors = [];
  for (const [name, role] of Object.entries(roles)) {
    for (const key of ["include", "exclude"]) {
      for (const entry of role[key] ?? [])
        errors.push(...selectorCoverage(entry, files, resolver, `role ${name}.${key}`, roles));
    }
  }
  const referenced = new Set();
  for (const { where, selectors } of usages) {
    for (const selector of selectors) {
      if (isRoleReference(selector)) referenced.add(selector.slice(1));
      if (isRoleReference(selector) && roles[selector.slice(1)] === undefined)
        errors.push(`${where}: unknown role ${selector}`);
      else errors.push(...selectorCoverage(selector, files, resolver, where, roles));
    }
  }
  for (const name of Object.keys(roles)) {
    for (const entry of [...(roles[name].include ?? []), ...(roles[name].exclude ?? [])]) {
      if (isRoleReference(entry)) referenced.add(entry.slice(1));
    }
  }
  for (const name of Object.keys(roles)) if (!referenced.has(name)) errors.push(`role ${name} is not used by any rule`);
  return [...new Set(errors)];
}
