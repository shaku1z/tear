import { readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

// Each cue ships one Opus encode per build target (tear-music `profiles`):
// `opus/` is the web encode that cue.json names, and `opus-<target>/` mirrors
// it file for file at that target's bitrate. A build keeps exactly one set:
// its own mirror moved over `opus/` when it has one, every other mirror dropped.

export async function selectAudioProfile(directory, target) {
  const cuesRoot = join(directory, "audio", "cues");
  let swapped = 0;
  let droppedBytes = 0;
  let cues;
  try {
    cues = await readdir(cuesRoot, { withFileTypes: true });
  } catch {
    return Object.freeze({ swapped, droppedBytes });
  }
  for (const cue of cues.filter((entry) => entry.isDirectory())) {
    const cueDirectory = join(cuesRoot, cue.name);
    for (const entry of await readdir(cueDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("opus-")) continue;
      const mirror = join(cueDirectory, entry.name);
      if (entry.name === `opus-${target}`) {
        for (const file of await readdir(mirror)) {
          await rename(join(mirror, file), join(cueDirectory, "opus", file));
          swapped += 1;
        }
      } else {
        for (const file of await readdir(mirror)) droppedBytes += (await stat(join(mirror, file))).size;
      }
      await rm(mirror, { recursive: true, force: true });
    }
  }
  return Object.freeze({ swapped, droppedBytes });
}
