/* eslint-disable @typescript-eslint/no-require-imports -- small dependency-free PNG reader for external Class-C screenshots. */
const assert = require("node:assert/strict");
const zlib = require("node:zlib");

const PNG_SIGNATURE = "89504e470d0a1a0a";

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left : aboveDistance <= upperLeftDistance ? above : upperLeft;
}

/** Decodes the non-interlaced 8-bit RGB/RGBA screenshots emitted by Playwright. */
function decodePng(png, capturedAtMs = Date.now()) {
  assert.equal(png.subarray(0, 8).toString("hex"), PNG_SIGNATURE, "Class-C observation must be a PNG screenshot");
  let cursor = 8, width = 0, height = 0, colorType = -1, bitDepth = -1;
  const idat = [];
  while (cursor < png.length) {
    const length = png.readUInt32BE(cursor); cursor += 4;
    const type = png.subarray(cursor, cursor + 4).toString("ascii"); cursor += 4;
    const payload = png.subarray(cursor, cursor + length); cursor += length + 4;
    if (type === "IHDR") {
      width = payload.readUInt32BE(0); height = payload.readUInt32BE(4); bitDepth = payload[8]; colorType = payload[9];
    } else if (type === "IDAT") idat.push(payload);
    else if (type === "IEND") break;
  }
  assert.equal(bitDepth, 8, "Class-C PNG decoder supports only 8-bit screenshots");
  assert.ok(colorType === 2 || colorType === 6, `unsupported Class-C PNG color type ${String(colorType)}`);
  const channels = colorType === 6 ? 4 : 3;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const raw = Buffer.alloc(height * stride);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[source++];
    const row = raw.subarray(y * stride, (y + 1) * stride);
    const prior = y === 0 ? null : raw.subarray((y - 1) * stride, y * stride);
    for (let x = 0; x < stride; x += 1) {
      const value = inflated[source++]; const left = x >= channels ? row[x - channels] : 0; const above = prior?.[x] ?? 0; const upperLeft = x >= channels ? prior?.[x - channels] ?? 0 : 0;
      row[x] = filter === 0 ? value : filter === 1 ? (value + left) & 255 : filter === 2 ? (value + above) & 255
        : filter === 3 ? (value + Math.floor((left + above) / 2)) & 255 : filter === 4 ? (value + paeth(left, above, upperLeft)) & 255 : (() => { throw new Error(`unsupported PNG filter ${String(filter)}`); })();
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba[pixel * 4] = raw[pixel * channels]; rgba[pixel * 4 + 1] = raw[pixel * channels + 1]; rgba[pixel * 4 + 2] = raw[pixel * channels + 2]; rgba[pixel * 4 + 3] = channels === 4 ? raw[pixel * channels + 3] : 255;
  }
  return { width, height, rgba, capturedAtMs };
}

module.exports = { decodePng };
