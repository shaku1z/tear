/**
 * An action-time capability for a future Ghost publication client.
 *
 * This deliberately has no owner identifier, storage, retry queue, or HTTP
 * implementation.  A caller must ask Firebase for a fresh bearer at the
 * point it intends to make an authenticated publication request.
 */
export interface GhostPublicationBearerPort {
  acquireAuthorization(): Promise<Readonly<{ readonly authorization: string }>>;
}

export interface FirebasePublicationAuthUser {
  readonly isAnonymous: boolean;
  getIdToken(): Promise<string>;
}

export interface FirebasePublicationAuth {
  readonly currentUser: FirebasePublicationAuthUser | null;
}

export type GhostPublicationBearerFailure =
  | "firebase-auth-unavailable"
  | "firebase-user-unavailable"
  | "firebase-anonymous-user"
  | "firebase-token-unavailable";

export class GhostPublicationBearerError extends Error {
  readonly code: GhostPublicationBearerFailure;

  constructor(code: GhostPublicationBearerFailure) {
    super(code);
    this.name = "GhostPublicationBearerError";
    this.code = code;
  }
}

/**
 * Bridges the Firebase compat auth surface without keeping a token or a UID.
 * The auth provider is read for every call so a sign-in/sign-out transition
 * between actions cannot reuse a prior user's credentials.
 */
export function createFirebaseGhostPublicationBearerPort(
  getAuth: () => FirebasePublicationAuth | null | undefined,
): GhostPublicationBearerPort {
  return Object.freeze({
    async acquireAuthorization() {
      const auth = getAuth();
      if (!auth) throw new GhostPublicationBearerError("firebase-auth-unavailable");
      const user = auth.currentUser;
      if (!user) throw new GhostPublicationBearerError("firebase-user-unavailable");
      if (user.isAnonymous) throw new GhostPublicationBearerError("firebase-anonymous-user");
      let token: string;
      try {
        token = await user.getIdToken();
      } catch {
        throw new GhostPublicationBearerError("firebase-token-unavailable");
      }
      if (token.trim().length === 0) throw new GhostPublicationBearerError("firebase-token-unavailable");
      return Object.freeze({ authorization: `Bearer ${token}` });
    },
  });
}
