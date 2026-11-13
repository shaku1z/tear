import type { SourceVoidState, SourceVoidTransitionState } from "./arena-rules";
import type { VoidPlatform } from "../voidgen-contracts";
import { stableVerificationHash } from "../../replay/hash";

/** Hydrates only aliases from an already captured v6 Source world; never creates a stream or advances it. */
export function rebindBossPracticeSource(candidate: {
  run: { voidScroll?: SourceVoidState | null; voidDescent?: SourceVoidTransitionState | null };
  player: { supportPlatform?: unknown };
  enemies: readonly object[];
  platforms: object[];
}): void {
  const { run, platforms } = candidate,
    transition = run.voidDescent;
  const stream = run.voidScroll ?? transition?.stream;
  if (!stream) return;
  if (transition?.stream && stableVerificationHash(transition.stream) !== stableVerificationHash(stream))
    throw new RangeError("Source practice stream aliases disagree");
  if (stableVerificationHash(stream.platforms) !== stableVerificationHash(platforms))
    throw new RangeError("Source practice platform aliases disagree");
  const identity = (value: object): string => {
    const id: unknown = Reflect.get(value, "platformId");
    if (typeof id !== "string" || id.length === 0)
      throw new RangeError("Source practice platform lacks canonical identity");
    return id;
  };
  const byId = new Map<string, object>();
  for (const platform of platforms) {
    const id = identity(platform);
    if (byId.has(id)) throw new RangeError("Ambiguous Source practice platform identity");
    byId.set(id, platform);
  }
  const resolve = (platform: VoidPlatform, historical = false): VoidPlatform => {
    const match = byId.get(identity(platform));
    if (!match) {
      if (historical) return platform;
      throw new RangeError("Missing Source practice platform alias");
    }
    if (stableVerificationHash(match) !== stableVerificationHash(platform))
      throw new RangeError("Inconsistent Source practice platform alias");
    return match as VoidPlatform;
  };
  stream.platforms = platforms as VoidPlatform[];
  for (const chunk of stream.chunks) chunk.platforms = chunk.platforms.map((platform) => resolve(platform));
  stream.arrivalQueue = stream.arrivalQueue.map((platform, index) => resolve(platform, index < stream.arrivalIndex));
  stream.ingress = resolve(stream.ingress, true);
  if (transition) transition.stream = stream;
  run.voidScroll = stream;
  if (candidate.player.supportPlatform)
    candidate.player.supportPlatform = resolve(candidate.player.supportPlatform as VoidPlatform);
  for (const actor of candidate.enemies) {
    const platform: unknown = Reflect.get(actor, "campPlat");
    if (platform) Reflect.set(actor, "campPlat", resolve(platform as VoidPlatform));
  }
}
