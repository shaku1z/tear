// The merge rules of scripts/merge-ready.mjs, decided from fixed facts.
import { describe, expect, it } from "vitest";
import { batchNote } from "../../scripts/merge-batch.mjs";
import { decide, FIX_LABEL, parseBatchNote, pickRun } from "../../scripts/merge-ready.mjs";

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

    it("does not treat the tool catalogue as shared: only a change that edits it too goes stale", () => {
      const catalogue = "config/tool-catalogue.json";
      expect(decide({ main: green, pr: pr(), run: passed(), mainFilesSince: [catalogue] }).ready).toBe(true);
      const editsIt = pr({ files: ["scripts/new-tool.mjs", catalogue] });
      expect(decide({ main: green, pr: editsIt, run: passed(), mainFilesSince: [catalogue] }).ready).toBe(false);
      expect(decide({ main: green, pr: pr(), run: passed(), mainFilesSince: ["config/checks.json"] }).ready).toBe(
        false,
      );
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

  describe("rule 3: a passed batch covers its members", () => {
    // Five members, #11 to #15; #13 is the pull request being decided. Its own pass is stale: the
    // other members changed shared files, and main's newest commit has no finished run yet.
    const oid = (digit) => digit.repeat(40);
    const members = [11, 12, 13, 14, 15].map((number, index) => ({ pr: number, head: oid(String(index + 1)) }));
    const batch = (overrides = {}) => ({ conclusion: "success", url: "run", main: checkedMain, members, ...overrides });
    const merge = (number) => ({
      sha: oid(String(number - 4)).replace(/^./u, "e"),
      pr: number,
      head: oid(String(number - 10)),
    });
    const facts = (overrides = {}) => ({
      main: green,
      pr: pr({ number: 13, headSha: oid("3") }),
      run: passed({ checkedHead: oid("3") }),
      mainFilesSince: ["config/architecture-roles.json"],
      mainTip: "f".repeat(40),
      batch: batch(),
      mainSinceBatch: [merge(11), merge(12)],
      ...overrides,
    });

    it("is ready when every commit on main since the batch is another member's merge", () => {
      const decision = decide(facts());
      expect(decision).toMatchObject({ ready: true });
      expect(decision.reason).toContain("only by #11, #12");
    });

    it("stays ready for the rest after a partial batch: three of five merged, then a stop", () => {
      const after = facts({ mainSinceBatch: [merge(11), merge(12), merge(14)] });
      expect(decide(after).ready).toBe(true);
      expect(decide({ ...after, pr: pr({ number: 15, headSha: oid("5") }) }).ready).toBe(true);
    });

    it("does not cover a head that moved after the batch", () => {
      const decision = decide(facts({ pr: pr({ number: 13, headSha: oid("9") }) }));
      expect(decision.ready).toBe(false);
      expect(decision.reason).toContain("head moved after the batch");
    });

    it("does not cover once a commit from outside the batch lands on main mid-batch", () => {
      const outsider = { sha: "9".repeat(40), pr: 99, head: "8".repeat(40) };
      const decision = decide(facts({ mainSinceBatch: [merge(11), outsider, merge(12)] }));
      expect(decision.ready).toBe(false);
      expect(decision.reason).toContain("not another member's merge");
      const direct = decide(facts({ mainSinceBatch: [{ sha: "9".repeat(40) }] }));
      expect(direct.ready).toBe(false);
    });

    it("does not cover when a member merged a different head than the batch checked", () => {
      const decision = decide(facts({ mainSinceBatch: [{ ...merge(11), head: "8".repeat(40) }] }));
      expect(decision.ready).toBe(false);
      expect(decision.reason).toContain("#11 merged a head the batch did not check");
    });

    it("does not cover from a failed batch run, a batch without this pull request, or unknown history", () => {
      expect(decide(facts({ batch: batch({ conclusion: "failure" }) })).reason).toContain("batch run ended failure");
      expect(decide(facts({ batch: batch({ members: members.filter((m) => m.pr !== 13) }) })).ready).toBe(false);
      expect(decide(facts({ mainSinceBatch: undefined })).ready).toBe(false);
    });

    it("never applies while main is red, even to the pull request labelled to fix it", () => {
      expect(decide(facts({ main: red })).ready).toBe(false);
      const labelled = facts({ main: red, pr: pr({ number: 13, headSha: oid("3"), labels: [FIX_LABEL] }) });
      expect(decide(labelled).reason).toContain("a batch does not apply while main is red");
    });

    it("never makes a draft or a closed pull request ready", () => {
      expect(decide(facts({ pr: pr({ number: 13, headSha: oid("3"), draft: true }) })).ready).toBe(false);
      expect(decide(facts({ pr: pr({ number: 13, headSha: oid("3"), state: "CLOSED" }) })).ready).toBe(false);
    });

    it("leaves the single-PR rules unchanged when no batch names the pull request", () => {
      const decision = decide(facts({ batch: undefined, mainSinceBatch: undefined }));
      expect(decision.ready).toBe(false);
      expect(decision.reason).toContain("newest commit");
    });

    it("reads back the annotation merge-batch writes", () => {
      expect(parseBatchNote(batchNote(checkedMain, members))).toEqual({ main: checkedMain, members });
      expect(parseBatchNote("main=short members=1:abc")).toBeUndefined();
      expect(parseBatchNote(undefined)).toBeUndefined();
    });
  });
});
