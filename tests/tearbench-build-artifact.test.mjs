import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeReleaseArtifactMetadata } from "../scripts/release-artifact.mjs";
import {
  createProviderArtifactReceipt, fanoutContentAddressedBuild, materializeContentAddressedBuild,
  verifyContentAddressedBuild, verifyProviderArtifactReceipt,
} from "../scripts/tearbench-build-artifact.mjs";

function git(root, ...args) { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim(); }

test("one build materializes under an exact content identity and rejects stale bytes or provider bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "tear-content-build-"));
  try {
    const output = join(root, "dist", "test-standalone");
    await mkdir(output, { recursive: true });
    await writeFile(join(root, ".gitignore"), "dist/\nartifacts/\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ packageManager: "pnpm@11.15.0", devDependencies: { vite: "7.1.5" } }));
    await writeFile(join(root, "vite.config.ts"), "export default {};\n");
    await writeFile(join(output, "index.html"), "<title>content build</title>\n");
    git(root, "init", "-q"); git(root, "config", "user.email", "tear@test.invalid"); git(root, "config", "user.name", "Tear Test");
    git(root, "add", ".gitignore", "package.json", "vite.config.ts"); git(root, "commit", "-qm", "fixture");
    const sha = git(root, "rev-parse", "HEAD");
    const metadata = await writeReleaseArtifactMetadata({ directory: output, sourceDirectory: root,
      repository: "shaku1z/tear", sha, target: "standalone", mode: "test-standalone" });
    const first = await materializeContentAddressedBuild({ workspaceRoot: root, directory: output });
    const second = await materializeContentAddressedBuild({ workspaceRoot: root, directory: output });
    assert.equal(first.record.recordDigest, second.record.recordDigest);
    assert.equal(first.record.buildIdentityDigest, metadata.buildIdentityDigest);
    const verified = await verifyContentAddressedBuild({ workspaceRoot: root,
      directory: join(root, first.record.contentAddressedPath), expectedRecord: first.record });
    assert.equal(verified.artifact.hash, metadata.artifactHash);
    await rm(output, { recursive: true, force: true });
    const fanout = await fanoutContentAddressedBuild({ workspaceRoot: root, record: first.record, destination: output });
    assert.equal(fanout.artifactHash, metadata.artifactHash);
    await assert.rejects(fanoutContentAddressedBuild({ workspaceRoot: root, record: first.record,
      destination: join(root, "dist", "wrong") }), /fanout destination/u);
    const provider = createProviderArtifactReceipt({ record: first.record, provider: "github-actions", artifactId: "123",
      artifactDigest: `sha256:${"a".repeat(64)}`, artifactUrl: "https://example.invalid/artifacts/123",
      repository: "shaku1z/tear", runId: "456" });
    assert.equal(provider.buildIdentityDigest, metadata.buildIdentityDigest);
    assert.equal(verifyProviderArtifactReceipt({ receipt: provider, record: first.record, expectedProvider: "github-actions",
      expectedArtifactId: "123", expectedArtifactDigest: `sha256:${"a".repeat(64)}`,
      expectedRepository: "shaku1z/tear", expectedRunId: "456" }).artifactId, "123");
    assert.throws(() => verifyProviderArtifactReceipt({ receipt: provider, record: first.record, expectedProvider: "github-actions",
      expectedArtifactId: "123", expectedArtifactDigest: `sha256:${"b".repeat(64)}`,
      expectedRepository: "shaku1z/tear", expectedRunId: "456" }), /mismatched/u);
    assert.throws(() => createProviderArtifactReceipt({ record: { ...first.record, artifactHash: "f".repeat(64) },
      provider: "github-actions", artifactId: "123", artifactDigest: "bad", artifactUrl: "bad", repository: "shaku1z/tear", runId: "456" }), /exact build record/u);
    await writeFile(join(root, first.record.contentAddressedPath, "index.html"), "altered\n");
    await assert.rejects(verifyContentAddressedBuild({ workspaceRoot: root,
      directory: join(root, first.record.contentAddressedPath), expectedRecord: first.record }), /stored build bytes/u);
    const record = JSON.parse(await readFile(first.recordPath, "utf8"));
    assert.equal(record.recordDigest, first.record.recordDigest);
  } finally { await rm(root, { recursive: true, force: true }); }
});
