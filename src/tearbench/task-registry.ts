import { stableVerificationHash } from "../replay/hash";

export const TEARBENCH_TASK_RESOURCE_CLASSES = Object.freeze(["static", "unit", "headless", "build", "browser", "endurance"] as const);
export const TEARBENCH_TASK_RUNNERS = Object.freeze(["node", "vitest", "typescript", "eslint", "build-target", "wrangler", "tearbench", "certifier"] as const);
export type TearBenchTaskResourceClass = typeof TEARBENCH_TASK_RESOURCE_CLASSES[number];
export type TearBenchTaskRunnerKind = typeof TEARBENCH_TASK_RUNNERS[number];
export type TearBenchIntentionalReplica = "none" | "reproducibility-a" | "reproducibility-b" | `backend-${string}`;
export interface TearBenchTaskDependency { readonly taskId: string; readonly outputId?: string }
export interface TearBenchTaskOutput { readonly outputId: string; readonly path: string }
export interface TearBenchTaskRunner { readonly kind: TearBenchTaskRunnerKind; readonly executable: string; readonly args: readonly string[] }
export interface TearBenchTaskDefinition {
  readonly taskId: string; readonly version: number; readonly runner: TearBenchTaskRunner;
  readonly claimIds: readonly string[]; readonly dependencies: readonly TearBenchTaskDependency[];
  readonly resourceClass: TearBenchTaskResourceClass; readonly resourceKeys: readonly string[];
  readonly outputs: readonly TearBenchTaskOutput[]; readonly timeoutMs: number;
  readonly intentionalReplica: TearBenchIntentionalReplica; readonly replicaGroup?: string;
}
export interface TearBenchTaskRegistry {
  readonly schemaVersion: 1; readonly definitionPolicyVersion: number;
  readonly tasks: readonly TearBenchTaskDefinition[]; readonly profiles: Readonly<Record<string, readonly string[]>>;
  readonly compatibilityInventory: Readonly<Record<string, { readonly expandedLeafCount: number; readonly taskIds: readonly string[] }>>;
  readonly commandProjections: Readonly<Record<string, readonly string[]>>;
}

const ID = /^[a-z][a-z0-9.-]*$/u;
const SHELL_SYNTAX = /[;&|<>`$()\r\n]/u;
const SAFE_PATH = /^(?![A-Za-z]:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u;
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new TypeError(`${label} must be unique`);
}
function semanticTask(task: TearBenchTaskDefinition, policyVersion: number): object {
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
export function taskDefinitionDigest(task: TearBenchTaskDefinition, policyVersion = 1): string {
  return stableVerificationHash(semanticTask(task, policyVersion));
}
export function displayCommandForTask(task: TearBenchTaskDefinition): string {
  if (task.runner.kind === "build-target" && task.runner.args.length === 1) {
    const [target] = task.runner.args;
    if (target === undefined) throw new TypeError(`task ${task.taskId} has no build target`);
    return target.startsWith("test-") ? `pnpm build:test:${target.replace(/^test-/u, "")}` : `pnpm build:${target}`;
  }
  if (task.runner.kind === "vitest") return `pnpm exec vitest ${task.runner.args.join(" ")}`;
  if (task.runner.kind === "tearbench") return `pnpm tearbench ${task.runner.args.join(" ")}`;
  if (task.runner.kind === "node" && task.runner.executable === "node") return `node ${task.runner.args.join(" ")}`;
  throw new TypeError(`task ${task.taskId} is not an evidence-command projection`);
}
export function taskRegistryDigest(registry: TearBenchTaskRegistry): string {
  return stableVerificationHash({
    schemaVersion: registry.schemaVersion, definitionPolicyVersion: registry.definitionPolicyVersion,
    tasks: [...registry.tasks].sort((a, b) => a.taskId.localeCompare(b.taskId))
      .map((task) => ({ taskId: task.taskId, taskDefinitionDigest: taskDefinitionDigest(task, registry.definitionPolicyVersion) })),
    profiles: Object.fromEntries(Object.entries(registry.profiles).sort(([a], [b]) => a.localeCompare(b))
      .map(([id, taskIds]) => [id, [...taskIds]])),
  });
}

export function validateTaskRegistry(input: unknown): TearBenchTaskRegistry {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new TypeError("task registry must be an object");
  const raw = input as Record<string, unknown>;
  if (raw.schemaVersion !== 1 || !Number.isSafeInteger(raw.definitionPolicyVersion) || Number(raw.definitionPolicyVersion) < 1
    || !Array.isArray(raw.tasks) || raw.profiles === null || typeof raw.profiles !== "object" || Array.isArray(raw.profiles)
    || raw.compatibilityInventory === null || typeof raw.compatibilityInventory !== "object"
    || raw.commandProjections === null || typeof raw.commandProjections !== "object") throw new TypeError("task registry header is malformed");
  const rawProfiles = raw.profiles as Record<string, unknown>, rawInventory = raw.compatibilityInventory as Record<string, unknown>;
  const rawProjections = raw.commandProjections as Record<string, unknown>;
  if (Object.values(rawProfiles).some((ids) => !Array.isArray(ids))
    || Object.values(rawInventory).some((fixture) => !isRecord(fixture) || !Array.isArray(fixture.taskIds))
    || Object.values(rawProjections).some((ids) => !Array.isArray(ids))) throw new TypeError("task registry collections are malformed");
  const registry = raw as unknown as TearBenchTaskRegistry;
  const taskIds = registry.tasks.map((task) => task.taskId);
  if (taskIds.some((id) => typeof id !== "string" || !ID.test(id))) throw new TypeError("task registry has an invalid task ID");
  unique(taskIds, "task IDs");
  const tasks = new Map(registry.tasks.map((task) => [task.taskId, task]));
  const outputPaths = new Map<string, string>();
  for (const task of registry.tasks) {
    const rawTask = task as unknown as Record<string, unknown>, rawRunner = rawTask.runner;
    if (!Number.isSafeInteger(rawTask.version) || Number(rawTask.version) < 1 || !Number.isSafeInteger(rawTask.timeoutMs) || Number(rawTask.timeoutMs) < 1) throw new TypeError(`task ${task.taskId} has an invalid version or timeout`);
    if (!isRecord(rawRunner) || typeof rawRunner.kind !== "string" || !TEARBENCH_TASK_RUNNERS.includes(rawRunner.kind as TearBenchTaskRunnerKind)
      || typeof rawRunner.executable !== "string" || rawRunner.executable === "" || SHELL_SYNTAX.test(rawRunner.executable)
      || !Array.isArray(rawRunner.args) || rawRunner.args.some((arg: unknown) => typeof arg !== "string" || SHELL_SYNTAX.test(arg))) {
      throw new TypeError(`task ${task.taskId} uses an unsupported or unsafe runner`);
    }
    if (typeof rawTask.resourceClass !== "string" || !TEARBENCH_TASK_RESOURCE_CLASSES.includes(rawTask.resourceClass as TearBenchTaskResourceClass)) throw new TypeError(`task ${task.taskId} has an invalid resource class`);
    if (!Array.isArray(rawTask.claimIds) || !Array.isArray(rawTask.dependencies) || !Array.isArray(rawTask.resourceKeys) || !Array.isArray(rawTask.outputs)
      || rawTask.outputs.some((output: unknown) => !isRecord(output) || typeof output.outputId !== "string" || typeof output.path !== "string")) throw new TypeError(`task ${task.taskId} collections are malformed`);
    unique(task.claimIds, `task ${task.taskId} claim IDs`); unique(task.resourceKeys, `task ${task.taskId} resource keys`);
    unique(task.outputs.map((entry: TearBenchTaskOutput) => entry.outputId), `task ${task.taskId} output IDs`);
    if (task.resourceKeys.some((path: unknown) => typeof path !== "string" || !SAFE_PATH.test(path))) throw new TypeError(`task ${task.taskId} has an unsafe resource path`);
    for (const output of task.outputs) {
      if (!ID.test(output.outputId) || !SAFE_PATH.test(output.path)) throw new TypeError(`task ${task.taskId} has an invalid output`);
      const owner = outputPaths.get(output.path); if (owner !== undefined) throw new TypeError(`task output path collision between ${owner} and ${task.taskId}`);
      outputPaths.set(output.path, task.taskId);
    }
    if (task.intentionalReplica !== "none" && !/^(?:reproducibility-[ab]|backend-[a-z][a-z0-9-]*)$/u.test(task.intentionalReplica)) throw new TypeError(`task ${task.taskId} has an invalid intentional replica`);
    if ((task.intentionalReplica === "none") !== (task.replicaGroup === undefined)) throw new TypeError(`task ${task.taskId} replica metadata is incomplete`);
  }
  for (const task of registry.tasks) for (const dependency of task.dependencies) {
    const producer = tasks.get(dependency.taskId); if (producer === undefined) throw new RangeError(`task ${task.taskId} has an unknown dependency ${dependency.taskId}`);
    if (dependency.outputId !== undefined && !producer.outputs.some((output: TearBenchTaskOutput) => output.outputId === dependency.outputId)) throw new RangeError(`task ${task.taskId} requires missing output ${dependency.taskId}:${dependency.outputId}`);
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): void => { if (visiting.has(id)) throw new RangeError(`task dependency cycle includes ${id}`); if (visited.has(id)) return; visiting.add(id); for (const dependency of tasks.get(id)?.dependencies ?? []) visit(dependency.taskId); visiting.delete(id); visited.add(id); };
  for (const id of taskIds) visit(id);
  const groups = new Map<string, Set<string>>();
  for (const task of registry.tasks) if (task.replicaGroup !== undefined) { const sides = groups.get(task.replicaGroup) ?? new Set<string>(); sides.add(task.intentionalReplica); groups.set(task.replicaGroup, sides); }
  for (const [group, sides] of groups) if ((sides.has("reproducibility-a") || sides.has("reproducibility-b")) && !(sides.has("reproducibility-a") && sides.has("reproducibility-b"))) throw new RangeError(`replica group ${group} is missing an A/B side`);
  for (const [profile, ids] of Object.entries(registry.profiles)) if (!ID.test(profile) || ids.some((id) => !tasks.has(id))) throw new RangeError(`profile ${profile} references an unknown task`);
  for (const [profile, fixture] of Object.entries(registry.compatibilityInventory)) if (!Number.isSafeInteger(fixture.expandedLeafCount) || fixture.expandedLeafCount < 0 || fixture.taskIds.length !== fixture.expandedLeafCount || fixture.taskIds.some((id) => !tasks.has(id))) throw new RangeError(`compatibility inventory ${profile} does not match its expanded leaf count`);
  for (const [command, ids] of Object.entries(registry.commandProjections)) {
    if (ids.length === 0 || ids.some((id) => !tasks.has(id))) throw new RangeError(`command projection ${command} references an unknown task`);
    const projected = ids.map((id) => {
      const task = tasks.get(id);
      if (task === undefined) throw new RangeError(`command projection ${command} references unknown task ${id}`);
      return displayCommandForTask(task);
    }).join(" && ");
    if (projected !== command) throw new TypeError(`command projection disagrees with typed tasks: ${command}`);
  }
  return registry;
}
