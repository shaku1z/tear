import { describe, expect, it, vi } from "vitest";
import {
  createFirebaseCloudCompatibility,
  type FirebaseCloudOptions,
  type FirebaseServices,
  type FirebaseUser,
} from "../../src/platform/firebase-cloud";
import type { AccountContext } from "../../src/platform/cloud";

interface FakeRecord {
  /** Each write as [path, data, merge], so a test can tell a merge from a replacement. */
  readonly writes: unknown[][];
  readonly appended: unknown[];
}

/**
 * Services whose every document reads as a corrupt replay summary (chunkCount 99), signed in
 * anonymously as u1. `failWrites` makes every write reject, as offline.
 */
function corruptServices(record: FakeRecord = { writes: [], appended: [] }, failWrites = false): FirebaseServices {
  const user: FirebaseUser = { uid: "u1", isAnonymous: true, displayName: null, photoURL: null };
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
      read: () => Promise.resolve({ chunkCount: 99 }),
      write: (...args) => {
        record.writes.push(args);
        return failWrites ? Promise.reject(new Error("offline")) : Promise.resolve();
      },
      append: (_path, data) => {
        record.appended.push(data);
        return Promise.resolve();
      },
      list: () => Promise.resolve([]),
    },
  };
}

const adapter = (services: FirebaseServices, extra: Partial<FirebaseCloudOptions> = {}) =>
  createFirebaseCloudCompatibility({ services: () => Promise.resolve(services), ...extra });

const context: AccountContext = {
  setUser() {
    return;
  },
  sync: () => Promise.resolve(),
};

describe("Firebase cloud adapter", () => {
  it("keeps corrupt replay metadata from causing unbounded reads", async () => {
    await expect(adapter(corruptServices()).shared.loadReplay("bad")).resolves.toBeNull();
  });

  it("memoizes an SDK start failure and degrades shared operations", async () => {
    const services = vi.fn(() => Promise.reject(new Error("offline")));
    const compatibility = createFirebaseCloudCompatibility({ services });
    await expect(compatibility.shared.replayFeed(20)).resolves.toBeNull();
    await expect(compatibility.shared.replayFeed(20)).resolves.toBeNull();
    await expect(compatibility.shared.submitScore("endless", "hard", { name: "Guest", score: 5 })).resolves.toBe(false);
    expect(services).toHaveBeenCalledOnce();
  });

  it("keeps the local guest when the SDK cannot start", async () => {
    const users: string[] = [];
    const compatibility = createFirebaseCloudCompatibility({ services: () => Promise.reject(new Error("blocked")) });
    await compatibility.account.init({ ...context, setUser: (user) => users.push(user.id) });
    expect(users).toEqual(["local"]);
    await expect(compatibility.account.signIn?.(context)).resolves.toBe(false);
  });

  it("stays the local guest, with no unhandled rejection, when the anonymous sign-in is refused", async () => {
    const services = corruptServices();
    let listener: ((user: FirebaseUser | null) => void | Promise<void>) | undefined;
    const refused = vi.fn(() => Promise.reject(new Error("network-request-failed")));
    const compatibility = adapter({
      ...services,
      auth: {
        ...services.auth,
        current: () => null,
        onChange: (next) => {
          listener = next;
          return () => undefined;
        },
        signInAnonymously: refused,
      },
    });
    const users: string[] = [];
    await compatibility.account.init({ ...context, setUser: (user) => users.push(user.id) });
    await listener?.(null);
    expect(refused).toHaveBeenCalledOnce();
    expect(users).toEqual(["local"]);
  });

  it("rejects a corrupt cloud-save shape instead of merging it", async () => {
    const compatibility = adapter(corruptServices());
    await compatibility.account.init(context);
    await expect(compatibility.account.load?.(context)).resolves.toBeNull();
  });

  it("replaces the cloud save outright where a save merges, so earned progress cannot survive in it", async () => {
    const record: FakeRecord = { writes: [], appended: [] };
    const compatibility = adapter(corruptServices(record));
    await compatibility.account.init(context);
    const payload = { profile: { shards: 0 }, meta: { lifetimeEarned: 0 } };
    await compatibility.account.save?.(context, payload);
    await expect(compatibility.account.replace?.(context, payload)).resolves.toBe(true);
    expect(record.writes).toEqual([
      ["users/u1", payload, true],
      ["users/u1", payload, false],
    ]);
  });

  it("reports a replacement that did not happen, so a reset is not claimed on an unreachable save", async () => {
    const compatibility = adapter(corruptServices(undefined, true));
    await compatibility.account.init(context);
    await expect(compatibility.account.replace?.(context, { profile: {}, meta: {} })).resolves.toBe(false);
  });

  it("writes a run statistic with the event and its figures and no account id", async () => {
    const record: FakeRecord = { writes: [], appended: [] };
    const compatibility = adapter(corruptServices(record), { now: () => 1234 });
    compatibility.shared.logEvent("run_end", { wave: 3, score: 900 });
    await vi.waitFor(() => {
      expect(record.appended).toHaveLength(1);
    });
    expect(record.appended[0]).toEqual({ event: "run_end", ts: 1234, wave: 3, score: 900 });
  });

  it("asks to retry when Google is already linked to another account, then signs in to it", async () => {
    const services = corruptServices();
    const google: FirebaseUser = { uid: "g1", isAnonymous: false, displayName: "Rook", photoURL: null };
    const linkError = Object.assign(new Error("in use"), { code: "auth/credential-already-in-use" });
    const compatibility = adapter({
      ...services,
      auth: {
        ...services.auth,
        linkGoogle: () => Promise.reject(linkError),
        signInWithGoogle: () => Promise.resolve(google),
      },
    });
    const statuses: string[] = [];
    const signIn: AccountContext = { ...context, setUser: (user, status) => statuses.push(`${user.id}:${status}`) };
    await compatibility.account.init(signIn);
    await expect(compatibility.account.signIn?.(signIn)).resolves.toEqual({
      status: "needsRetry",
      code: "auth/credential-already-in-use",
    });
    await expect(compatibility.account.signIn?.(signIn)).resolves.toBe(true);
    expect(statuses.at(-1)).toBe("g1:signedin");
  });
});
