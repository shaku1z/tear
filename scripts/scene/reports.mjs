// Offline reports for `pnpm scene contrast` and `pnpm scene sheet`. Both work
// from the package files alone (camera at rest: zoom 1, no shake, player at
// the centre), so they run without a browser build.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import sharp from "sharp";
import { coverageReport, inspectPackage, loadContract, REQUIRED_VIEWPORTS } from "./package-files.mjs";

/** Collision rectangles a sheet or contrast report may draw skins into (`--platforms x,y,w,h;...`). */
function parsePlatforms(option) {
  if (typeof option !== "string") return [];
  return option.split(";").map((item) => item.split(",").map(Number));
}

/**
 * Renders the back plane, platforms (as the game draws them) and front plane over a world-space window
 * at rest. Returns an sRGB raw RGBA buffer. `window` = [x, y, w, h] in world px.
 */
export async function composeRest(directory, scene, window, platforms = []) {
  const [wx, wy, ww, wh] = window;
  const layers = [];
  const place = async (file, rect, extra = {}) => {
    const [x, y, w, h] = rect.map((value) => Math.round(value));
    const left = x - wx,
      top = y - wy;
    // Composite only the visible part of the layer.
    const cropLeft = Math.max(0, -left),
      cropTop = Math.max(0, -top);
    const width = Math.min(w - cropLeft, ww - Math.max(0, left)),
      height = Math.min(h - cropTop, wh - Math.max(0, top));
    if (width <= 0 || height <= 0) return;
    const input = await sharp(join(directory, file))
      .resize(w, h, { fit: "fill" })
      .ensureAlpha()
      .extract({ left: cropLeft, top: cropTop, width, height })
      .png()
      .toBuffer();
    layers.push({ input, left: Math.max(0, left), top: Math.max(0, top), ...extra });
  };
  const fileOf = (imageId) => scene.images.find((image) => image.id === imageId)?.file;
  for (const layer of scene.layers.filter((item) => item.plane === "back"))
    await place(fileOf(layer.image), layer.rect);
  // Readability shading, as the renderer draws it at rest.
  const shades = scene.shading
    .map((shade, index) => {
      const [x, y, w, h] = shade.rect;
      const solid =
        shade.kind === "band"
          ? Math.max(0, 1 - shade.feather / h)
          : Math.max(0, 1 - shade.feather / (Math.min(w, h) / 2));
      const stops = `<stop offset="0" stop-color="${shade.color}" stop-opacity="${shade.opacity}"/><stop offset="${solid}" stop-color="${shade.color}" stop-opacity="${shade.opacity}"/><stop offset="1" stop-color="${shade.color}" stop-opacity="0"/>`;
      return shade.kind === "band"
        ? `<linearGradient id="g${index}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient><rect x="${x - wx}" y="${y - wy}" width="${w}" height="${h}" fill="url(#g${index})"/>`
        : `<radialGradient id="g${index}" cx="0.5" cy="0.5" r="0.5">${stops}</radialGradient><ellipse cx="${x + w / 2 - wx}" cy="${y + h / 2 - wy}" rx="${w / 2}" ry="${h / 2}" fill="url(#g${index})"/>`;
    })
    .join("");
  if (shades)
    layers.push({
      input: Buffer.from(`<svg width="${ww}" height="${wh}" xmlns="http://www.w3.org/2000/svg">${shades}</svg>`),
      left: 0,
      top: 0,
    });
  // Platforms are game objects: shadows, then the material's surface strip in each collision rect.
  const binding = scene.platforms;
  const shadows = platforms
    .map(
      ([x, y, w, h], index) =>
        `<linearGradient id="s${index}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${binding.shadow.color}" stop-opacity="${binding.shadow.opacity}"/><stop offset="1" stop-color="${binding.shadow.color}" stop-opacity="0"/></linearGradient><rect x="${x + 6 - wx}" y="${y + h - wy}" width="${Math.max(0, w - 12)}" height="${binding.shadow.length}" fill="url(#s${index})"/>`,
    )
    .join("");
  layers.push({
    input: Buffer.from(`<svg width="${ww}" height="${wh}" xmlns="http://www.w3.org/2000/svg">${shadows}</svg>`),
    left: 0,
    top: 0,
  });
  const texture = scene.images.find((image) => image.id === binding.texture);
  const tileWidth = Math.max(1, Math.round(texture.width * binding.scale)),
    tileHeight = Math.max(1, Math.round(texture.height * binding.scale));
  const tile = await sharp(join(directory, texture.file))
    .resize(tileWidth, tileHeight, { fit: "fill" })
    .ensureAlpha()
    .png()
    .toBuffer();
  const surface = async ([x, y, w, h]) => {
    const [left, top, width, height] = [x - wx, y - wy, w, h].map((value) => Math.round(value));
    const strip = Math.min(height, tileHeight);
    const piece = await sharp(tile).extract({ left: 0, top: 0, width: tileWidth, height: strip }).png().toBuffer();
    const tiles = [];
    for (let tx = Math.floor(x / tileWidth) * tileWidth; tx < x + w; tx += tileWidth)
      tiles.push({ input: piece, left: Math.round(tx - x), top: 0 });
    const body = await sharp({
      create: { width: tileWidth * (tiles.length + 2), height, channels: 4, background: binding.fill },
    })
      .composite(tiles.map((item) => ({ ...item, left: item.left + tileWidth })))
      .png()
      .toBuffer()
      .then((buffer) => sharp(buffer).extract({ left: tileWidth, top: 0, width, height }).png().toBuffer());
    const cropLeft = Math.max(0, -left),
      cropTop = Math.max(0, -top);
    const visibleWidth = Math.min(width - cropLeft, ww - Math.max(0, left)),
      visibleHeight = Math.min(height - cropTop, wh - Math.max(0, top));
    if (visibleWidth <= 0 || visibleHeight <= 0) return;
    const input = await sharp(body)
      .extract({ left: cropLeft, top: cropTop, width: visibleWidth, height: visibleHeight })
      .png()
      .toBuffer();
    layers.push({ input, left: Math.max(0, left), top: Math.max(0, top) });
  };
  await surface([wx, scene.world.groundY, ww, Math.max(1, wy + wh - scene.world.groundY)]);
  for (const rect of platforms) await surface(rect);
  for (const layer of scene.layers.filter((item) => item.plane === "front"))
    await place(fileOf(layer.image), layer.rect);
  return sharp({ create: { width: ww, height: wh, channels: 4, background: scene.edge.color } })
    .composite(layers)
    .raw()
    .toBuffer();
}

const linear = (value) => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};
const luminance = (r, g, b) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const hexLuminance = (hex) =>
  luminance(
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  );
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** The game derives ink from the paper colour (config THEME.set): light ink below 0.5 luminance. */
export function inkForPaper(paper) {
  const red = Number.parseInt(paper.slice(1, 3), 16) / 255,
    green = Number.parseInt(paper.slice(3, 5), 16) / 255,
    blue = Number.parseInt(paper.slice(5, 7), 16) / 255;
  // THEME.set uses the same relative-luminance formula as the HUD.
  const lum = 0.2126 * linear(red * 255) + 0.7152 * linear(green * 255) + 0.0722 * linear(blue * 255);
  return lum < 0.5 ? "#ecebf6" : "#0a0a0a";
}

/**
 * `--with variant.json`: try a variation without rebuilding the images. The
 * file may set `theme`, `shading` and `offset` ([dx, dy] world px applied to
 * every back layer), and is validated like a package.
 */
export async function withVariant(scene, option) {
  if (typeof option !== "string") return scene;
  const variant = JSON.parse(readFileSync(option, "utf8"));
  const [dx, dy] = variant.offset ?? [0, 0];
  const { validateScenePackage } = await loadContract();
  return validateScenePackage({
    ...scene,
    ...(variant.theme ? { theme: variant.theme } : {}),
    ...(variant.shading ? { shading: variant.shading } : {}),
    layers: scene.layers.map((layer) =>
      layer.plane === "back"
        ? { ...layer, rect: [layer.rect[0] + dx, layer.rect[1] + dy, layer.rect[2], layer.rect[3]] }
        : layer,
    ),
  });
}

export async function contrastReport(directory, options) {
  const inspected = await inspectPackage(directory);
  const scene = inspected.scene === undefined ? undefined : await withVariant(inspected.scene, options.with);
  if (scene === undefined) throw new Error("package is invalid; run pnpm scene validate");
  const { width, height, groundY } = scene.world;
  const raster = await composeRest(directory, scene, [0, 0, width, height], parsePlatforms(options.platforms));
  const inks = {
    "theme ink": inkForPaper(scene.theme.paper),
    "dark ink": "#0a0a0a",
    "light ink": "#ecebf6",
    "enemy red": "#d32f35",
    "telegraph gold": "#e4c95a",
    ...(typeof options.ink === "string" ? Object.fromEntries(options.ink.split(",").map((hex) => [hex, hex])) : {}),
  };
  // Where the HUD actually draws at 16:9 (title and stats centred, status top left).
  const zones = {
    "HUD title (600..1000, y < 115)": [600, 0, 400, 115],
    "HUD status (20..460, y < 100)": [20, 0, 440, 100],
    "HUD band (y < 130)": [0, 0, width, 130],
    "play band (130..floor)": [0, 130, width, groundY - 130],
    "upper air (130..450)": [0, 130, width, 320],
    "lower air (450..floor)": [0, 450, width, groundY - 450],
  };
  const results = { paper: scene.theme.paper, ink: inks["theme ink"], zones: {} };
  console.log(`${basename(directory)}: paper ${scene.theme.paper} -> theme ink ${inks["theme ink"]}`);
  for (const [zone, [zx, zy, zw, zh]] of Object.entries(zones)) {
    const values = [];
    for (let y = zy; y < zy + zh; y += 2) {
      for (let x = zx; x < zx + zw; x += 2) {
        const index = (y * width + x) * 4;
        values.push(luminance(raster[index], raster[index + 1], raster[index + 2]));
      }
    }
    values.sort((a, b) => a - b);
    const pick = (q) => values[Math.min(values.length - 1, Math.floor(q * values.length))];
    results.zones[zone] = {};
    const parts = Object.entries(inks).map(([label, hex]) => {
      const ink = hexLuminance(hex);
      const ok3 = values.filter((value) => contrast(value, ink) >= 3).length / values.length;
      results.zones[zone][label] = ok3;
      return `${label} ${hex}: >=3:1 on ${(ok3 * 100).toFixed(0)}%`;
    });
    console.log(
      `  ${zone.padEnd(24)} luminance p10 ${pick(0.1).toFixed(3)} p50 ${pick(0.5).toFixed(3)} p90 ${pick(0.9).toFixed(3)}`,
    );
    console.log(`    ${parts.join(" | ")}`);
  }
  if (typeof options.out === "string") {
    mkdirSync(options.out, { recursive: true });
    const ink = hexLuminance(inks["theme ink"]);
    const map = Buffer.from(raster);
    for (let index = 0; index < width * height; index += 1) {
      const value = luminance(map[index * 4], map[index * 4 + 1], map[index * 4 + 2]);
      if (contrast(value, ink) < 3) {
        map[index * 4] = 255;
        map[index * 4 + 1] = 0;
        map[index * 4 + 2] = 180;
      }
    }
    const file = join(options.out, `${basename(directory)}-contrast-under-3.png`);
    await sharp(map, { raw: { width, height, channels: 4 } })
      .png()
      .toFile(file);
    console.log(`  wrote ${file} (magenta: theme ink below 3:1)`);
  }
  return results;
}

export async function contactSheet(directory, out, options = {}) {
  const inspected = await inspectPackage(directory);
  const scene = inspected.scene === undefined ? undefined : await withVariant(inspected.scene, options.with);
  if (scene === undefined) throw new Error("package is invalid; run pnpm scene validate");
  mkdirSync(out, { recursive: true });
  const name = basename(directory);
  const window = [-480, -280, 2560, 1440];
  const platforms = parsePlatforms(options.platforms);
  const raster = await composeRest(directory, scene, window, platforms);
  const composite = await sharp(raster, { raw: { width: window[2], height: window[3], channels: 4 } })
    .png()
    .toBuffer();
  // Viewport frames at rest, labelled by aspect.
  const { viewportWorldRect } = await loadContract();
  const frames = REQUIRED_VIEWPORTS.map(([label, w, h]) => {
    const [x, y, rw, rh] = viewportWorldRect(scene.world, w, h);
    return `<rect x="${x - window[0]}" y="${y - window[1]}" width="${rw}" height="${rh}" fill="none" stroke="#ff2fb4" stroke-width="3"/><text x="${x - window[0] + 8}" y="${y - window[1] + 26}" fill="#ff2fb4" font-size="22" font-family="monospace">${label}</text>`;
  });
  const arena = `<rect x="${-window[0]}" y="${-window[1]}" width="${scene.world.width}" height="${scene.world.height}" fill="none" stroke="#ffffff" stroke-width="4"/>`;
  const overlay = Buffer.from(
    `<svg width="${window[2]}" height="${window[3]}" xmlns="http://www.w3.org/2000/svg">${frames.join("")}${arena}</svg>`,
  );
  await sharp(composite)
    .composite([{ input: overlay }])
    .png()
    .toFile(join(out, `${name}-composite-viewports.png`));
  await sharp(raster, { raw: { width: window[2], height: window[3], channels: 4 } })
    .extract({ left: -window[0], top: -window[1], width: scene.world.width, height: scene.world.height })
    .png()
    .toFile(join(out, `${name}-arena-rest.png`));
  // Each image alone over a checkerboard, so alpha edges and halos are visible.
  const tiles = [];
  for (const image of scene.images) {
    const scaled = await sharp(join(directory, image.file)).resize(600, 300, { fit: "inside" }).png().toBuffer();
    const meta = await sharp(scaled).metadata();
    const checker = Buffer.from(
      `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="c" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#ff00aa"/><rect width="8" height="8" fill="#00ffd0"/><rect x="8" y="8" width="8" height="8" fill="#00ffd0"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`,
    );
    const tile = await sharp(checker)
      .composite([{ input: scaled }])
      .png()
      .toBuffer();
    tiles.push({
      input: tile,
      label: `${image.file} ${image.width}x${image.height} ${(image.bytes / 1024).toFixed(0)} KiB`,
      ...meta,
    });
  }
  const columns = 3,
    cell = [620, 350];
  const rows = Math.ceil(tiles.length / columns);
  const labels = tiles
    .map(
      (tile, index) =>
        `<text x="${(index % columns) * cell[0] + 10}" y="${Math.floor(index / columns) * cell[1] + 336}" fill="#fff" font-size="16" font-family="monospace">${tile.label}</text>`,
    )
    .join("");
  await sharp({ create: { width: columns * cell[0], height: rows * cell[1], channels: 4, background: "#202020" } })
    .composite([
      ...tiles.map((tile, index) => ({
        input: tile.input,
        left: (index % columns) * cell[0] + 10,
        top: Math.floor(index / columns) * cell[1] + 10,
      })),
      {
        input: Buffer.from(
          `<svg width="${columns * cell[0]}" height="${rows * cell[1]}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`,
        ),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toFile(join(out, `${name}-layers.png`));
  const coverage = await coverageReport(scene);
  writeFileSync(join(out, `${name}-coverage.json`), `${JSON.stringify(coverage, null, 2)}\n`);
  console.log(
    `wrote ${name}-composite-viewports.png, ${name}-arena-rest.png, ${name}-layers.png, ${name}-coverage.json to ${out}`,
  );
}
