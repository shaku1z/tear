const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS } = require("./browser-waits");
const { catalog } = require("../public/audio/music.json");

/**
 * The MUSIC screen in a built game: opened from the main menu's MUSIC row, it lists every
 * catalogued song; PREVIEW on a song plays it (Now playing switches to it) and BACK ends the
 * preview, so the menu music returns. The list is checked again at phone landscape.
 * Screenshots go to TEAR_VISUAL_DIR when it is set.
 */
const TITLES = catalog.works.map((work) => work.title);
const PREVIEWED = catalog.works.find((work) => work.id === "shopkeeper");
assert.ok(PREVIEWED, "the catalog keeps the shopkeeper song this journey previews");

async function capture(page, name) {
  if (!process.env.TEAR_VISUAL_DIR) return;
  fs.mkdirSync(process.env.TEAR_VISUAL_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.TEAR_VISUAL_DIR, `music-screen-${name}.png`) });
}

/** Texts the last drawn frame shows. */
const frameTexts = (page) => page.evaluate(() => window.__TEAR_JOURNEY_FRAME__.texts.map((entry) => entry.text));

/** Starts audio (it waits for a first input) and waits until the menu shows what is playing. */
async function startAudio(page) {
  await page.keyboard.press("Shift");
  await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "running", undefined, {
    timeout: STATE_WAIT_MS,
  });
  await page.waitForFunction(
    () => window.__TEAR_JOURNEY_FRAME__.texts.some((entry) => entry.text === "FILLET"),
    undefined,
    { timeout: STATE_WAIT_MS },
  );
}

/** Opens the MUSIC screen through the main menu's MUSIC row (it shows the playing song's title). */
async function openMusic(page, clickLabel) {
  await clickLabel("FILLET", "music");
  await page.waitForFunction(
    () => window.__TEAR_JOURNEY_FRAME__.texts.some((entry) => entry.text === "Songs"),
    undefined,
    { timeout: STATE_WAIT_MS },
  );
}

/** Scrolls the list from top to bottom and collects every song title it draws. */
async function collectTitles(page, viewport) {
  const seen = new Set();
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  for (let step = 0; step < 24; step += 1) {
    for (const text of await frameTexts(page)) if (TITLES.includes(text)) seen.add(text);
    if (seen.size === TITLES.length) break;
    await page.mouse.wheel(0, viewport.height / 3);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  return seen;
}

const desktop = { width: 1600, height: 900 };
const phone = { width: 800, height: 360 };

withJourney(
  { name: "music screen journey", port: 8188, recordFrames: true, viewport: desktop },
  async ({ page, waitScreen, clickLabel }) => {
    await startAudio(page);
    await openMusic(page, clickLabel);
    await capture(page, "desktop");
    // The preview control on the song's row: the ▶ drawn level with its title.
    const point = await page.evaluate((title) => {
      const texts = window.__TEAR_JOURNEY_FRAME__.texts;
      const row = texts.find((entry) => entry.text === title);
      const control =
        row && texts.find((entry) => entry.text === "▶" && entry.x > row.x && Math.abs(entry.y - row.y) < 30);
      return control ? { x: Math.round(control.x), y: Math.round(control.y - 4) } : null;
    }, PREVIEWED.title);
    assert.ok(point, `${PREVIEWED.title} has a preview control`);
    await page.mouse.click(point.x, point.y);
    // The mini-player shows STOP only once the previewed song is what is sounding (Now playing switched to it).
    await page.waitForFunction(
      () =>
        window.__TEAR_JOURNEY_FRAME__.texts.some((entry) => entry.text === "■  STOP") &&
        window.__TEAR_JOURNEY_FRAME__.texts.some((entry) => entry.text === "■"),
      undefined,
      { timeout: STATE_WAIT_MS },
    );
    await capture(page, "desktop-preview");
    const seen = await collectTitles(page, desktop);
    assert.deepEqual([...seen].sort(), [...TITLES].sort(), "every catalogued song is listed");
    assert.equal(TITLES.length, 14);
    await page.keyboard.press("Escape");
    await waitScreen("menu");
    // Leaving the screen ends the preview: the menu music (Fillet) plays again.
    await page.waitForFunction(
      () => window.__TEAR_JOURNEY_FRAME__.texts.some((entry) => entry.text === "FILLET"),
      undefined,
      { timeout: STATE_WAIT_MS },
    );
  },
)
  .then(() =>
    withJourney(
      {
        name: "music screen journey (phone landscape)",
        port: 8189,
        recordFrames: true,
        viewport: phone,
        deviceScaleFactor: 3,
      },
      async ({ page, waitScreen, clickLabel }) => {
        await startAudio(page);
        await openMusic(page, clickLabel);
        await capture(page, "phone");
        const seen = await collectTitles(page, phone);
        assert.deepEqual([...seen].sort(), [...TITLES].sort(), "every catalogued song is listed at phone size");
        await page.keyboard.press("Escape");
        await waitScreen("menu");
      },
    ),
  )
  .then(() => console.log("browser music screen journey passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
