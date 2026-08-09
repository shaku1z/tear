/** Player-safe, bounded outcome of a Theater admission attempt. */
export type GhostTheaterRefusalCategory =
  | "capsule-unavailable"
  | "codec-preflight"
  | "source-verification"
  | "source-invalid";

export interface GhostTheaterOpened { readonly kind: "opened"; readonly root: string; readonly tick: number; }
export interface GhostTheaterRefused {
  readonly kind: "refused";
  readonly category: GhostTheaterRefusalCategory;
  readonly detail: string;
  readonly tick: number;
  readonly root?: string;
}
export type GhostTheaterOpenResult = GhostTheaterOpened | GhostTheaterRefused;

export function refuseGhostTheater(category: GhostTheaterRefusalCategory, root?: string, tick = 0): GhostTheaterRefused {
  const detail: Record<GhostTheaterRefusalCategory, string> = {
    "capsule-unavailable": "The local Ghost capsule is unavailable.",
    "codec-preflight": "The recorded state could not be safely restored.",
    "source-verification": "The Ghost source is not verified for Theater.",
    "source-invalid": "The Ghost source is not valid for Theater.",
  };
  return Object.freeze({ kind: "refused", category, detail: detail[category], tick: Math.max(0, Math.floor(tick)), ...(root === undefined ? {} : { root }) });
}
