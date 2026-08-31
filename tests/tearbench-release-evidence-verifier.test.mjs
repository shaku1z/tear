import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { REQUIRED_CORRECTION_IDS, REQUIRED_RELEASE_EVIDENCE_IDS, REQUIRED_RELEASE_MATRIX_IDS, createReleaseCertificate,
  releaseCertificateBindsManifest, verifyReleaseEvidenceManifest } from "../scripts/tearbench-release-evidence-verifier.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const clone = (value) => JSON.parse(JSON.stringify(value));
const head = "a".repeat(40);
const clean = sha("");

function fixture() {
  const root = resolve("tearbench-release-evidence-fixture");
  const files = new Map();
  const add = (path, content) => { files.set(resolve(root, path), content); return { path, sha256: sha(content) }; };
  const source = { repository: "shaku1z/tear", revision: head, state: "clean", fingerprint: sha("source"), worktreeFingerprint: clean };
  const evidenceEntry = (id, command) => {
    const artifact = add(`evidence/${id}.json`, id);
    const correctionId = /^tc-([1-9])-focused$/u.exec(id)?.[1];
    const scope = correctionId === undefined ? { kind: "receipt", id } : { kind: "receipt", id, correctionId: `TC-${correctionId}` };
    const receipt = add(`artifacts/tearbench/receipts/${id}.json`, JSON.stringify({
      format: "tearbench-evidence-receipt", schemaVersion: 1, id, command,
      timestamp: "2026-01-01T00:00:00.000Z", commit: head, worktreeFingerprint: clean, source,
      status: "passed", exitCode: 0, stdout: "pass", stderr: "",
      scope,
      subject: { path: artifact.path, sha256: artifact.sha256, size: Buffer.byteLength(id) },
    }));
    return { id, status: "passed", command, timestamp: "2026-01-01T00:00:00.000Z", commit: head,
      worktreeFingerprint: clean, source, scope, artifactPath: artifact.path, artifactSha256: artifact.sha256,
      artifactSize: Buffer.byteLength(id), receiptPath: receipt.path, receiptSha256: receipt.sha256 };
  };
  const manifest = {
    format: "tearbench-release-evidence-manifest", schemaVersion: 1, commit: head, worktreeFingerprint: clean,
    evidence: [
      ...REQUIRED_RELEASE_EVIDENCE_IDS.map((id) => evidenceEntry(id, id === "full-check" ? "pnpm check" : `pnpm ${id}`)),
      ...REQUIRED_CORRECTION_IDS.map((id) => evidenceEntry(`${id.toLowerCase()}-focused`, `pnpm focused:${id.toLowerCase()}`)),
    ],
    coverage: {
      arbitraryStates: [{ id: "wave-99", evidenceId: "deterministic-scenarios" }],
      journeys: [{ id: "normal-adventure-menu-to-menu", evidenceId: "browser-journeys" }],
      matrices: REQUIRED_RELEASE_MATRIX_IDS.map((id) => ({ id, evidenceId: "interaction-matrices" })),
    },
    preservation: { runtimeManifest: add("preservation/runtime.json", "runtime"), corpus: add("preservation/corpus.json", "corpus") },
  };
  const plan = add("plans/TEARBENCH_CURRENT_CORRECTION_PLAN.md", "plan");
  const corrections = REQUIRED_CORRECTION_IDS.map((id) => {
    const report = add(`docs/checkpoints/tearbench-current-corrections/${id}_REPORT.md`, id);
    return { id, status: "complete", reportPath: report.path, reportSha256: report.sha256,
      focusedReceiptIds: [`${id.toLowerCase()}-focused`], postReviewDisposition: "green" };
  });
  manifest.generatedAt = "2026-01-01T00:00:01.000Z";
  manifest.correctionClosure = { format: "tearbench-correction-closure", schemaVersion: 1,
    status: "correction-complete", c40Status: "incomplete", source,
    plan: { path: plan.path, sha256: plan.sha256 }, corrections,
    blockers: [{ id: "c40-remaining", owner: "release", status: "open", reason: "broader C40 requirements remain" }],
    finalFullCheck: { evidenceId: "full-check", receiptSha256: manifest.evidence[0].receiptSha256 } };
  return { manifest, runtime: { root, sourceIdentity: async () => source, git: async (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    realpath: async (path) => path, readFile: async (path) => { if (!files.has(path)) throw new Error("missing"); return files.get(path); } }, files, root };
}

function rewriteReceipt(value, id, mutate) {
  const entry = value.manifest.evidence.find((candidate) => candidate.id === id);
  const path = resolve(value.root, entry.receiptPath);
  const receipt = JSON.parse(value.files.get(path));
  mutate(receipt, entry);
  const contents = JSON.stringify(receipt);
  value.files.set(path, contents);
  entry.receiptSha256 = sha(contents);
  if (id === "full-check") value.manifest.correctionClosure.finalFullCheck.receiptSha256 = entry.receiptSha256;
}

describe("C40 immutable release evidence verifier", () => {
  it("rejects forged flags because no assertion can replace a manifest", async () => {
    const { manifest, runtime } = fixture();
    manifest.evidence[0].status = "failed";
    const result = await verifyReleaseEvidenceManifest(manifest, runtime);
    assert.equal(result.verified, false);
    assert.match(result.errors.join("\n"), /full-check is not passed/);
  });

  it("rejects stale commits and mutated or missing retained artifacts", async () => {
    const stale = fixture(); stale.manifest.commit = "b".repeat(40);
    assert.equal((await verifyReleaseEvidenceManifest(stale.manifest, stale.runtime)).verified, false);
    const mutated = fixture(); mutated.files.set(resolve(mutated.root, "evidence/graveyard.json"), "tampered");
    assert.match((await verifyReleaseEvidenceManifest(mutated.manifest, mutated.runtime)).errors.join("\n"), /artifact hash mismatch/);
    const missing = fixture(); missing.files.delete(resolve(missing.root, "evidence/graveyard.json"));
    assert.match((await verifyReleaseEvidenceManifest(missing.manifest, missing.runtime)).errors.join("\n"), /artifact is missing/);
    const escaped = fixture();
    const escapedPath = resolve(escaped.root, "evidence/graveyard.json");
    escaped.runtime.realpath = async (path) => path === escapedPath ? resolve(escaped.root, "..", "outside.json") : path;
    assert.match((await verifyReleaseEvidenceManifest(escaped.manifest, escaped.runtime)).errors.join("\n"), /graveyard artifact resolves outside the workspace/u);
  });

  it("rejects missing, tampered, failed, and receipt/subject mismatches", async () => {
    const missing = fixture(); delete missing.manifest.evidence[0].receiptPath;
    assert.match((await verifyReleaseEvidenceManifest(missing.manifest, missing.runtime)).errors.join("\n"), /invalid receipt reference/);
    const tampered = fixture(); tampered.files.set(resolve(tampered.root, "artifacts/tearbench/receipts/graveyard.json"), "tampered");
    assert.match((await verifyReleaseEvidenceManifest(tampered.manifest, tampered.runtime)).errors.join("\n"), /receipt hash mismatch/);
    const failed = fixture(); const receiptPath = resolve(failed.root, "artifacts/tearbench/receipts/graveyard.json"); const receipt = JSON.parse(failed.files.get(receiptPath)); receipt.status = "failed"; failed.files.set(receiptPath, JSON.stringify(receipt)); failed.manifest.evidence.find((entry) => entry.id === "graveyard").receiptSha256 = sha(JSON.stringify(receipt));
    assert.match((await verifyReleaseEvidenceManifest(failed.manifest, failed.runtime)).errors.join("\n"), /receipt did not pass/);
    const mismatch = fixture(); const mismatchPath = resolve(mismatch.root, "artifacts/tearbench/receipts/graveyard.json"); const mismatchReceipt = JSON.parse(mismatch.files.get(mismatchPath)); mismatchReceipt.subject.size = 999; mismatch.files.set(mismatchPath, JSON.stringify(mismatchReceipt)); mismatch.manifest.evidence.find((entry) => entry.id === "graveyard").receiptSha256 = sha(JSON.stringify(mismatchReceipt));
    assert.match((await verifyReleaseEvidenceManifest(mismatch.manifest, mismatch.runtime)).errors.join("\n"), /receipt subject does not match manifest/);
    const timestampMismatch = fixture();
    timestampMismatch.manifest.evidence.find((entry) => entry.id === "graveyard").timestamp = "2026-01-01T00:00:00.500Z";
    assert.match((await verifyReleaseEvidenceManifest(timestampMismatch.manifest, timestampMismatch.runtime)).errors.join("\n"), /receipt timestamp mismatch/u);
    const emptyId = fixture();
    emptyId.manifest.evidence.push({ ...emptyId.manifest.evidence.at(-1), id: "" });
    assert.match((await verifyReleaseEvidenceManifest(emptyId.manifest, emptyId.runtime)).errors.join("\n"), /unique non-empty strings/u);
    const historical = fixture();
    const historicalEntry = historical.manifest.evidence.find((entry) => entry.id === "graveyard");
    const currentPath = resolve(historical.root, historicalEntry.receiptPath);
    historicalEntry.receiptPath = "artifacts/tearbench/receipts/history/graveyard-passed-old.json";
    historical.files.set(resolve(historical.root, historicalEntry.receiptPath), historical.files.get(currentPath));
    assert.match((await verifyReleaseEvidenceManifest(historical.manifest, historical.runtime)).errors.join("\n"), /invalid receipt reference/u);
  });

  it("rejects missing named arbitrary-state, journey, and matrix coverage", async () => {
    for (const key of ["arbitraryStates", "journeys", "matrices"]) {
      const { manifest, runtime } = fixture(); manifest.coverage[key] = [];
      assert.equal((await verifyReleaseEvidenceManifest(manifest, runtime)).verified, false);
    }
  });

  it("rejects missing, duplicate, extra, and out-of-order correction IDs", async () => {
    const mutations = [
      (entries) => entries.pop(),
      (entries) => { entries[1] = clone(entries[0]); },
      (entries) => entries.push({ ...clone(entries[0]), id: "TC-10" }),
      (entries) => { [entries[0], entries[1]] = [entries[1], entries[0]]; },
    ];
    for (const mutate of mutations) {
      const value = fixture();
      mutate(value.manifest.correctionClosure.corrections);
      const result = await verifyReleaseEvidenceManifest(value.manifest, value.runtime);
      assert.equal(result.verified, false);
      assert.match(result.errors.join("\n"), /exactly TC-1 through TC-9|exactly ordered/u);
    }
  });

  it("rejects correction plan and report hash drift", async () => {
    const plan = fixture();
    plan.manifest.correctionClosure.plan.sha256 = sha("stale-plan");
    assert.match((await verifyReleaseEvidenceManifest(plan.manifest, plan.runtime)).errors.join("\n"), /plan hash mismatch/u);

    const report = fixture();
    const reportPath = resolve(report.root, report.manifest.correctionClosure.corrections[3].reportPath);
    report.files.set(reportPath, "mutated-report");
    assert.match((await verifyReleaseEvidenceManifest(report.manifest, report.runtime)).errors.join("\n"), /TC-4 report hash mismatch/u);
  });

  it("rejects stale or dirty correction source identity fields", async () => {
    const cases = [
      ["revision", "b".repeat(40)],
      ["state", "dirty"],
      ["fingerprint", sha("stale-source")],
      ["worktreeFingerprint", sha("dirty-tree")],
    ];
    for (const [field, value] of cases) {
      const candidate = fixture();
      candidate.manifest.correctionClosure.source[field] = value;
      const result = await verifyReleaseEvidenceManifest(candidate.manifest, candidate.runtime);
      assert.equal(result.verified, false, field);
      assert.match(result.errors.join("\n"), /source identity/u, field);
    }
    const unavailable = fixture();
    delete unavailable.runtime.sourceIdentity;
    assert.match((await verifyReleaseEvidenceManifest(unavailable.manifest, unavailable.runtime)).errors.join("\n"), /source identity is unavailable/u);
  });

  it("rejects invalid focused correction receipt bindings", async () => {
    for (const focusedReceiptIds of [[], ["missing-focused"], ["full-check"], ["tc-1-focused", "tc-1-focused"]]) {
      const value = fixture();
      value.manifest.correctionClosure.corrections[0].focusedReceiptIds = focusedReceiptIds;
      assert.match((await verifyReleaseEvidenceManifest(value.manifest, value.runtime)).errors.join("\n"), /invalid focused receipt IDs/u);
    }
    const wrongOwner = fixture();
    rewriteReceipt(wrongOwner, "tc-1-focused", (receipt) => { receipt.scope.correctionId = "TC-2"; });
    assert.match((await verifyReleaseEvidenceManifest(wrongOwner.manifest, wrongOwner.runtime)).errors.join("\n"), /correction TC-1 has invalid focused receipt IDs/u);
    const reused = fixture();
    reused.manifest.correctionClosure.corrections[1].focusedReceiptIds = ["tc-1-focused"];
    assert.match((await verifyReleaseEvidenceManifest(reused.manifest, reused.runtime)).errors.join("\n"), /focused receipt tc-1-focused is reused across corrections/u);
  });

  it("rejects source identity changes during verification", async () => {
    const value = fixture();
    let calls = 0;
    value.runtime.sourceIdentity = async () => ++calls === 1 ? value.manifest.correctionClosure.source
      : { ...value.manifest.correctionClosure.source, state: "dirty", fingerprint: sha("changed") };
    assert.match((await verifyReleaseEvidenceManifest(value.manifest, value.runtime)).errors.join("\n"), /source identity changed during release evidence verification/u);
  });

  it("rejects missing, wrong, duplicate, failed, stale, or rebound final full-check evidence", async () => {
    const missing = fixture();
    missing.manifest.evidence = missing.manifest.evidence.filter((entry) => entry.id !== "full-check");
    assert.equal((await verifyReleaseEvidenceManifest(missing.manifest, missing.runtime)).verified, false);

    const wrong = fixture();
    rewriteReceipt(wrong, "full-check", (receipt, entry) => { receipt.command = "pnpm typecheck"; entry.command = receipt.command; });
    assert.match((await verifyReleaseEvidenceManifest(wrong.manifest, wrong.runtime)).errors.join("\n"), /exact pnpm check/u);

    const duplicate = fixture();
    rewriteReceipt(duplicate, "graveyard", (receipt, entry) => { receipt.command = "pnpm check"; entry.command = receipt.command; });
    assert.match((await verifyReleaseEvidenceManifest(duplicate.manifest, duplicate.runtime)).errors.join("\n"), /exactly one final pnpm check/u);

    const failed = fixture();
    rewriteReceipt(failed, "full-check", (receipt, entry) => { receipt.status = "failed"; receipt.exitCode = 1; entry.status = "failed"; });
    assert.match((await verifyReleaseEvidenceManifest(failed.manifest, failed.runtime)).errors.join("\n"), /did not pass|not passed/u);

    const afterManifest = fixture();
    rewriteReceipt(afterManifest, "full-check", (receipt, entry) => { receipt.timestamp = "2026-01-01T00:00:02.000Z"; entry.timestamp = receipt.timestamp; });
    assert.match((await verifyReleaseEvidenceManifest(afterManifest.manifest, afterManifest.runtime)).errors.join("\n"), /precede manifest generation/u);

    const rebound = fixture();
    rebound.manifest.correctionClosure.finalFullCheck.receiptSha256 = sha("another-receipt");
    assert.match((await verifyReleaseEvidenceManifest(rebound.manifest, rebound.runtime)).errors.join("\n"), /receipt binding is invalid/u);
  });

  it("requires blockers only while C40 remains incomplete", async () => {
    const incomplete = fixture();
    incomplete.manifest.correctionClosure.blockers = [];
    assert.match((await verifyReleaseEvidenceManifest(incomplete.manifest, incomplete.runtime)).errors.join("\n"), /must name blockers/u);

    const inconsistent = fixture();
    inconsistent.manifest.correctionClosure.c40Status = "certified";
    assert.match((await verifyReleaseEvidenceManifest(inconsistent.manifest, inconsistent.runtime)).errors.join("\n"), /cannot contain blockers/u);

    const certified = fixture();
    certified.manifest.correctionClosure.c40Status = "certified";
    certified.manifest.correctionClosure.blockers = [];
    assert.equal((await verifyReleaseEvidenceManifest(certified.manifest, certified.runtime)).verified, true);
  });

  it("accepts only a complete clean-HEAD synthetic manifest", async () => {
    const { manifest, runtime } = fixture();
    const result = await verifyReleaseEvidenceManifest(manifest, runtime);
    assert.deepEqual(result.errors, []);
    assert.equal(result.verified, true);
  });

  it("emits only a schema-2 manifest-bound certificate verdict", async () => {
    const { manifest, runtime } = fixture();
    manifest.correctionClosure.c40Status = "certified";
    manifest.correctionClosure.blockers = [];
    const verification = await verifyReleaseEvidenceManifest(manifest, runtime);
    const certificate = createReleaseCertificate({
      manifestPath: "artifacts/tearbench/generated/release-evidence.json",
      manifestSha256: sha(JSON.stringify(manifest)),
      verification,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.deepEqual(certificate, {
      format: "tear-release-certificate",
      schemaVersion: 2,
      status: "certified",
      commit: head,
      evidenceManifest: "artifacts/tearbench/generated/release-evidence.json",
      evidenceManifestSha256: sha(JSON.stringify(manifest)),
      worktreeFingerprint: clean,
      errors: [],
      generatedAt: "2026-01-01T00:00:00.000Z",
      certificateHash: certificate.certificateHash,
    });
    const manifestBytes = JSON.stringify(manifest);
    assert.equal(releaseCertificateBindsManifest(certificate, manifestBytes), true);
    assert.equal(releaseCertificateBindsManifest(certificate, `${manifestBytes}\n`), false);
    assert.equal(releaseCertificateBindsManifest({ ...certificate, evidenceManifestSha256: sha("forged") }, manifestBytes), false);
  });

  it("keeps a valid correction closure non-certifying while C40 blockers remain", async () => {
    const { manifest, runtime } = fixture();
    const verification = await verifyReleaseEvidenceManifest(manifest, runtime);
    assert.equal(verification.verified, true);
    const certificate = createReleaseCertificate({
      manifestPath: "artifacts/tearbench/generated/release-evidence.json",
      manifestSha256: sha(JSON.stringify(manifest)), verification, generatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(certificate.status, "rejected");
    assert.match(certificate.errors.join("\n"), /C40 blocker c40-remaining/u);
  });

  it("preserves named C40 blockers when broader release evidence is absent", async () => {
    const { manifest, runtime } = fixture();
    manifest.evidence = manifest.evidence.filter((entry) => entry.id !== "historical-replays");
    const verification = await verifyReleaseEvidenceManifest(manifest, runtime);
    assert.equal(verification.verified, false);
    const certificate = createReleaseCertificate({
      manifestPath: "artifacts/tearbench/generated/release-evidence.json",
      manifestSha256: sha(JSON.stringify(manifest)), verification, generatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(certificate.status, "rejected");
    assert.match(certificate.errors.join("\n"), /required evidence is missing: historical-replays/u);
    assert.match(certificate.errors.join("\n"), /C40 blocker c40-remaining/u);
  });

  it("cannot certify without an exact manifest-byte hash", async () => {
    const { manifest, runtime } = fixture();
    const verification = await verifyReleaseEvidenceManifest(manifest, runtime);
    const certificate = createReleaseCertificate({
      manifestPath: "<missing>", verification, generatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(certificate.status, "rejected");
    assert.match(certificate.errors.join("\n"), /manifest SHA-256/u);
  });
});
