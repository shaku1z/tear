import { asRecord } from "../domain/records";
import type { AccountProvider, CloudSavePayload, CloudUser, SharedCloudService, SignInResult } from "./cloud";

type DataRecord = Record<string, unknown>;

/** The signed-in Firebase account, anonymous or Google. */
export interface FirebaseUser {
  readonly uid: string;
  readonly isAnonymous: boolean;
  readonly displayName: string | null;
  readonly photoURL: string | null;
}

/** What the adapter needs from Firebase Auth. Failures reject with the SDK's error, which carries `code`. */
export interface FirebaseAuthPort {
  current(): FirebaseUser | null;
  onChange(listener: (user: FirebaseUser | null) => void | Promise<void>): () => void;
  signInAnonymously(): Promise<FirebaseUser>;
  signInWithGoogle(): Promise<FirebaseUser>;
  /** Links Google to the current anonymous account, keeping its uid. */
  linkGoogle(): Promise<FirebaseUser>;
  signOut(): Promise<void>;
}

/** One document of a listed collection. */
export interface FirebaseListedDocument {
  readonly id: string;
  readonly data: DataRecord;
}

/**
 * A field value the store writes as the server's clock at the write (Firestore's serverTimestamp()). It reads
 * back as epoch milliseconds. firestore.rules spaces leaderboard writes by it, which a client cannot set.
 */
export const SERVER_TIME: unique symbol = Symbol("server time");

/**
 * What the adapter needs from Firestore, by slash-separated document and collection paths. A top-level field
 * whose value is SERVER_TIME is written as the server's clock; timestamps read back as epoch milliseconds.
 */
export interface FirestorePort {
  /** The document's data, or null when it does not exist. */
  read(path: string): Promise<DataRecord | null>;
  /** Writes the document: merged into what is there, or replacing it outright. */
  write(path: string, data: DataRecord, merge: boolean): Promise<void>;
  /** Adds a document with a generated id. */
  append(collectionPath: string, data: DataRecord): Promise<void>;
  /** The first `limit` documents ordered by one field. */
  list(
    collectionPath: string,
    field: string,
    direction: "asc" | "desc",
    limit: number,
  ): Promise<FirebaseListedDocument[]>;
}

export interface FirebaseServices {
  readonly auth: FirebaseAuthPort;
  readonly store: FirestorePort;
}

export interface FirebaseCloudOptions {
  /** Loads and starts the SDK (src/platform/firebase-sdk.ts); a rejection leaves the game local. */
  readonly services: () => Promise<FirebaseServices>;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly timeoutMs?: number;
}

export interface FirebaseCloudCompatibility {
  readonly account: AccountProvider;
  readonly shared: SharedCloudService;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function errorCode(error: unknown): string {
  const record = asRecord(error);
  return string(record?.code, "unknown");
}

function cloudUser(user: FirebaseUser): CloudUser {
  return {
    id: user.uid,
    name: user.displayName ?? (user.isAnonymous ? "Guest" : "Player"),
    guest: user.isAnonymous,
    ...(user.photoURL ? { avatar: user.photoURL } : {}),
  };
}

const board = (mode: string, difficulty: string): string => `leaderboards/${mode}_${difficulty}/scores`;

/** At most this many chunks per replay, as firestore.rules allows. */
const REPLAY_MAX_CHUNKS = 6;
/** The characters firestore.rules allows in one chunk. */
const REPLAY_CHUNK_CHARS = 500_000;
/** UTF-8 bytes per chunk: under Firestore's 1 MiB document limit, with room for the path and field name. */
const REPLAY_CHUNK_BYTES = 1_000_000;

/**
 * Splits a recording's JSON into chunk strings that each fit both limits: the rules' characters and Firestore's
 * bytes (a character outside ASCII takes 2 to 4 bytes). A cut never falls inside a surrogate pair.
 */
export function replayChunks(json: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  let bytes = 0;
  for (let index = 0; index < json.length;) {
    const code = json.codePointAt(index) ?? 0;
    const units = code > 0xffff ? 2 : 1;
    const size = code < 0x80 ? 1 : code < 0x800 ? 2 : code <= 0xffff ? 3 : 4;
    if (index + units - start > REPLAY_CHUNK_CHARS || bytes + size > REPLAY_CHUNK_BYTES) {
      chunks.push(json.slice(start, index));
      start = index;
      bytes = 0;
    }
    bytes += size;
    index += units;
  }
  if (start < json.length || chunks.length === 0) chunks.push(json.slice(start));
  return chunks;
}

/** The thumbnail when it is the small JPEG data URL firestore.rules accepts; anything else publishes without one. */
export function replayThumb(value: unknown): string | null {
  return typeof value === "string" &&
    value.length <= 32_768 &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/u.test(value)
    ? value
    : null;
}

export function createFirebaseCloudCompatibility(options: FirebaseCloudOptions): FirebaseCloudCompatibility {
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const timeoutMs = options.timeoutMs ?? 9_000;
  let started: Promise<FirebaseServices | null> | undefined;
  let services: FirebaseServices | null = null;
  let authUid: string | null = null;
  let retryMerge = false;
  let removeAuthListener: (() => void) | undefined;

  const race = async <T>(promise: Promise<T>, milliseconds = timeoutMs): Promise<T> =>
    await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("timeout"));
      }, milliseconds);
      void promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error("Cloud operation failed."));
        },
      );
    });

  /** Starts the SDK once; a failure is remembered, so an offline game does not retry on every call. */
  const start = (): Promise<FirebaseServices | null> => {
    started ??= options.services().then(
      (value) => {
        services = value;
        return value;
      },
      () => null,
    );
    return started;
  };

  const account: AccountProvider = {
    kind: "firebase",
    signInLabel: "Sign in with Google",
    async init(context) {
      context.setUser({ id: "local", name: "Guest", guest: true }, "guest");
      const active = await start();
      if (!active) return;
      let first = true;
      removeAuthListener?.();
      removeAuthListener = active.auth.onChange(async (user) => {
        try {
          if (first) {
            first = false;
            if (!user) {
              await active.auth.signInAnonymously();
              return;
            }
          }
          if (!user) return;
          authUid = user.uid;
          context.setUser(cloudUser(user), user.isAnonymous ? "guest" : "signedin", true);
          await context.sync();
        } catch {
          /* offline or blocked: the player stays the local guest */
        }
      });
    },
    async signIn(context): Promise<SignInResult> {
      const active = await start();
      if (!active) return false;
      try {
        let user: FirebaseUser;
        if (active.auth.current()?.isAnonymous && !retryMerge) {
          try {
            user = await active.auth.linkGoogle();
          } catch (error) {
            const code = errorCode(error);
            if (code === "auth/credential-already-in-use") {
              retryMerge = true;
              return { status: "needsRetry", code };
            }
            return false;
          }
        } else {
          retryMerge = false;
          user = await active.auth.signInWithGoogle();
        }
        authUid = user.uid;
        context.setUser(cloudUser(user), "signedin", true);
        return true;
      } catch {
        return false;
      }
    },
    async signOut() {
      try {
        await services?.auth.signOut();
      } catch {
        /* remain local */
      }
    },
    async load(): Promise<CloudSavePayload | null> {
      if (!services || !authUid) return null;
      try {
        const data = await race(services.store.read(`users/${authUid}`));
        const profile = asRecord(data?.profile);
        const meta = asRecord(data?.meta);
        return profile && meta ? { profile, meta } : null;
      } catch {
        return null;
      }
    },
    async save(_context, payload) {
      if (!services || !authUid) return;
      try {
        await race(services.store.write(`users/${authUid}`, { profile: payload.profile, meta: payload.meta }, true));
      } catch {
        /* retry on next save */
      }
    },
    async replace(_context, payload) {
      if (!services || !authUid) return false;
      try {
        // No merge: the document becomes exactly this payload, so nothing the player earned survives in it.
        await race(services.store.write(`users/${authUid}`, { profile: payload.profile, meta: payload.meta }, false));
        return true;
      } catch {
        return false;
      }
    },
    dispose() {
      removeAuthListener?.();
      removeAuthListener = undefined;
    },
  };

  /** The Replay Passport: the current account, signing in anonymously when there is none yet. */
  const passport = async (): Promise<Readonly<{ store: FirestorePort; uid: string }> | null> => {
    const active = await start();
    if (!active) return null;
    try {
      if (!active.auth.current()) {
        await new Promise<void>((resolve) => {
          let done = false;
          let unsubscribe: () => void = () => {
            return;
          };
          const timer = setTimeout(() => {
            finish();
          }, 2_500);
          const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            unsubscribe();
            resolve();
          };
          unsubscribe = active.auth.onChange(finish);
        });
        if (!active.auth.current()) await active.auth.signInAnonymously();
      }
      const user = active.auth.current();
      return user ? { store: active.store, uid: user.uid } : null;
    } catch {
      return null;
    }
  };

  const shared: SharedCloudService = {
    available: true,
    async submitScore(mode, difficulty, entry) {
      const session = await passport();
      if (!session) return false;
      const path = `${board(mode, difficulty)}/${session.uid}`;
      try {
        const current = await race(session.store.read(path));
        if (number(current?.score) >= entry.score) return false;
        await race(
          session.store.write(
            path,
            {
              name: string(entry.name, "Player"),
              score: Math.trunc(entry.score),
              wave: Math.trunc(number(entry.wave)),
              time: Math.round(number(entry.time)),
              uid: session.uid,
              ts: now(),
              at: SERVER_TIME,
            },
            true,
          ),
        );
        return true;
      } catch {
        return false;
      }
    },
    async topScores(mode, difficulty, limit) {
      const session = await passport();
      if (!session) return null;
      try {
        const rows = await race(session.store.list(board(mode, difficulty), "score", "desc", limit || 25));
        return rows.map((row) => row.data);
      } catch {
        return null;
      }
    },
    logEvent(name, data) {
      void passport().then(async (session) => {
        if (!session) return;
        try {
          // Anonymous by construction: the document carries no account id, only the event and its figures.
          await session.store.append("telemetry", { event: name, ts: now(), ...data });
        } catch {
          /* optional telemetry */
        }
      });
    },
    async publishReplay(recording, summary, fixedIdPrefix) {
      const session = await passport();
      if (!session) return null;
      try {
        const shareId = fixedIdPrefix
          ? `${fixedIdPrefix}_${session.uid}`
          : `r${now().toString(36)}${random().toString(36).slice(2, 8)}`;
        const json = JSON.stringify(recording);
        if (json.length > 3_000_000) return null;
        const chunks = replayChunks(json);
        if (chunks.length > REPLAY_MAX_CHUNKS) return null;
        const replaySummary: DataRecord = {
          ...(summary ?? {}),
          ownerUid: session.uid,
          createdAt: now(),
          chunkCount: chunks.length,
          mode: recording.mode ?? "",
          diff: recording.diff ?? "",
          wave: Math.trunc(number(recording.wave)),
          score: Math.trunc(number(recording.score)),
          time: number(recording.time),
          won: recording.won === true,
          kills: Math.trunc(number(recording.kills)),
          peak: Math.trunc(number(recording.peak, 1)),
          name: string(recording.name, "Player"),
          thumb: replayThumb(recording.thumb),
          lb: fixedIdPrefix !== undefined,
        };
        await race(session.store.write(`replays/${shareId}`, replaySummary, false), 12_000);
        for (let index = 0; index < chunks.length; index += 1) {
          await race(
            session.store.write(`replays/${shareId}/chunks/${String(index)}`, { d: chunks[index] ?? "" }, false),
            15_000,
          );
        }
        return shareId;
      } catch {
        return null;
      }
    },
    async loadReplay(shareId) {
      const session = await passport();
      if (!session || !shareId) return null;
      try {
        const summary = await race(session.store.read(`replays/${shareId}`));
        if (!summary) return null;
        const chunkCount = number(summary.chunkCount, 1);
        if (!Number.isSafeInteger(chunkCount) || chunkCount < 1 || chunkCount > 8) return null;
        let json = "";
        for (let index = 0; index < chunkCount; index += 1) {
          const chunk = await race(session.store.read(`replays/${shareId}/chunks/${String(index)}`), 12_000);
          if (!chunk || typeof chunk.d !== "string") return null;
          json += chunk.d;
        }
        if (json.length > 3_000_000) return null;
        const recording = asRecord(JSON.parse(json) as unknown);
        if (!recording) return null;
        recording.name = string(summary.name, "Player");
        recording.won = summary.won === true;
        return recording;
      } catch {
        return null;
      }
    },
    async replayFeed(limit) {
      const session = await passport();
      if (!session) return null;
      try {
        const rows = await race(session.store.list("replays", "createdAt", "desc", limit || 20));
        return rows.map((row) => ({ shareId: row.id, ...row.data }));
      } catch {
        return null;
      }
    },
    async linkReplay(mode, difficulty, shareId) {
      const session = await passport();
      if (!session) return false;
      try {
        await race(session.store.write(`${board(mode, difficulty)}/${session.uid}`, { replayId: shareId }, true));
        return true;
      } catch {
        return false;
      }
    },
    async loadGhost(mode, difficulty) {
      const session = await passport();
      if (!session) return null;
      try {
        return await race(session.store.read(`ghosts/${mode}_${difficulty}`));
      } catch {
        return null;
      }
    },
  };

  return Object.freeze({ account, shared });
}
