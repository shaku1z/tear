import type { FirebaseClientConfig } from "../../src/platform/firebase-config";
import type { FirebaseEmulators } from "../../src/platform/firebase-sdk";

/**
 * The emulator project the rules tests run under, from the Firebase CLI's `emulators:exec`
 * (scripts/test-firestore-rules.mjs). Refuses anything but a `demo-` project, which the CLI never
 * connects to a real Firebase project, so a test can never touch production data.
 */
export function rulesTestProject(): string {
  const project = process.env.GCLOUD_PROJECT ?? "";
  if (!project.startsWith("demo-") || process.env.FIRESTORE_EMULATOR_HOST === undefined)
    throw new Error("Run the rules tests with `pnpm test:rules`: they need the emulators of a demo- project.");
  return project;
}

/** The game's Firebase client config, pointed at the emulator project instead of tear-682cf. */
export function emulatorClientConfig(): FirebaseClientConfig {
  const projectId = rulesTestProject();
  return {
    apiKey: "demo-api-key",
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    measurementId: "",
  };
}

/** Where the CLI started the Auth and Firestore emulators. */
export function emulatorHosts(): FirebaseEmulators {
  const [firestoreHost = "127.0.0.1", firestorePort = "8189"] = (process.env.FIRESTORE_EMULATOR_HOST ?? "").split(":");
  return {
    authUrl: `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9199"}`,
    firestoreHost,
    firestorePort: Number(firestorePort),
  };
}

/** Polls `read` until it gives a value, for state the SDK reports asynchronously. */
export async function until<T>(read: () => T | undefined | Promise<T | undefined>, what: string): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}
