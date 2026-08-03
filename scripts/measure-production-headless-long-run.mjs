import { mkdir, writeFile } from "node:fs/promises";
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
if ((targetId === undefined) !== (targetDeclaredBy === undefined)) {
  throw new TypeError("--target-id and --declared-by must be supplied together");
}
const hardware = Object.freeze({
  id: targetId ?? `developer-${stableId(os.hostname())}`,
  classification: targetId === undefined ? "developer" : "target",
  declaredBy: targetDeclaredBy ?? "local-automation",
  operatingSystem: `${os.type()} ${os.release()} ${os.arch()}`,
  processor: os.cpus().at(0)?.model ?? "unknown-processor",
  physicalMemoryBytes: os.totalmem(),
});
const output = resolve(root, option("--output") ?? "artifacts/tearbench/c30/production-headless-long-run.json");
if (typeof global.gc !== "function") {
  throw new Error("C30 long-run measurement requires node --expose-gc");
}
const server = await createServer({ root, server: { middlewareMode: true } });
try {
  const { measureProductionHeadlessLongRun } = await server.ssrLoadModule(
    "/src/tearbench/production-headless-benchmark.ts",
  );
  const artifact = await measureProductionHeadlessLongRun({
    hardware,
    heapUsedBytes: () => process.memoryUsage().heapUsed,
    collectGarbage: () => global.gc(),
  });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ artifact: output, hardware, aggregate: artifact.aggregate,
    budget: artifact.budget, heap: artifact.heap, deterministic: artifact.deterministic }));
} finally {
  await server.close();
}
