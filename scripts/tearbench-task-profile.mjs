export function dependencyOrderedTaskIds(profile, tasks) {
  const byId = new Map(tasks.map((task) => [task.taskId, task])), ordered = [], visited = new Set(), visiting = new Set();
  const visit = (taskId) => {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) throw new RangeError(`task dependency cycle includes ${taskId}`);
    const task = byId.get(taskId);
    if (task === undefined) throw new RangeError(`task profile requires unknown task ${taskId}`);
    visiting.add(taskId);
    for (const dependency of task.dependencies) visit(dependency.taskId);
    visiting.delete(taskId); visited.add(taskId); ordered.push(taskId);
  };
  for (const taskId of profile) visit(taskId);
  return Object.freeze(ordered);
}

export function registryTaskEnvironment(task, baseEnvironment = process.env) {
  return Object.freeze({ ...baseEnvironment, ...(task.dependencies.some((dependency) => dependency.outputId === "build-artifact")
    ? { TEARBENCH_REUSE_VERIFIED_BUILDS: "1" } : {}) });
}
