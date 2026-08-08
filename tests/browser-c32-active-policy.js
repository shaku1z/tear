/* eslint-disable @typescript-eslint/no-require-imports -- Node browser journey. */
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function hash(value) {
  const source = canonical(value); let result = 0xcbf29ce484222325n;
  for (let index = 0; index < source.length; index += 1) {
    result ^= BigInt(source.charCodeAt(index) & 0xff); result = (result * 0x100000001b3n) & 0xffffffffffffffffn;
    result ^= BigInt(source.charCodeAt(index) >>> 8); result = (result * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return result.toString(16).padStart(16, "0");
}
function artifact() {
  const sourceAdapter = { id: "tear-c34-c32-canonical-source-state.v1", schemaVersion: 1, stateSchema: "tear-canonical-gameplay-state.v1", actionSchema: "tear-game-action-command-envelope.v1", selection: "highest-q-then-semantic-action-hash.v1" };
  const sourceAdapterHash = hash(sourceAdapter);
  const protocol = { id: "tear-c34-v3-c32-candidate.v1", schemaVersion: 1, sourceAdapter: sourceAdapter.id, sourceAdapterHash, selection: sourceAdapter.selection, evaluation: "completed-passed-online-v3-source-evaluation.v1" };
  const actionVocabulary = [{ type: "move", x: 1000, y: 0 }];
  const modelDraft = { format: "tear-c34-c32-tabular-q-model", schemaVersion: 1, sourceStateAdapter: { id: sourceAdapter.id, adapterHash: sourceAdapterHash }, entries: [] };
  const payload = JSON.stringify({ format: "c34-v3-c32-tabular-q-policy-v1", schemaVersion: 1, protocolHash: hash(protocol), sourceStateAdapter: { id: sourceAdapter.id, adapterHash: sourceAdapterHash }, lineage: { offlinePlanHash: "1111111111111111", offlineTrainingHash: "2222222222222222", onlinePlanHash: "3333333333333333", onlineCheckpointHash: "4444444444444444", onlineEvaluationHash: "5555555555555555", actionVocabularyHash: hash(actionVocabulary) }, actionVocabulary, model: { ...modelDraft, modelHash: hash(modelDraft) } });
  const draft = {
    format: "tear-policy-artifact", schemaVersion: 1, id: "browser-c32-v3", createdAt: "2026-08-08T16:00:00.000Z",
    model: { format: "c34-v3-c32-tabular-q-policy-v1", payload, modelHash: hash(payload) },
    encoder: { id: sourceAdapter.id, schemaVersion: 1, observationClass: "structured-state", normalizationHash: "0123456789abcdef" },
    actionSchema: "tear-game-action-command-envelope.v1", recurrentState: { kind: "none", schemaVersion: 1 },
    trainingManifest: { id: "browser-c32", version: 1, rootHash: "fedcba9876543210" }, rewardVersion: "c34-v3",
    build: { version: "test", revision: "c32-v3", target: "browser", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" },
    metrics: { legalActionRate: 1 }, levelTarget: "class-a", lineage: { trainingRunId: "browser-c32-run" },
    signature: { kind: "local-unsigned", keyId: "browser-test" },
    compatibility: { runtime: "tear-policy-runtime.v1", observationClass: "structured-state", actionSchema: "tear-game-action-command-envelope.v1", modelFormats: ["c34-v3-c32-tabular-q-policy-v1"] },
    extensions: { c34V3C32ProtocolHash: hash(protocol), candidateOnly: true },
  };
  const stored = { ...draft, artifactHash: hash(draft) };
  const activationDraft = { format: "tear-policy-activation", schemaVersion: 1, revision: 1, artifactId: stored.id, artifactHash: stored.artifactHash, activatedAt: "2026-08-08T16:01:00.000Z" };
  return { stored, activation: { ...activationDraft, activationHash: hash(activationDraft) } };
}

withJourney({ name: "C32 canonical V3 active-policy Watch Agent", port: 8162, deferBoot: true }, async ({ page, baseUrl, boot }) => {
  await boot({ test: "1", bossdebug: "1" });
  const records = artifact();
  await page.evaluate(async (input) => new Promise((resolve, reject) => {
    const request = indexedDB.open("tear-ghost-v3", 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const transaction = request.result.transaction(["analysis", "indexes"], "readwrite");
      transaction.objectStore("analysis").put(JSON.stringify(input.stored), "policy-artifact:v1:browser-c32-v3");
      transaction.objectStore("analysis").put(JSON.stringify(input.activation), "policy-active:v1");
      transaction.objectStore("indexes").put(JSON.stringify(input.activation), "policy-activation:v1:000000000001");
      transaction.oncomplete = () => { request.result.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }), records);
  await page.goto(`${baseUrl}/index.html?test=1&bossdebug=1&watchagent=1`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__, undefined, { timeout: 15_000 });
  let snapshot = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.start({ profile: "competent", mode: "campaign", difficulty: "easy", weapon: "sword", seed: 62 }));
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "setup", undefined, { timeout: 10_000 });
  await page.waitForLoadState("networkidle", { timeout: 10_000 });
  for (let index = 0; index < 20 && snapshot.policyReceipt?.source !== "artifact"; index += 1) {
    snapshot = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.run(1));
  }
  assert.equal(snapshot.policyReceipt?.source, "artifact", JSON.stringify(snapshot));
  assert.equal(snapshot.policyReceipt?.artifactId, "browser-c32-v3");
  assert.equal(snapshot.policyReceipt?.activationHash, records.activation.activationHash);
  assert.equal(snapshot.lastTrace?.observationClass, "privileged-diagnostic");
  assert.equal(snapshot.status, "running");
  assert.ok(snapshot.policyDecisionTrace?.id, JSON.stringify(snapshot));
  await page.waitForFunction(() => {
    const trace = window.__TEAR_WATCH_AGENT__.snapshot().policyDecisionTrace;
    return trace && trace.pending === 0 && trace.committed > 0;
  }, undefined, { timeout: 10_000 });
  const journal = await page.evaluate(async (id) => new Promise((resolve, reject) => {
    const request = indexedDB.open("tear-ghost-v3", 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const transaction = request.result.transaction("analysis", "readonly");
      const read = transaction.objectStore("analysis").get(`policy-decision-journal:v1:${id}`);
      read.onerror = () => reject(read.error);
      read.onsuccess = () => { request.result.close(); resolve(read.result === undefined ? undefined : JSON.parse(read.result)); };
    };
  }), snapshot.policyDecisionTrace.id);
  assert.equal(journal.format, "tear-policy-decision-journal");
  assert.equal(journal.entries.at(-1).receipt.source, "artifact");
  assert.equal(journal.entries.at(-1).receipt.artifactId, "browser-c32-v3");
  assert.equal(journal.entries.at(-1).receipt.activationHash, records.activation.activationHash);
  assert.equal(journal.entries.at(-1).actions[0]?.type, "move");
  assert.equal(journal.entries.at(-1).trace.observationClass, "privileged-diagnostic");
});
