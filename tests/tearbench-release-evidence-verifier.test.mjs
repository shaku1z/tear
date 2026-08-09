import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { REQUIRED_RELEASE_EVIDENCE_IDS, REQUIRED_RELEASE_MATRIX_IDS, createReleaseCertificate, verifyReleaseEvidenceManifest } from "../scripts/tearbench-release-evidence-verifier.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const head = "a".repeat(40);
const clean = sha("");

function fixture() {
  const root = resolve("tearbench-release-evidence-fixture");
  const files = new Map();
  const add = (path, content) => { files.set(resolve(root, path), content); return { path, sha256: sha(content) }; };
  const manifest = {
    format: "tearbench-release-evidence-manifest", schemaVersion: 1, commit: head, worktreeFingerprint: clean,
    evidence: REQUIRED_RELEASE_EVIDENCE_IDS.map((id) => {
      const artifact = add(`evidence/${id}.json`, id);
      return { id, status: "passed", command: `pnpm ${id}`, timestamp: "2026-01-01T00:00:00.000Z", commit: head, worktreeFingerprint: clean, artifactPath: artifact.path, artifactSha256: artifact.sha256 };
    }),
    coverage: {
      arbitraryStates: [{ id: "wave-99", evidenceId: "deterministic-scenarios" }],
      journeys: [{ id: "normal-adventure-menu-to-menu", evidenceId: "browser-journeys" }],
      matrices: REQUIRED_RELEASE_MATRIX_IDS.map((id) => ({ id, evidenceId: "interaction-matrices" })),
    },
    preservation: { runtimeManifest: add("preservation/runtime.json", "runtime"), corpus: add("preservation/corpus.json", "corpus") },
  };
  return { manifest, runtime: { root, git: async (args) => args[0] === "rev-parse" ? `${head}\n` : "", readFile: async (path) => { if (!files.has(path)) throw new Error("missing"); return files.get(path); } }, files, root };
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
  });

  it("rejects missing named arbitrary-state, journey, and matrix coverage", async () => {
    for (const key of ["arbitraryStates", "journeys", "matrices"]) {
      const { manifest, runtime } = fixture(); manifest.coverage[key] = [];
      assert.equal((await verifyReleaseEvidenceManifest(manifest, runtime)).verified, false);
    }
  });

  it("accepts only a complete clean-HEAD synthetic manifest", async () => {
    const { manifest, runtime } = fixture();
    const result = await verifyReleaseEvidenceManifest(manifest, runtime);
    assert.deepEqual(result.errors, []);
    assert.equal(result.verified, true);
  });

  it("emits only a schema-2 manifest-bound certificate verdict", async () => {
    const { manifest, runtime } = fixture();
    const verification = await verifyReleaseEvidenceManifest(manifest, runtime);
    const certificate = createReleaseCertificate({
      manifestPath: "artifacts/tearbench/generated/release-evidence.json",
      verification,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.deepEqual(certificate, {
      format: "tear-release-certificate",
      schemaVersion: 2,
      status: "certified",
      commit: head,
      evidenceManifest: "artifacts/tearbench/generated/release-evidence.json",
      worktreeFingerprint: clean,
      errors: [],
      generatedAt: "2026-01-01T00:00:00.000Z",
      certificateHash: certificate.certificateHash,
    });
  });
});
