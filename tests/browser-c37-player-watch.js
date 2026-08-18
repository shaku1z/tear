/* eslint-disable @typescript-eslint/no-require-imports -- Node browser journey. */
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");
const startedAt = Date.now();
const mark = (name) => console.log(`c37-watch: ${name} +${Date.now() - startedAt}ms`);
const hardTimeout = setTimeout(() => { console.error(`c37-watch: hard timeout +${Date.now() - startedAt}ms`); process.exit(2); }, 50_000);

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function hash(value) {
  const source = canonical(value); let result = 0xcbf29ce484222325n;
  for (let index = 0; index < source.length; index += 1) { result ^= BigInt(source.charCodeAt(index) & 0xff); result = (result * 0x100000001b3n) & 0xffffffffffffffffn; result ^= BigInt(source.charCodeAt(index) >>> 8); result = (result * 0x100000001b3n) & 0xffffffffffffffffn; }
  return result.toString(16).padStart(16, "0");
}
function records() {
  const sourceAdapter = { id: "tear-c34-c32-canonical-source-state.v1", schemaVersion: 1, stateSchema: "tear-canonical-gameplay-state.v1", actionSchema: "tear-game-action-command-envelope.v1", selection: "highest-q-then-semantic-action-hash.v1" }, sourceAdapterHash = hash(sourceAdapter);
  const protocol = { id: "tear-c34-v3-c32-candidate.v1", schemaVersion: 1, sourceAdapter: sourceAdapter.id, sourceAdapterHash, selection: sourceAdapter.selection, evaluation: "completed-passed-online-v3-source-evaluation.v1" }, actionVocabulary = [{ type: "move", x: 1000, y: 0 }];
  const modelDraft = { format: "tear-c34-c32-tabular-q-model", schemaVersion: 1, sourceStateAdapter: { id: sourceAdapter.id, adapterHash: sourceAdapterHash }, entries: [] };
  const payload = JSON.stringify({ format: "c34-v3-c32-tabular-q-policy-v1", schemaVersion: 1, protocolHash: hash(protocol), sourceStateAdapter: { id: sourceAdapter.id, adapterHash: sourceAdapterHash }, lineage: { offlinePlanHash: "1111111111111111", offlineTrainingHash: "2222222222222222", onlinePlanHash: "3333333333333333", onlineCheckpointHash: "4444444444444444", onlineEvaluationHash: "5555555555555555", actionVocabularyHash: hash(actionVocabulary) }, actionVocabulary, model: { ...modelDraft, modelHash: hash(modelDraft) } });
  const draft = { format: "tear-policy-artifact", schemaVersion: 1, id: "browser-c37-player-watch-v3", createdAt: "2026-08-09T00:00:00.000Z", model: { format: "c34-v3-c32-tabular-q-policy-v1", payload, modelHash: hash(payload) }, encoder: { id: sourceAdapter.id, schemaVersion: 1, observationClass: "structured-state", normalizationHash: "0123456789abcdef" }, actionSchema: "tear-game-action-command-envelope.v1", recurrentState: { kind: "none", schemaVersion: 1 }, trainingManifest: { id: "browser-c37-player-watch", version: 1, rootHash: "fedcba9876543210" }, rewardVersion: "c34-v3", build: { version: "test", revision: "c37-player-watch", target: "browser", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" }, metrics: { legalActionRate: 1 }, levelTarget: "class-a", lineage: { trainingRunId: "browser-c37-player-watch-run" }, signature: { kind: "local-unsigned", keyId: "browser-test" }, compatibility: { runtime: "tear-policy-runtime.v1", observationClass: "structured-state", actionSchema: "tear-game-action-command-envelope.v1", modelFormats: ["c34-v3-c32-tabular-q-policy-v1"] }, extensions: { c34V3C32ProtocolHash: hash(protocol), candidateOnly: true } };
  const stored = { ...draft, artifactHash: hash(draft) }, activationDraft = { format: "tear-policy-activation", schemaVersion: 1, revision: 1, artifactId: stored.id, artifactHash: stored.artifactHash, activatedAt: "2026-08-09T00:01:00.000Z" };
  return { stored, activation: { ...activationDraft, activationHash: hash(activationDraft) } };
}
async function seed(page, input) {
  await page.evaluate(async (value) => new Promise((resolve, reject) => { const request = indexedDB.open("tear-ghost-v3", 2); request.onerror = () => reject(request.error); request.onsuccess = () => { const transaction = request.result.transaction(["analysis", "indexes"], "readwrite"); transaction.objectStore("analysis").put(JSON.stringify(value.stored), `policy-artifact:v1:${value.stored.id}`); transaction.objectStore("analysis").put(JSON.stringify(value.activation), "policy-active:v1"); transaction.objectStore("indexes").put(JSON.stringify(value.activation), "policy-activation:v1:000000000001"); transaction.oncomplete = () => { request.result.close(); resolve(); }; transaction.onerror = () => reject(transaction.error); }; }), input);
}

withJourney({ name: "C37 ordinary Player Watch", port: 8180, deferBoot: true }, async ({ page, baseUrl, boot, waitScreen }) => {
  mark("boot");
  await boot();
  await page.evaluate(() => { const captured = []; const original = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function playerWatchText(value, ...rest) { captured.push(String(value)); if (captured.length > 800) captured.splice(0, 400); return original.call(this, value, ...rest); }; window.__TEAR_C37_PLAYER_WATCH_TEXT__ = captured; });
  await page.mouse.click(780, 757); await waitScreen("ghostlab");
  await page.waitForFunction(() => window.__TEAR_C37_PLAYER_WATCH_TEXT__.includes("No validated canonical V3 policy is available locally."));
  const active = records(); await seed(page, active);
  mark("seeded");
  await page.goto(`${baseUrl}/index.html?test=1&bossdebug=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__PANTHEON_TEST && window.__TEAR_DIAGNOSTICS__?.snapshot().frame.samples > 0);
  mark("rebooted");
  const text = [];
  await page.evaluate(() => { const captured = []; const original = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function playerWatchText(value, ...rest) { captured.push(String(value)); if (captured.length > 800) captured.splice(0, 400); return original.call(this, value, ...rest); }; window.__TEAR_C37_PLAYER_WATCH_TEXT__ = captured; });
  await page.mouse.click(780, 757); await waitScreen("ghostlab");
  mark("lab");
  await page.waitForTimeout(750); mark("post-lab-wait");
  mark("before-text"); const initialText = await page.evaluate(() => window.__TEAR_C37_PLAYER_WATCH_TEXT__); mark("after-text");
  assert.ok(initialText.includes("Canonical V3 policy is available locally."), `seeded ordinary Watch did not validate: ${initialText.slice(-80).join(" | ")}`);
  assert.ok(initialText.includes("START WATCH"), "seeded ordinary Watch did not visibly enable start");
  mark("validated");
  // This is the normal canvas pointer route using the authored logical target,
  // not a test-only action bridge or Watch-agent query host.
  await page.mouse.click(360, 727); mark("start-clicked");
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing", undefined, { timeout: 10_000 });
  await page.waitForTimeout(400);
  await page.keyboard.press("p"); await waitScreen("paused");
  const running = await page.evaluate(() => window.__TEAR_C37_PLAYER_WATCH_TEXT__.filter((line) => line.startsWith("PLAYER WATCH /")).at(-1));
  assert.match(running, /[1-9]\d* DECISIONS/, `ordinary Watch did not advance from the canonical policy: ${running}`);
  await page.mouse.click(220, 447); await page.waitForFunction(() => window.__TEAR_C37_PLAYER_WATCH_TEXT__.includes("RESUME PLAYER WATCH"));
  const paused = await page.evaluate(() => window.__TEAR_C37_PLAYER_WATCH_TEXT__.filter((line) => line.startsWith("PLAYER WATCH /")).at(-1));
  await page.waitForTimeout(300);
  const frozenWatch = await page.evaluate(() => window.__TEAR_C37_PLAYER_WATCH_TEXT__.filter((line) => line.startsWith("PLAYER WATCH /")).at(-1));
  assert.equal(frozenWatch, paused, "paused Watch continued to issue decisions");
  await page.mouse.click(220, 447); await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing");
  await page.waitForTimeout(300); await page.keyboard.press("p"); await waitScreen("paused");
  const resumed = await page.evaluate(() => window.__TEAR_C37_PLAYER_WATCH_TEXT__.filter((line) => line.startsWith("PLAYER WATCH /")).at(-1));
  assert.notEqual(resumed, paused, "resumed Watch did not advance");
  await page.mouse.click(220, 497); await page.waitForTimeout(150);
  await page.mouse.click(220, 233); await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing");
  await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(200); await page.keyboard.up("ArrowLeft");
  assert.ok((await page.evaluate(() => window.__PANTHEON_TEST.state().playerTrace.vx)) < 0,
    "stopped Watch did not restore native physical input authority");
}).then(() => { clearTimeout(hardTimeout); console.log("browser ordinary Player Watch passed"); }).catch((error) => { clearTimeout(hardTimeout); console.error(error); process.exit(1); });
