// The machine-wide check slots and the group selection of scripts/run-checks.mjs.
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadChecks, selectChecks, takeSlot } from "../../scripts/run-checks.mjs";

const made = [];
const directory = () => {
  const path = mkdtempSync(join(tmpdir(), "tear-check-slots-"));
  made.push(path);
  return path;
};
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("check slots", () => {
  it("lets a second taker in only after the first releases its slot", async () => {
    const slots = directory();
    const release = await takeSlot({ directory: slots, slots: 1, wait: 10, log: () => undefined });
    let second = false;
    const waiting = takeSlot({ directory: slots, slots: 1, wait: 10, log: () => undefined }).then((done) => {
      second = true;
      return done;
    });
    await new Promise((done) => setTimeout(done, 100));
    expect(second).toBe(false);
    release();
    (await waiting)();
    expect(second).toBe(true);
    expect(readdirSync(slots)).toEqual([]);
  });

  it("takes over a slot whose owner process has died", async () => {
    const slots = directory();
    writeFileSync(join(slots, "slot-0.json"), JSON.stringify({ pid: 2 ** 22 + 12_345, since: Date.now() }));
    const release = await takeSlot({ directory: slots, slots: 1, wait: 10, log: () => undefined });
    release();
  });
});

describe("check groups", () => {
  it("runs the gate groups in order when no group is named", () => {
    const config = loadChecks();
    const groups = [...new Set(selectChecks(config).map((check) => check.group))];
    expect(groups).toEqual(config.gate);
    expect(config.gate).toEqual(["static", "unit", "build", "browser"]);
  });

  it("keeps the fast group free of browsers and builds", () => {
    for (const check of selectChecks(loadChecks(), "fast"))
      expect(check.run).not.toMatch(/browser|build-target|vitest\.mjs run$/u);
  });
});
