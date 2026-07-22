import type {
  AccountProvider,
  CloudSavePayload,
  CloudUser,
  SharedCloudService,
  SignInResult,
} from "./cloud";
import type { FirebaseClientConfig } from "./firebase-config";

type DataRecord = Record<string, unknown>;

interface DocumentSnapshot {
  readonly exists: boolean;
  readonly id?: string;
  data(): unknown;
}

interface QuerySnapshot { readonly docs: readonly DocumentSnapshot[] }

interface QueryReference {
  limit(count: number): QueryReference;
  get(): Promise<QuerySnapshot>;
}

interface CollectionReference {
  doc(id: string): DocumentReference;
  add(data: DataRecord): Promise<unknown>;
  orderBy(field: string, direction: "asc" | "desc"): QueryReference;
}

interface DocumentReference {
  get(): Promise<DocumentSnapshot>;
  set(data: DataRecord, options?: Readonly<{ merge: boolean }>): Promise<void>;
  collection(name: string): CollectionReference;
}

interface Firestore {
  collection(name: string): CollectionReference;
  settings(settings: DataRecord): void;
}

interface AuthUser {
  readonly uid: string;
  readonly isAnonymous: boolean;
  readonly displayName?: string | null;
  readonly photoURL?: string | null;
  linkWithPopup(provider: unknown): Promise<AuthResult>;
}

interface AuthResult { readonly user: AuthUser }

interface Auth {
  readonly currentUser: AuthUser | null;
  onAuthStateChanged(listener: (user: AuthUser | null) => void | Promise<void>): () => void;
  signInAnonymously(): Promise<AuthResult>;
  signInWithPopup(provider: unknown): Promise<AuthResult>;
  signOut(): Promise<void>;
}

interface RemoteConfigValue { asNumber(): number }
interface RemoteConfig {
  settings: DataRecord;
  defaultConfig: DataRecord;
  fetchAndActivate(): Promise<boolean>;
  getValue(key: string): RemoteConfigValue;
}

interface AuthFactory {
  (): Auth;
  readonly GoogleAuthProvider: new () => unknown;
}

export interface FirebaseCompatSdk {
  initializeApp(config: FirebaseClientConfig): unknown;
  readonly auth: AuthFactory;
  firestore(): Firestore;
  remoteConfig?(): RemoteConfig;
}

export interface FirebaseCloudOptions {
  readonly config: FirebaseClientConfig;
  readonly getSdk: () => FirebaseCompatSdk | undefined;
  readonly loadScript: (url: string) => Promise<void>;
  readonly remote: Record<string, number>;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly timeoutMs?: number;
}

export interface FirebaseCloudCompatibility {
  readonly account: AccountProvider;
  readonly shared: SharedCloudService;
}

export function createBrowserScriptLoader(documentLike: Document): (url: string) => Promise<void> {
  return async (url) => {
    await new Promise<void>((resolve, reject) => {
      const script = documentLike.createElement("script");
      script.src = url;
      script.onload = () => { resolve(); };
      script.onerror = () => { reject(new Error(`Failed to load ${url}`)); };
      documentLike.head.appendChild(script);
    });
  };
}

function asRecord(value: unknown): DataRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as DataRecord : null;
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

function authUser(user: AuthUser): CloudUser {
  return {
    id: user.uid,
    name: user.displayName ?? (user.isAnonymous ? "Guest" : "Player"),
    guest: user.isAnonymous,
    ...(user.photoURL ? { avatar: user.photoURL } : {}),
  };
}

function currentAuthUser(auth: Auth): AuthUser | null {
  return auth.currentUser;
}

export function createFirebaseCloudCompatibility(options: FirebaseCloudOptions): FirebaseCloudCompatibility {
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const timeoutMs = options.timeoutMs ?? 9_000;
  let sdkLoad: Promise<FirebaseCompatSdk | null> | undefined;
  let initialized: Promise<boolean> | undefined;
  let auth: Auth | null = null;
  let db: Firestore | null = null;
  let authUid: string | null = null;
  let retryMerge = false;
  let removeAuthListener: (() => void) | undefined;

  const race = async <T>(promise: Promise<T>, milliseconds = timeoutMs): Promise<T> => await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error("timeout")); }, milliseconds);
    void promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("Cloud operation failed."));
      },
    );
  });

  const ensureSdk = (): Promise<FirebaseCompatSdk | null> => {
    if (sdkLoad) return sdkLoad;
    sdkLoad = (async () => {
      const existing = options.getSdk();
      if (existing?.auth) return existing;
      const base = "https://www.gstatic.com/firebasejs/10.12.2";
      try {
        await options.loadScript(`${base}/firebase-app-compat.js`);
        await options.loadScript(`${base}/firebase-auth-compat.js`);
        await options.loadScript(`${base}/firebase-firestore-compat.js`);
        try { await options.loadScript(`${base}/firebase-remote-config-compat.js`); } catch { /* optional */ }
        return options.getSdk() ?? null;
      } catch { return null; }
    })();
    return sdkLoad;
  };

  const ensureInitialized = (): Promise<boolean> => {
    if (initialized) return initialized;
    initialized = (async () => {
      const sdk = await ensureSdk();
      if (!sdk) return false;
      try {
        try { sdk.initializeApp(options.config); } catch { /* another adapter may own the default app */ }
        auth = sdk.auth();
        db = sdk.firestore();
        try { db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch { /* already configured */ }
        return true;
      } catch { auth = null; db = null; return false; }
    })();
    return initialized;
  };

  const updateRemoteConfig = async (): Promise<void> => {
    const sdk = options.getSdk();
    if (!sdk?.remoteConfig) return;
    try {
      const remoteConfig = sdk.remoteConfig();
      remoteConfig.settings = { minimumFetchIntervalMillis: 3_600_000, fetchTimeoutMillis: 8_000 };
      remoteConfig.defaultConfig = { coinMult: 1, enemyHpMult: 1, enemyDensityMult: 1, scoreMult: 1 };
      await remoteConfig.fetchAndActivate();
      for (const key of Object.keys(options.remote)) {
        const value = remoteConfig.getValue(key).asNumber();
        if (Number.isFinite(value) && value > 0) options.remote[key] = value;
      }
    } catch { /* defaults remain active */ }
  };

  const account: AccountProvider = {
    kind: "firebase",
    signInLabel: "Sign in with Google",
    async init(context) {
      context.setUser({ id: "local", name: "Guest", guest: true }, "guest");
      if (!(await ensureInitialized()) || !auth) return;
      void updateRemoteConfig();
      let first = true;
      removeAuthListener?.();
      removeAuthListener = auth.onAuthStateChanged(async (user) => {
        if (first) {
          first = false;
          if (!user) { await auth?.signInAnonymously(); return; }
        }
        if (!user) return;
        authUid = user.uid;
        context.setUser(authUser(user), user.isAnonymous ? "guest" : "signedin", true);
        await context.sync();
      });
    },
    async signIn(context): Promise<SignInResult> {
      const sdk = await ensureSdk();
      if (!sdk || !auth) return false;
      try {
        const provider = new sdk.auth.GoogleAuthProvider();
        const current = auth.currentUser;
        let result: AuthResult;
        if (current?.isAnonymous && !retryMerge) {
          try { result = await current.linkWithPopup(provider); }
          catch (error) {
            const code = errorCode(error);
            if (code === "auth/credential-already-in-use") {
              retryMerge = true;
              return { status: "needsRetry", code };
            }
            return false;
          }
        } else {
          retryMerge = false;
          result = await auth.signInWithPopup(provider);
        }
        authUid = result.user.uid;
        context.setUser(authUser(result.user), "signedin", true);
        return true;
      } catch { return false; }
    },
    async signOut() { try { await auth?.signOut(); } catch { /* remain local */ } },
    async load(): Promise<CloudSavePayload | null> {
      if (!db || !authUid) return null;
      try {
        const snapshot = await race(db.collection("users").doc(authUid).get());
        const data = snapshot.exists ? asRecord(snapshot.data()) : null;
        const profile = asRecord(data?.profile);
        const meta = asRecord(data?.meta);
        return profile && meta ? { profile, meta } : null;
      } catch { return null; }
    },
    async save(_context, payload) {
      if (!db || !authUid) return;
      try {
        await race(db.collection("users").doc(authUid).set({ profile: payload.profile, meta: payload.meta }, { merge: true }));
      } catch { /* retry on next save */ }
    },
    dispose() { removeAuthListener?.(); removeAuthListener = undefined; },
  };

  const passport = async (): Promise<Readonly<{ db: Firestore; uid: string }> | null> => {
    if (!(await ensureInitialized()) || !auth || !db) return null;
    const activeAuth = auth;
    const activeDb = db;
    try {
      if (!currentAuthUser(activeAuth)) {
        await new Promise<void>((resolve) => {
          let done = false;
          let unsubscribe: () => void = () => { return; };
          const timer = setTimeout(() => { finish(); }, 2_500);
          const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            unsubscribe();
            resolve();
          };
          unsubscribe = activeAuth.onAuthStateChanged(finish);
        });
        if (!currentAuthUser(activeAuth)) await activeAuth.signInAnonymously();
      }
      const user = currentAuthUser(activeAuth);
      return user ? { db: activeDb, uid: user.uid } : null;
    } catch { return null; }
  };

  const shared: SharedCloudService = {
    available: typeof options.config.apiKey === "string" && options.config.apiKey.length > 0,
    async submitScore(mode, difficulty, entry) {
      const session = await passport();
      if (!session) return false;
      const ref = session.db.collection("leaderboards").doc(`${mode}_${difficulty}`).collection("scores").doc(session.uid);
      try {
        const current = await race(ref.get());
        const currentData = current.exists ? asRecord(current.data()) : null;
        if (number(currentData?.score) >= entry.score) return false;
        await race(ref.set({
          name: string(entry.name, "Player"), score: Math.trunc(entry.score), wave: Math.trunc(number(entry.wave)),
          time: Math.round(number(entry.time)), uid: session.uid, ts: now(),
        }, { merge: true }));
        return true;
      } catch { return false; }
    },
    async topScores(mode, difficulty, limit) {
      const session = await passport();
      if (!session) return null;
      try {
        const snapshot = await race(session.db.collection("leaderboards").doc(`${mode}_${difficulty}`)
          .collection("scores").orderBy("score", "desc").limit(limit || 25).get());
        return snapshot.docs.map((document) => asRecord(document.data()) ?? {});
      } catch { return null; }
    },
    logEvent(name, data) {
      void passport().then(async (session) => {
        if (!session) return;
        try { await session.db.collection("telemetry").add({ event: name, uid: session.uid, ts: now(), ...data }); }
        catch { /* optional telemetry */ }
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
        const chunks: string[] = [];
        for (let offset = 0; offset < json.length; offset += 500_000) chunks.push(json.slice(offset, offset + 500_000));
        const replaySummary: DataRecord = {
          ...(summary ?? {}), ownerUid: session.uid, createdAt: now(), chunkCount: chunks.length,
          mode: recording.mode ?? "", diff: recording.diff ?? "", wave: number(recording.wave), score: number(recording.score),
          time: number(recording.time), won: recording.won === true, kills: number(recording.kills), peak: number(recording.peak, 1),
          name: string(recording.name, "Player"), thumb: recording.thumb ?? null, lb: fixedIdPrefix !== undefined,
        };
        const ref = session.db.collection("replays").doc(shareId);
        await race(ref.set(replaySummary), 12_000);
        for (let index = 0; index < chunks.length; index += 1) {
          await race(ref.collection("chunks").doc(String(index)).set({ d: chunks[index] ?? "" }), 15_000);
        }
        return shareId;
      } catch { return null; }
    },
    async loadReplay(shareId) {
      const session = await passport();
      if (!session || !shareId) return null;
      try {
        const ref = session.db.collection("replays").doc(shareId);
        const document = await race(ref.get());
        if (!document.exists) return null;
        const summary = asRecord(document.data());
        if (!summary) return null;
        const chunkCount = number(summary.chunkCount, 1);
        if (!Number.isSafeInteger(chunkCount) || chunkCount < 1 || chunkCount > 8) return null;
        let json = "";
        for (let index = 0; index < chunkCount; index += 1) {
          const chunkDocument = await race(ref.collection("chunks").doc(String(index)).get(), 12_000);
          const chunk = chunkDocument.exists ? asRecord(chunkDocument.data()) : null;
          if (!chunk || typeof chunk.d !== "string") return null;
          json += chunk.d;
        }
        if (json.length > 3_000_000) return null;
        const recording = asRecord(JSON.parse(json) as unknown);
        if (!recording) return null;
        recording.name = string(summary.name, "Player");
        recording.won = summary.won === true;
        return recording;
      } catch { return null; }
    },
    async replayFeed(limit) {
      const session = await passport();
      if (!session) return null;
      try {
        const snapshot = await race(session.db.collection("replays").orderBy("createdAt", "desc").limit(limit || 20).get());
        return snapshot.docs.map((document) => ({ shareId: document.id ?? "", ...(asRecord(document.data()) ?? {}) }));
      } catch { return null; }
    },
    async linkReplay(mode, difficulty, shareId) {
      const session = await passport();
      if (!session) return false;
      try {
        await race(session.db.collection("leaderboards").doc(`${mode}_${difficulty}`).collection("scores").doc(session.uid)
          .set({ replayId: shareId }, { merge: true }));
        return true;
      } catch { return false; }
    },
    async loadGhost(mode, difficulty) {
      const session = await passport();
      if (!session) return null;
      try {
        const document = await race(session.db.collection("ghosts").doc(`${mode}_${difficulty}`).get());
        return document.exists ? asRecord(document.data()) : null;
      } catch { return null; }
    },
  };

  return Object.freeze({ account, shared });
}
