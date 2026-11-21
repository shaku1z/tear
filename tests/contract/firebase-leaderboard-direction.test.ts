import { describe, expect, it } from "vitest";
import type { LeaderboardRef } from "../../src/domain/leaderboards";
import {
  SERVER_TIME,
  createFirebaseCloudCompatibility,
  type FirebaseServices,
  type FirebaseUser,
} from "../../src/platform/firebase-cloud";

type Data = Record<string, unknown>;

/** The server's clock in these tests, which a SERVER_TIME field is written as. */
const SERVER_NOW = 2000;

/**
 * An in-memory Firestore holding documents by path, enough for the leaderboard calls: read, write (merged or
 * replacing) and a collection listed in order of one numeric field. Nothing here reaches a live service.
 */
function memoryServices(store: Map<string, Data>): FirebaseServices {
  const user: FirebaseUser = { uid: "me", isAnonymous: true, displayName: null, photoURL: null };
  const stamped = (data: Data): Data =>
    Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === SERVER_TIME ? SERVER_NOW : value]));
  return {
    auth: {
      current: () => user,
      onChange: (listener) => {
        void listener(user);
        return () => undefined;
      },
      signInAnonymously: () => Promise.resolve(user),
      signInWithGoogle: () => Promise.resolve(user),
      linkGoogle: () => Promise.reject(new Error("not used")),
      signOut: () => Promise.resolve(),
    },
    store: {
      read: (path) => Promise.resolve(store.get(path) ?? null),
      write: (path, data, merge) => {
        store.set(path, merge ? { ...store.get(path), ...stamped(data) } : stamped(data));
        return Promise.resolve();
      },
      append: () => Promise.resolve(),
      list: (path, field, direction, limit) => {
        const rows = [...store.entries()]
          .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/"))
          .filter(([, data]) => typeof data[field] === "number")
          .sort(([, a], [, b]) => ((a[field] as number) - (b[field] as number)) * (direction === "asc" ? 1 : -1))
          .slice(0, limit);
        return Promise.resolve(rows.map(([key, data]) => ({ id: key.slice(path.length + 1), data })));
      },
    },
  };
}

function sharedCloud(store: Map<string, Data>) {
  return createFirebaseCloudCompatibility({ services: () => Promise.resolve(memoryServices(store)), now: () => 1000 })
    .shared;
}

const ENDLESS: LeaderboardRef = { kind: "score", mode: "endless", difficulty: "normal" };
const CLEAR: LeaderboardRef = { kind: "gauntlet-clear", mode: "gauntlet", difficulty: "hard" };

describe("Firebase leaderboards read and write in the board's direction", () => {
  it("keeps the lowest clear time on a fastest-clear board and lists it first", async () => {
    const store = new Map<string, Data>([
      ["leaderboards/gauntletclear_hard/scores/a", { name: "Ash", score: 90_000, wave: 6, uid: "a" }],
      ["leaderboards/gauntletclear_hard/scores/b", { name: "Bea", score: 70_000, wave: 6, uid: "b" }],
    ]);
    const shared = sharedCloud(store);
    expect(shared.ranks("lower")).toBe(true);
    await expect(shared.submitScore(CLEAR, { name: "Me", score: 80_000.7, wave: 6, time: 667 })).resolves.toBe(true);
    // A slower clear does not replace the faster one; a faster one does.
    await expect(shared.submitScore(CLEAR, { name: "Me", score: 85_000, wave: 6, time: 708 })).resolves.toBe(false);
    await expect(shared.submitScore(CLEAR, { name: "Me", score: 60_000, wave: 6, time: 500 })).resolves.toBe(true);
    expect(store.get("leaderboards/gauntletclear_hard/scores/me")).toMatchObject({ score: 60_000, wave: 6, uid: "me" });
    // Linking the replay merges its id and keeps the time.
    await expect(shared.linkReplay(CLEAR, "lb_gauntletclear_hard_me")).resolves.toBe(true);
    expect(store.get("leaderboards/gauntletclear_hard/scores/me")).toMatchObject({
      score: 60_000,
      replayId: "lb_gauntletclear_hard_me",
    });
    const rows = (await shared.topScores(CLEAR, 25)) ?? [];
    expect(rows.map((row) => row.name)).toEqual(["Me", "Bea", "Ash"]);
  });

  it("reads score boards written by earlier builds unchanged: same ids, highest first, higher still wins", async () => {
    // Documents as earlier builds wrote them, before boards had a direction. One carries a malformed score.
    const store = new Map<string, Data>([
      [
        "leaderboards/endless_normal/scores/old1",
        { name: "Old", score: 4200, wave: 14, time: 300, uid: "old1", ts: 5 },
      ],
      ["leaderboards/endless_normal/scores/old2", { name: "Older", score: 9100, wave: 22, time: 610, uid: "old2" }],
      ["leaderboards/endless_normal/scores/me", { name: "Me", score: "broken", wave: 3, uid: "me" }],
    ]);
    const shared = sharedCloud(store);
    const rows = (await shared.topScores(ENDLESS, 25)) ?? [];
    expect(rows.map((row) => row.name)).toEqual(["Older", "Old"]);
    // The malformed stored score counts as no score, so the next real one replaces it.
    await expect(shared.submitScore(ENDLESS, { name: "Me", score: 5000, wave: 15, time: 320 })).resolves.toBe(true);
    await expect(shared.submitScore(ENDLESS, { name: "Me", score: 4000, wave: 12, time: 280 })).resolves.toBe(false);
    expect(store.get("leaderboards/endless_normal/scores/me")).toMatchObject({ score: 5000, wave: 15 });
    expect(((await shared.topScores(ENDLESS, 25)) ?? []).map((row) => row.name)).toEqual(["Older", "Me", "Old"]);
  });

  it("refuses a 0-point first entry on a score board, as before boards had a direction", async () => {
    const store = new Map<string, Data>();
    const shared = sharedCloud(store);
    await expect(shared.submitScore(ENDLESS, { name: "Me", score: 0, wave: 1, time: 4 })).resolves.toBe(false);
    expect(store.size).toBe(0);
  });

  it("drops the earlier run's replay link when a new best replaces the entry", async () => {
    const path = "leaderboards/gauntletclear_hard/scores/me";
    const store = new Map<string, Data>([
      [path, { name: "Me", score: 90_000, wave: 6, time: 750, uid: "me", ts: 1, replayId: "lb_gauntletclear_hard_me" }],
    ]);
    const shared = sharedCloud(store);
    await expect(shared.submitScore(CLEAR, { name: "Me", score: 80_000, wave: 6, time: 667 })).resolves.toBe(true);
    // Until this run's replay is published and linked, the entry names no replay rather than the slower run's.
    expect(store.get(path)).toEqual({
      name: "Me",
      score: 80_000,
      wave: 6,
      time: 667,
      uid: "me",
      ts: 1000,
      at: SERVER_NOW,
    });
    await expect(shared.linkReplay(CLEAR, "lb_gauntletclear_hard_me")).resolves.toBe(true);
    expect(store.get(path)).toMatchObject({ score: 80_000, replayId: "lb_gauntletclear_hard_me" });
  });

  it("does not let a broken stored clear time lock the player out, and refuses a 0-tick clear", async () => {
    for (const stored of [0, -5, "fast"]) {
      const path = "leaderboards/gauntletclear_hard/scores/me";
      const store = new Map<string, Data>([[path, { name: "Me", score: stored, wave: 6, uid: "me" }]]);
      const shared = sharedCloud(store);
      await expect(shared.submitScore(CLEAR, { name: "Me", score: 0, wave: 6, time: 0 })).resolves.toBe(false);
      await expect(
        shared.submitScore(CLEAR, { name: "Me", score: 90_000, wave: 6, time: 750 }),
        String(stored),
      ).resolves.toBe(true);
      expect(store.get(path)).toMatchObject({ score: 90_000 });
    }
  });
});
