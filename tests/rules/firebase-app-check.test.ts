// App Check fails open: with an attestation provider that never gives a token (as when reCAPTCHA is blocked,
// or its free monthly assessments are used up), the game's adapter still signs in, saves and submits a score
// under firestore.rules. Its own file, so the SDK's default app here is not the adapter test's.
// Run with `pnpm test:rules`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { CustomProvider } from "firebase/app-check";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { LeaderboardRef } from "../../src/domain/leaderboards";
import type { AccountContext, CloudUser } from "../../src/platform/cloud";
import { createFirebaseCloudCompatibility } from "../../src/platform/firebase-cloud";
import { createFirebaseServices } from "../../src/platform/firebase-sdk";
import { emulatorClientConfig, emulatorHosts, rulesTestProject, until } from "./rules-test-project";

const ENDLESS_NORMAL: LeaderboardRef = { kind: "score", mode: "endless", difficulty: "normal" };
let env: RulesTestEnvironment;
let user: CloudUser | undefined;
const context: AccountContext = {
  setUser(next) {
    user = next;
  },
  sync: () => Promise.resolve(),
};
const getToken = vi.fn(() => Promise.reject(new Error("reCAPTCHA unavailable")));
const cloud = createFirebaseCloudCompatibility({
  services: () =>
    Promise.resolve(
      createFirebaseServices(emulatorClientConfig(), {
        emulators: emulatorHosts(),
        appCheck: new CustomProvider({ getToken }),
      }),
    ),
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: rulesTestProject(),
    firestore: { rules: readFileSync(resolve(import.meta.dirname, "../../firestore.rules"), "utf8") },
  });
  await cloud.account.init(context);
});
afterAll(async () => {
  cloud.account.dispose?.();
  await env.cleanup();
});

describe("App Check in monitor mode", () => {
  it("signs in, saves and submits a score when no App Check token can be had", async () => {
    const signedIn = await until(() => (user !== undefined && user.id !== "local" ? user : undefined), "the sign-in");
    const save = { profile: { coins: 3 }, meta: {} };
    await cloud.account.save?.(context, save);
    await expect(cloud.account.load?.(context)).resolves.toEqual(save);
    await expect(
      cloud.shared.submitScore(ENDLESS_NORMAL, { name: "Guest", score: 800, wave: 4, time: 90 }),
    ).resolves.toBe(true);
    expect((await cloud.shared.topScores(ENDLESS_NORMAL, 25))?.[0]?.uid).toBe(signedIn.id);
    // App Check was on and asked for a token; the refusal did not hold any request back.
    expect(getToken).toHaveBeenCalled();
  });
});
