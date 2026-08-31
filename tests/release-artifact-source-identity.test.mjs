import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readSourceIdentitySync, verifyReleaseArtifact, writeReleaseArtifactMetadata } from "../scripts/release-artifact.mjs";

function git(root, ...args) { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim(); }

test("source attribution detects tracked/untracked drift and blocks dirty release certification", async () => {
  const root = mkdtempSync(join(tmpdir(), "tear-build-identity-"));
  try {
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "src.ts"), "export const value = 1;\n");
    writeFileSync(join(root, ".gitignore"), "dist/\n");
    git(root, "init", "-q"); git(root, "config", "user.email", "tear@test.invalid");
    git(root, "config", "user.name", "Tear Test"); git(root, "add", "src.ts", ".gitignore");
    git(root, "commit", "-qm", "fixture");
    writeFileSync(join(root, "dist", "index.html"), "<title>fixture</title>\n");
    const sha = git(root, "rev-parse", "HEAD");
    const clean = readSourceIdentitySync(root);
    const settings = { directory: join(root, "dist"), sourceDirectory: root,
      expectedRepository: "shaku1z/tear", expectedSha: sha, expectedTarget: "standalone" };
    await writeReleaseArtifactMetadata({ directory: settings.directory, sourceDirectory: root,
      repository: settings.expectedRepository, sha, target: "standalone", mode: "standalone" });
    assert.equal((await verifyReleaseArtifact(settings)).metadata.sourceFingerprint, clean.fingerprint);
    writeFileSync(join(root, "src.ts"), "export const value = 2;\n");
    writeFileSync(join(root, "untracked.ts"), "export const extra = true;\n");
    const dirty = readSourceIdentitySync(root);
    assert.equal(dirty.state, "dirty");
    assert.notEqual(dirty.fingerprint, clean.fingerprint);
    await assert.rejects(verifyReleaseArtifact(settings), /source state|source fingerprint|dirty/u);
    const metadata = await writeReleaseArtifactMetadata({ directory: settings.directory, sourceDirectory: root,
      repository: settings.expectedRepository, sha, target: "standalone", mode: "test-standalone" });
    assert.equal(JSON.parse(readFileSync(join(root, "dist", "build-info.json"), "utf8")).sourceFingerprint, metadata.sourceFingerprint);
    await assert.rejects(verifyReleaseArtifact({ ...settings, expectedMode: "standalone", allowDirty: true }), /mode/u);
    await verifyReleaseArtifact({ ...settings, allowDirty: true });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
