const assert = require("node:assert/strict");
const rules = require("../config/stage-readability.json");
const { STATE_WAIT_MS } = require("./browser-waits");

/**
 * Measures the stage the page is showing against config/stage-readability.json.
 * It reads the test build's rest frame (the stage as the world draws it with no
 * actors and no interface) at time 0 and at each of `motion.times`, so the
 * stage's own motion is judged too. For each moment it returns the share of
 * each zone where the stage's ink reaches the contrast, and how much of the
 * motion zone differs from time 0.
 */
async function measureStageReadability(page) {
  await page.waitForFunction(() => window.__TEAR_STAGE_REST_FRAME__?.() !== undefined, undefined, {
    timeout: STATE_WAIT_MS,
  });
  return page.evaluate(({ contrast, zones, motion }) => {
    const linear = (value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (red, green, blue) => 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
    const motionZone = zones.find((zone) => zone.id === motion.zone);
    let rest;
    let stage;
    const moments = [0, ...motion.times].map((timeSeconds) => {
      const frame = window.__TEAR_STAGE_REST_FRAME__(timeSeconds);
      const { width, height } = frame.canvas;
      const pixels = frame.canvas.getContext("2d").getImageData(0, 0, width, height).data;
      const hex = (at) => Number.parseInt(frame.ink.slice(at, at + 2), 16);
      const ink = luminance(hex(1), hex(3), hex(5));
      stage ??= { stageId: frame.stageId, ink: frame.ink, width, height };
      rest ??= pixels;
      const shares = {};
      for (const zone of zones) {
        const [left, top, zoneWidth, zoneHeight] = zone.rect;
        let readable = 0;
        for (let y = top; y < top + zoneHeight; y += 1) {
          for (let x = left; x < left + zoneWidth; x += 1) {
            const index = (y * width + x) * 4;
            const value = luminance(pixels[index], pixels[index + 1], pixels[index + 2]);
            if ((Math.max(value, ink) + 0.05) / (Math.min(value, ink) + 0.05) >= contrast) readable += 1;
          }
        }
        shares[zone.id] = readable / (zoneWidth * zoneHeight);
      }
      // Change against time 0, in 0..255 steps of the brightest-moving colour channel.
      const [left, top, zoneWidth, zoneHeight] = motionZone.rect;
      let changed = 0;
      let sum = 0;
      for (let y = top; y < top + zoneHeight; y += 1) {
        for (let x = left; x < left + zoneWidth; x += 1) {
          const index = (y * width + x) * 4;
          const change = Math.max(
            Math.abs(pixels[index] - rest[index]),
            Math.abs(pixels[index + 1] - rest[index + 1]),
            Math.abs(pixels[index + 2] - rest[index + 2]),
          );
          if (change >= motion.step) changed += 1;
          sum += change;
        }
      }
      const area = zoneWidth * zoneHeight;
      return { timeSeconds, shares, changedShare: changed / area, meanChange: sum / area };
    });
    return { ...stage, shares: moments[0].shares, moments };
  }, rules);
}

/**
 * Fails when a zone of the shown stage is under its floor at any sampled
 * moment, or when its motion changes more of the motion zone than the ceiling
 * allows. Returns the measurement for the report.
 */
async function assertStageReadable(page, stageId) {
  assert.ok(
    rules.stages.some((entry) => entry.stage === stageId),
    `${stageId} is not listed in config/stage-readability.json`,
  );
  const measured = await measureStageReadability(page);
  assert.equal(measured.stageId, stageId, "the page is showing a different stage");
  const percent = (share) => `${(share * 100).toFixed(1)}%`;
  for (const moment of measured.moments) {
    const at = `at ${String(moment.timeSeconds)} s`;
    for (const zone of rules.zones) {
      const share = moment.shares[zone.id];
      assert.ok(
        share >= zone.floor,
        `${stageId} ${zone.id} ${at}: ink ${measured.ink} reaches ${String(rules.contrast)}:1 on ${percent(share)} of the zone, floor ${percent(zone.floor)}`,
      );
    }
    assert.ok(
      moment.changedShare <= rules.motion.maxChangedShare,
      `${stageId} ${at}: ${percent(moment.changedShare)} of the ${rules.motion.zone} moved by ${String(rules.motion.step)} steps or more, ceiling ${percent(rules.motion.maxChangedShare)}`,
    );
    assert.ok(
      moment.meanChange <= rules.motion.maxMeanChange,
      `${stageId} ${at}: the ${rules.motion.zone} changed by ${moment.meanChange.toFixed(2)} steps on average, ceiling ${String(rules.motion.maxMeanChange)}`,
    );
  }
  return measured;
}

/**
 * For a page with reduced motion on: fails unless every sampled moment is the
 * same picture as time 0, pixel for pixel, and that picture keeps its floors.
 */
async function assertStageStill(page, stageId) {
  const measured = await assertStageReadable(page, stageId);
  for (const moment of measured.moments) {
    assert.equal(
      moment.meanChange,
      0,
      `${stageId} moved at ${String(moment.timeSeconds)} s with reduced motion on (mean change ${String(moment.meanChange)})`,
    );
  }
  return measured;
}

module.exports = { assertStageReadable, assertStageStill, measureStageReadability };
