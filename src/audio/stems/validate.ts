import type { CueValidationResult, StemCueManifest, Tier } from "./types";

const TIERS: readonly Tier[] = [0, 1, 2, 3, 4];

function isFrame(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Validate an untrusted stem-cue manifest before it reaches the runtime. */
export function validateStemCue(value: unknown): CueValidationResult {
  const errors: string[] = [];
  if (!isRecord(value))
    return { valid: false, errors: ["Cue must be an object."] };
  const cue = value;

  if (cue.format !== "tear-score-stem-cue") errors.push("Unsupported cue format.");
  if (cue.version !== 1) errors.push("Unsupported cue version.");
  if (!text(cue.id).trim()) errors.push("id is required.");
  if (!text(cue.name).trim()) errors.push("name is required.");
  if (typeof cue.tempo !== "number" || !Number.isFinite(cue.tempo) || cue.tempo <= 0)
    errors.push("tempo must be positive.");
  if (typeof cue.sourceSampleRate !== "number" || !Number.isInteger(cue.sourceSampleRate) || cue.sourceSampleRate <= 0)
    errors.push("sourceSampleRate must be a positive integer.");

  const stemIds = new Set<string>();
  const stems = Array.isArray(cue.stems) ? cue.stems : [];
  if (stems.length === 0) errors.push("At least one stem is required.");
  for (const candidate of stems) {
    if (!isRecord(candidate)) {
      errors.push("A stem must be an object.");
      continue;
    }
    const stem = candidate;
    const stemId = text(stem.id);
    if (!stemId.trim()) errors.push("A stem is missing an id.");
    else if (stemIds.has(stemId)) errors.push(`Duplicate stem id: ${stemId}.`);
    else stemIds.add(stemId);
    if (stem.channels !== 1 && stem.channels !== 2)
      errors.push(`Stem ${stemId} must be mono or stereo.`);
    if (
      stem.pan !== undefined &&
      (typeof stem.pan !== "number" ||
        !Number.isFinite(stem.pan) ||
        stem.pan < -1 ||
        stem.pan > 1)
    )
      errors.push(`Stem ${stemId} pan must be between -1 and 1.`);
    if (
      stem.seamMode !== undefined &&
      stem.seamMode !== "hard" &&
      stem.seamMode !== "crossfade" &&
      stem.seamMode !== "tail-overlap"
    )
      errors.push(`Stem ${stemId} has an unsupported seam mode.`);
    if (
      stem.crossfadeFrames !== undefined &&
      (!isFrame(stem.crossfadeFrames) || stem.crossfadeFrames === 0)
    )
      errors.push(`Stem ${stemId} crossfadeFrames must be a positive integer.`);
    if (!Array.isArray(stem.sources) || stem.sources.length === 0)
      errors.push(`Stem ${stemId} needs at least one codec source.`);
  }

  const loop = isRecord(cue.loop) ? cue.loop : null;
  if (!loop || !isFrame(loop.startFrame) || !isFrame(loop.endFrame))
    errors.push("loop.startFrame and loop.endFrame must be non-negative integer frames.");
  else if (loop.endFrame <= loop.startFrame)
    errors.push("loop.endFrame must be greater than loop.startFrame.");
  else if (
    loop.crossfadeFrames !== undefined &&
    (!isFrame(loop.crossfadeFrames) ||
      loop.crossfadeFrames === 0 ||
      loop.crossfadeFrames * 2 >= loop.endFrame - loop.startFrame)
  )
    errors.push("loop.crossfadeFrames must be positive and shorter than half the loop.");

  if (loop && isFrame(loop.startFrame) && isFrame(loop.endFrame) && loop.endFrame > loop.startFrame) {
    const loopFrames = loop.endFrame - loop.startFrame;
    for (const candidate of stems) {
      if (!isRecord(candidate)) continue;
      const stem = candidate;
      if (
        stem.crossfadeFrames !== undefined &&
        isFrame(stem.crossfadeFrames) &&
        stem.crossfadeFrames * 2 >= loopFrames
      )
        errors.push(
          `Stem ${text(stem.id)} crossfadeFrames must be shorter than half the loop.`,
        );
    }
  }

  for (const candidate of [cue.intro, cue.outro]) {
    if (candidate === undefined) continue;
    if (!isRecord(candidate)) {
      errors.push("intro/outro regions must be valid frame ranges.");
      continue;
    }
    const region = candidate;
    if (!isFrame(region.startFrame) || !isFrame(region.endFrame) || region.endFrame <= region.startFrame)
      errors.push("intro/outro regions must be valid frame ranges.");
  }
  // The intro must hand off exactly at the loop start so the join is seamless.
  if (isRecord(cue.intro) && loop && cue.intro.endFrame !== loop.startFrame)
    errors.push("intro.endFrame must equal loop.startFrame for a seamless hand-off.");

  const grid = isRecord(cue.grid) ? cue.grid : null;
  if (!grid || !isFrame(grid.downbeatFrame)
    || typeof grid.beatsPerBar !== "number" || grid.beatsPerBar <= 0
    || typeof grid.barsPerLoop !== "number" || grid.barsPerLoop <= 0)
    errors.push("grid must define downbeatFrame, beatsPerBar, and barsPerLoop.");

  const tiers = isRecord(cue.tiers) ? cue.tiers : null;
  for (const tier of TIERS) {
    const mix = tiers?.[String(tier)];
    if (!isRecord(mix)) {
      errors.push(`tiers[${String(tier)}] is required.`);
      continue;
    }
    for (const stemId of Object.keys(mix))
      if (!stemIds.has(stemId))
        errors.push(`tiers[${String(tier)}] references unknown stem ${stemId}.`);
  }

  const provenance = isRecord(cue.provenance) ? cue.provenance : null;
  if (!provenance || !text(provenance.owner).trim() || !text(provenance.license).trim())
    errors.push("provenance.owner and provenance.license are required.");

  return { valid: errors.length === 0, errors };
}

export function assertValidStemCue(value: unknown): asserts value is StemCueManifest {
  const result = validateStemCue(value);
  if (!result.valid)
    throw new Error(`Invalid stem cue: ${result.errors.join(" ")}`);
}
