// firestore.rules under the Firestore emulator: for every collection the game uses, the writes the game
// makes are allowed and the ones it never makes are refused. Run with `pnpm test:rules`
// (scripts/test-firestore-rules.mjs starts the emulators). tests/rules/firebase-adapter.test.ts runs the
// game's own Firebase adapter against the same rules.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { DIFFICULTY_IDS } from "../../src/gameplay/run/difficulty-catalog";
import { rulesTestProject } from "./rules-test-project";

const rulesText = readFileSync(resolve(import.meta.dirname, "../../firestore.rules"), "utf8");
let env: RulesTestEnvironment;

/** The board ids a rules function such as isBoard lists, sorted. */
function listedBoards(name: string): string[] {
  const start = rulesText.indexOf(`function ${name}(board)`);
  const list = start < 0 ? "" : rulesText.slice(rulesText.indexOf("[", start), rulesText.indexOf("]", start));
  return [...list.matchAll(/'([a-z_]+)'/gu)].map((match) => match[1] ?? "").sort();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: rulesTestProject(), firestore: { rules: rulesText } });
});
beforeEach(async () => {
  await env.clearFirestore();
});
afterAll(async () => {
  await env.cleanup();
});

// rules-unit-testing types its databases as the compat class; the modular functions take that instance as is.
const modular = (db: unknown): Firestore => db as Firestore;
const as = (uid: string): Firestore => modular(env.authenticatedContext(uid).firestore());
const anonymous = (): Firestore => modular(env.unauthenticatedContext().firestore());
async function seed(path: string, data: DocumentData): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

describe("users/{uid}: the cloud save", () => {
  const save = { profile: { username: "Rook", coins: 12 }, meta: { level: 3 } };

  it("lets the owner create, read, merge-save, replace and delete their save", async () => {
    const db = as("alice");
    await assertSucceeds(setDoc(doc(db, "users/alice"), save));
    await assertSucceeds(getDoc(doc(db, "users/alice")));
    await assertSucceeds(setDoc(doc(db, "users/alice"), { profile: { coins: 13 }, meta: {} }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, "users/alice"), save));
    await assertSucceeds(deleteDoc(doc(db, "users/alice")));
  });

  it("keeps a save from an older build that holds other fields writable", async () => {
    await seed("users/alice", { ...save, legacyField: true });
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice"), save, { merge: true }));
  });

  it("refuses everyone but the owner", async () => {
    await seed("users/alice", save);
    await assertFails(getDoc(doc(as("bob"), "users/alice")));
    await assertFails(setDoc(doc(as("bob"), "users/alice"), save));
    await assertFails(deleteDoc(doc(as("bob"), "users/alice")));
    await assertFails(getDoc(doc(anonymous(), "users/alice")));
    await assertFails(setDoc(doc(anonymous(), "users/alice"), save));
  });

  it("refuses fields other than profile and meta, and blobs that are not maps", async () => {
    const db = as("alice");
    await assertFails(setDoc(doc(db, "users/alice"), { ...save, admin: true }));
    await assertFails(setDoc(doc(db, "users/alice"), { profile: "x", meta: {} }));
    await assertFails(setDoc(doc(db, "users/alice"), { profile: {}, meta: 3 }));
    await seed("users/alice", save);
    await assertFails(setDoc(doc(db, "users/alice"), { admin: true }, { merge: true }));
  });
});

describe("leaderboards/{board}/scores/{uid}", () => {
  const row = (uid: string, extra: DocumentData = {}): DocumentData => ({
    name: "Guest",
    score: 1200,
    wave: 4,
    time: 95,
    uid,
    ts: Date.now(),
    ...extra,
  });
  const path = (uid: string, board = "endless_hard"): string => `leaderboards/${board}/scores/${uid}`;

  it("names exactly the boards the LEADERBOARDS screen lists", async () => {
    // The screen's filter (src/app/library/library-screen-adapters-runtime.ts) times every difficulty.
    const modes = CONFIG.modes.filter((mode) => !mode.training && !mode.debug).map((mode) => mode.id);
    const boards = modes.flatMap((mode) => DIFFICULTY_IDS.map((difficulty) => `${mode}_${difficulty}`));
    expect(listedBoards("isBoard")).toEqual([...boards].sort());
    for (const board of boards) await assertSucceeds(setDoc(doc(as("alice"), path("alice", board)), row("alice")));
  });

  it("names one Gauntlet clear board per difficulty", () => {
    expect(listedBoards("isClearBoard")).toEqual(
      DIFFICULTY_IDS.map((difficulty) => `gauntletclear_${difficulty}`).sort(),
    );
  });

  it("lets anyone read a board in score order", async () => {
    await seed(path("alice"), row("alice"));
    const board = collection(anonymous(), "leaderboards/endless_hard/scores");
    await assertSucceeds(getDocs(query(board, orderBy("score", "desc"), limit(25))));
  });

  it("refuses a board the game has no screen for", async () => {
    for (const board of ["sandbox_normal", "bossonly_hard", "tutorial_normal", "endless_nightmare", "x"])
      await assertFails(setDoc(doc(as("alice"), path("alice", board)), row("alice")));
  });

  it("refuses someone else's row and a signed-out write", async () => {
    await assertFails(setDoc(doc(as("bob"), path("alice")), row("alice")));
    await assertFails(setDoc(doc(as("bob"), path("alice")), row("bob")));
    await assertFails(setDoc(doc(anonymous(), path("alice")), row("alice")));
    await seed(path("alice"), row("alice"));
    await assertFails(deleteDoc(doc(as("bob"), path("alice"))));
    await assertSucceeds(deleteDoc(doc(as("alice"), path("alice"))));
  });

  it("refuses a row with a missing, extra or out-of-bounds field", async () => {
    const db = as("alice");
    const withoutTs = Object.fromEntries(Object.entries(row("alice")).filter(([key]) => key !== "ts"));
    const refused: DocumentData[] = [
      withoutTs,
      row("alice", { admin: true }),
      row("alice", { replayId: "lb_endless_hard_alice" }),
      row("alice", { uid: "bob" }),
      row("alice", { score: 0 }),
      row("alice", { score: -5 }),
      row("alice", { score: 12.5 }),
      row("alice", { score: "1200" }),
      row("alice", { score: 1_000_000_001 }),
      row("alice", { wave: -1 }),
      row("alice", { wave: 100_001 }),
      row("alice", { time: 95.5 }),
      row("alice", { time: 10_000_001 }),
      row("alice", { name: "" }),
      row("alice", { name: "Seventeen chars!!" }),
      row("alice", { name: "<b>Rook</b>" }),
      row("alice", { name: 7 }),
      row("alice", { ts: Date.now() - 11 * 60_000 }),
      row("alice", { ts: Date.now() + 11 * 60_000 }),
      row("alice", { ts: 1.5 }),
    ];
    for (const data of refused) await assertFails(setDoc(doc(db, path("alice")), data));
    await assertSucceeds(setDoc(doc(db, path("alice")), row("alice", { name: "Rook_the-2 nd" })));
  });

  it("takes a new best only when it is higher and at least 10 seconds after the last", async () => {
    const db = as("alice");
    const earlier = Date.now() - 60_000;
    await seed(path("alice"), row("alice", { ts: earlier }));
    const best = (score: number, ts: number) =>
      setDoc(doc(db, path("alice")), row("alice", { score, ts }), { merge: true });
    await assertFails(best(1100, Date.now()));
    await assertFails(best(1200, Date.now()));
    await assertFails(best(1300, earlier + 9_000));
    await assertSucceeds(best(1300, Date.now()));
  });

  it("links a replay only to the owner's own row and the owner's own replay", async () => {
    const db = as("alice");
    await seed("replays/lb_endless_hard_alice", { ownerUid: "alice" });
    await seed("replays/lb_endless_hard_bob", { ownerUid: "bob" });
    const link = (replayId: unknown, uid = "alice") =>
      setDoc(doc(as(uid), path("alice")), { replayId }, { merge: true });
    // No row yet: a link alone is not a score.
    await assertFails(link("lb_endless_hard_alice"));
    await seed(path("alice"), row("alice"));
    await assertFails(link("lb_endless_hard_bob"));
    await assertFails(link("r-missing"));
    await assertFails(link(""));
    await assertFails(link(42));
    await assertFails(link("lb_endless_hard_alice", "bob"));
    await assertFails(
      setDoc(doc(db, path("alice")), { replayId: "lb_endless_hard_alice", score: 9e8 }, { merge: true }),
    );
    await assertSucceeds(link("lb_endless_hard_alice"));
  });
});

describe("leaderboards/gauntletclear_<difficulty>: fastest Gauntlet clears", () => {
  // score is the clear time in simulation ticks (120 a second); lower is better.
  const clear = (uid: string, extra: DocumentData = {}): DocumentData => ({
    name: "Guest",
    score: 120 * 60 * 9,
    wave: 6,
    time: 560,
    uid,
    ts: Date.now(),
    ...extra,
  });
  const path = (uid: string, difficulty = "hard"): string => `leaderboards/gauntletclear_${difficulty}/scores/${uid}`;

  it("takes a first clear on every difficulty and refuses bounds the game never writes", async () => {
    const db = as("alice");
    for (const difficulty of DIFFICULTY_IDS)
      await assertSucceeds(setDoc(doc(db, path("alice", difficulty)), clear("alice")));
    await env.clearFirestore();
    const refused: DocumentData[] = [
      clear("alice", { score: 7_199 }),
      clear("alice", { score: 1_728_001 }),
      clear("alice", { score: 70_000.5 }),
      clear("alice", { wave: 0 }),
      clear("alice", { wave: 33 }),
      clear("alice", { uid: "bob" }),
      clear("alice", { replayId: "lb_gauntletclear_hard_alice" }),
      clear("alice", { extra: 1 }),
    ];
    for (const data of refused) await assertFails(setDoc(doc(db, path("alice")), data));
    await assertFails(setDoc(doc(as("bob"), path("alice")), clear("alice")));
    await assertFails(setDoc(doc(db, "leaderboards/gauntletclear_nightmare/scores/alice"), clear("alice")));
    await assertSucceeds(setDoc(doc(db, path("alice")), clear("alice", { score: 7_200, wave: 1 })));
  });

  it("takes a new clear only when it is faster and at least 10 seconds after the last", async () => {
    const earlier = Date.now() - 60_000;
    await seed(path("alice"), clear("alice", { score: 70_000, ts: earlier }));
    const fastest = (score: number, ts: number) =>
      setDoc(doc(as("alice"), path("alice")), clear("alice", { score, ts }), { merge: true });
    await assertFails(fastest(70_001, Date.now()));
    await assertFails(fastest(70_000, Date.now()));
    await assertFails(fastest(60_000, earlier + 9_000));
    await assertSucceeds(fastest(60_000, Date.now()));
  });

  it("links the owner's own replay without changing the time", async () => {
    await seed(path("alice"), clear("alice"));
    await seed("replays/lb_gauntletclear_hard_alice", { ownerUid: "alice" });
    const db = as("alice");
    const link = { replayId: "lb_gauntletclear_hard_alice" };
    await assertFails(setDoc(doc(db, path("alice")), { ...link, score: 7_200 }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, path("alice")), link, { merge: true }));
  });
});

describe("telemetry/{doc}: anonymous statistics", () => {
  const runEnd = (extra: DocumentData = {}): DocumentData => ({
    event: "run_end",
    ts: Date.now(),
    mode: "endless",
    diff: "hard",
    wave: 7,
    score: 4200,
    time: 210,
    peak: 3,
    died: true,
    earned: 40,
    wallet: 310,
    coinMagnet: 1,
    fortune: 0,
    bounty: 0,
    shopRanks: 6,
    ...extra,
  });

  it("lets a signed-in player add the run_end event", async () => {
    await assertSucceeds(addDoc(collection(as("alice"), "telemetry"), runEnd()));
  });

  it("refuses a signed-out write, another event, a stale clock and an oversized document", async () => {
    await assertFails(addDoc(collection(anonymous(), "telemetry"), runEnd()));
    await assertFails(addDoc(collection(as("alice"), "telemetry"), runEnd({ event: "admin" })));
    await assertFails(addDoc(collection(as("alice"), "telemetry"), runEnd({ ts: Date.now() - 11 * 60_000 })));
    const wide = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`extra${String(index)}`, index]));
    await assertFails(addDoc(collection(as("alice"), "telemetry"), runEnd(wide)));
  });

  it("refuses every read, update and delete", async () => {
    await seed("telemetry/one", runEnd());
    await assertFails(getDoc(doc(as("alice"), "telemetry/one")));
    await assertFails(getDocs(collection(as("alice"), "telemetry")));
    await assertFails(setDoc(doc(as("alice"), "telemetry/one"), runEnd()));
    await assertFails(deleteDoc(doc(as("alice"), "telemetry/one")));
  });
});

describe("ghosts/{board}: legacy, read-only", () => {
  it("lets anyone read and nobody write", async () => {
    await seed("ghosts/endless_hard", { score: 1 });
    await assertSucceeds(getDoc(doc(anonymous(), "ghosts/endless_hard")));
    await assertFails(setDoc(doc(as("alice"), "ghosts/endless_hard"), { score: 2 }));
    await assertFails(setDoc(doc(as("alice"), "ghosts/campaign_easy"), { score: 2 }));
    await assertFails(deleteDoc(doc(as("alice"), "ghosts/endless_hard")));
  });
});

describe("replays/{id} and their chunks", () => {
  const summary = (ownerUid: string, extra: DocumentData = {}): DocumentData => ({
    ownerUid,
    createdAt: Date.now(),
    chunkCount: 2,
    mode: "endless",
    diff: "hard",
    wave: 7,
    score: 4200,
    time: 210,
    won: false,
    kills: 31,
    peak: 3,
    name: "Guest",
    thumb: null,
    lb: true,
    ...extra,
  });

  it("lets the owner publish under a random id or their own leaderboard id, and anyone watch", async () => {
    const db = as("alice");
    await assertSucceeds(setDoc(doc(db, "replays/rmhz2k0q4f8a1x"), summary("alice", { lb: false })));
    await assertSucceeds(setDoc(doc(db, "replays/lb_endless_hard_alice"), summary("alice")));
    await assertSucceeds(getDoc(doc(anonymous(), "replays/lb_endless_hard_alice")));
    await assertSucceeds(getDocs(query(collection(anonymous(), "replays"), orderBy("createdAt", "desc"), limit(20))));
  });

  it("refuses another player's leaderboard id, an unknown id shape and a summary owned by someone else", async () => {
    const db = as("alice");
    await assertFails(setDoc(doc(db, "replays/lb_endless_hard_bob"), summary("alice")));
    await assertFails(setDoc(doc(db, "replays/lb_endless_hard_alice"), summary("bob")));
    await assertFails(setDoc(doc(db, "replays/someone"), summary("alice")));
    await assertFails(setDoc(doc(db, "replays/R123"), summary("alice")));
    await assertFails(setDoc(doc(anonymous(), "replays/rabc"), summary("alice")));
  });

  it("refuses a summary with an extra field or bounds the game never writes", async () => {
    const db = as("alice");
    for (const extra of [{ admin: true }, { chunkCount: 0 }, { chunkCount: 7 }, { chunkCount: 1.5 }, { name: "" }])
      await assertFails(setDoc(doc(db, "replays/rabc"), summary("alice", extra)));
    await assertFails(setDoc(doc(db, "replays/rabc"), summary("alice", { name: "x".repeat(33) })));
    await assertFails(setDoc(doc(db, "replays/rabc"), summary("alice", { createdAt: Date.now() - 11 * 60_000 })));
  });

  it("lets only the owner replace or delete a replay, and never hand it to someone else", async () => {
    await seed("replays/lb_endless_hard_alice", summary("alice"));
    await assertSucceeds(setDoc(doc(as("alice"), "replays/lb_endless_hard_alice"), summary("alice", { score: 5000 })));
    await assertFails(setDoc(doc(as("alice"), "replays/lb_endless_hard_alice"), summary("bob")));
    await assertFails(setDoc(doc(as("bob"), "replays/lb_endless_hard_alice"), summary("bob")));
    await assertFails(deleteDoc(doc(as("bob"), "replays/lb_endless_hard_alice")));
    await assertSucceeds(deleteDoc(doc(as("alice"), "replays/lb_endless_hard_alice")));
  });

  it("lets the owner write chunks below the parent's chunk count, each only a bounded string", async () => {
    await seed("replays/rabc", summary("alice"));
    const chunk = (n: string, data: DocumentData, uid = "alice") =>
      setDoc(doc(as(uid), `replays/rabc/chunks/${n}`), data);
    await assertSucceeds(chunk("0", { d: "x".repeat(500_000) }));
    await assertSucceeds(chunk("1", { d: "" }));
    await assertSucceeds(chunk("1", { d: "{}" }));
    await assertSucceeds(getDoc(doc(anonymous(), "replays/rabc/chunks/0")));
    await assertFails(chunk("2", { d: "{}" }));
    await assertFails(chunk("6", { d: "{}" }));
    await assertFails(chunk("01", { d: "{}" }));
    await assertFails(chunk("0", { d: "x".repeat(500_001) }));
    await assertFails(chunk("0", { d: 5 }));
    await assertFails(chunk("0", { d: "{}", extra: 1 }));
    await assertFails(chunk("0", { d: "{}" }, "bob"));
    await assertFails(setDoc(doc(anonymous(), "replays/rabc/chunks/0"), { d: "{}" }));
    await assertFails(deleteDoc(doc(as("alice"), "replays/rabc/chunks/0")));
    // A leaderboard re-publish with fewer chunks leaves the old higher chunks unwritable.
    await seed("replays/rabc", summary("alice", { chunkCount: 1 }));
    await assertSucceeds(chunk("0", { d: "{}" }));
    await assertFails(chunk("1", { d: "{}" }));
    // A chunk needs its parent.
    await assertFails(setDoc(doc(as("alice"), "replays/rmissing/chunks/0"), { d: "{}" }));
  });
});

describe("everything else", () => {
  it("is refused", async () => {
    await assertFails(setDoc(doc(as("alice"), "admin/config"), { open: true }));
    await assertFails(getDoc(doc(as("alice"), "admin/config")));
    await assertFails(setDoc(doc(as("alice"), "leaderboards/endless_hard"), { score: 1 }));
  });
});
