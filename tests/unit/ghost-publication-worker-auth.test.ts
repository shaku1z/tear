import { describe, expect, it } from "vitest";
import {
  FirebaseAuthenticationError,
  createFirebaseIdTokenVerifier,
  type FirebaseIdTokenVerifier,
} from "../../workers/firebase-auth";
import { createGhostPublicationHandler } from "../../workers/ghost-publication";

const uidA = "firebase-uid-a";
const uidB = "firebase-uid-b";

function verifier(): FirebaseIdTokenVerifier {
  return Object.freeze({
    async verifyIdToken(token: string) {
      if (token === "valid-a.token.signature") return Object.freeze({ uid: uidA });
      if (token === "valid-b.token.signature") return Object.freeze({ uid: uidB });
      throw new FirebaseAuthenticationError();
    },
  });
}

function request(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("authorization", "Bearer valid-a.token.signature");
  headers.set("x-tear-owner", uidB);
  return new Request(`https://publication.test${path}`, { ...init, headers });
}

function context(): ExecutionContext {
  return { waitUntil() {}, passThroughOnException() {} };
}

function environment(input: Readonly<{ readonly row?: Record<string, unknown> | null; readonly onBatch?: (statements: readonly unknown[]) => void }> = {}): Env {
  const statement = (sql: string) => ({
    bind: (...values: unknown[]) => ({
      first: async () => input.row ?? null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true }),
      sql,
      values,
    }),
  });
  return {
    FIREBASE_PROJECT_ID: "tear-682cf",
    GHOST_METADATA: {
      prepare: statement,
      batch: async (statements: readonly unknown[]) => {
        input.onBatch?.(statements);
        return [];
      },
    } as unknown as D1Database,
    GHOST_CAPSULES: {
      createMultipartUpload: async () => ({ uploadId: "upload-1", abort: async () => {} }),
    } as unknown as R2Bucket,
    GHOST_VERIFIER: {} as Fetcher,
  };
}

function manifest(): string {
  return JSON.stringify({
    capsuleId: "capsule-1", buildId: "tear-1", schemaVersion: 1, byteLength: 8,
    contentHash: "content-hash", resultHash: "result-hash", title: "A run", tags: [],
    privacy: "private", visibility: "private", trainingConsent: false, eligibility: {},
  });
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

async function signedToken(input: Readonly<{ readonly privateKey: CryptoKey; readonly header?: Record<string, unknown>; readonly claims?: Record<string, unknown> }>): Promise<string> {
  const header = base64Url(new TextEncoder().encode(JSON.stringify(input.header ?? { alg: "RS256", kid: "test-key" })));
  const claims = base64Url(new TextEncoder().encode(JSON.stringify({
    aud: "tear-682cf", iss: "https://securetoken.google.com/tear-682cf", exp: 2_000_000_000, sub: uidA,
    ...input.claims,
  })));
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", input.privateKey, new TextEncoder().encode(`${header}.${claims}`)));
  return `${header}.${claims}.${base64Url(signature)}`;
}

describe("Ghost publication Worker Firebase owner authentication", () => {
  it("verifies Firebase JWKS signatures, issuer, audience, expiry, and opaque subject", async () => {
    const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: "SHA-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
    const verify = createFirebaseIdTokenVerifier({
      projectId: "tear-682cf",
      fetcher: async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: "test-key" }] }), { headers: { "cache-control": "max-age=0" } }),
      nowSeconds: () => 1_900_000_000,
    });
    await expect(verify.verifyIdToken(await signedToken({ privateKey: keys.privateKey }))).resolves.toEqual({ uid: uidA });
    await expect(verify.verifyIdToken(await signedToken({ privateKey: keys.privateKey, claims: { aud: "other-project" } }))).rejects.toBeInstanceOf(FirebaseAuthenticationError);
    await expect(verify.verifyIdToken(await signedToken({ privateKey: keys.privateKey, claims: { exp: 1 } }))).rejects.toBeInstanceOf(FirebaseAuthenticationError);
    await expect(verify.verifyIdToken(await signedToken({ privateKey: keys.privateKey, header: { alg: "none", kid: "test-key" } }))).rejects.toBeInstanceOf(FirebaseAuthenticationError);
  });

  it("rejects a missing, forged, or caller-controlled owner before owner-scoped work", async () => {
    const handler = createGhostPublicationHandler({ verifier: verifier() });
    const missing = await handler.fetch(new Request("https://publication.test/v1/uploads", { method: "POST" }), environment(), context());
    expect(missing.status).toBe(401);

    const forged = await handler.fetch(new Request("https://publication.test/v1/uploads", {
      method: "POST", headers: { authorization: "Bearer forged.token.signature", "x-tear-owner": uidA }, body: manifest(),
    }), environment(), context());
    expect(forged.status).toBe(401);
  });

  it("uses only the verified Firebase uid for a valid owner-scoped upload", async () => {
    let batches = 0;
    const handler = createGhostPublicationHandler({ verifier: verifier() });
    const response = await handler.fetch(request("/v1/uploads", {
      method: "POST", headers: { "content-type": "application/json" }, body: manifest(),
    }), environment({ onBatch: () => { batches += 1; } }), context());
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ capsuleId: "capsule-1", status: "uploading" });
    expect(batches).toBe(1);
  });

  it("does not allow one verified Firebase uid to mutate another uid's capsule", async () => {
    const handler = createGhostPublicationHandler({ verifier: verifier() });
    const response = await handler.fetch(request("/v1/uploads/capsule-1/parts/1", {
      method: "PUT", body: Uint8Array.of(1),
    }), environment({ row: {
      capsule_id: "capsule-1", upload_id: "upload-1", object_key: "capsules/capsule-1.ghost", owner_id: uidB,
      status: "uploading", visibility: "private", byte_length: 1, build_id: "tear-1", content_hash: "x", result_hash: "y",
    } }), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "upload owner mismatch" });
  });
});
