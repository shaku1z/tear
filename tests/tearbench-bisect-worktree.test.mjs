import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { describe, it } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = resolve(root, "scripts", "tearbench-bisect-worktree.mjs");

function rejected(args) {
  try {
    execFileSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8", stdio: "pipe" });
    assert.fail("expected guarded bisection command to reject");
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
}

describe("guarded TearBench worktree bisection", () => {
  it("rejects an invalid bounded repetition request before Git mutation", () => {
    const output = rejected(["--good", "good", "--bad", "bad", "--scenario", "movement-jump", "--repetitions", "1"]);
    assert.match(output, /2 through 10/u);
  });

  it("refuses the intentionally dirty development checkout before creating a worktree", () => {
    const output = rejected(["--good", "good", "--bad", "bad", "--scenario", "movement-jump"]);
    assert.match(output, /dirty source checkout/u);
  });
});
