import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join, posix } from "node:path";

// The CrazyGames upload is held to a strict unpacked-size budget. Vite copies all of
// public/ into every build, so the CrazyGames output also carried files that game never
// requests: cue audio that no cue manifest names (superseded revisions, full-loop renders,
// stems a cue leaves out) and the standalone PWA's install icons. This module names those
// files from what the build itself references, so nothing a player can hear or see goes.

async function filesBelow(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await filesBelow(join(directory, entry.name), name));
    else if (entry.isFile()) files.push(name);
  }
  return files.sort();
}

/** Audio a cue manifest loads: each stem source and its boss intro. */
function cueReferences(cueName, cue) {
  const base = posix.dirname(cueName);
  const urls = [];
  for (const stem of Array.isArray(cue?.stems) ? cue.stems : []) {
    for (const source of Array.isArray(stem?.sources) ? stem.sources : []) {
      if (typeof source?.url === "string") urls.push(source.url);
    }
  }
  if (typeof cue?.bossIntro?.asset === "string") urls.push(cue.bossIntro.asset);
  return urls.map((url) => posix.normalize(posix.join(base, url.replaceAll("\\", "/"))));
}

/** Files in a CrazyGames build that nothing in that build requests. */
export async function unrequestedCrazyGamesFiles(directory) {
  const files = await filesBelow(directory);
  const requested = new Set();
  const cueNames = files.filter((name) => /^audio\/cues\/[^/]+\/cue\.json$/u.test(name));
  for (const cueName of cueNames) {
    const cue = JSON.parse(await readFile(join(directory, ...cueName.split("/")), "utf8"));
    for (const name of cueReferences(cueName, cue)) requested.add(name);
  }
  const cueDirectories = new Set(cueNames.map((name) => `${posix.dirname(name)}/`));
  const cueAudio = (name) => !name.endsWith(".json")
    && [...cueDirectories].some((cueDirectory) => name.startsWith(cueDirectory));
  // Branding is requested by path from the page or a bundle; the CrazyGames page drops
  // the standalone PWA block, so its install icons are referenced by nothing.
  const text = (await Promise.all(files.filter((name) => name === "index.html" || /^assets\/.+\.(?:js|css)$/u.test(name))
    .map((name) => readFile(join(directory, ...name.split("/")), "utf8")))).join("\n");
  const brandingRequested = (name) => text.includes(name);
  return files.filter((name) => (cueAudio(name) && !requested.has(name))
    || (name.startsWith("branding/") && !brandingRequested(name)));
}

/** Removes unrequested files from a CrazyGames build directory; returns what went. */
export async function pruneCrazyGamesArtifact(directory) {
  const files = await unrequestedCrazyGamesFiles(directory);
  let bytes = 0;
  for (const name of files) {
    const path = join(directory, ...name.split("/"));
    bytes += (await stat(path)).size;
    await rm(path);
  }
  await removeEmptyDirectories(directory);
  return Object.freeze({ files: Object.freeze(files), bytes });
}

async function removeEmptyDirectories(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = join(directory, entry.name);
    await removeEmptyDirectories(child);
    if ((await readdir(child)).length === 0) await rm(child, { recursive: true });
  }
}
