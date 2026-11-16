import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectAudioProfile } from "../../scripts/audio-profile.mjs";

const roots = [];
function buildDirectory() {
  const root = mkdtempSync(join(tmpdir(), "audio-profile-"));
  roots.push(root);
  const cue = join(root, "audio", "cues", "song");
  for (const [dir, tag] of [
    ["opus", "web"],
    ["opus-crazygames", "crazygames"],
  ]) {
    mkdirSync(join(cue, dir), { recursive: true });
    for (const name of ["rhythm.ogg", "melody.ogg"]) writeFileSync(join(cue, dir, name), `${tag}:${name}`);
  }
  writeFileSync(join(cue, "cue.json"), "{}");
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("selectAudioProfile", () => {
  it("swaps in the CrazyGames encode and leaves one set", async () => {
    const root = buildDirectory();
    const result = await selectAudioProfile(root, "crazygames");
    const cue = join(root, "audio", "cues", "song");
    expect(result.swapped).toBe(2);
    expect(readFileSync(join(cue, "opus", "rhythm.ogg"), "utf8")).toBe("crazygames:rhythm.ogg");
    expect(readdirSync(cue).sort()).toEqual(["cue.json", "opus"]);
  });

  it("keeps the web encode for the standalone build and drops the others", async () => {
    const root = buildDirectory();
    const result = await selectAudioProfile(root, "standalone");
    const cue = join(root, "audio", "cues", "song");
    expect(result.swapped).toBe(0);
    expect(result.droppedBytes).toBeGreaterThan(0);
    expect(readFileSync(join(cue, "opus", "melody.ogg"), "utf8")).toBe("web:melody.ogg");
    expect(existsSync(join(cue, "opus-crazygames"))).toBe(false);
  });
});
