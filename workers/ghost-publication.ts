interface UploadRow {
  capsule_id: string;
  upload_id: string;
  object_key: string;
  owner_id: string;
  status: "uploading" | "finalized" | "deleted" | "quarantined";
  visibility: "private" | "unlisted" | "public";
  byte_length: number;
  build_id: string;
  content_hash: string;
  result_hash: string;
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
}

const MAX_JSON_BYTES = 32 * 1024;
const MAX_CAPSULE_BYTES = 512 * 1024 * 1024;
const MAX_PARTS = 10_000;

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function owner(request: Request): string {
  const value = request.headers.get("x-tear-owner");
  if (value === null || !/^[A-Za-z0-9_-]{8,128}$/u.test(value)) throw new Error("missing or invalid owner identity");
  return value;
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
  if (!Number.isSafeInteger(schemaVersion) || Number(schemaVersion) < 1) throw new TypeError("invalid schemaVersion");
  if (!Number.isSafeInteger(byteLength) || Number(byteLength) < 1 || Number(byteLength) > MAX_CAPSULE_BYTES) {
    throw new TypeError("invalid byteLength");
  }
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
  return { parts };
}

function parseTrustedVerdict(value: unknown, row: UploadRow): TrustedVerdict {
  if (!isRecord(value)) throw new TypeError("trusted verifier returned an invalid verdict");
  const status = value.status;
  if (status !== "verified" && status !== "rejected" && status !== "unsupported" && status !== "quarantined") {
    throw new TypeError("trusted verifier returned an invalid status");
  }
  const verdict: TrustedVerdict = {
    status,
    capsuleId: stringField(value, "capsuleId", 128),
    buildId: stringField(value, "buildId", 128),
    contentHash: stringField(value, "contentHash", 128),
    resultHash: stringField(value, "resultHash", 128),
    signature: stringField(value, "signature", 512),
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
      build_id, content_hash, result_hash FROM ghost_uploads WHERE capsule_id = ?`,
  ).bind(capsuleId).first<UploadRow>();
}

function assertOwner(row: UploadRow | null, actor: string): UploadRow {
  if (row === null) throw new Error("upload not found");
  if (row.owner_id !== actor) throw new Error("upload owner mismatch");
  return row;
}

async function begin(request: Request, env: Env): Promise<Response> {
  const actor = owner(request);
  const body = parseBegin(await boundedJson(request));
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
          visibility, training_consent, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?, ?)`,
      ).bind(
        body.capsuleId, multipart.uploadId, objectKey, actor, body.buildId, body.schemaVersion,
        body.byteLength, body.contentHash, body.resultHash, body.title, JSON.stringify(body.tags),
        body.privacy, JSON.stringify(body.eligibility), body.visibility, body.trainingConsent ? 1 : 0,
        now, now,
      ),
      env.GHOST_METADATA.prepare(
        "INSERT INTO ghost_audit (actor_id, action, capsule_id, detail, created_at) VALUES (?, 'upload.begin', ?, ?, ?)",
      ).bind(actor, body.capsuleId, body.visibility, now),
    ]);
  } catch (error) {
    await multipart.abort();
    throw error;
  }
  return json({ capsuleId: body.capsuleId, uploadId: multipart.uploadId, status: "uploading" }, 201);
}

async function uploadPart(request: Request, env: Env, capsuleId: string, partNumber: number): Promise<Response> {
  const actor = owner(request);
  const row = assertOwner(await loadUpload(env, capsuleId), actor);
  if (row.status !== "uploading") throw new Error("upload is not accepting parts");
  if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > MAX_PARTS || request.body === null) {
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

async function complete(request: Request, env: Env, capsuleId: string): Promise<Response> {
  const actor = owner(request);
  const row = assertOwner(await loadUpload(env, capsuleId), actor);
  if (row.status !== "uploading") throw new Error("upload cannot be completed");
  const body = parseComplete(await boundedJson(request));
  const multipart = env.GHOST_CAPSULES.resumeMultipartUpload(row.object_key, row.upload_id);
  const object = await multipart.complete(body.parts);
  if (object.size !== row.byte_length) {
    await env.GHOST_CAPSULES.delete(row.object_key);
    throw new Error("completed object length differs from manifest");
  }
  const verificationResponse = await env.GHOST_VERIFIER.fetch("https://verifier.internal/v1/verify", {
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
  if (!verificationResponse.ok) {
    throw new Error(`trusted verifier failed with ${String(verificationResponse.status)}`);
  }
  const verdict = parseTrustedVerdict(await verificationResponse.json(), row);
  const publicationStatus = verdict.status === "verified" || verdict.status === "unsupported"
    ? "finalized"
    : "quarantined";
  const now = new Date().toISOString();
  await env.GHOST_METADATA.batch([
    env.GHOST_METADATA.prepare(
      "UPDATE ghost_uploads SET status = ?, verdict_json = ?, updated_at = ? WHERE capsule_id = ? AND status = 'uploading'",
    ).bind(publicationStatus, JSON.stringify(verdict), now, capsuleId),
    env.GHOST_METADATA.prepare(
      "INSERT INTO ghost_audit (actor_id, action, capsule_id, detail, created_at) VALUES (?, 'upload.finalize', ?, ?, ?)",
    ).bind(actor, capsuleId, verdict.status, now),
  ]);
  return json({ capsuleId, status: publicationStatus, verification: verdict.status, etag: object.httpEtag });
}

async function listMetadata(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const own = url.searchParams.get("scope") === "own";
  if (own) {
    const actor = owner(request);
    const result = await env.GHOST_METADATA.prepare(
      `SELECT capsule_id, build_id, title, tags_json, visibility, status, verdict_json, updated_at
       FROM ghost_uploads WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 100`,
    ).bind(actor).all();
    return json({ capsules: result.results });
  }
  const result = await env.GHOST_METADATA.prepare(
    `SELECT capsule_id, build_id, title, tags_json, visibility, verdict_json, updated_at
     FROM ghost_uploads
     WHERE status = 'finalized' AND visibility IN ('public', 'unlisted')
     ORDER BY updated_at DESC LIMIT 100`,
  ).all();
  return json({ capsules: result.results });
}

async function download(request: Request, env: Env, capsuleId: string): Promise<Response> {
  const row = await loadUpload(env, capsuleId);
  if (row?.status !== "finalized" || row.visibility === "private") return json({ error: "not found" }, 404);
  const object = await env.GHOST_CAPSULES.get(row.object_key, { range: request.headers });
  if (object === null) return json({ error: "not found" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("x-content-type-options", "nosniff");
  if (object.range !== undefined) {
    const offset = "suffix" in object.range ? Math.max(0, object.size - object.range.suffix) : object.range.offset ?? 0;
    const length = "suffix" in object.range ? object.range.suffix : object.range.length ?? object.size - offset;
    headers.set("content-range", `bytes ${String(offset)}-${String(offset + length - 1)}/${String(object.size)}`);
  }
  return new Response(object.body, { status: object.range === undefined ? 200 : 206, headers });
}

async function mutate(request: Request, env: Env, capsuleId: string, action: string, ctx: ExecutionContext): Promise<Response> {
  const actor = owner(request);
  const row = assertOwner(await loadUpload(env, capsuleId), actor);
  const now = new Date().toISOString();
  if (action === "delete") {
    await env.GHOST_METADATA.prepare(
      "UPDATE ghost_uploads SET status = 'deleted', visibility = 'private', updated_at = ? WHERE capsule_id = ?",
    ).bind(now, capsuleId).run();
    ctx.waitUntil(env.GHOST_CAPSULES.delete(row.object_key));
    return json({ capsuleId, status: "deleted", localRetentionUnaffected: true });
  }
  const body = await boundedJson(request);
  if (!isRecord(body)) throw new TypeError("mutation body must be an object");
  if (action === "visibility") {
    const visibility = body.visibility;
    if (visibility !== "private" && visibility !== "unlisted" && visibility !== "public") throw new TypeError("invalid visibility");
    await env.GHOST_METADATA.prepare(
      "UPDATE ghost_uploads SET visibility = ?, updated_at = ? WHERE capsule_id = ?",
    ).bind(visibility, now, capsuleId).run();
    return json({ capsuleId, visibility });
  }
  if (action === "consent") {
    if (typeof body.trainingConsent !== "boolean") throw new TypeError("invalid consent");
    await env.GHOST_METADATA.prepare(
      "UPDATE ghost_uploads SET training_consent = ?, updated_at = ? WHERE capsule_id = ?",
    ).bind(body.trainingConsent ? 1 : 0, now, capsuleId).run();
    return json({ capsuleId, trainingConsent: body.trainingConsent });
  }
  return json({ error: "not found" }, 404);
}

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (request.method === "POST" && url.pathname === "/v1/uploads") return begin(request, env);
  if (request.method === "GET" && url.pathname === "/v1/capsules") return listMetadata(request, env);
  if (parts[0] !== "v1" || (parts[1] !== "uploads" && parts[1] !== "capsules") || parts[2] === undefined) {
    return json({ error: "not found" }, 404);
  }
  const capsuleId = parts[2];
  if (request.method === "PUT" && parts[1] === "uploads" && parts[3] === "parts" && parts[4] !== undefined) {
    return uploadPart(request, env, capsuleId, Number(parts[4]));
  }
  if (request.method === "POST" && parts[1] === "uploads" && parts[3] === "complete") {
    return complete(request, env, capsuleId);
  }
  if (request.method === "GET" && parts[1] === "capsules" && parts[3] === "object") {
    return download(request, env, capsuleId);
  }
  if (request.method === "DELETE" && parts[1] === "capsules") return mutate(request, env, capsuleId, "delete", ctx);
  if (request.method === "PATCH" && parts[1] === "capsules" && parts[3] !== undefined) {
    return mutate(request, env, capsuleId, parts[3], ctx);
  }
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const response = await route(request, env, ctx);
      console.log(JSON.stringify({ message: "ghost publication request", method: request.method, path: new URL(request.url).pathname, status: response.status }));
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(JSON.stringify({ message: "ghost publication failure", error: message, path: new URL(request.url).pathname }));
      const status = error instanceof RangeError || error instanceof TypeError ? 400 : 409;
      return json({ error: message }, status);
    }
  },
} satisfies ExportedHandler<Env>;
