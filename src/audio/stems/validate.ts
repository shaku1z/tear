import type { CueValidationResult, StemCueManifest, Tier } from "./types";

const TIERS: readonly Tier[] = [0, 1, 2, 3, 4];

function isFrame(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

/** Validate an untrusted stem-cue manifest before it reaches the runtime. */
export function validateStemCue(value: unknown): CueValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== "object")
    return { valid: false, errors: ["Cue must be an object."] };
  const cue = value as Partial<StemCueManifest>;

  if (cue.format !== "tear-score-stem-cue") errors.push("Unsupported cue format.");
  if (cue.version !== 1) errors.push("Unsupported cue version.");
  if (!cue.id?.trim()) errors.push("id is required.");
  if (!cue.name?.trim()) errors.push("name is required.");
  if (!Number.isFinite(cue.tempo) || (cue.tempo as number) <= 0)
    errors.push("tempo must be positive.");
  if (!Number.isInteger(cue.sourceSampleRate) || (cue.sourceSampleRate as number) <= 0)
    errors.push("sourceSampleRate must be a positive integer.");

  const stemIds = new Set<string>();
  if (!cue.stems?.length) errors.push("At least one stem is required.");
  for (const stem of cue.stems ?? []) {
    if (!stem.id?.trim()) errors.push("A stem is missing an id.");
    else if (stemIds.has(stem.id)) errors.push(`Duplicate stem id: ${stem.id}.`);
    else stemIds.add(stem.id);
    if (stem.channels !== 1 && stem.channels !== 2)
      errors.push(`Stem ${stem.id} must be mono or stereo.`);
    if (!stem.sources?.length)
      errors.push(`Stem ${stem.id} needs at least one codec source.`);
  }

  const loop = cue.loop;
  if (!loop || !isFrame(loop.startFrame) || !isFrame(loop.endFrame))
    errors.push("loop.startFrame and loop.endFrame must be non-negative integer frames.");
  else if (loop.endFrame <= loop.startFrame)
    errors.push("loop.endFrame must be greater than loop.startFrame.");

  for (const region of [cue.intro, cue.outro]) {
    if (!region) continue;
    if (!isFrame(region.startFrame) || !isFrame(region.endFrame) || region.endFrame <= region.startFrame)
      errors.push("intro/outro regions must be valid frame ranges.");
  }
  // The intro must hand off exactly at the loop start so the join is seamless.
  if (cue.intro && loop && cue.intro.endFrame !== loop.startFrame)
    errors.push("intro.endFrame must equal loop.startFrame for a seamless hand-off.");

  if (!cue.grid || !isFrame(cue.grid.downbeatFrame) || !(cue.grid.beatsPerBar > 0) || !(cue.grid.barsPerLoop > 0))
    errors.push("grid must define downbeatFrame, beatsPerBar, and barsPerLoop.");

  for (const tier of TIERS) {
    const mix = cue.tiers?.[tier];
    if (!mix || typeof mix !== "object") {
      errors.push(`tiers[${tier}] is required.`);
      continue;
    }
    for (const stemId of Object.keys(mix))
      if (!stemIds.has(stemId))
        errors.push(`tiers[${tier}] references unknown stem ${stemId}.`);
  }

  if (!cue.provenance?.owner?.trim() || !cue.provenance?.license?.trim())
    errors.push("provenance.owner and provenance.license are required.");

  return { valid: errors.length === 0, errors };
}

export function assertValidStemCue(value: unknown): asserts value is StemCueManifest {
  const result = validateStemCue(value);
  if (!result.valid)
    throw new Error(`Invalid stem cue: ${result.errors.join(" ")}`);
}
