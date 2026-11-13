import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { pruneCrazyGamesArtifact, unrequestedCrazyGamesFiles } from "../../scripts/crazygames-artifact-scope.mjs";

async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), "tear-crazygames-scope-"));
  for (const [name, contents] of Object.entries(files)) {
    const path = join(root, ...name.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, typeof contents === "string" ? contents : JSON.stringify(contents));
  }
  return root;
}

const cue = (urls, intro) => ({ stems: urls.map((url) => ({ sources: [{ url }] })), ...(intro ? { bossIntro: { asset: intro } } : {}) });

it("keeps every file a cue, the page or a bundle requests and lists the rest", async () => {
  const root = await fixture({
    "index.html": '<link rel="icon" href="./branding/icons/icon-192.png">',
    "assets/index.js": 'draw("branding/logo.png")',
    "branding/icons/icon-192.png": "a", "branding/icons/icon-512.png": "b", "branding/logo.png": "c",
    "audio/cues/a/cue.json": cue(["opus/rhythm.ogg", "opus/revisions/r2/melody.ogg"], "intro.ogg"),
    "audio/cues/a/intro.ogg": "i", "audio/cues/a/opus/rhythm.ogg": "r",
    "audio/cues/a/opus/melody.ogg": "old", "audio/cues/a/opus/revisions/r2/melody.ogg": "new",
    "audio/cues/a/opus/revisions/r1/melody.ogg": "older", "audio/cues/a/opus/revisions/r2/full-loop.ogg": "loop",
    "audio/stingers/victory.ogg": "s", "audio/catalog.json": {},
  });
  try {
    expect(await unrequestedCrazyGamesFiles(root)).toEqual([
      "audio/cues/a/opus/melody.ogg",
      "audio/cues/a/opus/revisions/r1/melody.ogg",
      "audio/cues/a/opus/revisions/r2/full-loop.ogg",
      "branding/icons/icon-512.png",
    ]);
    const pruned = await pruneCrazyGamesArtifact(root);
    expect(pruned.files).toHaveLength(4);
    expect(pruned.bytes).toBe("old".length + "older".length + "loop".length + 1);
    expect(await unrequestedCrazyGamesFiles(root)).toEqual([]);
    // Emptied revision folders go too.
    expect(await readdir(join(root, "audio/cues/a/opus/revisions"))).toEqual(["r2"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
