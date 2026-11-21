import { ruleApplies, formatFinding, targetSelected } from "./evaluate.mjs";

function describeRule(rule) {
  const edges =
    rule.kind === "import" ? ` (${rule.edges ?? "any"} edges${rule.transitive === true ? ", transitive" : ""})` : "";
  return `${rule.id} [${rule.kind}${edges}]: ${rule.message}`;
}

function permissionsLine(layer, allow) {
  const entries = Object.entries(allow[layer] ?? {});
  const any = entries.filter(([, permission]) => permission === "any").map(([name]) => name);
  const type = entries.filter(([, permission]) => permission === "type").map(([name]) => name);
  return `may import ${any.length > 0 ? any.join(", ") : "nothing outside its layer"}${type.length > 0 ? `; type-only: ${type.join(", ")}` : ""}`;
}

function section(title, items) {
  return items.length === 0
    ? [`  ${title}: none`]
    : [`  ${title} (${String(items.length)}):`, ...items.map((item) => `    - ${item}`)];
}

/** Human-readable account of which roles, rules, layer permissions, allowlist entries and cycles concern one file. */
export function explainFile(file, analysis) {
  const { configuration, resolver, tree, assignment, findings } = analysis;
  const { rules, roles, layers, baseline } = configuration;
  const module = tree.modules.get(file);
  const layer = assignment.get(file);
  const lines = [
    file,
    `  exists: ${tree.available.has(file) ? `yes${module === undefined ? "" : ` (${String(module.text.split(/\r?\n/u).length)} lines)`}` : "no"}`,
  ];
  lines.push(`  layer: ${layer ?? "none"}${layer === undefined ? "" : `; ${permissionsLine(layer, layers.allow)}`}`);
  lines.push(
    ...section(
      "roles",
      Object.keys(roles).filter((name) => resolver.matches(`@${name}`, file)),
    ),
  );
  lines.push(...section("rules applied", rules.filter((rule) => ruleApplies(rule, file, resolver)).map(describeRule)));
  lines.push(
    ...section(
      "rules exempting it",
      rules
        .filter((rule) => resolver.matchesAny(rule.in, file) && resolver.matchesAny(rule.except ?? [], file))
        .map((rule) => `${rule.id} (exempt via ${(rule.except ?? []).join(", ")})`),
    ),
  );
  lines.push(
    ...section(
      "rules protecting it as an import target",
      rules
        .filter((rule) => rule.kind === "import" && targetSelected(rule, file, resolver))
        .map(
          (rule) =>
            `${rule.id}: not from ${rule.in.join(", ")}${rule.except === undefined ? "" : ` (except ${rule.except.join(", ")})`}`,
        ),
    ),
  );
  const allowlisted = baseline.layerViolations.filter((entry) => entry.from === file || entry.to === file);
  lines.push(
    ...section(
      "allowlisted layer edges",
      allowlisted.map((entry) => `${entry.from} -> ${entry.to} (${entry.kind})`),
    ),
  );
  const cycle = baseline.cycles.find((members) => members.includes(file));
  lines.push(
    `  recorded import cycle: ${cycle === undefined ? "none" : `member of a ${String(cycle.length)}-file cycle`}`,
  );
  lines.push(...section("current findings", findings.filter((entry) => entry.file === file).map(formatFinding)));
  return lines.join("\n");
}
