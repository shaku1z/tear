import type { GhostRecordingProfile } from "./truth-kernel";

export interface GhostRecordingCaptureProfile extends GhostRecordingProfile {
  readonly keyframeIntervalTicks: number;
  readonly chunkEntries: number;
  readonly maxPendingWrites: number;
}

export const GHOST_RECORDING_PROFILES = Object.freeze({
  "compact-public": Object.freeze({
    id: "compact-public",
    tracks: Object.freeze({ manifest: "required", commands: "required", rng: "required", events: "preferred", results: "required", keyframes: "optional", presentation: "disabled" }),
    keyframeIntervalTicks: 360, chunkEntries: 128, maxPendingWrites: 2,
  }),
  coaching: Object.freeze({
    id: "coaching",
    tracks: Object.freeze({ manifest: "required", commands: "required", rng: "required", events: "required", results: "required", keyframes: "required", presentation: "optional" }),
    keyframeIntervalTicks: 120, chunkEntries: 96, maxPendingWrites: 3,
  }),
  "forensic-qa": Object.freeze({
    id: "forensic-qa",
    tracks: Object.freeze({ manifest: "required", commands: "required", rng: "required", events: "required", results: "required", keyframes: "required", presentation: "required" }),
    keyframeIntervalTicks: 60, chunkEntries: 48, maxPendingWrites: 4,
  }),
  cinematic: Object.freeze({
    id: "cinematic",
    tracks: Object.freeze({ manifest: "required", commands: "preferred", rng: "optional", events: "required", results: "required", keyframes: "required", presentation: "required" }),
    keyframeIntervalTicks: 120, chunkEntries: 64, maxPendingWrites: 3,
  }),
} satisfies Readonly<Record<string, GhostRecordingCaptureProfile>>);

export type GhostRecordingProfileId = keyof typeof GHOST_RECORDING_PROFILES;

export function ghostRecordingProfile(id: GhostRecordingProfileId): GhostRecordingCaptureProfile {
  return GHOST_RECORDING_PROFILES[id];
}
