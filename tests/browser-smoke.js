const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "..", "dist", "standalone");
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const rel = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".html") ? "text/html" : "application/octet-stream");
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(8123, "127.0.0.1", resolve));
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("http://127.0.0.1:8123/")) route.continue();
    else route.abort();
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  await page.goto("http://127.0.0.1:8123/index.html?test=1", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__TEAR_BUILD__ && window.__TEAR_CATALOG_DEBUG__);
  const snapshot = await page.evaluate(() => ({
    weapons: window.__TEAR_CATALOG_DEBUG__.weapons,
    abilities: window.__TEAR_CATALOG_DEBUG__.abilities,
    canvas: { width: document.querySelector("canvas").width, height: document.querySelector("canvas").height },
  }));
  assert.equal(snapshot.weapons.map((weapon) => weapon.id).join(","), "sword,hammer,spear,chainblade,ringblade");
  assert.equal(new Set(snapshot.weapons.map((weapon) => weapon.throwIdentity)).size, 5);
  assert.equal(snapshot.abilities.sort().join(","), "Overrun,Sever,Stormbank");
  assert.ok(snapshot.canvas.width > 0 && snapshot.canvas.height > 0);
  await page.mouse.click(260, 360); // PLAY -> setup/war table (renders all five weapon cards)
  await page.waitForTimeout(500);
  if (process.env.TEAR_SCREENSHOT) await page.screenshot({ path: process.env.TEAR_SCREENSHOT });
  const weaponIds = ["sword", "hammer", "spear", "chainblade", "ringblade"];
  async function pulseThrowUntilLaunched(expectedThrows) {
    let snapshot = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      await page.mouse.click(800, 450, { button: "right" });
      await page.waitForTimeout(80);
      snapshot = await page.evaluate(() => window.TEAR_WEAPON_DEBUG && window.TEAR_WEAPON_DEBUG());
      if (snapshot && snapshot.stats.throws >= expectedThrows) return snapshot;
    }
    return snapshot;
  }
  for (let i = 0; i < weaponIds.length; i++) {
    if (i > 0) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__);
      await page.mouse.click(260, 360);
      await page.waitForTimeout(450);
    }
    await page.mouse.click(1180, 200 + i * 78);
    await page.waitForTimeout(80);
    await page.mouse.click(800, 758);
    await page.waitForTimeout(500);
    const debug = await page.evaluate(() => window.TEAR_WEAPON_DEBUG && window.TEAR_WEAPON_DEBUG());
    assert.equal(debug && debug.weapon, weaponIds[i], `${weaponIds[i]} run starts cleanly`);
    const thrown = await pulseThrowUntilLaunched(1);
    assert.ok(thrown.stats.throws >= 1, `${weaponIds[i]} throw launches through shared input (${JSON.stringify(thrown.blade)})`);
    await page.mouse.click(800, 450, { button: "right" });
    await page.waitForTimeout(180);
    console.log(`${weaponIds[i]} start passed`);
  }
  assert.deepEqual(pageErrors, []);
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log("browser smoke passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
