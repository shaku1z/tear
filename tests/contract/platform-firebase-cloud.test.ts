import { describe, expect, it, vi } from "vitest";
import { createFirebaseCloudCompatibility, type FirebaseCompatSdk } from "../../src/platform/firebase-cloud";
import { FIREBASE_CONFIG } from "../../src/platform/firebase-config";
import type { AccountContext } from "../../src/platform/cloud";

/** `written` records each document write as its arguments, so a test can tell a merge from a replacement. */
function corruptReplaySdk(added: unknown[] = [], written: unknown[][] = [], failWrites = false): FirebaseCompatSdk {
  const user = {
    uid: "u1",
    isAnonymous: true,
    displayName: null,
    photoURL: null,
    linkWithPopup: () => Promise.reject(new Error("not used")),
  };
  const document = {
    exists: true,
    data: () => ({ chunkCount: 99 }),
    get() {
      return Promise.resolve(this);
    },
    set: (...args: unknown[]) => {
      written.push(args);
      return failWrites ? Promise.reject(new Error("offline")) : Promise.resolve();
    },
    collection: () => ({ doc: () => document, add: () => Promise.resolve(), orderBy: () => query }),
  };
  const query = { limit: () => query, get: () => Promise.resolve({ docs: [] }) };
  const collection = {
    doc: () => document,
    add: (entry: unknown) => {
      added.push(entry);
      return Promise.resolve();
    },
    orderBy: () => query,
  };
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
  const authFactory = Object.assign(() => auth, { GoogleAuthProvider: GoogleProvider });
  return {
    initializeApp: () => ({}),
    auth: authFactory,
    firestore: () => ({
      collection: () => collection,
      settings() {
        return;
      },
    }),
  };
}

describe("Firebase cloud adapter", () => {
  it("keeps corrupt replay metadata from causing unbounded reads", async () => {
    const compatibility = createFirebaseCloudCompatibility({
      config: FIREBASE_CONFIG,
      getSdk: () => corruptReplaySdk(),
      loadScript: () => Promise.resolve(),
      remote: {},
    });
    await expect(compatibility.shared.loadReplay("bad")).resolves.toBeNull();
  });

  it("memoizes SDK load failure and degrades shared operations", async () => {
    const loadScript = vi.fn(() => Promise.reject(new Error("offline")));
    const compatibility = createFirebaseCloudCompatibility({
      config: FIREBASE_CONFIG,
      getSdk: () => undefined,
      loadScript,
      remote: {},
    });
    await expect(compatibility.shared.replayFeed(20)).resolves.toBeNull();
    await expect(compatibility.shared.replayFeed(20)).resolves.toBeNull();
    expect(loadScript).toHaveBeenCalledOnce();
  });

  it("rejects a corrupt cloud-save shape instead of merging it", async () => {
    const sdk = corruptReplaySdk();
    const compatibility = createFirebaseCloudCompatibility({
      config: FIREBASE_CONFIG,
      getSdk: () => sdk,
      loadScript: () => Promise.resolve(),
      remote: {},
    });
    const context: AccountContext = {
      setUser() {
        return;
      },
      sync: () => Promise.resolve(),
    };
    await compatibility.account.init(context);
    await expect(compatibility.account.load?.(context)).resolves.toBeNull();
  });

  it("replaces the cloud save outright where a save merges, so earned progress cannot survive in it", async () => {
    const written: unknown[][] = [];
    const sdk = corruptReplaySdk([], written);
    const compatibility = createFirebaseCloudCompatibility({
      config: FIREBASE_CONFIG,
      getSdk: () => sdk,
      loadScript: () => Promise.resolve(),
      remote: {},
    });
    const context: AccountContext = {
      setUser() {
        return;
      },
      sync: () => Promise.resolve(),
    };
    await compatibility.account.init(context);
    const payload = { profile: { shards: 0 }, meta: { lifetimeEarned: 0 } };
    await compatibility.account.save?.(context, payload);
    await expect(compatibility.account.replace?.(context, payload)).resolves.toBe(true);
    expect(written).toEqual([[payload, { merge: true }], [payload]]);
  });

  it("reports a replacement that did not happen, so a reset is not claimed on an unreachable save", async () => {
    const sdk = corruptReplaySdk([], [], true);
    const compatibility = createFirebaseCloudCompatibility({
      config: FIREBASE_CONFIG,
      getSdk: () => sdk,
      loadScript: () => Promise.resolve(),
      remote: {},
    });
    const context: AccountContext = {
      setUser() {
        return;
      },
      sync: () => Promise.resolve(),
    };
    await compatibility.account.init(context);
    await expect(compatibility.account.replace?.(context, { profile: {}, meta: {} })).resolves.toBe(false);
  });

  it("writes a run statistic with the event and its figures and no account id", async () => {
    const added: unknown[] = [];
    const sdk = corruptReplaySdk(added);
    const compatibility = createFirebaseCloudCompatibility({
      config: FIREBASE_CONFIG,
      getSdk: () => sdk,
      loadScript: () => Promise.resolve(),
      remote: {},
      now: () => 1234,
    });
    compatibility.shared.logEvent("run_end", { wave: 3, score: 900 });
    await vi.waitFor(() => {
      expect(added).toHaveLength(1);
    });
    expect(added[0]).toEqual({ event: "run_end", ts: 1234, wave: 3, score: 900 });
  });
});
