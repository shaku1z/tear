const assert = require("node:assert/strict");
const rules = require("../config/stage-readability.json");
const { STATE_WAIT_MS } = require("./browser-waits");

/**
 * Measures the stage the page is showing against config/stage-readability.json.
 * It reads the test build's rest frame (the stage as the world draws it with no
 * actors and no interface), waits for the stage's own art to cover the view,
 * and returns the share of each zone where the stage's ink reaches the contrast.
 */
async function measureStageReadability(page) {
  await page.waitForFunction(() => window.__TEAR_STAGE_REST_FRAME__?.() !== undefined, undefined, {
    timeout: STATE_WAIT_MS,
  });
  return page.evaluate(({ contrast, zones }) => {
    const frame = window.__TEAR_STAGE_REST_FRAME__();
    const { width, height } = frame.canvas;
    const pixels = frame.canvas.getContext("2d").getImageData(0, 0, width, height).data;
    const linear = (value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (red, green, blue) => 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
    const hex = (at) => Number.parseInt(frame.ink.slice(at, at + 2), 16);
    const ink = luminance(hex(1), hex(3), hex(5));
    const shares = {};
    for (const zone of zones) {
      const [left, top, zoneWidth, zoneHeight] = zone.rect;
      let readable = 0;
      let total = 0;
      for (let y = top; y < top + zoneHeight; y += 1) {
        for (let x = left; x < left + zoneWidth; x += 1) {
          const index = (y * width + x) * 4;
          const value = luminance(pixels[index], pixels[index + 1], pixels[index + 2]);
          if ((Math.max(value, ink) + 0.05) / (Math.min(value, ink) + 0.05) >= contrast) readable += 1;
          total += 1;
        }
      }
      shares[zone.id] = readable / total;
    }
    return { stageId: frame.stageId, ink: frame.ink, width, height, shares };
  }, rules);
}

/** Fails when a zone of the shown stage is under its floor; returns the measurement for the report. */
async function assertStageReadable(page, stageId) {
  assert.ok(
    rules.stages.some((entry) => entry.stage === stageId),
    `${stageId} is not listed in config/stage-readability.json`,
  );
  const measured = await measureStageReadability(page);
  assert.equal(measured.stageId, stageId, "the page is showing a different stage");
  for (const zone of rules.zones) {
    const share = measured.shares[zone.id];
    assert.ok(
      share >= zone.floor,
      `${stageId} ${zone.id}: ink ${measured.ink} reaches ${String(rules.contrast)}:1 on ${(share * 100).toFixed(1)}% of the zone, floor ${(zone.floor * 100).toFixed(0)}%`,
    );
  }
  return measured;
}

module.exports = { assertStageReadable, measureStageReadability };
