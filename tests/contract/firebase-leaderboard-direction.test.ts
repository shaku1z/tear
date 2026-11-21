import { describe, expect, it } from "vitest";
import type { LeaderboardRef } from "../../src/domain/leaderboards";
import { createFirebaseCloudCompatibility, type FirebaseCompatSdk } from "../../src/platform/firebase-cloud";
import { FIREBASE_CONFIG } from "../../src/platform/firebase-config";

type Data = Record<string, unknown>;

/**
 * An in-memory Firestore holding documents by path, enough for the leaderboard calls: get, set (with
 * merge), and a collection query ordered by one numeric field. Nothing here reaches a live service.
 */
function memoryFirestore(store: Map<string, Data>): FirebaseCompatSdk {
  const user = {
    uid: "me",
    isAnonymous: true,
    displayName: null,
    photoURL: null,
    linkWithPopup: () => Promise.reject(new Error("not used")),
  };
  const collection = (path: string) => ({
    doc: (id: string) => document(`${path}/${id}`),
    add: () => Promise.resolve(),
    orderBy: (field: string, direction: "asc" | "desc") => {
      let count = Number.POSITIVE_INFINITY;
      const query = {
        limit(next: number) {
          count = next;
          return query;
        },
        get() {
          const rows = [...store.entries()]
            .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/"))
            .map(([, data]) => data)
            .filter((data) => typeof data[field] === "number")
            .sort((a, b) => ((a[field] as number) - (b[field] as number)) * (direction === "asc" ? 1 : -1))
            .slice(0, count);
          return Promise.resolve({ docs: rows.map((data) => ({ exists: true, data: () => data })) });
        },
      };
      return query;
    },
  });
  const document = (path: string) => ({
    get: () => Promise.resolve({ exists: store.has(path), data: () => store.get(path) }),
    set: (data: Data, options?: Readonly<{ merge: boolean }>) => {
      store.set(path, options?.merge === true ? { ...store.get(path), ...data } : { ...data });
      return Promise.resolve();
    },
    collection: (name: string) => collection(`${path}/${name}`),
  });
  const auth = {
    currentUser: user,
    onAuthStateChanged: (listener: (next: typeof user) => void) => {
      listener(user);
      return () => undefined;
    },
    signInAnonymously: () => Promise.resolve({ user }),
    signInWithPopup: () => Promise.resolve({ user }),
    signOut: () => Promise.resolve(),
  };
  class GoogleProvider {
    readonly kind = "google";
  }
  return {
    initializeApp: () => ({}),
    auth: Object.assign(() => auth, { GoogleAuthProvider: GoogleProvider }),
    firestore: () => ({ collection, settings: () => undefined }),
  };
}

function sharedCloud(store: Map<string, Data>) {
  return createFirebaseCloudCompatibility({
    config: FIREBASE_CONFIG,
    getSdk: () => memoryFirestore(store),
    loadScript: () => Promise.resolve(),
    remote: {},
    now: () => 1000,
  }).shared;
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
});
