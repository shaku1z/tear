// Writing `pnpm assets:sheets` output: each picture as SVG and PNG, one true-scale SVG sheet per asset, the
// index (JSON for tools, HTML for people). A run that draws only some scenes keeps the rest from the last run.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const FORMAT = "tear-asset-sheets.v3";
const escapeXml = (text) =>
  String(text).replace(/[&<>"]/gu, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** The last run's index, or null when there is none (or it is from an older format). */
export function loadIndex(out) {
  const file = path.join(out, "index.json");
  if (!existsSync(file)) return null;
  try {
    const index = JSON.parse(readFileSync(file, "utf8"));
    return index.format === FORMAT ? index : null;
  } catch {
    return null;
  }
}

const base = (category, asset, state) => `${category}/${asset}/${state}`;
export const filesOf = (category, asset, state) => ({
  svg: `${base(category, asset, state)}.svg`,
  png: `${base(category, asset, state)}.png`,
  png3x: `${base(category, asset, state)}@3x.png`,
});
const dataUrlBytes = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");

/** The bytes of every file a picture writes, keyed by path. */
export function pictureFiles(picture) {
  const files = filesOf(picture.category, picture.asset, picture.state);
  return new Map([
    [files.svg, Buffer.from(picture.svg, "utf8")],
    [files.png, dataUrlBytes(picture.png["1"])],
    [files.png3x, dataUrlBytes(picture.png["3"])],
  ]);
}

/**
 * Merges this run's pictures into the last run's assets. States of scenes drawn again are replaced; states of
 * scenes no longer in the catalogue are dropped. When two scenes show the same state of an asset (a boss's
 * phase 1 scene reaching phase 2), the scene earlier in the catalogue keeps it, so a full run and a partial run
 * keep the same picture. Returns the merged assets, the pictures kept and the files that are now stale.
 */
export function mergeAssets({ previous, pictures, drawnScenes, sceneOrder, describe }) {
  const assets = new Map();
  const stale = [];
  const rank = (scene) => sceneOrder.get(scene) ?? Number.POSITIVE_INFINITY;
  for (const asset of previous?.assets ?? [])
    for (const state of asset.states) {
      if (drawnScenes.has(state.scene) || !sceneOrder.has(state.scene)) {
        stale.push(...Object.values(state.files));
        continue;
      }
      const entry = assets.get(asset.id) ?? { ...asset, states: [] };
      entry.states.push(state);
      assets.set(asset.id, entry);
    }
  const accepted = [];
  for (const picture of [...pictures].sort((a, b) => rank(a.scene) - rank(b.scene))) {
    const id = picture.asset;
    const entry = assets.get(id) ?? { id, category: picture.category, ...describe(picture), states: [] };
    const held = entry.states.find((state) => state.state === picture.state);
    if (held !== undefined && rank(held.scene) <= rank(picture.scene)) continue;
    entry.states = entry.states.filter((state) => state !== held);
    accepted.push(picture);
    entry.states.push({
      state: picture.state,
      scene: picture.scene,
      tick: picture.tick,
      worldRect: picture.rect,
      ...(picture.facts === undefined ? {} : { facts: picture.facts }),
      ...(picture.approximations.length === 0 ? {} : { svgApproximations: picture.approximations }),
      files: filesOf(picture.category, picture.asset, picture.state),
    });
    assets.set(id, entry);
  }
  const written = new Set(
    accepted.flatMap((picture) => Object.values(filesOf(picture.category, picture.asset, picture.state))),
  );
  return { assets: [...assets.values()], stale: stale.filter((file) => !written.has(file)), accepted };
}

/**
 * One SVG sheet of an asset: every state at true size (one unit per game unit), labelled, no background.
 * Each state's SVG is nested as it is, so the sheet is exactly the pictures.
 */
export function assetSheet(out, asset) {
  const GAP = 28,
    LABEL = 22,
    MAX_WIDTH = 1600;
  let x = GAP,
    y = GAP + 30,
    rowHeight = 0,
    width = 0;
  const parts = [];
  for (const state of asset.states) {
    const svg = readFileSync(path.join(out, state.files.svg), "utf8");
    const w = state.worldRect.w,
      h = state.worldRect.h;
    if (x > GAP && x + w > MAX_WIDTH) {
      x = GAP;
      y += rowHeight + LABEL + GAP;
      rowHeight = 0;
    }
    parts.push(
      svg.replace(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /u, `<svg x="${String(x)}" y="${String(y)}" `),
      `<text x="${String(x)}" y="${String(y + h + 15)}" font-family="monospace" font-size="12" fill="#8c96a8">${escapeXml(state.state)}</text>`,
    );
    x += w + GAP;
    width = Math.max(width, x);
    rowHeight = Math.max(rowHeight, h);
  }
  const height = y + rowHeight + LABEL + GAP;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}" width="${String(width)}" height="${String(height)}">` +
    `<title>${escapeXml(asset.name)}</title>` +
    `<text x="${String(GAP)}" y="${String(GAP + 8)}" font-family="monospace" font-size="16" font-weight="bold" fill="#8c96a8">${escapeXml(asset.name)}  (${escapeXml(asset.id)})</text>` +
    `${parts.join("")}</svg>`
  );
}

export function indexHtml(index) {
  const sections = index.categories
    .map((category) => {
      const blocks = index.assets
        .filter((asset) => asset.category === category.id)
        .map((asset) => {
          const states = asset.states
            .map(
              (state) =>
                `<figure><a href="${state.files.svg}"><img loading="lazy" src="${state.files.svg}" alt=""></a>` +
                `<figcaption>${escapeXml(state.state)}<br><a href="${state.files.svg}">svg</a> ` +
                `<a href="${state.files.png}">png</a> <a href="${state.files.png3x}">png 3x</a></figcaption></figure>`,
            )
            .join("");
          return (
            `<section><h3 id="${asset.id}">${escapeXml(asset.name)} <small>${asset.id} · <a href="${asset.sheet}">sheet</a></small></h3>` +
            `<p>${asset.sources.map(escapeXml).join("<br>")}</p><div class="grid">${states}</div></section>`
          );
        })
        .join("");
      return (
        `<h2 id="${category.id}">${category.id} <small><a href="${category.overview}">overview</a></small></h2>` +
        `<p>${escapeXml(category.about)}</p>${blocks}`
      );
    })
    .join("");
  const notes = index.notes.map((note) => `<li>${escapeXml(note)}</li>`).join("");
  return `<!doctype html><meta charset="utf-8"><title>Tear asset sheets</title>
<style>body{background:#1b2130;color:#e9edf5;font:14px/1.4 system-ui,sans-serif;margin:24px}a{color:#8fd3ff}small{color:#9aa6b8;font-weight:normal}
h2{border-top:1px solid #2a3344;padding-top:16px;margin-top:32px}p{color:#9aa6b8;font:12px/1.4 ui-monospace,monospace}
.grid{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;max-width:320px}img{max-width:320px;max-height:240px;display:block}
figcaption{font:12px/1.4 ui-monospace,monospace;color:#c7d0de}</style>
<h1>Tear asset sheets</h1><p>Commit ${index.commit}${index.dirty ? " (with uncommitted changes)" : ""}. Drawn by the game's own code with <code>pnpm assets:sheets</code>; see docs/ASSET_SHEETS.md.
Every picture is an SVG (vector, any size) and a PNG at 1x and 3x, all with no background. Each asset has a true-scale SVG sheet.</p>
<p>${index.categories.map((category) => `<a href="#${category.id}">${category.id}</a>`).join(" · ")}</p><ul>${notes}</ul>${sections}`;
}

/** Writes files (creating folders) and removes stale ones. */
export function writeFiles(out, files, stale) {
  for (const file of stale) rmSync(path.join(out, file), { force: true });
  for (const [file, bytes] of files) {
    mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
    writeFileSync(path.join(out, file), bytes);
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** RGBA at 8 bits: the colour type that can hold a transparent background (IHDR bytes 24 and 25). */
const isRgbaPng = (bytes) => bytes.subarray(0, 8).equals(PNG_SIGNATURE) && bytes[24] === 8 && bytes[25] === 6;

function folderBytes(folder) {
  return readdirSync(folder, { withFileTypes: true }).reduce((sum, entry) => {
    const full = path.join(folder, entry.name);
    return sum + (entry.isDirectory() ? folderBytes(full) : statSync(full).size);
  }, 0);
}

/**
 * Holds the written pictures to the manifest's budgets: each file within its asset's budget, each PNG in RGBA,
 * and the whole output within the total. Returns the problems and what was measured.
 */
export function checkFiles(out, assets, budgetOf, budget) {
  const problems = [];
  const limits = { svg: "svgBytes", png: "pngBytes", png3x: "png3xBytes" };
  const measured = Object.fromEntries(Object.keys(limits).map((kind) => [kind, { files: 0, bytes: 0, largest: 0 }]));
  for (const asset of assets)
    for (const state of asset.states)
      for (const [kind, file] of Object.entries(state.files)) {
        const bytes = readFileSync(path.join(out, file));
        const tally = measured[kind];
        tally.files += 1;
        tally.bytes += bytes.length;
        tally.largest = Math.max(tally.largest, bytes.length);
        const limit = budgetOf(asset.id)[limits[kind]];
        if (bytes.length > limit) problems.push(`${file} is ${String(bytes.length)} bytes, over its ${String(limit)}`);
        if (kind !== "svg" && !isRgbaPng(bytes)) problems.push(`${file} is not an RGBA PNG`);
      }
  measured.total = folderBytes(out);
  if (measured.total > budget.totalBytes)
    problems.push(`the output is ${String(measured.total)} bytes, over the total of ${String(budget.totalBytes)}`);
  return { problems, measured };
}
