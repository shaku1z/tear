import { createHash } from "node:crypto";

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("shadow plan contains a non-finite number");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => {
    if (value[key] === undefined) throw new TypeError(`shadow plan field ${key} is undefined`);
    return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
  }).join(",")}}`;
  throw new TypeError("shadow plan contains non-JSON data");
}

function sha256(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
function stableHash(value) {
  const text = canonicalJson(value); let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n, mask = 0xffffffffffffffffn;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index); hash ^= BigInt(code & 0xff); hash = (hash * prime) & mask;
    hash ^= BigInt(code >>> 8); hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}
function canonicalStrings(values) { return [...new Set(values)].sort(); }
const COMMON_INVARIANT_IDS = Object.freeze([
  "runtime.finite-state", "player.finite-transform", "blade.finite-transform",
  "entity.unique-id", "entity.valid-owner", "player.valid-health", "replay.monotonic-time",
]);
const ENVIRONMENT_INVARIANT_IDS = Object.freeze([
  "runtime.finite-state", "environment.finite-state", "environment.unique-id",
  "environment.valid-references", "environment.no-orphan-link", "environment.legal-transition",
  "environment.bounded",
]);
const UNSUPPORTED_INVARIANT_IDS = new Set(["replay.branch-equivalence", "test.production-isolation"]);
const GRAVEYARD_TASK_IDS = Object.freeze({
  "all-shared-runtime-history": "graveyard.all-shared-runtime-history",
  "audio-lifecycle-history": "graveyard.audio-lifecycle-history",
  "migration-and-corruption-history": "graveyard.migration-and-corruption-history",
  "movement-boundary-history": "graveyard.movement-boundary-history",
  "planted-downstream-divergence": "graveyard.planted-downstream-divergence",
  "progression-ledger-history": "graveyard.progression-ledger-history",
  "screen-route-history": "graveyard.screen-route-history",
});
const PLANNER_POLICY = Object.freeze({
  version: 1, commonInvariantIds: COMMON_INVARIANT_IDS,
  environmentInvariantIds: ENVIRONMENT_INVARIANT_IDS,
  unsupportedInvariantIds: [...UNSUPPORTED_INVARIANT_IDS].sort(),
  graveyardTaskIds: GRAVEYARD_TASK_IDS,
  resourceContention: "resource-class-and-key-serial-upper-bound",
});

function effectiveInvariantIds(scenario) {
  const environment = scenario.subject?.kind === "environment-field"
    || scenario.subject?.kind === "environment-combat-object";
  return canonicalStrings([
    ...(scenario.assertions ?? []), ...COMMON_INVARIANT_IDS,
    ...(environment ? ENVIRONMENT_INVARIANT_IDS : []),
  ]);
}
function semanticTask(task, policyVersion) {
  return {
    taskId: task.taskId, version: task.version,
    runner: { kind: task.runner.kind, executable: task.runner.executable, args: [...task.runner.args] },
    claimIds: [...task.claimIds].sort(),
    dependencies: [...task.dependencies].map((entry) => ({ ...entry })).sort((a, b) =>
      `${a.taskId}:${a.outputId ?? ""}`.localeCompare(`${b.taskId}:${b.outputId ?? ""}`)),
    resourceClass: task.resourceClass, resourceKeys: [...task.resourceKeys].sort(),
    outputs: [...task.outputs].map((entry) => ({ ...entry })).sort((a, b) => a.outputId.localeCompare(b.outputId)),
    timeoutMs: task.timeoutMs, intentionalReplica: task.intentionalReplica,
    replicaGroup: task.replicaGroup ?? null, definitionPolicyVersion: policyVersion,
  };
}
export function shadowTaskDefinitionDigest(task, policyVersion = 1) { return stableHash(semanticTask(task, policyVersion)); }
export function shadowTaskRegistryDigest(registry) {
  return stableHash({
    schemaVersion: registry.schemaVersion, definitionPolicyVersion: registry.definitionPolicyVersion,
    tasks: [...registry.tasks].sort((a, b) => a.taskId.localeCompare(b.taskId))
      .map((task) => ({ taskId: task.taskId, taskDefinitionDigest: shadowTaskDefinitionDigest(task, registry.definitionPolicyVersion) })),
    profiles: Object.fromEntries(Object.entries(registry.profiles).sort(([a], [b]) => a.localeCompare(b))
      .map(([id, taskIds]) => [id, [...taskIds]])),
  });
}

function commandsToTasks(commands, projections) {
  const taskIds = [], missing = [];
  for (const command of commands) {
    const ids = projections[command];
    if (!Array.isArray(ids) || ids.length === 0) missing.push(command);
    else taskIds.push(...ids);
  }
  return { taskIds: canonicalStrings(taskIds), missing: canonicalStrings(missing) };
}

function criticalPath(tasks, selected) {
  const memo = new Map(), visiting = new Set();
  const visit = (id) => {
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) throw new RangeError(`shadow task dependency cycle includes ${id}`);
    visiting.add(id); const task = tasks.get(id);
    if (task === undefined) throw new RangeError(`shadow plan references unknown task ${id}`);
    const dependencies = task.dependencies.filter((entry) => selected.has(entry.taskId));
    const parent = dependencies.length === 0 ? { durationMs: 0, taskIds: [] }
      : dependencies.map((entry) => visit(entry.taskId)).sort((a, b) => b.durationMs - a.durationMs || a.taskIds.join().localeCompare(b.taskIds.join()))[0];
    const result = { durationMs: parent.durationMs + task.timeoutMs, taskIds: [...parent.taskIds, id] };
    visiting.delete(id); memo.set(id, result); return result;
  };
  return [...selected].map(visit).sort((a, b) => b.durationMs - a.durationMs || a.taskIds.join().localeCompare(b.taskIds.join()))[0]
    ?? { durationMs: 0, taskIds: [] };
}

function resourceContention(taskNodes) {
  const groups = new Map();
  for (const task of taskNodes) {
    const keys = canonicalStrings([`class:${task.resourceClass}`, ...task.resourceKeys.map((key) => `key:${key}`)]);
    for (const key of keys) {
      const group = groups.get(key) ?? [];
      group.push(task);
      groups.set(key, group);
    }
  }
  const contentionGroups = [...groups].map(([resourceKey, members]) => ({
    resourceKey, taskIds: members.map((task) => task.taskId).sort(),
    serialTimeoutBudgetMs: members.reduce((sum, task) => sum + task.timeoutMs, 0),
  })).sort((a, b) => a.resourceKey.localeCompare(b.resourceKey));
  const limiting = [...contentionGroups].sort((a, b) => b.serialTimeoutBudgetMs - a.serialTimeoutBudgetMs
    || a.resourceKey.localeCompare(b.resourceKey))[0] ?? { resourceKey: null, taskIds: [], serialTimeoutBudgetMs: 0 };
  return { contentionGroups, limiting };
}

export function createTearBenchShadowPlan({ registry, policy, selection, catalog, routes, profileId }) {
  if (!Array.isArray(registry?.tasks) || registry?.schemaVersion !== 1) throw new TypeError("shadow plan task registry is malformed");
  if (!Array.isArray(selection?.routes) || selection?.scopeDigest === undefined) throw new TypeError("shadow plan selection is malformed");
  const tasks = new Map(registry.tasks.map((task) => [task.taskId, task]));
  const docsOnly = selection.routes.length === 1 && selection.routes[0] === "documentation-only";
  const effectiveProfileId = profileId === "pull-request" && docsOnly ? "pull-request-docs" : profileId;
  const profile = registry.profiles[effectiveProfileId];
  if (!Array.isArray(profile)) throw new RangeError(`unknown shadow plan profile: ${profileId}`);
  const requests = [], obligations = [];
  const request = (taskId, reason) => requests.push({ taskId, reason });
  const obligation = (entry) => obligations.push({ ...entry, status: entry.status ?? "required", taskIds: canonicalStrings(entry.taskIds ?? []) });
  for (const taskId of profile) request(taskId, `profile:${effectiveProfileId}`);
  if (!docsOnly && ["pull-request", "protected-main", "nightly", "endurance"].includes(profileId)) {
    request("unit.tearbench-ci-core", `selected-evidence-core:${profileId}`);
    for (const caseId of selection.graveyardCases ?? []) {
      const taskId = GRAVEYARD_TASK_IDS[caseId];
      if (taskId === undefined) {
        obligation({ obligationId: `graveyard:${caseId}`, kind: "graveyard", status: "missing", reason: "selected graveyard case has no typed task binding" });
      } else {
        obligation({ obligationId: `graveyard:${caseId}`, kind: "graveyard", taskIds: [taskId] });
        request(taskId, `graveyard:${caseId}`);
      }
    }
  }
  const selectedScenarios = new Map(catalog.filter((scenario) => selection.scenarios.includes(scenario.id)).map((scenario) => [scenario.id, scenario]));
  for (const scenarioId of [...selection.scenarios].sort()) {
    const scenario = selectedScenarios.get(scenarioId);
    if (scenario === undefined) { obligation({ obligationId: `scenario:${scenarioId}`, kind: "scenario", status: "missing", reason: "selected scenario is absent from the catalog" }); continue; }
    for (const backend of [...scenario.backends].sort()) {
      const taskIds = scenario.backendTaskIds?.[backend] ?? [];
      obligation({ obligationId: `backend:${scenarioId}:${backend}`, kind: "backend", scenarioId, backend, taskIds,
        ...(taskIds.length === 0 ? { status: "missing", reason: "backend has no typed task binding" } : {}) });
      for (const taskId of taskIds) request(taskId, `backend:${scenarioId}:${backend}`);
      for (const invariant of effectiveInvariantIds(scenario)) {
        const unsupported = UNSUPPORTED_INVARIANT_IDS.has(invariant);
        obligation({ obligationId: `invariant:${scenarioId}:${backend}:${invariant}`, kind: "invariant", scenarioId, backend, invariant, taskIds,
          ...(unsupported ? { status: "unsupported", reason: "invariant is registered but has no source-owned comparison input contract" }
            : taskIds.length === 0 ? { status: "missing", reason: "invariant backend has no typed task binding" } : {}) });
      }
      for (const assertion of canonicalStrings(scenario.structuredAssertions ?? [])) {
        obligation({ obligationId: `structured-assertion:${scenarioId}:${backend}:${assertion}`, kind: "structured-assertion",
          scenarioId, backend, assertion, taskIds,
          ...(taskIds.length === 0 ? { status: "missing", reason: "structured assertion backend has no typed task binding" } : {}) });
      }
    }
  }
  for (const binding of selection.obligationBindings ?? []) {
    const mapped = commandsToTasks(binding.commands ?? [], registry.commandProjections ?? {});
    obligation({ obligationId: `${binding.route}:${binding.obligation}`, kind: binding.obligation.split(":", 1)[0], routeId: binding.route,
      taskIds: mapped.taskIds, ...(mapped.missing.length > 0 ? { status: "missing", reason: `unmapped commands: ${mapped.missing.join(", ")}` } : {}) });
    for (const taskId of mapped.taskIds) request(taskId, `${binding.route}:${binding.obligation}`);
  }
  const selectedRoutes = routes.filter((route) => selection.routes.includes(route.id));
  for (const route of selectedRoutes) {
    const bound = new Set(obligations.filter((entry) => entry.routeId === route.id).map((entry) => entry.obligationId));
    for (const matrix of route.interactionMatrices ?? []) if (!bound.has(`${route.id}:matrix:${matrix}`)) {
      obligation({ obligationId: `${route.id}:matrix:${matrix}`, kind: "matrix", routeId: route.id, status: "missing", reason: "selected route matrix was not materialized" });
    }
    for (const capability of route.capabilityClaims ?? []) if (!bound.has(`${route.id}:capability:${capability}`)) {
      obligation({ obligationId: `${route.id}:capability:${capability}`, kind: "capability", routeId: route.id, status: "missing", reason: "selected route capability was not materialized" });
    }
    const routeScenarioIds = selection.routeScenarios?.find((entry) => entry.routeId === route.id)?.scenarioIds ?? route.scenarios ?? [];
    const scenarioTasks = routeScenarioIds.filter((id) => selectedScenarios.has(id)).flatMap((id) => {
      const scenario = selectedScenarios.get(id);
      return [...scenario.backends].flatMap((backend) => scenario.backendTaskIds?.[backend] ?? []);
    });
    const routeTasks = canonicalStrings([
      ...(route.authorityTaskIds ?? []), ...(route.journeyTaskIds ?? []),
      ...scenarioTasks,
      ...(route.buildTargets ?? []).map((id) => policy.buildTargets[id]?.taskId).filter(Boolean),
    ]);
    const comparisonNotRun = route.baseComparison === "not-run";
    const journeyNotRun = route.journeyCheckpoint === "not-run";
    obligation({ obligationId: `comparison:${route.id}:${route.baseComparison}`, kind: "comparison", routeId: route.id, taskIds: routeTasks,
      ...(comparisonNotRun ? { status: "not-run", reason: "route declares no comparison gate" }
        : routeTasks.length === 0 ? { status: "missing", reason: "route comparison has no typed evidence" } : {}) });
    obligation({ obligationId: `journey:${route.id}:${route.journeyCheckpoint}`, kind: "journey-checkpoint", routeId: route.id, taskIds: routeTasks,
      ...(journeyNotRun ? { status: "not-run", reason: "route declares no journey gate" }
        : routeTasks.length === 0 ? { status: "missing", reason: "route journey checkpoint has no typed evidence" } : {}) });
    if (route.reducedDisposition !== undefined) obligation({ obligationId: `reduced:${route.id}:${route.reducedDisposition}`, kind: "reduced", routeId: route.id,
      status: "unsupported", taskIds: routeTasks, reason: route.reducedDisposition });
  }
  for (const target of selection.buildTargets ?? []) {
    const taskId = policy.buildTargets[target]?.taskId;
    const ids = taskId === undefined ? [] : [taskId];
    obligation({ obligationId: `build-target:${target}`, kind: "build-target", taskIds: ids,
      ...(ids.length === 0 ? { status: "missing", reason: "build target has no typed task" } : {}) });
    if (taskId !== undefined) request(taskId, `build-target:${target}`);
  }
  for (const disposition of selection.backendDispositions ?? []) {
    const mapped = commandsToTasks(disposition.authorityCommands ?? [], registry.commandProjections ?? {});
    const status = disposition.disposition === "unsupported" ? "unsupported" : mapped.taskIds.length === 0 ? "missing" : "required";
    obligation({ obligationId: `backend-family:${disposition.family}:${disposition.backend}`, kind: "backend-family", backend: disposition.backend,
      status, taskIds: mapped.taskIds, reason: disposition.disposition });
    for (const taskId of mapped.taskIds) request(taskId, `backend-family:${disposition.family}:${disposition.backend}`);
  }
  if (selection.currentWeaponParity?.required === true) request("headless.test-headless-current-weapon-parity", "current-weapon-parity");
  const selected = new Set();
  const include = (id) => {
    if (selected.has(id)) return; const task = tasks.get(id);
    if (task === undefined) { obligation({ obligationId: `task:${id}`, kind: "task", status: "missing", reason: "unknown task ID" }); return; }
    selected.add(id); for (const dependency of task.dependencies) { request(dependency.taskId, `dependency:${id}`); include(dependency.taskId); }
  };
  for (const entry of requests) include(entry.taskId);
  const reasons = new Map();
  for (const entry of requests) { const values = reasons.get(entry.taskId) ?? []; values.push(entry.reason); reasons.set(entry.taskId, values); }
  const taskReuse = [...reasons.entries()].filter(([, values]) => values.length > 1)
    .map(([taskId, values]) => ({ taskId, requestCount: values.length, reasons: canonicalStrings(values) })).sort((a, b) => a.taskId.localeCompare(b.taskId));
  const profileOccurrenceDuplicates = [...new Set(profile)].map((taskId) => ({
    taskId, occurrenceCount: profile.filter((candidate) => candidate === taskId).length,
  })).filter((entry) => entry.occurrenceCount > 1).sort((a, b) => a.taskId.localeCompare(b.taskId));
  const taskNodes = [...selected].sort().map((taskId) => {
    const task = tasks.get(taskId); return { taskId, taskDefinitionDigest: shadowTaskDefinitionDigest(task, registry.definitionPolicyVersion),
      resourceClass: task.resourceClass, resourceKeys: [...task.resourceKeys].sort(), timeoutMs: task.timeoutMs,
      dependencies: task.dependencies.filter((entry) => selected.has(entry.taskId)).map((entry) => ({ taskId: entry.taskId, outputId: entry.outputId ?? null }))
        .sort((a, b) => `${a.taskId}:${a.outputId ?? ""}`.localeCompare(`${b.taskId}:${b.outputId ?? ""}`)),
      claimIds: [...task.claimIds].sort(), reasons: canonicalStrings(reasons.get(taskId) ?? ["dependency"]) };
  });
  const resourceTotals = Object.values(Object.groupBy(taskNodes, (task) => task.resourceClass)).map((group) => ({
    resourceClass: group[0].resourceClass, taskCount: group.length, timeoutBudgetMs: group.reduce((sum, task) => sum + task.timeoutMs, 0),
  })).sort((a, b) => a.resourceClass.localeCompare(b.resourceClass));
  const path = criticalPath(tasks, selected);
  const contention = resourceContention(taskNodes);
  const missing = obligations.filter((entry) => entry.status === "missing").map((entry) => entry.obligationId).sort();
  const unsupported = obligations.filter((entry) => entry.status === "unsupported").map((entry) => entry.obligationId).sort();
  const profileTaskIds = new Set(profile);
  const extra = taskNodes.filter((node) => !profileTaskIds.has(node.taskId)).map((node) => ({
    taskId: node.taskId, classification: "explained-selection-expansion", reasons: node.reasons,
  }));
  const intentionalReplicas = taskNodes.filter((node) => tasks.get(node.taskId).intentionalReplica !== "none")
    .map((node) => ({ taskId: node.taskId, classification: tasks.get(node.taskId).intentionalReplica,
      replicaGroup: tasks.get(node.taskId).replicaGroup ?? null }));
  const payload = {
    format: "tearbench-shadow-plan", schemaVersion: 1, executionMode: "shadow-only", authoritativeGateUnchanged: true,
    profileId, effectiveProfileId, source: selection.source, planningBasis: selection.planningBasis ?? { kind: "working-source" },
    scope: selection.scope, scopeDigest: selection.scopeDigest,
    routeDefinitionDigest: selection.routeDefinitionDigest, taskRegistryDigest: shadowTaskRegistryDigest(registry),
    policyDigest: sha256(policy), plannerPolicyDigest: sha256(PLANNER_POLICY),
    requiredClaims: canonicalStrings([...taskNodes.flatMap((task) => task.claimIds), ...obligations.filter((entry) => entry.status === "required").map((entry) => entry.obligationId)]),
    requiredTaskIds: taskNodes.map((task) => task.taskId), taskNodes,
    dependencyGraph: { nodes: taskNodes.map((task) => task.taskId), edges: taskNodes.flatMap((task) => task.dependencies.map((dependency) =>
      ({ from: dependency.taskId, to: task.taskId, outputId: dependency.outputId })))
      .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || String(a.outputId).localeCompare(String(b.outputId))) },
    estimates: { dependencyCriticalPathMs: path.durationMs, dependencyCriticalPathTaskIds: path.taskIds,
      resourceContentionUpperBoundMs: contention.limiting.serialTimeoutBudgetMs,
      resourceContentionLimitingKey: contention.limiting.resourceKey,
      resourceContentionTaskIds: contention.limiting.taskIds,
      currentAuthoritativeSerialTimeoutBudgetMs: profile.map((id) => tasks.get(id)?.timeoutMs ?? 0).reduce((sum, value) => sum + value, 0),
      resourceTotals, resourceContentionGroups: contention.contentionGroups },
    obligations: obligations.sort((a, b) => a.obligationId.localeCompare(b.obligationId)),
    diagnostics: { status: missing.length === 0 ? "complete" : "incomplete", missing, unsupported, extra, unexplainedExtra: [],
      profileOccurrenceDuplicates, taskReuse, intentionalReplicas },
    currentGateComparison: { profileTaskOccurrences: profile.length, profileUniqueTasks: new Set(profile).size,
      shadowRequiredUniqueTasks: taskNodes.length, exactProfileTaskIds: [...profile] },
    explanations: taskNodes.map((task) => ({ taskId: task.taskId, selectedBecause: task.reasons,
      unprovedWithout: canonicalStrings([...task.claimIds,
        ...obligations.filter((entry) => entry.status === "required" && entry.taskIds.includes(task.taskId)).map((entry) => entry.obligationId)]) })),
  };
  return Object.freeze({ ...payload, planDigest: sha256(payload) });
}
