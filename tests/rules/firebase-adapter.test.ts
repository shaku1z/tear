// The game's Firebase adapter (src/platform/firebase-cloud.ts) on the SDK the standalone build ships
// (src/platform/firebase-sdk.ts), against the emulators with firestore.rules loaded: every write the game
// makes is one the rules allow, and every read gets back what was written.
// Run with `pnpm test:rules`. The rules on their own, allowed and refused writes, are in
// tests/rules/firestore-rules.test.ts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, getDocs } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AccountContext, CloudStatus, CloudUser } from "../../src/platform/cloud";
import { createFirebaseCloudCompatibility } from "../../src/platform/firebase-cloud";
import { createFirebaseServices } from "../../src/platform/firebase-sdk";
import { emulatorClientConfig, emulatorHosts, rulesTestProject, until } from "./rules-test-project";

const projectId = rulesTestProject();

let env: RulesTestEnvironment;
let clockOffset = 0;
let signedIn: Readonly<{ user: CloudUser; status: CloudStatus }> | undefined;
const context: AccountContext = {
  setUser(user, status) {
    signedIn = { user, status };
  },
  sync: () => Promise.resolve(),
};
const cloud = createFirebaseCloudCompatibility({
  services: () => Promise.resolve(createFirebaseServices(emulatorClientConfig(), { emulators: emulatorHosts() })),
  now: () => Date.now() + clockOffset,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(resolve(import.meta.dirname, "../../firestore.rules"), "utf8") },
  });
  await cloud.account.init(context);
  // init reports the local guest first, then the anonymous Firebase account once it is signed in.
  await until(() => (signedIn !== undefined && signedIn.user.id !== "local" ? signedIn : undefined), "the sign-in");
});
beforeEach(async () => {
  await env.clearFirestore();
  clockOffset = 0;
});
afterAll(async () => {
  cloud.account.dispose?.();
  await env.cleanup();
});

const uid = (): string => signedIn?.user.id ?? "";
const recording = (size: number) => ({
  mode: "endless",
  diff: "hard",
  wave: 7,
  score: 4200,
  time: 210.4,
  won: false,
  kills: 31,
  peak: 3,
  name: "Guest",
  thumb: null,
  frames: "f".repeat(size),
});

describe("the game's Firebase adapter under firestore.rules", () => {
  it("signs in anonymously and saves, loads and replaces the cloud save", async () => {
    expect(uid()).not.toBe("local");
    const save = { profile: { username: "Rook", coins: 12 }, meta: { level: 3 } };
    await cloud.account.save?.(context, save);
    await expect(cloud.account.load?.(context)).resolves.toEqual(save);
    const replacement = { profile: { coins: 0 }, meta: {} };
    await expect(cloud.account.replace?.(context, replacement)).resolves.toBe(true);
    await expect(cloud.account.load?.(context)).resolves.toEqual(replacement);
  });

  it("submits a best score, keeps a lower one out and reads the board back", async () => {
    const entry = (score: number) => ({ name: "Guest", score, wave: 5, time: 120.4 });
    await expect(cloud.shared.submitScore("endless", "hard", entry(1500))).resolves.toBe(true);
    await expect(cloud.shared.submitScore("endless", "hard", entry(900))).resolves.toBe(false);
    // A higher score within 10 s of the last is refused by the rules' write-rate limit.
    await expect(cloud.shared.submitScore("endless", "hard", entry(1600))).resolves.toBe(false);
    clockOffset = 11_000;
    await expect(cloud.shared.submitScore("endless", "hard", entry(1700))).resolves.toBe(true);
    const board = await cloud.shared.topScores("endless", "hard", 25);
    expect(board).toEqual([
      { name: "Guest", score: 1700, wave: 5, time: 120, uid: uid(), ts: expect.any(Number) as number },
    ]);
  });

  it("publishes a leaderboard replay in chunks, links it to the row and plays it back", async () => {
    await expect(
      cloud.shared.submitScore("endless", "hard", { name: "Guest", score: 4200, wave: 7, time: 210 }),
    ).resolves.toBe(true);
    const published = recording(1_200_000);
    const shareId = await cloud.shared.publishReplay(published, null, "lb_endless_hard");
    expect(shareId).toBe(`lb_endless_hard_${uid()}`);
    await expect(cloud.shared.linkReplay("endless", "hard", shareId ?? "")).resolves.toBe(true);
    const row = (await cloud.shared.topScores("endless", "hard", 25))?.[0];
    expect(row?.replayId).toBe(shareId);
    await expect(cloud.shared.loadReplay(shareId ?? "")).resolves.toEqual(published);
    // Publishing the next leaderboard run replaces the same replay.
    await expect(cloud.shared.publishReplay(recording(10), null, "lb_endless_hard")).resolves.toBe(shareId);
    await expect(cloud.shared.loadReplay(shareId ?? "")).resolves.toEqual(recording(10));
  });

  it("publishes a replay to the feed under a random id", async () => {
    const shareId = await cloud.shared.publishReplay(recording(100), null);
    expect(shareId).toMatch(/^r[0-9a-z]+$/u);
    const feed = await cloud.shared.replayFeed(20);
    expect(feed?.map((entry) => entry.shareId)).toEqual([shareId]);
    await expect(cloud.shared.loadReplay(shareId ?? "")).resolves.toEqual(recording(100));
  });

  it("sends the run_end statistic", async () => {
    cloud.shared.logEvent("run_end", { mode: "endless", diff: "hard", wave: 7, score: 4200, died: true });
    const events = await until(async () => {
      let found: unknown[] | undefined;
      await env.withSecurityRulesDisabled(async (admin) => {
        const snapshot = await getDocs(collection(admin.firestore(), "telemetry"));
        if (!snapshot.empty) found = snapshot.docs.map((document) => document.data());
      });
      return found;
    }, "the statistic");
    expect(events).toEqual([
      {
        event: "run_end",
        ts: expect.any(Number) as number,
        mode: "endless",
        diff: "hard",
        wave: 7,
        score: 4200,
        died: true,
      },
    ]);
  });

  it("finds no legacy ghost", async () => {
    await expect(cloud.shared.loadGhost("endless", "hard")).resolves.toBeNull();
  });
});
