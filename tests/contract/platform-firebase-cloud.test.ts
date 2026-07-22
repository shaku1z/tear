import { describe, expect, it, vi } from "vitest";
import {
  createFirebaseCloudCompatibility,
  type FirebaseCompatSdk,
} from "../../src/platform/firebase-cloud";
import { FIREBASE_CONFIG } from "../../src/platform/firebase-config";
import type { AccountContext } from "../../src/platform/cloud";

function corruptReplaySdk(): FirebaseCompatSdk {
  const user = {
    uid: "u1", isAnonymous: true, displayName: null, photoURL: null,
    linkWithPopup: () => Promise.reject(new Error("not used")),
  };
  const document = {
    exists: true,
    data: () => ({ chunkCount: 99 }),
    get() { return Promise.resolve(this); },
    set: () => Promise.resolve(),
    collection: () => ({ doc: () => document, add: () => Promise.resolve(), orderBy: () => query }),
  };
  const query = { limit: () => query, get: () => Promise.resolve({ docs: [] }) };
  const collection = { doc: () => document, add: () => Promise.resolve(), orderBy: () => query };
  const auth = {
    currentUser: user,
    onAuthStateChanged: (listener: (next: typeof user) => void) => { listener(user); return () => undefined; },
    signInAnonymously: () => Promise.resolve({ user }),
    signInWithPopup: () => Promise.resolve({ user }),
    signOut: () => Promise.resolve(),
  };
  class GoogleProvider { readonly kind = "google"; }
  const authFactory = Object.assign(() => auth, { GoogleAuthProvider: GoogleProvider });
  return {
    initializeApp: () => ({}),
    auth: authFactory,
    firestore: () => ({ collection: () => collection, settings() { return; } }),
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
    const context: AccountContext = { setUser() { return; }, sync: () => Promise.resolve() };
    await compatibility.account.init(context);
    await expect(compatibility.account.load?.(context)).resolves.toBeNull();
  });
});
