import {
  FirebaseAuthenticationError,
  authenticateFirebaseRequest,
  createFirebaseIdTokenVerifier,
  type FirebaseIdTokenVerifier,
} from "./firebase-auth";

interface UploadRow {
  capsule_id: string;
  upload_id: string;
  object_key: string;
  owner_id: string;
  status: "uploading" | "verifying" | "finalized" | "deleting" | "deleted" | "quarantined";
  visibility: "private" | "unlisted" | "public";
  byte_length: number;
  build_id: string;
  content_hash: string;
  result_hash: string;
  schema_version: number;
  title: string;
  tags_json: string;
  privacy_class: "public" | "pseudonymous" | "private" | "sensitive";
  eligibility_json: string;
  training_consent: number;
  part_count: number;
  verdict_json: string | null;
  active_verdict_id: string | null;
}

interface BeginBody {
  capsuleId: string;
  buildId: string;
  schemaVersion: number;
  byteLength: number;
  contentHash: string;
  resultHash: string;
  title: string;
  tags: string[];
  privacy: "public" | "pseudonymous" | "private" | "sensitive";
  visibility: "private" | "unlisted" | "public";
  trainingConsent: boolean;
  eligibility: Record<string, boolean>;
  partCount: number;
}

interface CompleteBody {
  parts: R2UploadedPart[];
}

interface TrustedVerdict {
  status: "verified" | "rejected" | "unsupported" | "quarantined";
  capsuleId: string;
  buildId: string;
  contentHash: string;
  resultHash: string;
  signature: string;
  verifierId: string;
  verificationVersion: string;
  moderation: "cleared" | "held" | "rejected" | "unsupported" | "quarantined";
  issuedAt: string;
}

const REPORT_REASONS = new Set(["exploit", "privacy", "abuse", "copyright", "other"]);

const MAX_JSON_BYTES = 32 * 1024;
const MAX_CAPSULE_BYTES = 512 * 1024 * 1024;
const MAX_PARTS = 10_000;

type CorsPolicy = Readonly<{ readonly methods: readonly string[]; readonly headers: readonly string[] }>;

function configuredOrigins(origins: readonly string[] | undefined): ReadonlySet<string> {
  const values = origins ?? [];
  for (const origin of values) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new TypeError("CORS origin must be an absolute origin"); }
    if (parsed.origin !== origin || parsed.origin === "null") throw new TypeError("CORS origin must be an absolute origin");
  }
  return new Set(values);
}

function corsPolicy(request: Request): CorsPolicy | undefined {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/v1/uploads") return Object.freeze({ methods: ["POST"], headers: ["authorization", "content-type"] });
  if (url.pathname === "/v1/capsules") return Object.freeze({ methods: ["GET"], headers: ["authorization"] });
  if (parts[0] !== "v1" || parts[2] === undefined) return undefined;
  if (parts[1] === "uploads" && parts.length === 3) return Object.freeze({ methods: ["GET"], headers: ["authorization"] });
  if (parts[1] === "uploads" && parts[3] === "parts" && parts[4] !== undefined && parts.length === 5) return Object.freeze({ methods: ["PUT"], headers: ["authorization", "content-type"] });
  if (parts[1] === "uploads" && parts[3] === "complete" && parts.length === 4) return Object.freeze({ methods: ["POST"], headers: ["authorization", "content-type"] });
  if (parts[1] === "uploads" && parts[3] === "verify" && parts.length === 4) return Object.freeze({ methods: ["POST"], headers: ["authorization"] });
  if (parts[1] === "uploads" && parts[3] === "abort" && parts.length === 4) return Object.freeze({ methods: ["POST"], headers: ["authorization"] });
  if (parts[1] === "capsules" && parts[3] === "object" && parts.length === 4) return Object.freeze({ methods: ["GET"], headers: ["authorization", "range"] });
  if (parts[1] === "capsules" && parts[3] === "reports" && parts.length === 4) return Object.freeze({ methods: ["POST"], headers: ["authorization", "content-type"] });
  if (parts[1] === "capsules" && parts.length === 3) return Object.freeze({ methods: ["DELETE"], headers: ["authorization"] });
  if (parts[1] === "capsules" && (parts[3] === "visibility" || parts[3] === "consent") && parts.length === 4) return Object.freeze({ methods: ["PATCH"], headers: ["authorization", "content-type"] });
  return undefined;
}

function requestedHeaders(request: Request): readonly string[] | undefined {
  const raw = request.headers.get("access-control-request-headers");
  if (raw === null || raw.trim() === "") return [];
  const headers = raw.split(",").map((value) => value.trim().toLowerCase());
  return headers.some((header) => header.length === 0 || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/u.test(header)) ? undefined : headers;
}

function corsHeaders(origin: string, vary: string): Headers {
  return new Headers({
    "access-control-allow-origin": origin,
    "cache-control": "no-store",
    vary,
  });
}

function preflight(request: Request, origins: ReadonlySet<string>): Response | undefined {
  if (request.method !== "OPTIONS" || request.headers.get("access-control-request-method") === null) return undefined;
  const origin = request.headers.get("origin");
  if (origin === null || origin === "null" || !origins.has(origin)) return new Response(null, { status: 403, headers: { "cache-control": "no-store", vary: "Origin" } });
  const policy = corsPolicy(request);
  const requestedMethod = request.headers.get("access-control-request-method")?.toUpperCase();
  const headers = requestedHeaders(request);
  if (policy === undefined || requestedMethod === undefined || !policy.methods.includes(requestedMethod) || headers === undefined || headers.some((header) => !policy.headers.includes(header))) {
    return new Response(null, { status: 403, headers: corsHeaders(origin, "Origin, Access-Control-Request-Method, Access-Control-Request-Headers") });
  }
  const responseHeaders = corsHeaders(origin, "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
  responseHeaders.set("access-control-allow-methods", requestedMethod);
  if (headers.length > 0) responseHeaders.set("access-control-allow-headers", headers.join(", "));
  responseHeaders.set("access-control-max-age", "600");
  return new Response(null, { status: 204, headers: responseHeaders });
}

function withCors(request: Request, response: Response, origins: ReadonlySet<string>): Response {
  const origin = request.headers.get("origin");
  if (origin === null || origin === "null" || !origins.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("cache-control", "no-store");
  headers.set("vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function owner(request: Request, verifier: FirebaseIdTokenVerifier): Promise<string> {
  return authenticateFirebaseRequest(request, verifier);
}

async function boundedJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_JSON_BYTES) throw new RangeError("JSON body is too large");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_JSON_BYTES) throw new RangeError("JSON body is too large");
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string, maximum = 256): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) throw new TypeError(`invalid ${key}`);
  return value;
}

function parseBegin(value: unknown): BeginBody {
  if (!isRecord(value)) throw new TypeError("upload manifest must be an object");
  const schemaVersion = value.schemaVersion;
  const byteLength = value.byteLength;
  const tags = value.tags;
  const trainingConsent = value.trainingConsent;
  const eligibility = value.eligibility;
  const visibility = value.visibility;
  const privacy = value.privacy;
  const partCount = value.partCount;
  if (!Number.isSafeInteger(schemaVersion) || Number(schemaVersion) < 1) throw new TypeError("invalid schemaVersion");
  if (!Number.isSafeInteger(byteLength) || Number(byteLength) < 1 || Number(byteLength) > MAX_CAPSULE_BYTES) {
    throw new TypeError("invalid byteLength");
  }
  if (!Number.isSafeInteger(partCount) || Number(partCount) < 1 || Number(partCount) > MAX_PARTS) throw new TypeError("invalid partCount");
  if (!Array.isArray(tags) || tags.length > 12
    || tags.some((tag: unknown) => typeof tag !== "string" || tag.length > 24)) {
    throw new TypeError("invalid tags");
  }
  if (typeof trainingConsent !== "boolean" || !isRecord(eligibility)
    || Object.values(eligibility).some((flag) => typeof flag !== "boolean")) {
    throw new TypeError("invalid publication flags");
  }
  if (visibility !== "private" && visibility !== "unlisted" && visibility !== "public") {
    throw new TypeError("invalid visibility");
  }
  if (privacy !== "public" && privacy !== "pseudonymous" && privacy !== "private" && privacy !== "sensitive") {
    throw new TypeError("invalid privacy class");
  }
  return {
    capsuleId: stringField(value, "capsuleId", 128),
    buildId: stringField(value, "buildId", 128),
    schemaVersion: Number(schemaVersion),
    byteLength: Number(byteLength),
    contentHash: stringField(value, "contentHash", 128),
    resultHash: stringField(value, "resultHash", 128),
    title: stringField(value, "title", 80),
    tags: tags.map((tag: unknown) => String(tag)),
    privacy,
    visibility,
    trainingConsent,
    eligibility: Object.fromEntries(Object.entries(eligibility).map(([key, flag]) => [key, Boolean(flag)])),
    partCount: Number(partCount),
  };
}

function parseComplete(value: unknown): CompleteBody {
  if (!isRecord(value) || !Array.isArray(value.parts)
    || value.parts.length < 1 || value.parts.length > MAX_PARTS) {
    throw new TypeError("invalid completion body");
  }
  const parts = value.parts.map((part) => {
    if (!isRecord(part) || !Number.isSafeInteger(part.partNumber) || Number(part.partNumber) < 1
      || typeof part.etag !== "string" || part.etag.length > 256) {
      throw new TypeError("invalid uploaded part");
    }
    return { partNumber: Number(part.partNumber), etag: part.etag };
  });
  if (new Set(parts.map((part) => part.partNumber)).size !== parts.length) {
    throw new TypeError("completion parts must not contain duplicates");
  }
  return { parts };
}

function parseTrustedVerdict(value: unknown, row: UploadRow): TrustedVerdict {
  if (!isRecord(value)) throw new TypeError("trusted verifier returned an invalid verdict");
  const status = value.status;
  if (status !== "verified" && status !== "rejected" && status !== "unsupported" && status !== "quarantined") {
    throw new TypeError("trusted verifier returned an invalid status");
  }
  const moderation = value.moderation;
  if (moderation !== "cleared" && moderation !== "held" && moderation !== "rejected" && moderation !== "unsupported" && moderation !== "quarantined") {
    throw new TypeError("trusted verifier returned an invalid moderation state");
  }
  const issuedAt = stringField(value, "issuedAt", 64);
  if (!Number.isFinite(Date.parse(issuedAt))) throw new TypeError("trusted verifier returned an invalid issuedAt");
  const verdict: TrustedVerdict = {
    status,
    capsuleId: stringField(value, "capsuleId", 128),
    buildId: stringField(value, "buildId", 128),
    contentHash: stringField(value, "contentHash", 128),
    resultHash: stringField(value, "resultHash", 128),
    signature: stringField(value, "signature", 512),
    verifierId: stringField(value, "verifierId", 128),
    verificationVersion: stringField(value, "verificationVersion", 64),
    moderation,
    issuedAt,
  };
  if (verdict.capsuleId !== row.capsule_id || verdict.buildId !== row.build_id
    || verdict.contentHash !== row.content_hash || verdict.resultHash !== row.result_hash) {
    throw new TypeError("trusted verdict identity does not match the upload manifest");
  }
  return verdict;
}

async function loadUpload(env: Env, capsuleId: string): Promise<UploadRow | null> {
  return env.GHOST_METADATA.prepare(
    `SELECT capsule_id, upload_id, object_key, owner_id, status, visibility, byte_length,
      build_id, content_hash, result_hash, schema_version, title, tags_json, privacy_class,
      eligibility_json, training_consent, part_count, verdict_json, active_verdict_id FROM ghost_uploads WHERE capsule_id = ?`,
  ).bind(capsuleId).first<UploadRow>();
}

async function verifiedCleared(env: Env, row: UploadRow): Promise<boolean> {
  if (row.status !== "finalized" || row.active_verdict_id === null || row.verdict_json === null) return false;
  try {
    const receipt = await env.GHOST_METADATA.prepare(
      "SELECT verdict_json FROM ghost_verdict_receipts WHERE verdict_id = ? AND capsule_id = ?",
    ).bind(row.active_verdict_id, row.capsule_id).first<Readonly<{ verdict_json: string }>>();
    if (receipt?.verdict_json !== row.verdict_json) return false;
    const verdict = parseTrustedVerdict(JSON.parse(row.verdict_json), row);
    return verdict.status === "verified" && verdict.moderation === "cleared";
  } catch { return false; }
}

function assertOwner(row: UploadRow | null, actor: string): UploadRow {
  if (row === null) throw new Error("upload not found");
  if (row.owner_id !== actor) throw new Error("upload owner mismatch");
  return row;
}

function immutableManifestMatches(row: UploadRow, body: BeginBody): boolean {
  return row.capsule_id === body.capsuleId
    && row.build_id === body.buildId
    && row.schema_version === body.schemaVersion
    && row.byte_length === body.byteLength
    && row.content_hash === body.contentHash
    && row.result_hash === body.resultHash
    && row.title === body.title
    && row.tags_json === JSON.stringify(body.tags)
    && row.privacy_class === body.privacy
    && row.eligibility_json === JSON.stringify(body.eligibility)
    && row.visibility === body.visibility
    && row.training_consent === (body.trainingConsent ? 1 : 0)
    && row.part_count === body.partCount;
}

function resumedBegin(row: UploadRow): Response {
  return json({ capsuleId: row.capsule_id, uploadId: row.upload_id, status: "uploading", resumed: true });
}

async function begin(request: Request, env: Env, verifier: FirebaseIdTokenVerifier): Promise<Response> {
  const actor = await owner(request, verifier);
  const body = parseBegin(await boundedJson(request));
  const existing = await loadUpload(env, body.capsuleId);
  if (existing !== null) {
    if (existing.owner_id === actor && existing.status === "uploading" && immutableManifestMatches(existing, body)) {
      return resumedBegin(existing);
    }
    throw new Error("upload manifest conflict");
  }
  const objectKey = `capsules/${body.capsuleId}.ghost`;
  const multipart = await env.GHOST_CAPSULES.createMultipartUpload(objectKey, {
    httpMetadata: { contentType: "application/vnd.tear.ghost+binary" },
    customMetadata: { capsuleId: body.capsuleId, buildId: body.buildId },
  });
  const now = new Date().toISOString();
  try {
    await env.GHOST_METADATA.batch([
      env.GHOST_METADATA.prepare(
        `INSERT INTO ghost_uploads (
          capsule_id, upload_id, object_key, owner_id, build_id, schema_version, byte_length,
          content_hash, result_hash, title, tags_json, privacy_class, eligibility_json,
          visibility, training_consent, part_count, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?, ?)`,
      ).bind(
        body.capsuleId, multipart.uploadId, objectKey, actor, body.buildId, body.schemaVersion,
        body.byteLength, body.contentHash, body.resultHash, body.title, JSON.stringify(body.tags),
        body.privacy, JSON.stringify(body.eligibility), body.visibility, body.trainingConsent ? 1 : 0, body.partCount,
        now, now,
      ),
      env.GHOST_METADATA.prepare(
        "INSERT INTO ghost_audit (actor_id, action, capsule_id, detail, created_at) VALUES (?, 'upload.begin', ?, ?, ?)",
      ).bind(actor, body.capsuleId, body.visibility, now),
    ]);
  } catch (error) {
    await multipart.abort();
    // A concurrent begin may have won the durable D1 insert after our initial
    // read. Refetch only after aborting this orphaned R2 multipart handle.
    const concurrent = await loadUpload(env, body.capsuleId);
    if (concurrent !== null && concurrent.owner_id === actor && concurrent.status === "uploading"
      && immutableManifestMatches(concurrent, body)) {
      return resumedBegin(concurrent);
    }
    throw error;
  }
  return json({ capsuleId: body.capsuleId, uploadId: multipart.uploadId, status: "uploading" }, 201);
}

async function uploadStatus(request: Request, env: Env, capsuleId: string, verifier: FirebaseIdTokenVerifier): Promise<Response> {
  const actor = await owner(request, verifier);
  const row = await loadUpload(env, capsuleId);
  // Deliberately make absence and non-ownership indistinguishable.
  if (row?.owner_id !== actor || row.status === "deleting" || row.status === "deleted") return json({ error: "not found" }, 404);
  const result = await env.GHOST_METADATA.prepare(
    "SELECT part_number, etag FROM ghost_upload_parts WHERE capsule_id = ? ORDER BY part_number ASC",
  ).bind(capsuleId).all<Readonly<{ part_number: number; etag: string }>>();
  const parts = result.results.map((part) => ({ partNumber: part.part_number, etag: part.etag }));
  return json({ capsuleId: row.capsule_id, status: row.status, byteLength: row.byte_length, partCount: row.part_count, parts });
}

function assertExactPartLedger(submitted: readonly R2UploadedPart[], ledger: readonly Readonly<{ part_number: number; etag: string }>[]): void {
  const submittedByNumber = new Map<number, string>();
  for (const part of submitted) {
    if (submittedByNumber.has(part.partNumber)) throw new TypeError("completion parts must not contain duplicates");
    submittedByNumber.set(part.partNumber, part.etag);
  }
  const ledgerByNumber = new Map<number, string>();
  for (const part of ledger) {
    if (!Number.isSafeInteger(part.part_number) || part.part_number < 1 || typeof part.etag !== "string"
      || ledgerByNumber.has(part.part_number)) {
      throw new Error("durable upload part ledger is invalid");
    }
    ledgerByNumber.set(part.part_number, part.etag);
  }
  if (submittedByNumber.size !== ledgerByNumber.size) throw new Error("completion parts do not exactly match durable upload ledger");
  for (const [partNumber, etag] of submittedByNumber) {
    if (ledgerByNumber.get(partNumber) !== etag) throw new Error("completion parts do not exactly match durable upload ledger");
  }
}

async function uploadPart(request: Request, env: Env, capsuleId: string, partNumber: number, verifier: FirebaseIdTokenVerifier): Promise<Response> {
  const actor = await owner(request, verifier);
  const row = assertOwner(await loadUpload(env, capsuleId), actor);
  if (row.status !== "uploading") throw new Error("upload is not accepting parts");
  if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > row.part_count || request.body === null) {
    throw new RangeError("invalid upload part");
  }
  const multipart = env.GHOST_CAPSULES.resumeMultipartUpload(row.object_key, row.upload_id);
  const uploaded = await multipart.uploadPart(partNumber, request.body);
  await env.GHOST_METADATA.prepare(
    `INSERT INTO ghost_upload_parts (capsule_id, part_number, etag) VALUES (?, ?, ?)
     ON CONFLICT(capsule_id, part_number) DO UPDATE SET etag = excluded.etag`,
  ).bind(capsuleId, uploaded.partNumber, uploaded.etag).run();
  return json(uploaded, 201);
}

async function complete(request: Request, env: Env, capsuleId: string, verifier: FirebaseIdTokenVerifier): Promise<Response> {
  const actor = await owner(request, verifier);
  const row = assertOwner(await loadUpload(env, capsuleId), actor);
  if (row.status === "verifying") return verifyCompleted(env, row, actor);
  if (row.status !== "uploading") throw new Error("upload cannot be completed");
  const body = parseComplete(await boundedJson(request));
  if (body.parts.length !== row.part_count || body.parts.some((part) => part.partNumber > row.part_count)) {
    throw new RangeError("completion parts do not match immutable upload topology");
  }
  const ledger = await env.GHOST_METADATA.prepare(
    "SELECT part_number, etag FROM ghost_upload_parts WHERE capsule_id = ? ORDER BY part_number ASC",
  ).bind(capsuleId).all<Readonly<{ part_number: number; etag: string }>>();
  assertExactPartLedger(body.parts, ledger.results);
  const multipart = env.GHOST_CAPSULES.resumeMultipartUpload(row.object_key, row.upload_id);
  const object = await multipart.complete(body.parts);
  if (object.size !== row.byte_length) {
    await env.GHOST_CAPSULES.delete(row.object_key);
    throw new Error("completed object length differs from manifest");
  }
  // R2 completion is an irreversible boundary.  Persist `verifying` before
  // contacting the verifier so a transient verifier outage cannot strand a
  // finalized object behind an `uploading` multipart session.
  const now = new Date().toISOString();
  await env.GHOST_METADATA.batch([
    env.GHOST_METADATA.prepare("UPDATE ghost_uploads SET status = 'verifying', visibility = 'private', updated_at = ? WHERE capsule_id = ? AND status = 'uploading'").bind(now, capsuleId),
    env.GHOST_METADATA.prepare("INSERT INTO ghost_audit (actor_id, action, capsule_id, detail, created_at) VALUES (?, 'upload.verifying', ?, 'r2-complete-awaiting-verdict', ?)").bind(actor, capsuleId, now),
  ]);
  return verifyCompleted(env, { ...row, status: "verifying", visibility: "private" }, actor, object.httpEtag);
}

async function verifyCompleted(env: Env, row: UploadRow, actor: string, completedEtag?: string): Promise<Response> {
  if (row.status !== "verifying") throw new Error("upload is not awaiting verification");
  const capsuleId = row.capsule_id;
  let verificationResponse: Response;
  try {
    verificationResponse = await env.GHOST_VERIFIER.fetch("https://verifier.internal/v1/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      capsuleId,
      objectKey: row.object_key,
      buildId: row.build_id,
      contentHash: row.content_hash,
      resultHash: row.result_hash,
    }),
    });
  } catch { return json({ capsuleId, status: "verifying", retryable: true }, 202); }
  if (!verificationResponse.ok) return json({ capsuleId, status: "verifying", retryable: true }, 202);
  let verdict: TrustedVerdict;
  try { verdict = parseTrustedVerdict(await verificationResponse.json(), row); }
  catch {
    const badAt = new Date().toISOString();
    await env.GHOST_METADATA.batch([
      env.GHOST_METADATA.prepare("UPDATE ghost_uploads SET status = 'quarantined', visibility = 'private', updated_at = ? WHERE capsule_id = ? AND status = 'verifying'").bind(badAt, capsuleId),
      env.GHOST_METADATA.prepare("INSERT INTO ghost_audit (actor_id, action, capsule_id, detail, created_at) VALUES (?, 'upload.verdict.quarantined', ?, 'malformed-trusted-verdict', ?)").bind(actor, capsuleId, badAt),
    ]);
    return json({ capsuleId, status: "quarantined", verification: "quarantined" });
  }
  const publicationStatus = verdict.status === "verified" && verdict.moderation === "cleared" ? "finalized" : "quarantined";
  const verdictId = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.GHOST_METADATA.batch([
    env.GHOST_METADATA.prepare(
      "INSERT INTO ghost_verdict_receipts (verdict_id, capsule_id, verifier_id, verification_version, issued_at, verdict_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(verdictId, capsuleId, verdict.verifierId, verdict.verificationVersion, verdict.issuedAt, JSON.stringify(verdict), now),
    env.GHOST_METADATA.prepare(
      "UPDATE ghost_uploads SET status = ?, visibility = CASE WHEN ? = 'finalized' THEN visibility ELSE 'private' END, verdict_json = ?, active_verdict_id = ?, updated_at = ? WHERE capsule_id = ? AND status = 'verifying'",
    ).bind(publicationStatus, publicationStatus, JSON.stringify(verdict), verdictId, now, capsuleId),
    env.GHOST_METADATA.prepare(
      "INSERT INTO ghost_audit (actor_id, action, capsule_id, detail, created_at) VALUES (?, 'upload.finalize', ?, ?, ?)",
    ).bind(actor, capsuleId, verdict.status, now),
  ]);
  return json({ capsuleId, status: publicationStatus, verification: verdict.status, etag: completedEtag ?? null });
}

async function verifyOwnerRetry(request: Request, env: Env, capsuleId: string, verifier: FirebaseIdTokenVerifier): Promise<Response> {
  const actor = await owner(request, verifier);
  const row = assertOwner(await loadUpload(env, capsuleId), actor);
  return verifyCompleted(env, row, actor);
}

async function listMetadata(request: Request, env: Env, verifier: FirebaseIdTokenVerifier): Promise<Response> {
  const url = new URL(request.url);
  const own = url.searchParams.get("scope") === "own";
  if (own) {
    const actor = await owner(request, verifier);
    const result = await env.GHOST_METADATA.prepare(
      `SELECT capsule_id, build_id, title, tags_json, visibility, status, verdict_json, updated_at
       FROM ghost_uploads WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 100`,
    ).bind(actor).all();
    return json({ capsules: result.results });
  }
  const result = await env.GHOST_METADATA.prepare(
    `SELECT capsule_id, build_id, title, tags_json, visibility, verdict_json, updated_at
     FROM ghost_uploads
     WHERE status = 'finalized' AND visibility = 'public'
       AND privacy_class = 'pseudonymous'
       AND active_verdict_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM ghost_verdict_receipts receipt WHERE receipt.verdict_id = ghost_uploads.active_verdict_id AND receipt.capsule_id = ghost_uploads.capsule_id AND receipt.verdict_json = ghost_uploads.verdict_json)
       AND verdict_json LIKE '%"status":"verified"%'
       AND verdict_json LIKE '%"moderation":"cleared"%'
     ORDER BY updated_at DESC LIMIT 100`,
  ).all();
  return json({ capsules: result.results });
}

async function download(request: Request, env: Env, capsuleId: string, verifier: FirebaseIdTokenVerifier): Promise<Response> {
  const row = await loadUpload(env, capsuleId);
  if (row === null || !await verifiedCleared(env, row)) return json({ error: "not found" }, 404);
  if (row.visibility === "private") {
    // This is intentionally opaque: a missing, invalid, or foreign bearer must
    // not distinguish a private capsule from a missing one, and must never read R2.
    try {
      if (await owner(request, verifier) !== row.owner_id) return json({ error: "not found" }, 404);
    } catch (error) {
      if (error instanceof FirebaseAuthenticationError) return json({ error: "not found" }, 404);
      throw error;
    }
  } else if (!["public", "pseudonymous"].includes(row.privacy_class)) return json({ error: "not found" }, 404);
  const object = await env.GHOST_CAPSULES.get(row.object_key, { range: request.headers });
  if (object === null) return json({ error: "not found" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  if (object.range !== undefined) {
    const offset = "suffix" in object.range ? Math.max(0, object.size - object.range.suffix) : object.range.offset ?? 0;
    const length = "suffix" in object.range ? object.range.suffix : object.range.length ?? object.size - offset;
    headers.set("content-range", `bytes ${String(offset)}-${String(offset + length - 1)}/${String(object.size)}`);
  }
  return new Response(object.body, { status: object.range === undefined ? 200 : 206, headers });
}

async function mutate(request: Request, env: Env, capsuleId: string, action: string, verifier: FirebaseIdTokenVerifier): Promise<Response> {
  const actor = await owner(request, verifier);
  const loaded = await loadUpload(env, capsuleId);
  // A deletion request must not disclose whether another owner has this id.
  if (action === "delete" && loaded?.owner_id !== actor) return json({ error: "not found" }, 404);
  const row = assertOwner(loaded, actor);
  const now = new Date().toISOString();
  if (action === "delete") {
    return deleteCapsule(env, row, actor, now);
  }
  const body = await boundedJson(request);
  if (!isRecord(body)) throw new TypeError("mutation body must be an object");
  if (action === "visibility") {
    if (row.status === "deleting" || row.status === "deleted") throw new Error("capsule is deleting");
    const visibility = body.visibility;
    if (visibility !== "private" && visibility !== "unlisted" && visibility !== "public") throw new TypeError("invalid visibility");
    if (visibility !== "private" && (row.privacy_class === "private" || row.privacy_class === "sensitive" || !await verifiedCleared(env, row))) {
      throw new RangeError("only verified public or pseudonymous capsules can become discoverable");
    }
    await env.GHOST_METADATA.prepare(
      "UPDATE ghost_uploads SET visibility = ?, updated_at = ? WHERE capsule_id = ?",
    ).bind(visibility, now, capsuleId).run();
    return json({ capsuleId, visibility });
  }
  if (action === "consent") {
    if (row.status === "deleting" || row.status === "deleted") throw new Error("capsule is deleting");
    if (typeof body.trainingConsent !== "boolean") throw new TypeError("invalid consent");
    await env.GHOST_METADATA.prepare(
      "UPDATE ghost_uploads SET training_consent = ?, updated_at = ? WHERE capsule_id = ?",
    ).bind(body.trainingConsent ? 1 : 0, now, capsuleId).run();
    return json({ capsuleId, trainingConsent: body.trainingConsent });
  }
  return json({ error: "not found" }, 404);
}

function parseReport(value: unknown): string {
  if (!isRecord(value) || Object.keys(value).length !== 1 || typeof value.reason !== "string" || !REPORT_REASONS.has(value.reason)) {
    throw new TypeError("invalid report reason");
  }
  return value.reason;
}

async function reportCapsule(request: Request, env: Env, capsuleId: string, verifier: FirebaseIdTokenVerifier): Promise<Response> {
  const actor = await owner(request, verifier);
  const reason = parseReport(await boundedJson(request));
  const row = await loadUpload(env, capsuleId);
  if (row === null || row.owner_id === actor || row.visibility === "private" || !["public", "unlisted"].includes(row.visibility) || row.privacy_class !== "pseudonymous" || !await verifiedCleared(env, row)) {
    return json({ error: "not found" }, 404);
  }
  const now = new Date().toISOString();
  try {
    await env.GHOST_METADATA.batch([
      env.GHOST_METADATA.prepare("INSERT INTO ghost_capsule_reports (capsule_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?)").bind(capsuleId, actor, reason, now),
      env.GHOST_METADATA.prepare("INSERT INTO ghost_audit (actor_id, action, capsule_id, detail, created_at) VALUES (?, 'capsule.reported', ?, ?, ?)").bind(actor, capsuleId, reason, now),
    ]);
  } catch { return json({ error: "already reported" }, 409); }
  return json({ capsuleId, reported: true }, 201);
}

/**
 * Makes remote deletion durable before touching R2.  A Worker may be evicted
 * between the two stores, so `deleting` is deliberately a terminally private
 * deny state rather than a claim that the object has already been purged.
 */
async function deleteCapsule(env: Env, row: UploadRow, actor: string, now: string): Promise<Response> {
  if (row.status === "uploading") throw new Error("uploading capsule must be aborted before deletion");
  if (row.status === "deleted") return json({ capsuleId: row.capsule_id, status: "deleted", purge: "purged", localRetentionUnaffected: true });
  await env.GHOST_METADATA.batch([
    env.GHOST_METADATA.prepare(
      "UPDATE ghost_uploads SET status = 'deleting', visibility = 'private', updated_at = ? WHERE capsule_id = ? AND owner_id = ? AND status IN ('finalized', 'quarantined', 'deleting')",
    ).bind(now, row.capsule_id, actor),
    env.GHOST_METADATA.prepare(
      `INSERT INTO ghost_capsule_deletions (capsule_id, owner_id, state, attempts, requested_at, updated_at)
       VALUES (?, ?, 'pending', 0, ?, ?)
       ON CONFLICT(capsule_id) DO UPDATE SET updated_at = excluded.updated_at`,
    ).bind(row.capsule_id, actor, now, now),
    env.GHOST_METADATA.prepare(
      "INSERT INTO ghost_audit (actor_id, action, capsule_id, detail, created_at) VALUES (?, 'capsule.delete.requested', ?, 'deleting-private-before-r2', ?)",
    ).bind(actor, row.capsule_id, now),
  ]);
  try {
    await env.GHOST_CAPSULES.delete(row.object_key);
  } catch {
    const failedAt = new Date().toISOString();
    await env.GHOST_METADATA.batch([
      env.GHOST_METADATA.prepare(
        "UPDATE ghost_capsule_deletions SET state = 'pending', attempts = attempts + 1, updated_at = ? WHERE capsule_id = ? AND owner_id = ?",
      ).bind(failedAt, row.capsule_id, actor),
      env.GHOST_METADATA.prepare(
        "INSERT INTO ghost_audit (actor_id, action, capsule_id, detail, created_at) VALUES (?, 'capsule.delete.pending', ?, 'r2-delete-failed-retryable', ?)",
      ).bind(actor, row.capsule_id, failedAt),
    ]);
    return json({ capsuleId: row.capsule_id, status: "deleting", purge: "pending", retryable: true, localRetentionUnaffected: true }, 202);
  }
  const purgedAt = new Date().toISOString();
  await env.GHOST_METADATA.batch([
    env.GHOST_METADATA.prepare(
      "UPDATE ghost_uploads SET status = 'deleted', visibility = 'private', updated_at = ? WHERE capsule_id = ? AND owner_id = ? AND status = 'deleting'",
    ).bind(purgedAt, row.capsule_id, actor),
    env.GHOST_METADATA.prepare(
      "UPDATE ghost_capsule_deletions SET state = 'purged', attempts = attempts + 1, purged_at = ?, updated_at = ? WHERE capsule_id = ? AND owner_id = ?",
    ).bind(purgedAt, purgedAt, row.capsule_id, actor),
    env.GHOST_METADATA.prepare(
      "INSERT INTO ghost_audit (actor_id, action, capsule_id, detail, created_at) VALUES (?, 'capsule.delete.purged', ?, 'r2-delete-succeeded', ?)",
    ).bind(actor, row.capsule_id, purgedAt),
  ]);
  return json({ capsuleId: row.capsule_id, status: "deleted", purge: "purged", localRetentionUnaffected: true });
}

/** Cancels only an in-progress multipart session. Terminal uploads are immutable. */
async function abortUpload(request: Request, env: Env, capsuleId: string, verifier: FirebaseIdTokenVerifier): Promise<Response> {
  const actor = await owner(request, verifier);
  const row = assertOwner(await loadUpload(env, capsuleId), actor);
  if (row.status !== "uploading") throw new Error("only an uploading session can be aborted");
  await env.GHOST_CAPSULES.resumeMultipartUpload(row.object_key, row.upload_id).abort();
  const now = new Date().toISOString();
  await env.GHOST_METADATA.batch([
    env.GHOST_METADATA.prepare("DELETE FROM ghost_upload_parts WHERE capsule_id = ?").bind(capsuleId),
    env.GHOST_METADATA.prepare("UPDATE ghost_uploads SET status = 'deleted', visibility = 'private', updated_at = ? WHERE capsule_id = ? AND status = 'uploading'").bind(now, capsuleId),
    env.GHOST_METADATA.prepare("INSERT INTO ghost_audit (actor_id, action, capsule_id, detail, created_at) VALUES (?, 'upload.abort', ?, 'multipart-aborted', ?)").bind(actor, capsuleId, now),
  ]);
  return json({ capsuleId, status: "deleted", aborted: true, localRetentionUnaffected: true });
}

async function route(request: Request, env: Env, verifier: FirebaseIdTokenVerifier): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (request.method === "POST" && url.pathname === "/v1/uploads") return begin(request, env, verifier);
  if (request.method === "GET" && url.pathname === "/v1/capsules") return listMetadata(request, env, verifier);
  if (parts[0] !== "v1" || (parts[1] !== "uploads" && parts[1] !== "capsules") || parts[2] === undefined) {
    return json({ error: "not found" }, 404);
  }
  const capsuleId = parts[2];
  if (request.method === "GET" && parts[1] === "uploads" && parts.length === 3) {
    return uploadStatus(request, env, capsuleId, verifier);
  }
  if (request.method === "PUT" && parts[1] === "uploads" && parts[3] === "parts" && parts[4] !== undefined) {
    return uploadPart(request, env, capsuleId, Number(parts[4]), verifier);
  }
  if (request.method === "POST" && parts[1] === "uploads" && parts[3] === "complete") {
    return complete(request, env, capsuleId, verifier);
  }
  if (request.method === "POST" && parts[1] === "uploads" && parts[3] === "verify") return verifyOwnerRetry(request, env, capsuleId, verifier);
  if (request.method === "POST" && parts[1] === "uploads" && parts[3] === "abort") {
    return abortUpload(request, env, capsuleId, verifier);
  }
  if (request.method === "GET" && parts[1] === "capsules" && parts[3] === "object") {
    return download(request, env, capsuleId, verifier);
  }
  if (request.method === "POST" && parts[1] === "capsules" && parts[3] === "reports") return reportCapsule(request, env, capsuleId, verifier);
  if (request.method === "DELETE" && parts[1] === "capsules") return mutate(request, env, capsuleId, "delete", verifier);
  if (request.method === "PATCH" && parts[1] === "capsules" && parts[3] !== undefined) {
    return mutate(request, env, capsuleId, parts[3], verifier);
  }
  return json({ error: "not found" }, 404);
}

export function createGhostPublicationHandler(options: Readonly<{ verifier?: FirebaseIdTokenVerifier; allowedOrigins?: readonly string[] }> = {}): ExportedHandler<Env> {
  const origins = configuredOrigins(options.allowedOrigins);
  return {
  async fetch(request: Request, env: Env): Promise<Response> {
    const preflightResponse = preflight(request, origins);
    if (preflightResponse !== undefined) return preflightResponse;
    try {
      const verifier = options.verifier ?? createFirebaseIdTokenVerifier({ projectId: env.FIREBASE_PROJECT_ID });
      const response = await route(request, env, verifier);
      console.log(JSON.stringify({ message: "ghost publication request", method: request.method, path: new URL(request.url).pathname, status: response.status }));
      return withCors(request, response, origins);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(JSON.stringify({ message: "ghost publication failure", error: message, path: new URL(request.url).pathname }));
      const status = error instanceof FirebaseAuthenticationError ? 401 : error instanceof RangeError || error instanceof TypeError ? 400 : 409;
      return withCors(request, json({ error: message }, status), origins);
    }
  },
  };
}

export default createGhostPublicationHandler();
