import { execFileSync } from "node:child_process";
import { basename, join } from "node:path";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { LazyModuleUnavailable, lazyModuleReady, lazySlot } from "../../src/domain/lazy-module";
import { GhostCapsuleReader, type GhostCapsuleContents } from "../../src/ghost/capsule-reader";
import { createGhostProductionReplaySession } from "../../src/ghost/production-replay-session";
import { replayEngine, type ReplayEngine } from "../../src/ghost/replay-engine";
import type * as ProductionReplayComposition from "../../src/tearbench/production-replay-composition";

describe("replay engine gate", () => {
  it("waits for the engine before a capsule is read, and fails with a plain message when it cannot load", async () => {
    const getManifest = vi.fn(() => Promise.resolve(undefined));
    const reader = new GhostCapsuleReader({ getManifest, readChunk: vi.fn() });
    let release: (() => void) | undefined;
    const ensure = vi.spyOn(replayEngine, "ensure").mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve({} as Awaited<ReturnType<typeof replayEngine.ensure>>);
          };
        }),
    );
    const reading = reader.read("a").catch((error: unknown) => error);
    await Promise.resolve();
    expect(getManifest).not.toHaveBeenCalled();
    release?.();
    expect(await reading).toBeInstanceOf(RangeError);
    expect(getManifest).toHaveBeenCalledTimes(1);

    ensure.mockRejectedValueOnce(new LazyModuleUnavailable("needs a connection"));
    await expect(reader.read("a")).rejects.toThrow("needs a connection");
    expect(getManifest).toHaveBeenCalledTimes(1);
    ensure.mockRestore();
  });

  it("shows a wait line, runs when ready, and shows one retryable message on failure", async () => {
    const slot = lazySlot<object>("Check the connection and try again.");
    const said: string[] = [];
    slot.install(() => Promise.reject(new TypeError("offline")));
    expect(await lazyModuleReady(slot, (m) => said.push(m), "Loading…")).toBe(false);
    expect(said).toEqual(["Loading…", "Check the connection and try again."]);
    slot.install(() => Promise.resolve({}));
    said.length = 0;
    expect(await lazyModuleReady(slot, (m) => said.push(m), "Loading…")).toBe(true);
    expect(said).toEqual(["Loading…"]);
    expect(await lazyModuleReady(slot, (m) => said.push(m), "Loading…")).toBe(true);
    expect(said).toEqual(["Loading…"]);
  });

  it("keeps synchronous engine use inside the modules that work on a capsule", () => {
    // Each of these takes a capsule that GhostCapsuleReader.read produced, and that read waits for the engine.
    const allowed = ["live-ghost-reference.ts", "production-replay-session.ts", "production-replay-verification.ts"];
    // git grep searches the tree from its index in well under a second; reading every source
    // file from Node took about nine seconds on a loaded machine and timed the test out.
    const listed = execFileSync(
      "git",
      ["grep", "-l", "--untracked", "-F", "replayEngine.loaded()", "--", "src/**/*.ts"],
      { cwd: join(__dirname, "../.."), encoding: "utf8" },
    );
    const users = listed
      .split(/\r?\n/u)
      .filter((path) => path.length > 0)
      .map((path) => basename(path))
      .filter((name) => name !== "replay-engine.ts");
    expect(users.sort()).toEqual(allowed);
  });

  it("gives ReplayEngine the members the engine module really has (the app layer declares them)", () => {
    expectTypeOf<ReplayEngine["createProductionGhostReplayComposition"]>().toEqualTypeOf<
      typeof ProductionReplayComposition.createProductionGhostReplayComposition
    >();
    expectTypeOf<ReplayEngine["captureProductionReplayCheckpoint"]>().toEqualTypeOf<
      typeof ProductionReplayComposition.captureProductionReplayCheckpoint
    >();
    expectTypeOf<ReplayEngine["projectProductionReplayCanonicalState"]>().toEqualTypeOf<
      typeof ProductionReplayComposition.projectProductionReplayCanonicalState
    >();
  });

  it("lets only a capsule from GhostCapsuleReader.read reach the replay engine (the compiler proves it)", () => {
    const plain = {} as GhostCapsuleContents;
    // @ts-expect-error a capsule built by hand is not branded, so replay code refuses it
    const refused = (): unknown => createGhostProductionReplaySession(plain);
    expect(refused).toBeTypeOf("function");
  });
});
