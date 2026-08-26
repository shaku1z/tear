export interface TearSourceIdentity {
  readonly revision: string;
  readonly state: "clean" | "dirty";
  readonly fingerprint: string;
}

export function readSourceIdentitySync(directory: string): TearSourceIdentity;
