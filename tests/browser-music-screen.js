const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS } = require("./browser-waits");
const { catalog } = require("../public/audio/music.json");

/**
 * The MUSIC screen in a built game: opened from the main menu's MUSIC row, it starts on Home.
 * A stage opens its own page; PLAY previews its first song (STOP appears once it is what is
 * sounding) and the transport's ▶▶ steps to the stage's next song. BACK goes up to Home, Songs
 * lists every catalogued song, and leaving the screen ends the preview so the menu music
 * returns. The same walk runs again on a touch phone in landscape, where the compact layout shows. Screenshots go to
 * TEAR_VISUAL_DIR when it is set. Home and a stage page each wait until the game reports every painting drawn.
 */
const TITLES = catalog.works.map((work) => work.title);
const OPENED = "The Voidspire";
const FIRST = catalog.works.find((work) => work.id === "looking-out");
const NEXT = catalog.works.find((work) => work.id === "reflection-of-the-bladeless");
assert.ok(FIRST && NEXT, "the catalog keeps the two Voidspire songs this journey plays");

async function capture(page, name) {
  if (!process.env.TEAR_VISUAL_DIR) return;
  fs.mkdirSync(process.env.TEAR_VISUAL_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.TEAR_VISUAL_DIR, `music-screen-${name}.png`) });
}

/**
 * Waits until the game reports that the last drawn frame showed every cover that has a painting
 * as that painting (none still waiting on its file), so a capture shows them rather than the hue
 * covers they replace. Every painting request must have returned 200.
 */
async function paintingsShown(page) {
  await page.waitForFunction(
    () => {
      const covers = window.__TEAR_CATALOG_DEBUG__.musicCovers.snapshot();
      return covers.paintings > 0 && covers.waiting === 0;
    },
    undefined,
    { timeout: STATE_WAIT_MS },
  );
  const statuses = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => /-(512|768)[^/]*\.webp$/u.test(new URL(entry.name).pathname))
      .map((entry) => entry.responseStatus || 200),
  );
  assert.ok(statuses.length > 0, "the covers fetched their paintings");
  assert.ok(
    statuses.every((status) => status === 200),
    `every cover painting loads (${statuses.join(", ")})`,
  );
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

/** Waits until the last frame draws `text`. */
const waitText = (page, text) =>
  page
    .waitForFunction((value) => window.__TEAR_JOURNEY_FRAME__.texts.some((entry) => entry.text === value), text, {
      timeout: STATE_WAIT_MS,
    })
    .catch(async (error) => {
      // Name what the frame did show, so a failure says where the screen was.
      const shown = await frameTexts(page);
      throw new Error(`${text} never drawn; the frame shows: ${shown.slice(0, 40).join(" | ")}`, { cause: error });
    });

/** Opens the MUSIC screen through the main menu's MUSIC row (it shows the playing song's title); it starts on Home. */
async function openMusic(page, clickLabel) {
  await clickLabel("FILLET", "music");
  await page.waitForFunction(
    () => window.__TEAR_JOURNEY_FRAME__.texts.some((entry) => entry.text === "Stages"),
    undefined,
    { timeout: STATE_WAIT_MS },
  );
}

/** Scrolls the list from top to bottom and collects every song title it draws. */
async function collectTitles(page, viewport) {
  const seen = new Set();
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  for (let step = 0; step < 60; step += 1) {
    for (const text of await frameTexts(page)) if (TITLES.includes(text)) seen.add(text);
    if (seen.size === TITLES.length) break;
    await page.mouse.wheel(0, viewport.height / 3);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  return seen;
}

const desktop = { width: 1600, height: 900 };
const phone = { width: 800, height: 360 };
// `--desktop` (the required check) or `--touch` (the phone walk, parked while mobile is paused,
// plans/MOBILE_LATER.md; `pnpm check:mobile`); both by default.
const args = process.argv.slice(2);
const wantDesktop = args.includes("--desktop") || !args.includes("--touch");
const wantTouch = args.includes("--touch") || !args.includes("--desktop");

(wantDesktop ? withJourney : async () => undefined)(
  { name: "music screen journey", recordFrames: true, viewport: desktop },
  async ({ page, waitScreen, clickLabel }) => {
    await startAudio(page);
    await openMusic(page, clickLabel);
    await paintingsShown(page);
    await capture(page, "desktop-home");
    // A stage opens its page: PLAY previews its first song, then ▶▶ steps to its boss song.
    await clickLabel(OPENED, "music");
    await waitText(page, "STAGE");
    await paintingsShown(page);
    await capture(page, "desktop-stage");
    await clickLabel("▶  PLAY", "music");
    await waitText(page, "■  STOP");
    await waitText(page, FIRST.title);
    await clickLabel("▶▶", "music");
    await page.waitForFunction(
      (title) => window.__TEAR_JOURNEY_FRAME__.texts.filter((entry) => entry.text === title).length >= 2,
      NEXT.title,
      { timeout: STATE_WAIT_MS },
    );
    await capture(page, "desktop-playing");
    // BACK goes up one level, to Home; Songs lists the whole soundtrack.
    await page.keyboard.press("Escape");
    await waitText(page, "Stages");
    await clickLabel("Songs", "music");
    await waitText(page, "TEAR: BLADE");
    await capture(page, "desktop-songs");
    const seen = await collectTitles(page, desktop);
    assert.deepEqual([...seen].sort(), [...TITLES].sort(), "every catalogued song is listed");
    assert.equal(TITLES.length, 14);
    await clickLabel("Settings", "music");
    await waitText(page, "Soundtrack behavior");
    await capture(page, "desktop-settings");
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
    (wantTouch ? withJourney : async () => undefined)(
      {
        name: "music screen journey (phone landscape)",
        recordFrames: true,
        viewport: phone,
        deviceScaleFactor: 3,
        touch: true,
      },
      async ({ page, waitScreen, clickLabel }) => {
        await startAudio(page);
        await openMusic(page, clickLabel);
        await paintingsShown(page);
        await capture(page, "phone-home");
        await clickLabel(OPENED, "music");
        await waitText(page, "STAGE");
        await paintingsShown(page);
        await capture(page, "phone-stage");
        await clickLabel("▶  PLAY", "music");
        await waitText(page, "■  STOP");
        await clickLabel("▶▶", "music");
        await page.waitForFunction(
          (title) => window.__TEAR_JOURNEY_FRAME__.texts.filter((entry) => entry.text === title).length >= 2,
          NEXT.title,
          { timeout: STATE_WAIT_MS },
        );
        await capture(page, "phone-playing");
        await page.keyboard.press("Escape");
        await waitText(page, "Stages");
        await clickLabel("Songs", "music");
        await waitText(page, "TEAR: BLADE");
        await capture(page, "phone-songs");
        const seen = await collectTitles(page, phone);
        await capture(page, "phone-songs-end");
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
