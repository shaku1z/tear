import { describe, expect, it } from "vitest";
import {
  createFirebaseGhostPublicationBearerPort,
  type FirebasePublicationAuth,
} from "../../src/platform/firebase-publication-bearer";

function auth(input: Readonly<{ readonly anonymous?: boolean; readonly token?: string; readonly fail?: boolean }> = {}): FirebasePublicationAuth {
  return {
    currentUser: {
      isAnonymous: input.anonymous === true,
      getIdToken() {
        if (input.fail) return Promise.reject(new Error("Firebase token request failed"));
        return Promise.resolve(input.token ?? "firebase.id.token");
      },
    },
  };
}

describe("Firebase Ghost publication bearer", () => {
  it("acquires an authorization header only at the action from a signed-in nonanonymous user", async () => {
    let calls = 0;
    const getAuth = (): FirebasePublicationAuth => {
      calls += 1;
      return auth({ token: "fresh.firebase.token" });
    };
    const port = createFirebaseGhostPublicationBearerPort(getAuth);

    await expect(port.acquireAuthorization()).resolves.toEqual({ authorization: "Bearer fresh.firebase.token" });
    await expect(port.acquireAuthorization()).resolves.toEqual({ authorization: "Bearer fresh.firebase.token" });
    expect(calls).toBe(2);
  });

  it.each<readonly [string, () => FirebasePublicationAuth | undefined, string]>([
    ["missing Firebase auth", () => undefined, "firebase-auth-unavailable"],
    ["signed out", (): FirebasePublicationAuth => ({ currentUser: null }), "firebase-user-unavailable"],
    ["anonymous Firebase user", (): FirebasePublicationAuth => auth({ anonymous: true }), "firebase-anonymous-user"],
    ["empty Firebase token", (): FirebasePublicationAuth => auth({ token: "   " }), "firebase-token-unavailable"],
    ["failed Firebase token", (): FirebasePublicationAuth => auth({ fail: true }), "firebase-token-unavailable"],
  ])("rejects %s", async (_label, getAuth, code) => {
    const port = createFirebaseGhostPublicationBearerPort(getAuth);
    await expect(port.acquireAuthorization()).rejects.toMatchObject({
      name: "GhostPublicationBearerError",
      code,
    });
  });
});
