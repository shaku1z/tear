import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import test from "node:test";
import { dependencyOrderedTaskIds, registryTaskEnvironment } from "../scripts/tearbench-task-profile.mjs";
import { assertReproducibilitySideIdentity, expectedReproducibilitySide } from "../scripts/tearbench-reproducibility-contract.mjs";

const registry = JSON.parse(await readFile(new URL("../src/tearbench/task-registry.json", import.meta.url), "utf8"));

test("release task execution is dependency ordered, deduplicated, and preserves independent reproducibility sides", () => {
  const ids = dependencyOrderedTaskIds(registry.profiles.release, registry.tasks);
  assert.equal(ids.length, new Set(ids).size);
  for (const build of ["build.standalone", "build.crazygames", "build.test-standalone", "build.test-crazygames"]) {
    assert.equal(ids.filter((id) => id === build).length, 1, build);
  }
  const certifier = ids.indexOf("certify.reproducible");
  for (const side of ["repro.standalone.a", "repro.standalone.b", "repro.crazygames.a", "repro.crazygames.b",
    "repro.crazygames-package.a", "repro.crazygames-package.b"]) {
    assert.ok(ids.indexOf(side) >= 0 && ids.indexOf(side) < certifier, side);
  }
  assert.ok(ids.indexOf("build.crazygames") < ids.indexOf("build.check-crazygames-package"));
  assert.ok(ids.indexOf("build.standalone") < ids.indexOf("build.check-cloudflare"));
});

test("legacy profile consumers receive the verified-build reuse contract", () => {
  const consumer = registry.tasks.find((task) => task.taskId === "browser.test-browser-current-gameplay-scenarios");
  const producer = registry.tasks.find((task) => task.taskId === "build.test-standalone");
  assert.equal(registryTaskEnvironment(consumer, { SENTINEL: "kept" }).TEARBENCH_REUSE_VERIFIED_BUILDS, "1");
  assert.deepEqual(registryTaskEnvironment(producer, { SENTINEL: "kept" }), { SENTINEL: "kept" });
});

test("reproducibility sides have unique canonical build and package linkage", () => {
  const root = "C:/workspace", generated = "C:/workspace/artifacts/tearbench/generated/reproducibility";
  const packageA = expectedReproducibilitySide({ root, generated, side: "crazygames-package-a" });
  const packageB = expectedReproducibilitySide({ root, generated, side: "crazygames-package-b" });
  assert.notEqual(packageA.inputPath, packageB.inputPath);
  assert.notEqual(packageA.outputPath, packageB.outputPath);
  assert.throws(() => assertReproducibilitySideIdentity({ root, generated, side: "crazygames-package-b",
    record: { ...packageB, inputPath: packageA.inputPath } }), /mislinked reproducibility package/u);
  const standaloneA = expectedReproducibilitySide({ root, generated, side: "standalone-a" });
  assert.throws(() => assertReproducibilitySideIdentity({ root, generated, side: "standalone-b", record: standaloneA }),
    /mislinked reproducibility build/u);
});
