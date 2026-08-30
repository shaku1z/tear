import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function stableId(value) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
  return normalized.length > 0 ? normalized.slice(0, 120) : "developer-host";
}

const targetId = option("--target-id");
const targetDeclaredBy = option("--declared-by");
const capacityDeclarationPath = option("--capacity-declaration");
if ((targetId === undefined) !== (targetDeclaredBy === undefined)) {
  throw new TypeError("--target-id and --declared-by must be supplied together");
}
if (targetId !== undefined && capacityDeclarationPath === undefined) {
  throw new TypeError("target capacity measurement requires --capacity-declaration; an ID and declarant alone are not a capacity verdict");
}
if (targetId !== undefined && capacityDeclarationPath !== undefined) {
  throw new TypeError("--target-id/--declared-by are encoded by --capacity-declaration and must not be supplied separately");
}
const hardware = Object.freeze({
  id: `developer-${stableId(os.hostname())}`,
  classification: "developer",
  declaredBy: "local-automation",
  operatingSystem: `${os.type()} ${os.release()} ${os.arch()}`,
  processor: os.cpus().at(0)?.model ?? "unknown-processor",
  physicalMemoryBytes: os.totalmem(),
});
const output = resolve(root, option("--output") ?? (capacityDeclarationPath === undefined
  ? "artifacts/tearbench/checkpoints/core/C30/production-headless/long-run.json"
  : "artifacts/tearbench/checkpoints/core/C30/production-headless/training-capacity.json"));
if (typeof global.gc !== "function") {
  throw new Error("C30 long-run measurement requires node --expose-gc");
}
const server = await createServer({ root, server: { middlewareMode: true } });
try {
  const {
    measureProductionHeadlessLongRun,
    measureProductionHeadlessTrainingCapacity,
    parseC30TrainingCapacityDeclaration,
  } = await server.ssrLoadModule(
    "/src/tearbench/production-headless-benchmark.ts",
  );
  const artifact = capacityDeclarationPath === undefined
    ? await measureProductionHeadlessLongRun({
      hardware,
      heapUsedBytes: () => process.memoryUsage().heapUsed,
      collectGarbage: () => global.gc(),
    })
    : await measureProductionHeadlessTrainingCapacity({
      declaration: parseC30TrainingCapacityDeclaration(JSON.parse(await readFile(
        resolve(root, capacityDeclarationPath), "utf8",
      ))),
      heapUsedBytes: () => process.memoryUsage().heapUsed,
      collectGarbage: () => global.gc(),
    });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(capacityDeclarationPath === undefined
    ? { artifact: output, hardware, aggregate: artifact.aggregate,
      budget: artifact.budget, heap: artifact.heap, deterministic: artifact.deterministic }
    : { artifact: output, declaration: artifact.declaration, observation: artifact.observation,
      workloads: artifact.workloads.map((workload) => ({ kind: workload.kind, deterministic: workload.deterministic,
        completed: workload.firstPass.completed, episodes: workload.firstPass.episodes, budget: workload.budget,
        heap: workload.heap })), allDeclaredBudgetsMet: artifact.allDeclaredBudgetsMet }));
} finally {
  await server.close();
}
