// The merge rules of scripts/merge-ready.mjs, decided from fixed facts.
import { describe, expect, it } from "vitest";
import { decide, FIX_LABEL, pickRun } from "../../scripts/merge-ready.mjs";

const head = "a".repeat(40);
const checkedMain = "b".repeat(40);
const green = { conclusion: "success", headSha: "c".repeat(40) };
const red = { conclusion: "failure", headSha: "d".repeat(40) };
const pr = (overrides = {}) => ({
  state: "OPEN",
  draft: false,
  headSha: head,
  labels: [],
  files: ["src/gameplay/run/live-enemy-spawn.ts"],
  ...overrides,
});
const passed = (overrides = {}) => ({
  status: "completed",
  conclusion: "success",
  checkedHead: head,
  checkedMain,
  ...overrides,
});

describe("merge readiness", () => {
  it("is ready when the check passed and main has not changed since", () => {
    expect(decide({ main: green, pr: pr(), run: passed(), mainFilesSince: [] })).toMatchObject({ ready: true });
  });

  it("is ready when main changed only in files this change does not touch", () => {
    const decision = decide({ main: green, pr: pr(), run: passed(), mainFilesSince: ["src/presentation/ui.ts"] });
    expect(decision).toMatchObject({ ready: true });
    expect(decision.reason).toContain("unrelated");
  });

  describe("rule 1: a red main stops merges", () => {
    it("refuses while main's latest finished check is red", () => {
      const decision = decide({ main: red, pr: pr(), run: passed(), mainFilesSince: [] });
      expect(decision.ready).toBe(false);
      expect(decision.reason).toContain("main is red");
    });

    it(`lets the pull request labelled "${FIX_LABEL}" through, if its own check is current`, () => {
      expect(decide({ main: red, pr: pr({ labels: [FIX_LABEL] }), run: passed(), mainFilesSince: [] })).toMatchObject({
        ready: true,
      });
      expect(
        decide({
          main: red,
          pr: pr({ labels: [FIX_LABEL] }),
          run: passed({ conclusion: "failure" }),
          mainFilesSince: [],
        }).ready,
      ).toBe(false);
    });

    it("treats a skipped or cancelled run as nothing checked and asks for a fresh one", () => {
      for (const conclusion of ["skipped", "cancelled"]) {
        const decision = decide({ main: green, pr: pr(), run: passed({ conclusion }), mainFilesSince: [] });
        expect(decision.ready).toBe(false);
        expect(decision.reason).toContain(`was ${conclusion}, so nothing was checked`);
        expect(decision.action).toBe("refresh");
      }
    });

    it("lets the real run speak for a head even when a draft's skipped run was created after it", () => {
      const at = (second) => `2026-11-16T10:00:0${String(second)}Z`;
      const real = { id: 1, created_at: at(0), status: "in_progress", conclusion: null };
      const skipped = { id: 2, created_at: at(1), status: "completed", conclusion: "skipped" };
      const cancelled = { id: 3, created_at: at(2), status: "completed", conclusion: "cancelled" };
      expect(pickRun([skipped, real, cancelled]).id).toBe(1);
      expect(pickRun([skipped, cancelled]).id).toBe(3);
      expect(pickRun([])).toBeUndefined();
    });

    it("refuses while main's newest commit has no finished check (cancelled or still running)", () => {
      const tip = "e".repeat(40);
      const decision = decide({ main: green, pr: pr(), run: passed(), mainFilesSince: [], mainTip: tip });
      expect(decision.ready).toBe(false);
      expect(decision.reason).toContain("main's newest commit (eeeeeeee) has no finished check");
      expect(decide({ main: green, pr: pr(), run: passed(), mainFilesSince: [], mainTip: green.headSha }).ready).toBe(
        true,
      );
      // The pull request that fixes main may still go first.
      expect(
        decide({ main: red, pr: pr({ labels: [FIX_LABEL] }), run: passed(), mainFilesSince: [], mainTip: tip }).ready,
      ).toBe(true);
    });

    it("refuses when main has no finished check at all", () => {
      expect(decide({ main: undefined, pr: pr(), run: passed(), mainFilesSince: [] }).ready).toBe(false);
    });
  });

  describe("rule 2: a stale pass is not a pass", () => {
    it("refuses when main changed a file this change touches", () => {
      const decision = decide({
        main: green,
        pr: pr(),
        run: passed(),
        mainFilesSince: ["src/gameplay/run/live-enemy-spawn.ts"],
      });
      expect(decision).toMatchObject({ ready: false, action: "refresh" });
    });

    it.each([
      "package.json",
      "pnpm-lock.yaml",
      "config/checks.json",
      ".github/workflows/ci.yml",
      "src/tearbench/task-registry.json",
    ])("refuses when main changed the shared file %s", (file) => {
      expect(decide({ main: green, pr: pr(), run: passed(), mainFilesSince: [file] })).toMatchObject({
        ready: false,
        action: "refresh",
      });
    });

    it("refuses a pass that did not record what it checked, or checked another head", () => {
      expect(decide({ main: green, pr: pr(), run: passed({ checkedMain: undefined }), mainFilesSince: [] }).ready).toBe(
        false,
      );
      expect(
        decide({ main: green, pr: pr(), run: passed({ checkedHead: "e".repeat(40) }), mainFilesSince: [] }).ready,
      ).toBe(false);
    });

    it("refuses a missing, running or failed check", () => {
      expect(decide({ main: green, pr: pr(), run: undefined, mainFilesSince: undefined }).action).toBe("refresh");
      expect(decide({ main: green, pr: pr(), run: passed({ status: "in_progress" }), mainFilesSince: [] }).ready).toBe(
        false,
      );
      expect(decide({ main: green, pr: pr(), run: passed({ conclusion: "failure" }), mainFilesSince: [] }).ready).toBe(
        false,
      );
    });
  });

  it("refuses drafts and closed pull requests", () => {
    expect(decide({ main: green, pr: pr({ draft: true }), run: passed(), mainFilesSince: [] }).ready).toBe(false);
    expect(decide({ main: green, pr: pr({ state: "MERGED" }), run: passed(), mainFilesSince: [] }).ready).toBe(false);
  });
});
