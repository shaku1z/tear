import { describe, expect, it } from "vitest";
import packageSource from "../../package.json";
import registrySource from "../../src/tearbench/task-registry.json";
import { taskDefinitionDigest, taskRegistryDigest, validateTaskRegistry } from "../../src/tearbench/task-registry";

function canonical() { return validateTaskRegistry(structuredClone(registrySource)); }
function firstTask() {
  const task = registrySource.tasks.at(0);
  if (task === undefined) throw new Error("canonical registry has no tasks");
  return task;
}
function requiredTask(id: string) {
  const task = canonical().tasks.find((entry) => entry.taskId === id);
  if (task === undefined) throw new Error(`missing canonical task ${id}`);
  return task;
}

describe("TearBench atomic task registry", () => {
  it("preserves the exact VAP-0 inventory behind thin package aliases", () => {
    const value = canonical();
    expect(value.compatibilityInventory["check.functional"]?.expandedLeafCount).toBe(78);
    expect(value.compatibilityInventory["check.performance"]?.expandedLeafCount).toBe(2);
    expect(value.compatibilityInventory.check?.expandedLeafCount).toBe(80);
    expect(value.profiles.check).toEqual([...(value.profiles["check.functional"] ?? []), ...(value.profiles["check.performance"] ?? [])]);
    expect(requiredTask("build.test-standalone").runner.kind).toBe("build-target");
    expect(packageSource.scripts["check:functional"]).toBe("pnpm tearbench tasks run-profile check.functional");
    expect(packageSource.scripts["check:performance"]).toBe("pnpm tearbench tasks run-profile check.performance");
    expect(packageSource.scripts.check).toBe("pnpm tearbench tasks run-profile check");
  });

  it("rejects duplicate IDs, unknown dependencies, cycles, and missing outputs", () => {
    const first = firstTask();
    expect(() => validateTaskRegistry({ ...registrySource, tasks: [...registrySource.tasks, first] })).toThrow(/task IDs must be unique/u);
    const unknown = { ...registrySource, tasks: registrySource.tasks.map((task, index) => index === 0 ? { ...task, dependencies: [{ taskId: "missing.task" }] } : task) };
    expect(() => validateTaskRegistry(unknown)).toThrow(/unknown dependency/u);
    const [left, right] = registrySource.tasks;
    if (left === undefined || right === undefined) throw new Error("canonical registry lacks cycle fixtures");
    const cycle = { ...registrySource, tasks: registrySource.tasks.map((task, index) => index === 0 ? { ...task, dependencies: [{ taskId: right.taskId }] }
      : index === 1 ? { ...task, dependencies: [{ taskId: left.taskId }] } : task) };
    expect(() => validateTaskRegistry(cycle)).toThrow(/dependency cycle/u);
    const missing = { ...registrySource, tasks: registrySource.tasks.map((task, index) => index === 0
      ? { ...task, dependencies: [{ taskId: "build.test-standalone", outputId: "not-produced" }] } : task) };
    expect(() => validateTaskRegistry(missing)).toThrow(/requires missing output/u);
  });

  it("rejects unsupported runners, shell syntax, invalid resources, and output collisions", () => {
    const invalidRunner = { ...registrySource, tasks: registrySource.tasks.map((task, index) => index === 0
      ? { ...task, runner: { ...task.runner, kind: "shell" } } : task) };
    expect(() => validateTaskRegistry(invalidRunner)).toThrow(/unsupported or unsafe runner/u);
    const shell = { ...registrySource, tasks: registrySource.tasks.map((task, index) => index === 0
      ? { ...task, runner: { ...task.runner, args: ["-e", "process.exit(0)"] } } : task) };
    expect(() => validateTaskRegistry(shell)).toThrow(/unsupported or unsafe runner/u);
    const resource = { ...registrySource, tasks: registrySource.tasks.map((task, index) => index === 0
      ? { ...task, resourceKeys: ["../outside"] } : task) };
    expect(() => validateTaskRegistry(resource)).toThrow(/unsafe resource path/u);
    const producer = registrySource.tasks.find((task) => task.outputs.length > 0);
    if (producer === undefined) throw new Error("canonical registry lacks an output fixture");
    const collision = { ...registrySource, tasks: registrySource.tasks.map((task, index) => index === 0
      ? { ...task, outputs: [{ outputId: "collision", path: producer.outputs[0]?.path ?? "" }] } : task) };
    expect(() => validateTaskRegistry(collision)).toThrow(/output path collision/u);
  });

  it("requires complete intentional A/B replicas", () => {
    const tasks = registrySource.tasks.filter((task) => task.taskId !== "repro.standalone.b").map((task) => task.taskId === "certify.reproducible"
      ? { ...task, dependencies: task.dependencies.filter((dependency) => dependency.taskId !== "repro.standalone.b") } : task);
    expect(() => validateTaskRegistry({ ...registrySource, tasks })).toThrow(/missing an A\/B side/u);
  });

  it("computes deterministic semantic digests and changes on executable drift", () => {
    const value = canonical(), task = requiredTask("build.test-standalone");
    const reordered = { ...task, claimIds: [...task.claimIds].reverse(), resourceKeys: [...task.resourceKeys].reverse() };
    expect(taskDefinitionDigest(reordered)).toBe(taskDefinitionDigest(task));
    const changed = { ...task, runner: { ...task.runner, args: ["standalone"] } };
    expect(taskDefinitionDigest(changed)).not.toBe(taskDefinitionDigest(task));
    expect(taskRegistryDigest(value)).toBe(taskRegistryDigest(validateTaskRegistry({ ...registrySource, tasks: [...registrySource.tasks].reverse() })));
  });
});
