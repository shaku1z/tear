// What the Validate workflow must do, tested by behaviour rather than by its exact text:
// the required job `check` waits for every other job and fails unless they passed, and the
// parallel jobs together run every task of the functional gate exactly once.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GROUPS, loadTasks, selectTasks } from "../../scripts/run-checks.mjs";

const root = resolve(import.meta.dirname, "../..");
const workflow = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8").replace(/\r\n/gu, "\n");

/** Splits the workflow's `jobs:` block into { id: text } using its two-space indentation. */
function jobs(text) {
  const body = text.slice(text.indexOf("\njobs:\n") + 7);
  const result = {};
  let current;
  for (const line of body.split("\n")) {
    const header = /^ {2}([a-z][\w-]*):\s*$/u.exec(line);
    if (header !== null) {
      current = header[1];
      result[current] = "";
    } else if (current !== undefined) {
      result[current] += `${line}\n`;
    }
  }
  return result;
}

function needsOf(job) {
  const list = /^ {4}needs: \[([^\]]*)\]/mu.exec(job);
  if (list !== null) return list[1].split(",").map((name) => name.trim());
  const single = /^ {4}needs: ([\w-]+)$/mu.exec(job);
  return single === null ? [] : [single[1]];
}

const all = jobs(workflow);

describe("Validate workflow", () => {
  it("has a final `check` job that always runs and needs every other job", () => {
    expect(Object.keys(all)).toContain("check");
    const check = all.check;
    expect(check).toMatch(/^ {4}if: always\(\)$/mu);
    expect(new Set(needsOf(check))).toEqual(new Set(Object.keys(all).filter((id) => id !== "check")));
    expect(check).toContain('result !== "success"');
    expect(check).toContain("process.exit(1)");
  });

  it("gives no step a key twice (GitHub rejects such a file)", () => {
    for (const step of workflow.split(/\n(?= {6}- )/u)) {
      const keys = [...step.matchAll(/^ {6}(?:- | {2})([a-z-]+):/gmu)].map((match) => match[1]);
      expect(new Set(keys).size, `duplicate key in step: ${step.split("\n")[0]}`).toBe(keys.length);
    }
  });

  it("bounds every job's running time", () => {
    for (const [id, job] of Object.entries(all)) {
      const limit = /^ {4}timeout-minutes: (\d+)$/mu.exec(job);
      expect(limit, `${id} has no timeout`).not.toBeNull();
      expect(Number(limit?.[1]), `${id} timeout`).toBeLessThanOrEqual(15);
    }
  });

  it("runs every functional task in exactly one job", () => {
    const tasks = loadTasks();
    const seen = new Map();
    for (const [id, job] of Object.entries(all)) {
      const call = /node scripts\/run-checks\.mjs (\w+)( --shard \$\{\{ matrix\.shard \}\})?/u.exec(job);
      if (call === null) continue;
      const group = call[1];
      expect(GROUPS).toContain(group);
      const shards = call[2] === undefined ? [undefined] : JSON.parse(/shard: (\[[^\]]+\])/u.exec(job)?.[1] ?? "[]");
      for (const text of shards) {
        const shard =
          text === undefined ? undefined : { index: Number(text.split("/")[0]), count: Number(text.split("/")[1]) };
        for (const task of selectTasks(tasks, group, shard)) {
          // The vitest suite is split by vitest itself, so each unit shard names it once.
          const key =
            task.taskId === "unit.test-unit-without-preservation-corpus"
              ? `${task.taskId}#${String(text)}`
              : task.taskId;
          expect(seen.has(key), `${key} runs in ${String(seen.get(key))} and ${id}`).toBe(false);
          seen.set(key, id);
        }
      }
    }
    for (const task of tasks) {
      expect(
        [...seen.keys()].some((key) => key.split("#")[0] === task.taskId),
        `${task.taskId} runs nowhere`,
      ).toBe(true);
    }
  });

  it("uploads the release build under the name the deploy workflows download", () => {
    const uploads =
      workflow.match(/upload-artifact@v4\n {8}with:\n {10}name: tear-release-targets-\$\{\{ github\.sha \}\}/gu) ?? [];
    expect(uploads).toHaveLength(1);
    const production = readFileSync(resolve(root, ".github/workflows/deploy-production.yml"), "utf8");
    const preview = readFileSync(resolve(root, ".github/workflows/deploy-preview.yml"), "utf8");
    expect(production).toContain("name: tear-release-targets-${{ steps.validation.outputs.sha }}");
    expect(preview).toContain("/^tear-release-targets-[0-9a-f]{40}$/");
    expect(all.build).toMatch(/^ {12}dist\/standalone$/mu);
  });
});
