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
    verifyIdToken(token: string) {
      if (token === "valid-a.token.signature") return Promise.resolve(Object.freeze({ uid: uidA }));
      if (token === "valid-b.token.signature") return Promise.resolve(Object.freeze({ uid: uidB }));
      return Promise.reject(new FirebaseAuthenticationError());
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
  return { waitUntil() { return undefined; }, passThroughOnException() { return undefined; } } as ExecutionContext;
}

function uploadRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    capsule_id: "capsule-1", upload_id: "upload-1", object_key: "capsules/capsule-1.ghost", owner_id: uidA,
    status: "uploading", visibility: "private", byte_length: 8, build_id: "tear-1", content_hash: "content-hash", result_hash: "result-hash",
    schema_version: 1, title: "A run", tags_json: "[]", privacy_class: "private", eligibility_json: "{}", training_consent: 0, part_count: 1, verdict_json: null,
    ...overrides,
  };
}

function environment(input: Readonly<{
  readonly row?: Record<string, unknown> | null;
  readonly parts?: readonly Record<string, unknown>[];
  readonly onBatch?: (statements: readonly unknown[]) => void;
  readonly onCreate?: () => void;
  readonly onAbort?: () => void;
  readonly onGet?: () => void;
}> = {}): Env {
  const statement = (sql: string) => ({
    bind: (...values: unknown[]) => ({
      first: () => Promise.resolve(input.row ?? null),
      all: () => Promise.resolve({ results: sql.includes("ghost_upload_parts") ? input.parts ?? [] : [] }),
      run: () => Promise.resolve({ success: true }),
      sql,
      values,
    }),
  });
  return {
    FIREBASE_PROJECT_ID: "tear-682cf",
    GHOST_METADATA: {
      prepare: statement,
      batch: (statements: readonly unknown[]) => {
        input.onBatch?.(statements);
        return Promise.resolve([]);
      },
    } as unknown as D1Database,
    GHOST_CAPSULES: {
      createMultipartUpload: () => {
        input.onCreate?.();
        return {
          uploadId: "upload-1", abort: () => Promise.resolve(),
          complete: () => Promise.resolve({ size: 8, httpEtag: "etag" }),
          resumeMultipartUpload: undefined,
        };
      },
      resumeMultipartUpload: () => ({ complete: () => Promise.resolve({ size: 8, httpEtag: "etag" }), abort: () => { input.onAbort?.(); return Promise.resolve(); } }),
      get: () => {
        input.onGet?.();
        return Promise.resolve({
          body: new Blob([Uint8Array.of(1, 2, 3)]).stream(), size: 3, httpEtag: "private-etag",
          range: { offset: 1, length: 2 },
          writeHttpMetadata(headers: Headers) { headers.set("content-type", "application/vnd.tear.ghost+binary"); },
        });
      },
    } as unknown as R2Bucket,
    GHOST_VERIFIER: {} as Fetcher,
  };
}

function manifest(): string {
  return JSON.stringify({
    capsuleId: "capsule-1", buildId: "tear-1", schemaVersion: 1, byteLength: 8,
    contentHash: "content-hash", resultHash: "result-hash", title: "A run", tags: [],
    privacy: "private", visibility: "private", trainingConsent: false, eligibility: {}, partCount: 1,
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
  it("handles only allowlisted endpoint-specific preflight without authentication or storage access", async () => {
    let verified = 0, creates = 0, batches = 0;
    const handler = createGhostPublicationHandler({
      allowedOrigins: ["https://game.tear.test"],
      verifier: { verifyIdToken() { verified += 1; return Promise.resolve({ uid: uidA }); } },
    });
    const response = await handler.fetch(new Request("https://publication.test/v1/uploads", {
      method: "OPTIONS",
      headers: {
        origin: "https://game.tear.test",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization, content-type",
      },
    }), environment({ onCreate: () => { creates += 1; }, onBatch: () => { batches += 1; } }), context());
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://game.tear.test");
    expect(response.headers.get("access-control-allow-methods")).toBe("POST");
    expect(response.headers.get("access-control-allow-headers")).toBe("authorization, content-type");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("vary")).toBe("Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
    expect(verified).toBe(0); expect(creates).toBe(0); expect(batches).toBe(0);
  });

  it("denies null, unknown, and overbroad CORS preflight requests", async () => {
    const handler = createGhostPublicationHandler({ verifier: verifier(), allowedOrigins: ["https://game.tear.test"] });
    for (const input of [
      { origin: "null", method: "POST", headers: "authorization" },
      { origin: "https://elsewhere.test", method: "POST", headers: "authorization" },
      { origin: "https://game.tear.test", method: "DELETE", headers: "authorization" },
      { origin: "https://game.tear.test", method: "POST", headers: "authorization, x-tear-owner" },
    ]) {
      const response = await handler.fetch(new Request("https://publication.test/v1/uploads", { method: "OPTIONS", headers: {
        origin: input.origin, "access-control-request-method": input.method, "access-control-request-headers": input.headers,
      } }), environment(), context());
      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBe(input.origin === "https://game.tear.test" ? input.origin : null);
      expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    }
  });

  it("adds CORS only to an allowed actual origin, including an auth failure", async () => {
    const handler = createGhostPublicationHandler({ verifier: verifier(), allowedOrigins: ["https://game.tear.test"] });
    const denied = await handler.fetch(new Request("https://publication.test/v1/uploads", { method: "POST", headers: { origin: "https://elsewhere.test" }, body: manifest() }), environment(), context());
    expect(denied.status).toBe(401);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    const allowed = await handler.fetch(new Request("https://publication.test/v1/uploads", { method: "POST", headers: { origin: "https://game.tear.test" }, body: manifest() }), environment(), context());
    expect(allowed.status).toBe(401);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://game.tear.test");
    expect(allowed.headers.get("cache-control")).toBe("no-store");
    expect(allowed.headers.get("vary")).toBe("Origin");
    expect(allowed.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("verifies Firebase JWKS signatures, issuer, audience, expiry, and opaque subject", async () => {
    const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: "SHA-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
    const verify = createFirebaseIdTokenVerifier({
      projectId: "tear-682cf",
      fetcher: () => Promise.resolve(new Response(JSON.stringify({ keys: [{ ...jwk, kid: "test-key" }] }), { headers: { "cache-control": "max-age=0" } })),
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
    }), environment({ row: uploadRow({ owner_id: uidB, byte_length: 1, content_hash: "x", result_hash: "y" }) }), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "upload owner mismatch" });
  });

  it("returns an authenticated same-owner upload status with a sorted durable part ledger", async () => {
    const handler = createGhostPublicationHandler({ verifier: verifier() });
    const response = await handler.fetch(request("/v1/uploads/capsule-1"), environment({
      row: uploadRow(), parts: [{ part_number: 1, etag: "one" }, { part_number: 4, etag: "four" }],
    }), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ capsuleId: "capsule-1", status: "uploading", byteLength: 8, partCount: 1,
      parts: [{ partNumber: 1, etag: "one" }, { partNumber: 4, etag: "four" }] });
  });

  it("makes upload absence and non-owner status indistinguishable", async () => {
    const handler = createGhostPublicationHandler({ verifier: verifier() });
    const absent = await handler.fetch(request("/v1/uploads/capsule-1"), environment(), context());
    const foreign = await handler.fetch(request("/v1/uploads/capsule-1"), environment({ row: uploadRow({ owner_id: uidB }) }), context());
    expect(absent.status).toBe(404); expect(await absent.json()).toEqual({ error: "not found" });
    expect(foreign.status).toBe(404); expect(await foreign.json()).toEqual({ error: "not found" });
  });

  it("allows only the exact verified owner to retrieve a finalized private object", async () => {
    let reads = 0;
    const handler = createGhostPublicationHandler({ verifier: verifier(), allowedOrigins: ["https://game.tear.test"] });
    const response = await handler.fetch(request("/v1/capsules/capsule-1/object", {
      headers: { origin: "https://game.tear.test", range: "bytes=1-2" },
    }), environment({ row: uploadRow({ status: "finalized", verdict_json: '{"status":"verified"}' }), onGet: () => { reads += 1; } }), context());
    expect(response.status).toBe(206); expect(reads).toBe(1);
    expect(response.headers.get("etag")).toBe("private-etag");
    expect(response.headers.get("content-range")).toBe("bytes 1-2/3");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://game.tear.test");
  });

  it("keeps absent, anonymous, invalid, and foreign private retrieval opaque without reading R2", async () => {
    const handler = createGhostPublicationHandler({ verifier: verifier() });
    const privateRow = uploadRow({ status: "finalized", verdict_json: '{"status":"verified"}' });
    const responses: Response[] = [];
    let reads = 0;
    responses.push(await handler.fetch(new Request("https://publication.test/v1/capsules/capsule-1/object"), environment({ row: privateRow, onGet: () => { reads += 1; } }), context()));
    responses.push(await handler.fetch(new Request("https://publication.test/v1/capsules/capsule-1/object", { headers: { authorization: "Bearer forged.token.signature" } }), environment({ row: privateRow, onGet: () => { reads += 1; } }), context()));
    responses.push(await handler.fetch(new Request("https://publication.test/v1/capsules/capsule-1/object", { headers: { authorization: "Bearer valid-b.token.signature" } }), environment({ row: privateRow, onGet: () => { reads += 1; } }), context()));
    responses.push(await handler.fetch(request("/v1/capsules/capsule-1/object"), environment({ onGet: () => { reads += 1; } }), context()));
    for (const response of responses) {
      expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: "not found" });
    }
    expect(reads).toBe(0);
  });

  it("keeps verified public and unlisted reads anonymous, but never serves non-finalized terminal states", async () => {
    const handler = createGhostPublicationHandler({ verifier: verifier() });
    let reads = 0;
    for (const visibility of ["public", "unlisted"] as const) {
      const response = await handler.fetch(new Request("https://publication.test/v1/capsules/capsule-1/object"), environment({
        row: uploadRow({ status: "finalized", visibility, privacy_class: "pseudonymous", verdict_json: '{"status":"verified"}' }), onGet: () => { reads += 1; },
      }), context());
      expect(response.status).toBe(206);
    }
    for (const status of ["uploading", "quarantined", "deleted"] as const) {
      const response = await handler.fetch(request("/v1/capsules/capsule-1/object"), environment({
        row: uploadRow({ status, verdict_json: '{"status":"verified"}' }), onGet: () => { reads += 1; },
      }), context());
      expect(response.status).toBe(404);
    }
    expect(reads).toBe(2);
  });

  it("allows only authorization and range for private object CORS preflight", async () => {
    const handler = createGhostPublicationHandler({ verifier: verifier(), allowedOrigins: ["https://game.tear.test"] });
    const allowed = await handler.fetch(new Request("https://publication.test/v1/capsules/capsule-1/object", { method: "OPTIONS", headers: {
      origin: "https://game.tear.test", "access-control-request-method": "GET", "access-control-request-headers": "authorization, range",
    } }), environment(), context());
    const denied = await handler.fetch(new Request("https://publication.test/v1/capsules/capsule-1/object", { method: "OPTIONS", headers: {
      origin: "https://game.tear.test", "access-control-request-method": "GET", "access-control-request-headers": "authorization, range, x-tear-owner",
    } }), environment(), context());
    expect(allowed.status).toBe(204); expect(allowed.headers.get("access-control-allow-headers")).toBe("authorization, range");
    expect(denied.status).toBe(403);
  });

  it("resumes only an exact same-owner immutable uploading manifest without creating another multipart upload", async () => {
    let creates = 0;
    const handler = createGhostPublicationHandler({ verifier: verifier() });
    const response = await handler.fetch(request("/v1/uploads", { method: "POST", body: manifest() }), environment({
      row: uploadRow(), onCreate: () => { creates += 1; },
    }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ capsuleId: "capsule-1", uploadId: "upload-1", status: "uploading", resumed: true });
    expect(creates).toBe(0);
  });

  it("rejects begin collisions when immutable manifest data differs or the upload is terminal", async () => {
    const handler = createGhostPublicationHandler({ verifier: verifier() });
    const changed = await handler.fetch(request("/v1/uploads", { method: "POST", body: manifest().replace("content-hash", "other-hash") }), environment({ row: uploadRow() }), context());
    const terminal = await handler.fetch(request("/v1/uploads", { method: "POST", body: manifest() }), environment({ row: uploadRow({ status: "finalized" }) }), context());
    expect(changed.status).toBe(409); expect(terminal.status).toBe(409);
  });

  it("refuses completion unless submitted parts exactly equal the durable ledger", async () => {
    const handler = createGhostPublicationHandler({ verifier: verifier() });
    const body = JSON.stringify({ parts: [{ partNumber: 1, etag: "one" }, { partNumber: 2, etag: "wrong" }] });
    const response = await handler.fetch(request("/v1/uploads/capsule-1/complete", { method: "POST", body }), environment({
      row: uploadRow({ part_count: 2 }), parts: [{ part_number: 1, etag: "one" }, { part_number: 2, etag: "two" }],
    }), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "completion parts do not exactly match durable upload ledger" });
  });

  it("rejects duplicate completion part numbers before any R2 completion", async () => {
    const handler = createGhostPublicationHandler({ verifier: verifier() });
    const response = await handler.fetch(request("/v1/uploads/capsule-1/complete", { method: "POST", body: JSON.stringify({
      parts: [{ partNumber: 1, etag: "one" }, { partNumber: 1, etag: "one" }],
    }) }), environment({ row: uploadRow(), parts: [{ part_number: 1, etag: "one" }] }), context());
    expect(response.status).toBe(400);
  });

  it("rejects topology overflow and owner-aborts only an active multipart session", async () => {
    let aborts = 0, batches = 0;
    const handler = createGhostPublicationHandler({ verifier: verifier() });
    const env = environment({ row: uploadRow(), onAbort: () => { aborts += 1; }, onBatch: () => { batches += 1; } });
    const overflow = await handler.fetch(request("/v1/uploads/capsule-1/parts/2", { method: "PUT", body: Uint8Array.of(1) }), env, context());
    expect(overflow.status).toBe(400);
    const aborted = await handler.fetch(request("/v1/uploads/capsule-1/abort", { method: "POST" }), env, context());
    expect(aborted.status).toBe(200); expect(aborts).toBe(1); expect(batches).toBe(1);
  });
});
