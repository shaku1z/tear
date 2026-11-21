// Runs a Node test command against local Firebase emulators: Firestore with firestore.rules loaded,
// and Auth for the anonymous sign-in the game's adapter makes. The command is the arguments, so the
// check that runs it (config/checks.json, unit.firestore-rules) names the vitest config it reads, and
// the gate-file rule reaches that config:
//
//   node scripts/test-firestore-rules.mjs node_modules/vitest/vitest.mjs run --config vitest.rules.config.ts
//       every rules test (`pnpm test:rules`); add test files after it to run only those
//
// The emulators run under a `demo-` project id, which the Firebase CLI never connects to a real
// project: nothing here reads or writes tear-682cf, and no login or credential is used. They need
// Java 21 or later. The ports are in firebase.json.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

/** The project id the emulators and the tests share. The `demo-` prefix keeps it local-only. */
export const RULES_TEST_PROJECT = "demo-tear-rules";

const root = resolve(import.meta.dirname, "..");
const firebaseCli = resolve(root, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");

const java = spawnSync("java", ["-version"], { encoding: "utf8" });
if (java.error !== undefined || java.status !== 0) {
  console.error("The Firestore emulator needs Java 21 or later on PATH (java -version failed).");
  process.exit(1);
}

const [script, ...args] = process.argv.slice(2);
if (script === undefined || !/\.[cm]?js$/u.test(script)) {
  console.error("Usage: node scripts/test-firestore-rules.mjs <node script> [arguments], for example");
  console.error(
    "  node scripts/test-firestore-rules.mjs node_modules/vitest/vitest.mjs run --config vitest.rules.config.ts",
  );
  process.exit(2);
}
const quote = (value) => `"${value.replace(/"/gu, '\\"')}"`;
const testCommand = [process.execPath, resolve(root, script), ...args].map(quote).join(" ");

// Without the owner's login: the CLI must not pick up a token, and a demo project needs none.
const env = { ...process.env, FIREBASE_TOKEN: "", GOOGLE_APPLICATION_CREDENTIALS: "" };
const result = spawnSync(
  process.execPath,
  [firebaseCli, "emulators:exec", "--only", "auth,firestore", "--project", RULES_TEST_PROJECT, testCommand],
  { cwd: root, stdio: "inherit", env },
);
if (result.error !== undefined) throw result.error;
process.exit(result.status ?? 1);
