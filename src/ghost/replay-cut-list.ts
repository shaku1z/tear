import { stableVerificationHash } from "../domain/hash";
import type { GhostReadCapsule } from "./capsule-reader";
import type { GhostVerifiedProductionReplaySession } from "./production-replay-session";

export type ReplayClipSpeed = 0.25 | 0.5 | 1 | 2 | 4;

/** One range of a verified replay, in simulation ticks, and its place in the exported video. */
export interface ReplayClip {
  readonly id: string;
  readonly sourceFromTick: number;
  readonly sourceToTick: number;
  readonly outputOrder: number;
  readonly speed: ReplayClipSpeed;
}

/**
 * The clips the replay editor will export, bound to the replay they were cut from. It lives in
 * memory only: nothing stores it and it never changes the saved replay.
 */
export interface ReplayCutList {
  readonly id: string;
  readonly sourceGhostId: string;
  readonly sourceRootHash: string;
  readonly clips: readonly ReplayClip[];
  readonly cutListHash: string;
}

export function createReplayCutList(input: Omit<ReplayCutList, "cutListHash">): ReplayCutList {
  const clips = [...input.clips].sort((left, right) => left.outputOrder - right.outputOrder);
  if (clips.some((clip) => clip.sourceFromTick < 0 || clip.sourceToTick < clip.sourceFromTick))
    throw new TypeError("Clip range is invalid");
  if (new Set(clips.map((clip) => clip.id)).size !== clips.length) throw new TypeError("Clip IDs must be unique");
  const data = {
    id: input.id,
    sourceGhostId: input.sourceGhostId,
    sourceRootHash: input.sourceRootHash,
    clips: Object.freeze(clips.map((clip) => Object.freeze({ ...clip }))),
  };
  return Object.freeze({ ...data, cutListHash: stableVerificationHash(data) });
}

export type ReplayClipAppendResult =
  | Readonly<{ cutList: ReplayCutList; unavailable?: undefined }>
  | Readonly<{ cutList?: undefined; unavailable: string }>;

/**
 * Appends the range from `fromTick` (default: the verified checkpoint before `currentTick`) to
 * `currentTick` of the replay open in the Theater. Both ends must be verified checkpoints of a
 * complete replay that is still the one the session verified.
 */
export function appendTheaterClip(
  prior: ReplayCutList | undefined,
  capsule: GhostReadCapsule,
  session: GhostVerifiedProductionReplaySession,
  currentTick: number,
  fromTick?: number,
  speed: ReplayClipSpeed = 1,
): ReplayClipAppendResult {
  if (capsule.manifest.schemaVersion !== 2 || capsule.manifest.status !== "complete")
    return { unavailable: "Replay Editor requires a complete current V3 capsule." };
  if (capsule.manifest.id !== session.sourceId || capsule.manifest.rootIntegrity !== session.sourceCapsuleRootIntegrity)
    return { unavailable: "Theater source custody no longer matches this verified replay." };
  if (!Number.isSafeInteger(currentTick) || !session.verifiedReceiptTicks.includes(currentTick))
    return { unavailable: "Replay Editor requires the current verified replay checkpoint." };
  const from = fromTick ?? [...session.verifiedReceiptTicks].reverse().find((tick) => tick < currentTick) ?? 0;
  if (!session.verifiedReceiptTicks.includes(from) || from >= currentTick)
    return { unavailable: "Mark an earlier verified IN checkpoint, then seek a later OUT checkpoint." };
  const clips = prior?.sourceGhostId === session.sourceId ? prior.clips : [];
  return {
    cutList: createReplayCutList({
      id: `clip-${session.sourceId}`,
      sourceGhostId: session.sourceId,
      sourceRootHash: session.sourceRootHash,
      clips: [
        ...clips,
        {
          id: `clip-${String(clips.length)}`,
          sourceFromTick: from,
          sourceToTick: currentTick,
          outputOrder: clips.length,
          speed,
        },
      ],
    }),
  };
}
