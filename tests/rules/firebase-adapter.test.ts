// The game's Firebase adapter (src/platform/firebase-cloud.ts) on the SDK the standalone build ships
// (src/platform/firebase-sdk.ts), against the emulators with firestore.rules loaded: every write the game
// makes is one the rules allow, and every read gets back what was written.
// Run with `pnpm test:rules`. The rules on their own, allowed and refused writes, are in
// tests/rules/firestore-rules.test.ts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { Timestamp, collection, doc, getDocs, setDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { leaderboardId, type LeaderboardRef } from "../../src/domain/leaderboards";
import type { AccountContext, CloudStatus, CloudUser } from "../../src/platform/cloud";
import { createFirebaseCloudCompatibility } from "../../src/platform/firebase-cloud";
import type { FirebaseClientConfig } from "../../src/platform/firebase-config";
import { createFirebaseServices } from "../../src/platform/firebase-sdk";
import { rulesTestProject } from "./rules-test-project";

const projectId = rulesTestProject();
const config: FirebaseClientConfig = {
  apiKey: "demo-api-key",
  authDomain: `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: "",
};

let env: RulesTestEnvironment;
let clockOffset = 0;
let signedIn: Readonly<{ user: CloudUser; status: CloudStatus }> | undefined;
const context: AccountContext = {
  setUser(user, status) {
    signedIn = { user, status };
  },
  sync: () => Promise.resolve(),
};
const [firestoreHost = "127.0.0.1", firestorePort = "8189"] = (process.env.FIRESTORE_EMULATOR_HOST ?? "").split(":");
const emulators = {
  authUrl: `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9199"}`,
  firestoreHost,
  firestorePort: Number(firestorePort),
};
const cloud = createFirebaseCloudCompatibility({
  services: () => Promise.resolve(createFirebaseServices(config, emulators)),
  now: () => Date.now() + clockOffset,
});

async function until<T>(read: () => T | undefined | Promise<T | undefined>, what: string): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

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
const ENDLESS_HARD: LeaderboardRef = { kind: "score", mode: "endless", difficulty: "hard" };
const CLEAR_HARD: LeaderboardRef = { kind: "gauntlet-clear", mode: "gauntlet", difficulty: "hard" };
const anyNumber = expect.any(Number) as number;

/** Moves this player's row on a board 11 s into the past, server time included, instead of waiting. */
async function writtenEarlier(board: LeaderboardRef): Promise<void> {
  await env.withSecurityRulesDisabled(async (admin) => {
    const earlier = Date.now() - 11_000;
    const row = doc(admin.firestore() as unknown as Firestore, `leaderboards/${leaderboardId(board)}/scores/${uid()}`);
    await setDoc(row, { at: Timestamp.fromMillis(earlier), ts: earlier }, { merge: true });
  });
}
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
    await expect(cloud.shared.submitScore(ENDLESS_HARD, entry(1500))).resolves.toBe(true);
    await expect(cloud.shared.submitScore(ENDLESS_HARD, entry(900))).resolves.toBe(false);
    // A higher score within 10 s of the last is refused by the rules' write-rate limit, which goes by the
    // server's clock: moving the client's clock on does not get past it.
    await expect(cloud.shared.submitScore(ENDLESS_HARD, entry(1600))).resolves.toBe(false);
    clockOffset = 11_000;
    await expect(cloud.shared.submitScore(ENDLESS_HARD, entry(1600))).resolves.toBe(false);
    clockOffset = 0;
    await writtenEarlier(ENDLESS_HARD);
    await expect(cloud.shared.submitScore(ENDLESS_HARD, entry(1700))).resolves.toBe(true);
    const board = await cloud.shared.topScores(ENDLESS_HARD, 25);
    expect(board).toEqual([
      { name: "Guest", score: 1700, wave: 5, time: 120, uid: uid(), ts: anyNumber, at: anyNumber },
    ]);
  });

  it("publishes a leaderboard replay in chunks, links it to the row and plays it back", async () => {
    await expect(
      cloud.shared.submitScore(ENDLESS_HARD, { name: "Guest", score: 4200, wave: 7, time: 210 }),
    ).resolves.toBe(true);
    const published = recording(1_200_000);
    const shareId = await cloud.shared.publishReplay(published, null, "lb_endless_hard");
    expect(shareId).toBe(`lb_endless_hard_${uid()}`);
    await expect(cloud.shared.linkReplay(ENDLESS_HARD, shareId ?? "")).resolves.toBe(true);
    const row = (await cloud.shared.topScores(ENDLESS_HARD, 25))?.[0];
    expect(row?.replayId).toBe(shareId);
    await expect(cloud.shared.loadReplay(shareId ?? "")).resolves.toEqual(published);
    // Publishing the next leaderboard run replaces the same replay.
    await expect(cloud.shared.publishReplay(recording(10), null, "lb_endless_hard")).resolves.toBe(shareId);
    await expect(cloud.shared.loadReplay(shareId ?? "")).resolves.toEqual(recording(10));
  });

  it("keeps the fastest Gauntlet clear lowest first, and a new best replaces the row without the old link", async () => {
    const clear = (ticks: number) => ({ name: "Guest", score: ticks, wave: 6, time: Math.round(ticks / 120) });
    await expect(cloud.shared.submitScore(CLEAR_HARD, clear(90_000))).resolves.toBe(true);
    const shareId = await cloud.shared.publishReplay(recording(10), null, "lb_gauntletclear_hard");
    expect(shareId).toBe(`lb_gauntletclear_hard_${uid()}`);
    await expect(cloud.shared.linkReplay(CLEAR_HARD, shareId ?? "")).resolves.toBe(true);
    expect((await cloud.shared.topScores(CLEAR_HARD, 25))?.[0]?.replayId).toBe(shareId);
    await writtenEarlier(CLEAR_HARD);
    // A slower clear stays out on the client; one under the rules' 30 s floor is refused by the server.
    await expect(cloud.shared.submitScore(CLEAR_HARD, clear(95_000))).resolves.toBe(false);
    await expect(cloud.shared.submitScore(CLEAR_HARD, clear(3_599))).resolves.toBe(false);
    // A faster clear replaces the row: exactly the six fields and the server's time, the slower run's
    // replay link gone.
    await expect(cloud.shared.submitScore(CLEAR_HARD, clear(80_000))).resolves.toBe(true);
    await expect(cloud.shared.topScores(CLEAR_HARD, 25)).resolves.toEqual([
      { name: "Guest", score: 80_000, wave: 6, time: 667, uid: uid(), ts: anyNumber, at: anyNumber },
    ]);
  });

  it("publishes a replay to the feed under a random id", async () => {
    const shareId = await cloud.shared.publishReplay(recording(100), null);
    expect(shareId).toMatch(/^r[0-9a-z]+$/u);
    const feed = await cloud.shared.replayFeed(20);
    expect(feed?.map((entry) => entry.shareId)).toEqual([shareId]);
    await expect(cloud.shared.loadReplay(shareId ?? "")).resolves.toEqual(recording(100));
  });

  it("publishes a recording of multibyte text in chunks under Firestore's document size and plays it back", async () => {
    // 3 and 4 bytes a character in UTF-8: 500,000 characters of either would be over the 1 MiB document limit,
    // and a cut inside a surrogate pair would come back as a replacement character.
    const published = { ...recording(0), frames: `${"★".repeat(400_000)}${"\u{1F600}".repeat(300_000)}` };
    const shareId = await cloud.shared.publishReplay(published, null);
    expect(shareId).not.toBeNull();
    await expect(cloud.shared.loadReplay(shareId ?? "")).resolves.toEqual(published);
  });

  it("publishes without a thumbnail that is not a small JPEG, which the feed would otherwise fetch", async () => {
    const shareId = await cloud.shared.publishReplay(
      { ...recording(10), thumb: "https://example.com/pixel.png" },
      null,
    );
    expect(shareId).not.toBeNull();
    const feed = await cloud.shared.replayFeed(20);
    expect(feed?.find((entry) => entry.shareId === shareId)?.thumb).toBeNull();
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
