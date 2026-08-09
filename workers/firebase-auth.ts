/**
 * Minimal Firebase ID-token verification for owner-scoped Worker routes.
 *
 * The browser may choose which account to sign in with, but it never chooses
 * the owner identifier used by this Worker.  That value is the verified `sub`
 * claim only.  This intentionally has no Firebase Admin SDK dependency so it
 * remains usable in the Worker runtime and testable with a fake verifier.
 */
export interface FirebaseIdentity {
  readonly uid: string;
}

export interface FirebaseIdTokenVerifier {
  verifyIdToken(token: string): Promise<FirebaseIdentity>;
}

export class FirebaseAuthenticationError extends Error {
  constructor() {
    super("authentication required");
    this.name = "FirebaseAuthenticationError";
  }
}

interface JwtHeader {
  readonly alg: string;
  readonly kid: string;
}

interface JwtClaims {
  readonly aud: string;
  readonly iss: string;
  readonly exp: number;
  readonly sub: string;
}

interface CachedKeys {
  readonly expiresAt: number;
  readonly keys: ReadonlyMap<string, JsonWebKey>;
}

const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const DEFAULT_CACHE_MS = 60 * 60 * 1000;
const MAX_CACHE_MS = 24 * 60 * 60 * 1000;
let cachedKeys: CachedKeys | undefined;

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new FirebaseAuthenticationError();
  const padded = value.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new FirebaseAuthenticationError();
  }
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new FirebaseAuthenticationError();
  }
}

function parseJwt(token: string): Readonly<{ header: JwtHeader; claims: JwtClaims; signed: string; signature: Uint8Array }> {
  const pieces = token.split(".");
  if (pieces.length !== 3 || pieces.some((piece) => piece.length === 0)) throw new FirebaseAuthenticationError();
  const [headerPart, claimsPart, signaturePart] = pieces as [string, string, string];
  const header = parseJson(decodeBase64Url(headerPart)) as JwtHeader;
  const claims = parseJson(decodeBase64Url(claimsPart)) as JwtClaims;
  if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid.length === 0 || header.kid.length > 256) {
    throw new FirebaseAuthenticationError();
  }
  if (typeof claims.aud !== "string" || typeof claims.iss !== "string" || !Number.isFinite(claims.exp)
    || typeof claims.sub !== "string" || claims.sub.length === 0 || claims.sub.length > 128) {
    throw new FirebaseAuthenticationError();
  }
  return Object.freeze({ header, claims, signed: `${headerPart}.${claimsPart}`, signature: decodeBase64Url(signaturePart) });
}

function cacheLifetime(response: Response): number {
  const value = response.headers.get("cache-control")?.match(/max-age=(\d+)/u)?.[1];
  const seconds = value === undefined ? undefined : Number(value);
  return typeof seconds === "number" && Number.isSafeInteger(seconds) && seconds >= 0
    ? Math.min(seconds * 1000, MAX_CACHE_MS) : DEFAULT_CACHE_MS;
}

async function loadKeys(fetcher: typeof fetch): Promise<ReadonlyMap<string, JsonWebKey>> {
  const now = Date.now();
  if (cachedKeys !== undefined && cachedKeys.expiresAt > now) return cachedKeys.keys;
  let response: Response;
  try {
    response = await fetcher(FIREBASE_JWKS_URL, { headers: { accept: "application/json" } });
  } catch {
    throw new FirebaseAuthenticationError();
  }
  if (!response.ok) throw new FirebaseAuthenticationError();
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new FirebaseAuthenticationError();
  }
  if (body === null || typeof body !== "object" || !Array.isArray((body as Readonly<Record<string, unknown>>).keys)) throw new FirebaseAuthenticationError();
  const keysValue = (body as Readonly<Record<string, unknown>>).keys as readonly unknown[];
  const keys = new Map<string, JsonWebKey>();
  for (const candidate of keysValue) {
    if (candidate !== null && typeof candidate === "object") {
      const key = candidate as Readonly<Record<string, unknown>>;
      if (typeof key.kid === "string" && key.kty === "RSA" && typeof key.n === "string" && typeof key.e === "string") {
        keys.set(key.kid, key);
      }
    }
  }
  if (keys.size === 0) throw new FirebaseAuthenticationError();
  cachedKeys = Object.freeze({ expiresAt: now + cacheLifetime(response), keys });
  return keys;
}

export function createFirebaseIdTokenVerifier(options: Readonly<{ projectId: string; fetcher?: typeof fetch; nowSeconds?: () => number }>): FirebaseIdTokenVerifier {
  const projectId = options.projectId;
  if (!/^[a-z][a-z0-9-]{4,62}$/u.test(projectId)) throw new TypeError("invalid Firebase project ID");
  const fetcher = options.fetcher ?? fetch;
  const nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  const issuer = `https://securetoken.google.com/${projectId}`;
  return Object.freeze({
    async verifyIdToken(token: string): Promise<FirebaseIdentity> {
      const jwt = parseJwt(token);
      if (jwt.claims.aud !== projectId || jwt.claims.iss !== issuer || jwt.claims.exp <= nowSeconds()) throw new FirebaseAuthenticationError();
      const key = (await loadKeys(fetcher)).get(jwt.header.kid);
      if (key === undefined) throw new FirebaseAuthenticationError();
      let publicKey: CryptoKey;
      try {
        publicKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
        const signature = Uint8Array.from(jwt.signature);
        const signed = new TextEncoder().encode(jwt.signed);
        const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, signed);
        if (!valid) throw new FirebaseAuthenticationError();
      } catch (error) {
        if (error instanceof FirebaseAuthenticationError) throw error;
        throw new FirebaseAuthenticationError();
      }
      return Object.freeze({ uid: jwt.claims.sub });
    },
  });
}

export async function authenticateFirebaseRequest(request: Request, verifier: FirebaseIdTokenVerifier): Promise<string> {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/u);
  if (match?.[1] === undefined) throw new FirebaseAuthenticationError();
  return (await verifier.verifyIdToken(match[1])).uid;
}
