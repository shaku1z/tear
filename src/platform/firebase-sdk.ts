import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore/lite";
import type { FirebaseServices, FirebaseUser } from "./firebase-cloud";
import type { FirebaseClientConfig } from "./firebase-config";

/** Local emulators to use instead of the project; only the rules tests pass them. */
export interface FirebaseEmulators {
  /** For example http://127.0.0.1:9199. */
  readonly authUrl: string;
  readonly firestoreHost: string;
  readonly firestorePort: number;
}

const user = (account: User): FirebaseUser => ({
  uid: account.uid,
  isAnonymous: account.isAnonymous,
  displayName: account.displayName,
  photoURL: account.photoURL,
});

/**
 * The modular Firebase SDK behind the adapter's ports: Auth, and Firestore Lite (plain requests, no
 * offline cache or listeners, which the game never used). Bundled into the standalone build's on-demand
 * Firebase chunk only; the CrazyGames build never imports it (src/platform/standalone-cloud.ts).
 */
export function createFirebaseServices(config: FirebaseClientConfig, emulators?: FirebaseEmulators): FirebaseServices {
  const app: FirebaseApp = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (emulators !== undefined) {
    connectAuthEmulator(auth, emulators.authUrl, { disableWarnings: true });
    connectFirestoreEmulator(db, emulators.firestoreHost, emulators.firestorePort);
  }
  const signedIn = (): User => {
    if (auth.currentUser === null) throw new Error("not signed in");
    return auth.currentUser;
  };
  return Object.freeze({
    auth: Object.freeze({
      current: () => (auth.currentUser === null ? null : user(auth.currentUser)),
      onChange: (listener: (account: FirebaseUser | null) => void | Promise<void>) =>
        onAuthStateChanged(auth, (account) => {
          void listener(account === null ? null : user(account));
        }),
      signInAnonymously: async () => user((await signInAnonymously(auth)).user),
      signInWithGoogle: async () => user((await signInWithPopup(auth, new GoogleAuthProvider())).user),
      linkGoogle: async () => user((await linkWithPopup(signedIn(), new GoogleAuthProvider())).user),
      signOut: () => signOut(auth),
    }),
    store: Object.freeze({
      async read(path: string) {
        const snapshot = await getDoc(doc(db, path));
        return snapshot.exists() ? snapshot.data() : null;
      },
      async write(path: string, data: Record<string, unknown>, merge: boolean) {
        await (merge ? setDoc(doc(db, path), data, { merge: true }) : setDoc(doc(db, path), data));
      },
      async append(collectionPath: string, data: Record<string, unknown>) {
        await addDoc(collection(db, collectionPath), data);
      },
      async list(collectionPath: string, field: string, direction: "asc" | "desc", count: number) {
        const snapshot = await getDocs(query(collection(db, collectionPath), orderBy(field, direction), limit(count)));
        return snapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
      },
    }),
  });
}
