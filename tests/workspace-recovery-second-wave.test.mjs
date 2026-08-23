import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_PATH,
  validateWorkspaceRecoverySecondWavePolicy,
  runWorkspaceRecoveryReport,
} from "../scripts/report-workspace-recovery.mjs";
import { runWorkspaceQuarantinePreparation } from "../scripts/prepare-workspace-quarantine.mjs";
import { runWorkspacePreservationQuarantine } from "../scripts/apply-workspace-quarantine.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secondWavePolicySource = DEFAULT_WORKSPACE_RECOVERY_SECOND_WAVE_POLICY_PATH;
const basePolicySource = path.join(repositoryRoot, "preservation", "workspace-recovery-policy.json");
const reporterPath = path.join(repositoryRoot, "scripts", "report-workspace-recovery.mjs");
const now = new Date("2026-08-23T12:00:00.000Z");
const retainUntil = "2027-04-01T00:00:00.000Z";

function git(root, argumentsList) {
  const result = spawnSync("git", argumentsList, { cwd: root, encoding: "utf8", stdio: "pipe" });
  assert.equal(result.status, 0, `git ${argumentsList.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function hashFile(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return hashFile(filePath);
}

function createFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-second-wave-"));
  const workspaceRoot = path.join(base, "workspace");
  const repoRoot = path.join(workspaceRoot, "Tear");
  const archiveRoot = path.join(workspaceRoot, "Tear-archives");
  const archiveGroup = path.join(archiveRoot, "2026-08-23-g5-second-wave");
  const tempRoot = path.join(base, "temp");
  const policyPath = path.join(repoRoot, "preservation", "workspace-recovery-second-wave-sources.json");
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.mkdirSync(archiveGroup, { recursive: true });
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.mkdirSync(path.dirname(policyPath), { recursive: true });
  fs.copyFileSync(basePolicySource, path.join(repoRoot, "preservation", "workspace-recovery-policy.json"));
  fs.copyFileSync(secondWavePolicySource, policyPath);
  fs.writeFileSync(path.join(repoRoot, "README.md"), "canonical second-wave fixture\n", "utf8");
  git(repoRoot, ["init", "-q"]);
  git(repoRoot, ["config", "user.name", "Tear second-wave test"]);
  git(repoRoot, ["config", "user.email", "tear-second-wave@example.test"]);
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-q", "-m", "fixture"]);
  git(repoRoot, ["branch", "-M", "main"]);
  git(repoRoot, ["remote", "add", "origin", "git@github.com:shaku1z/tear.git"]);
  git(repoRoot, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(repoRoot, ["config", "branch.main.remote", "origin"]);
  git(repoRoot, ["config", "branch.main.merge", "refs/heads/main"]);
  const policy = JSON.parse(fs.readFileSync(secondWavePolicySource, "utf8"));
  for (const source of policy.sourceRoots) {
    const parent = source.rootArgument === "workspace-root" ? workspaceRoot : tempRoot;
    fs.mkdirSync(path.join(parent, source.name), { recursive: true });
  }
  return { base, workspaceRoot, repoRoot, archiveRoot, archiveGroup, tempRoot, policyPath, policy };
}

function cleanup(fixture) {
  fs.rmSync(fixture.base, { recursive: true, force: true });
}

function secondWaveEvidence(fixture, partitionId = "second-wave-partition-1") {
  const report = runWorkspaceRecoveryReport({
    repoRoot: fixture.repoRoot,
    workspaceRoot: fixture.workspaceRoot,
    tempRoot: fixture.tempRoot,
    archiveRoot: fixture.archiveRoot,
    owner: "g5-second-wave-owner",
    retainUntil,
    policyPath: fixture.policyPath,
    partition: partitionId,
    now,
  });
  const reportPath = path.join(fixture.archiveGroup, "second-wave-report.json");
  const reportSha256 = writeJson(reportPath, report);
  const destination = path.join(fixture.archiveGroup, "second-wave-payload");
  const manifest = runWorkspaceQuarantinePreparation({
    reportPath,
    reportSha256,
    policyPath: fixture.policyPath,
    repoRoot: fixture.repoRoot,
    owner: "g5-second-wave-owner",
    retainUntil,
    destination,
    now,
  });
  const manifestPath = path.join(fixture.archiveGroup, "second-wave-manifest.json");
  const manifestSha256 = writeJson(manifestPath, manifest);
  return { report, manifest, reportPath, reportSha256, manifestPath, manifestSha256, destination, journalPath: path.join(fixture.archiveGroup, "second-wave-journal") };
}

function applyOptions(fixture, evidence, extra = {}) {
  return {
    reportPath: evidence.reportPath,
    reportSha256: evidence.reportSha256,
    manifestPath: evidence.manifestPath,
    manifestSha256: evidence.manifestSha256,
    policyPath: fixture.policyPath,
    repoRoot: fixture.repoRoot,
    owner: "g5-second-wave-owner",
    retainUntil,
    journalPath: evidence.journalPath,
    apply: true,
    wholeRootPreservation: true,
    acknowledgeNoGoProtectedContent: true,
    now,
    ...extra,
  };
}

test("rejects case-insensitive duplicate second-wave allowlist names", () => {
  const policy = JSON.parse(fs.readFileSync(secondWavePolicySource, "utf8"));
  policy.sourceRoots[1].name = policy.sourceRoots[0].name.toUpperCase();
  assert.match(validateWorkspaceRecoverySecondWavePolicy(policy).join("\n"), /case-insensitive duplicate name/u);
});

test("requires five exhaustive ordinary partitions plus the coordinated deferred dependency group", () => {
  const policy = JSON.parse(fs.readFileSync(secondWavePolicySource, "utf8"));
  assert.equal(validateWorkspaceRecoverySecondWavePolicy(policy).length, 0);
  assert.equal(policy.partitions.length, 5);
  const assigned = new Set(policy.partitions.flatMap((partition) => partition.sourceIds));
  const deferred = new Set(policy.deferredSources.map((source) => source.id));
  assert.equal(assigned.size, 43);
  assert.equal(deferred.size, 2);
  assert.equal(new Set([...assigned, ...deferred]).size, 45);
  assert.deepEqual(policy.dependencyGroup.sourceIds, [...deferred]);
  assert.equal(policy.dependencyGroup.junctionSourceId, "second-wave-tear-budget-architecture");
  assert.equal(policy.dependencyGroup.targetSourceId, "second-wave-tear-tearscore-normalization");
  assert.equal(policy.dependencyGroup.auditedObservedBytes, 34793487);
  assert.equal(policy.partitions.reduce((total, partition) => total + partition.auditedObservedBytes, 0), 5718968788);
  assert.equal(policy.partitionAudit.totalObservedBytes, 5753762275);
  assert.equal(policy.partitionAudit.ordinaryPartitionObservedBytes + policy.partitionAudit.deferredObservedBytes, 5753762275);
  assert.ok(policy.partitions.every((partition) => partition.auditedObservedBytes < 2147483648));
});

test("rejects putting either dependency source into an ordinary partition or breaking its target relationship", () => {
  const policy = JSON.parse(fs.readFileSync(secondWavePolicySource, "utf8"));
  policy.partitions[2].sourceIds.push("second-wave-tear-tearscore-normalization");
  assert.match(validateWorkspaceRecoverySecondWavePolicy(policy).join("\n"), /deferred source cannot be included|partition auditedObservedBytes/u);

  const targetBroken = JSON.parse(fs.readFileSync(secondWavePolicySource, "utf8"));
  targetBroken.dependencyGroup.targetSourceId = "second-wave-tear-score-g2-final-3ff4b72";
  assert.match(validateWorkspaceRecoverySecondWavePolicy(targetBroken).join("\n"), /dependencyGroup.targetSourceId is invalid|dependencyGroup sources/u);
});

test("binds both deferred dependency records to exact sourceRoots names and root arguments", () => {
  const baseline = JSON.parse(fs.readFileSync(secondWavePolicySource, "utf8"));
  assert.deepEqual(baseline.compatibility.partitionBoundary, {
    mode: "explicit-partition-v1-only",
    prePartitionEvidence: "intentionally-invalidated-and-rejected",
    successfulPriorArtifact: false,
    failedAllAtOnceReport: "2GiB-cap-rejection-produced-no-report",
  });
  for (const deferred of baseline.deferredSources) {
    const sourceRootNameMutation = JSON.parse(JSON.stringify(baseline));
    const sourceRootForName = sourceRootNameMutation.sourceRoots.find((source) => source.id === deferred.id);
    sourceRootForName.name = `${sourceRootForName.name}-mismatch`;
    assert.match(validateWorkspaceRecoverySecondWavePolicy(sourceRootNameMutation).join("\n"), /deferred source name must match sourceRoots entry/u);

    const sourceRootArgumentMutation = JSON.parse(JSON.stringify(baseline));
    const sourceRootForArgument = sourceRootArgumentMutation.sourceRoots.find((source) => source.id === deferred.id);
    sourceRootForArgument.rootArgument = sourceRootForArgument.rootArgument === "temp-root" ? "workspace-root" : "temp-root";
    assert.match(validateWorkspaceRecoverySecondWavePolicy(sourceRootArgumentMutation).join("\n"), /deferred source rootArgument must match sourceRoots entry/u);

    const deferredNameMutation = JSON.parse(JSON.stringify(baseline));
    const deferredForName = deferredNameMutation.deferredSources.find((source) => source.id === deferred.id);
    deferredForName.name = `${deferredForName.name}-mismatch`;
    assert.match(validateWorkspaceRecoverySecondWavePolicy(deferredNameMutation).join("\n"), /deferred source name must match sourceRoots entry|deferredSources\[\d+\]\.name must be/u);

    const deferredArgumentMutation = JSON.parse(JSON.stringify(baseline));
    const deferredForArgument = deferredArgumentMutation.deferredSources.find((source) => source.id === deferred.id);
    deferredForArgument.rootArgument = deferredForArgument.rootArgument === "temp-root" ? "workspace-root" : "temp-root";
    assert.match(validateWorkspaceRecoverySecondWavePolicy(deferredArgumentMutation).join("\n"), /deferred source rootArgument must match sourceRoots entry|deferredSources\[\d+\]\.rootArgument must be/u);
  }
});

test("rejects partition omission, unknown IDs, and partition arguments for first-wave policy", () => {
  const fixture = createFixture();
  try {
    const baseOptions = {
      repoRoot: fixture.repoRoot,
      workspaceRoot: fixture.workspaceRoot,
      tempRoot: fixture.tempRoot,
      archiveRoot: fixture.archiveRoot,
      owner: "g5-second-wave-owner",
      retainUntil,
      policyPath: fixture.policyPath,
      now,
    };
    assert.throws(() => runWorkspaceRecoveryReport(baseOptions), /partition is required/u);
    assert.throws(() => runWorkspaceRecoveryReport({ ...baseOptions, partition: "second-wave-partition-unknown" }), /unknown second-wave partition/u);
    assert.throws(() => runWorkspaceRecoveryReport({ ...baseOptions, policyPath: path.join(fixture.repoRoot, "preservation", "workspace-recovery-policy.json"), partition: "second-wave-partition-1" }), /first-wave policy does not accept/u);
  } finally {
    cleanup(fixture);
  }
});

test("selects every partition exactly and never selects either deferred dependency source", () => {
  const fixture = createFixture();
  try {
    const deferredIds = new Set(fixture.policy.deferredSources.map((source) => source.id));
    for (const partition of fixture.policy.partitions) {
      const report = runWorkspaceRecoveryReport({
        repoRoot: fixture.repoRoot,
        workspaceRoot: fixture.workspaceRoot,
        tempRoot: fixture.tempRoot,
        archiveRoot: fixture.archiveRoot,
        owner: "g5-second-wave-owner",
        retainUntil,
        policyPath: fixture.policyPath,
        partition: partition.id,
        now,
      });
      assert.deepEqual(report.inputs.partition.sourceIds, partition.sourceIds);
      assert.equal(report.inputs.partition.auditedObservedBytes, partition.auditedObservedBytes);
      assert.deepEqual(new Set(report.sources.map((source) => source.id)), new Set(partition.sourceIds));
      assert.equal(report.sources.some((source) => deferredIds.has(source.id)), false);
    }
  } finally {
    cleanup(fixture);
  }
});

test("CLI accepts --policy and binds second-wave allowlist provenance without moving sources", () => {
  const fixture = createFixture();
  try {
    const outputPath = path.join(fixture.archiveGroup, "cli-second-wave-report.json");
    const result = spawnSync(process.execPath, [
      reporterPath,
      "--repo-root", fixture.repoRoot,
      "--workspace-root", fixture.workspaceRoot,
      "--temp-root", fixture.tempRoot,
      "--archive-root", fixture.archiveRoot,
      "--owner", "g5-second-wave-cli-owner",
      "--retain-until", retainUntil,
      "--policy", fixture.policyPath,
      "--partition", "second-wave-partition-1",
      "--output", outputPath,
    ], { encoding: "utf8", stdio: "pipe" });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(report.inputs.allowlist.format, "tear-workspace-recovery-second-wave-policy");
    assert.equal(path.resolve(report.inputs.allowlist.path), path.resolve(fixture.policyPath));
    assert.equal(report.inputs.allowlist.sha256, hashFile(fixture.policyPath));
    assert.equal(report.sources.length, 22);
    assert.equal(report.inputs.partition.id, "second-wave-partition-1");
    assert.deepEqual(report.inputs.partition.sourceIds, fixture.policy.partitions[0].sourceIds);
    assert.equal(report.inputs.partition.auditedObservedBytes, 815738355);
    assert.equal(fs.existsSync(path.join(fixture.tempRoot, "tear-score-g2-audit-1611bbb")), true);
    assert.equal(fs.existsSync(path.join(fixture.workspaceRoot, "Tear-cutting-room")), true);
  } finally {
    cleanup(fixture);
  }
});

test("selects exactly the reviewed second-wave directories and propagates root arguments/provenance", () => {
  const fixture = createFixture();
  try {
    const evidence = secondWaveEvidence(fixture);
    const selectedPartition = fixture.policy.partitions[0];
    assert.equal(evidence.report.sources.length, selectedPartition.sourceIds.length);
    assert.deepEqual(new Set(evidence.report.sources.map((source) => source.id)), new Set(selectedPartition.sourceIds));
    assert.ok(evidence.report.sources.every((source) => source.rootArgument === "workspace-root" || source.rootArgument === "temp-root"));
    assert.deepEqual(evidence.report.inputs.rootArguments, {
      "workspace-root": fixture.workspaceRoot,
      "temp-root": fixture.tempRoot,
      "archive-root": fixture.archiveRoot,
    });
    assert.equal(evidence.report.inputs.allowlist.sha256, hashFile(fixture.policyPath));
    assert.equal(evidence.manifest.roots.sourceRoots.length, selectedPartition.sourceIds.length);
    assert.ok(evidence.manifest.roots.sourceRoots.every((source) => source.rootArgument === "workspace-root" || source.rootArgument === "temp-root"));
    assert.equal(evidence.manifest.evidence.allowlist.sha256, hashFile(fixture.policyPath));
    assert.equal(evidence.manifest.roots.partition.id, selectedPartition.id);
    assert.deepEqual(evidence.manifest.roots.partition.sourceIds, selectedPartition.sourceIds);
    assert.equal(evidence.manifest.destination.exists, false);
    assert.equal(fs.existsSync(evidence.destination), false);
  } finally {
    cleanup(fixture);
  }
});

test("rejects canonical and wrong-parent second-wave report substitutions before destination creation", () => {
  const fixture = createFixture();
  try {
    const evidence = secondWaveEvidence(fixture);
    const wrongParent = fixture.policy.sourceRoots.find((source) => source.rootArgument === "temp-root");
    const wrongParentPath = path.join(fixture.workspaceRoot, wrongParent.name);
    fs.mkdirSync(wrongParentPath);
    const wrongReport = JSON.parse(fs.readFileSync(evidence.reportPath, "utf8"));
    const sourceIndex = wrongReport.sources.findIndex((source) => source.name === wrongParent.name);
    wrongReport.sources[sourceIndex].absolutePath = wrongParentPath;
    wrongReport.inputs.candidateRoots[sourceIndex] = wrongParentPath;
    writeJson(evidence.reportPath, wrongReport);
    evidence.reportSha256 = hashFile(evidence.reportPath);
    assert.throws(() => runWorkspaceQuarantinePreparation({
      reportPath: evidence.reportPath,
      reportSha256: evidence.reportSha256,
      policyPath: fixture.policyPath,
      repoRoot: fixture.repoRoot,
      owner: "g5-second-wave-owner",
      retainUntil,
      destination: evidence.destination,
      now,
    }), /exact-name or parent|allowlist/u);
    assert.equal(fs.existsSync(evidence.destination), false);

    const canonicalReport = JSON.parse(fs.readFileSync(path.join(fixture.archiveGroup, "second-wave-report.json"), "utf8"));
    const canonicalIndex = canonicalReport.sources.findIndex((source) => source.name === wrongParent.name);
    canonicalReport.sources[canonicalIndex].name = "Tear";
    canonicalReport.sources[canonicalIndex].id = "second-wave-canonical";
    canonicalReport.sources[canonicalIndex].absolutePath = fixture.repoRoot;
    canonicalReport.inputs.candidateRoots[canonicalIndex] = fixture.repoRoot;
    const canonicalReportPath = path.join(fixture.archiveGroup, "canonical-substitution-report.json");
    const canonicalReportSha256 = writeJson(canonicalReportPath, canonicalReport);
    assert.throws(() => runWorkspaceQuarantinePreparation({
      reportPath: canonicalReportPath,
      reportSha256: canonicalReportSha256,
      policyPath: fixture.policyPath,
      repoRoot: fixture.repoRoot,
      owner: "g5-second-wave-owner",
      retainUntil,
      destination: path.join(fixture.archiveGroup, "canonical-substitution-payload"),
      now,
    }), /allowlist|protected root|exact-name|source set/u);
  } finally {
    cleanup(fixture);
  }
});

test("rejects deferred-source substitution and cross-partition evidence before destination creation", () => {
  const fixture = createFixture();
  try {
    const evidence = secondWaveEvidence(fixture, "second-wave-partition-1");
    for (const [deferredIndex, deferred] of fixture.policy.deferredSources.entries()) {
      const deferredPath = path.join(fixture.tempRoot, deferred.name);
      const deferredReport = JSON.parse(fs.readFileSync(evidence.reportPath, "utf8"));
      const substitutedIndex = 0;
      deferredReport.sources[substitutedIndex] = {
        ...deferredReport.sources[substitutedIndex],
        id: deferred.id,
        name: deferred.name,
        absolutePath: deferredPath,
        rootArgument: deferred.rootArgument,
      };
      deferredReport.inputs.candidateRoots[substitutedIndex] = deferredPath;
      const deferredReportPath = path.join(fixture.archiveGroup, `deferred-substitution-report-${deferredIndex}.json`);
      const deferredReportSha256 = writeJson(deferredReportPath, deferredReport);
      assert.throws(() => runWorkspaceQuarantinePreparation({
        reportPath: deferredReportPath,
        reportSha256: deferredReportSha256,
        policyPath: fixture.policyPath,
        repoRoot: fixture.repoRoot,
        owner: "g5-second-wave-owner",
        retainUntil,
        destination: path.join(fixture.archiveGroup, `deferred-substitution-payload-${deferredIndex}`),
        now,
      }), /partition|source set|allowlist/u);
    }

    const crossReport = JSON.parse(fs.readFileSync(evidence.reportPath, "utf8"));
    crossReport.inputs.partition = {
      ...crossReport.inputs.partition,
      id: "second-wave-partition-2",
      sourceIds: [...fixture.policy.partitions[1].sourceIds],
      auditedObservedBytes: fixture.policy.partitions[1].auditedObservedBytes,
    };
    const crossReportPath = path.join(fixture.archiveGroup, "cross-partition-report.json");
    const crossReportSha256 = writeJson(crossReportPath, crossReport);
    assert.throws(() => runWorkspaceQuarantinePreparation({
      reportPath: crossReportPath,
      reportSha256: crossReportSha256,
      policyPath: fixture.policyPath,
      repoRoot: fixture.repoRoot,
      owner: "g5-second-wave-owner",
      retainUntil,
      destination: path.join(fixture.archiveGroup, "cross-partition-report-payload"),
      now,
    }), /partition|source set/u);

    const crossManifest = JSON.parse(fs.readFileSync(evidence.manifestPath, "utf8"));
    crossManifest.roots.partition = {
      ...crossManifest.roots.partition,
      id: "second-wave-partition-2",
      sourceIds: [...fixture.policy.partitions[1].sourceIds],
      auditedObservedBytes: fixture.policy.partitions[1].auditedObservedBytes,
    };
    const crossManifestPath = path.join(fixture.archiveGroup, "cross-partition-manifest.json");
    const crossManifestSha256 = writeJson(crossManifestPath, crossManifest);
    assert.throws(() => runWorkspacePreservationQuarantine(applyOptions(fixture, {
      ...evidence,
      reportPath: evidence.reportPath,
      reportSha256: evidence.reportSha256,
      manifestPath: crossManifestPath,
      manifestSha256: crossManifestSha256,
      destination: path.join(fixture.archiveGroup, "cross-partition-manifest-payload"),
      journalPath: path.join(fixture.archiveGroup, "cross-partition-manifest-journal"),
    })), /partition provenance|partition|source set/u);
    assert.equal(fs.existsSync(path.join(fixture.archiveGroup, "cross-partition-manifest-payload")), false);
  } finally {
    cleanup(fixture);
  }
});

test("rejects report/manifest root-argument mismatch before destination creation", () => {
  const fixture = createFixture();
  try {
    const evidence = secondWaveEvidence(fixture);
    const manifest = JSON.parse(fs.readFileSync(evidence.manifestPath, "utf8"));
    manifest.roots.sourceRoots[0].rootArgument = manifest.roots.sourceRoots[0].rootArgument === "temp-root" ? "workspace-root" : "temp-root";
    evidence.manifestSha256 = writeJson(evidence.manifestPath, manifest);
    assert.throws(() => runWorkspacePreservationQuarantine(applyOptions(fixture, evidence)), /rootArgument mismatch|allowlist/u);
    assert.equal(fs.existsSync(evidence.destination), false);
  } finally {
    cleanup(fixture);
  }
});

test("preserves the v1 fallback when rootArgument fields are absent", () => {
  const fixture = createFixture();
  try {
    const evidence = secondWaveEvidence(fixture);
    const report = JSON.parse(fs.readFileSync(evidence.reportPath, "utf8"));
    delete report.inputs.rootArguments;
    delete report.inputs.allowlist;
    delete report.inputs.partition;
    report.policySha256 = hashFile(basePolicySource);
    report.sources = report.sources.slice(0, 1).map((source) => ({ ...source, id: "invalid-gsm-worktrees", name: "gsm-v1-fallback", absolutePath: path.join(fixture.workspaceRoot, "gsm-v1-fallback") }));
    delete report.sources[0].rootArgument;
    report.inputs.candidateRoots = [report.sources[0].absolutePath];
    fs.mkdirSync(report.sources[0].absolutePath);
    const reportPath = path.join(fixture.archiveGroup, "v1-fallback-report.json");
    const reportSha256 = writeJson(reportPath, report);
    fs.copyFileSync(basePolicySource, path.join(fixture.repoRoot, "preservation", "workspace-recovery-policy.json"));
    const manifest = runWorkspaceQuarantinePreparation({
      reportPath,
      reportSha256,
      policyPath: path.join(fixture.repoRoot, "preservation", "workspace-recovery-policy.json"),
      repoRoot: fixture.repoRoot,
      owner: "g5-second-wave-owner",
      retainUntil,
      destination: path.join(fixture.archiveGroup, "v1-fallback-payload"),
      now,
    });
    delete manifest.roots.rootArguments;
    delete manifest.roots.sourceRoots[0].rootArgument;
    for (const entry of [...manifest.entries, ...manifest.emptyDirectories]) delete entry.rootArgument;
    const manifestPath = path.join(fixture.archiveGroup, "v1-fallback-manifest.json");
    const manifestSha256 = writeJson(manifestPath, manifest);
    const fallbackEvidence = { reportPath, reportSha256, manifestPath, manifestSha256, destination: path.join(fixture.archiveGroup, "v1-fallback-payload"), journalPath: path.join(fixture.archiveGroup, "v1-fallback-journal") };
    const receipt = runWorkspacePreservationQuarantine({
      ...applyOptions(fixture, fallbackEvidence),
      policyPath: path.join(fixture.repoRoot, "preservation", "workspace-recovery-policy.json"),
      reportPath,
      reportSha256,
      manifestPath,
      manifestSha256,
      destination: fallbackEvidence.destination,
      journalPath: fallbackEvidence.journalPath,
    });
    assert.equal(receipt.status, "complete");
    assert.equal(fs.existsSync(fallbackEvidence.destination), true);
  } finally {
    cleanup(fixture);
  }
});

test("legacy v1 publication-copy entries retain their temp-root during stable comparison", () => {
  const fixture = createFixture();
  try {
    const publication = path.join(fixture.tempRoot, "Tear-main-publication");
    fs.mkdirSync(publication);
    fs.writeFileSync(path.join(publication, "publication.txt"), "legacy publication\n", "utf8");
    const report = runWorkspaceRecoveryReport({
      repoRoot: fixture.repoRoot,
      workspaceRoot: fixture.workspaceRoot,
      tempRoot: fixture.tempRoot,
      archiveRoot: fixture.archiveRoot,
      owner: "g5-second-wave-owner",
      retainUntil,
      policyPath: path.join(fixture.repoRoot, "preservation", "workspace-recovery-policy.json"),
      now,
    });
    assert.equal(report.sources[0].id, "publication-copy");
    delete report.inputs.rootArguments;
    delete report.sources[0].rootArgument;
    const reportPath = path.join(fixture.archiveGroup, "legacy-publication-report.json");
    const reportSha256 = writeJson(reportPath, report);
    const policyPath = path.join(fixture.repoRoot, "preservation", "workspace-recovery-policy.json");
    const destination = path.join(fixture.archiveGroup, "legacy-publication-payload");
    const manifest = runWorkspaceQuarantinePreparation({
      reportPath,
      reportSha256,
      policyPath,
      repoRoot: fixture.repoRoot,
      owner: "g5-second-wave-owner",
      retainUntil,
      destination,
      now,
    });
    delete manifest.roots.rootArguments;
    delete manifest.roots.sourceRoots[0].rootArgument;
    for (const entry of [...manifest.entries, ...manifest.emptyDirectories]) delete entry.rootArgument;
    const manifestPath = path.join(fixture.archiveGroup, "legacy-publication-manifest.json");
    const manifestSha256 = writeJson(manifestPath, manifest);
    const receipt = runWorkspacePreservationQuarantine({
      ...applyOptions(fixture, { reportPath, reportSha256, manifestPath, manifestSha256, journalPath: path.join(fixture.archiveGroup, "legacy-publication-journal"), destination }),
      policyPath,
    });
    assert.equal(receipt.status, "complete");
    assert.equal(fs.readFileSync(path.join(destination, "Tear-main-publication", "publication.txt"), "utf8"), "legacy publication\n");
  } finally {
    cleanup(fixture);
  }
});

test("a completed receipt verifies after clean-main advances only along an ancestor", () => {
  const descendant = createFixture();
  try {
    const evidence = secondWaveEvidence(descendant);
    assert.throws(() => runWorkspacePreservationQuarantine(applyOptions(descendant, evidence, { interruptAfterMoves: 1 })), /injected interruption/u);
    runWorkspacePreservationQuarantine(applyOptions(descendant, evidence, { resume: true }));
    const receipt = JSON.parse(fs.readFileSync(path.join(evidence.journalPath, "completion-receipt.json"), "utf8"));
    const evidenceHead = receipt.head;
    fs.writeFileSync(path.join(descendant.repoRoot, "post-evidence.txt"), "descendant\n", "utf8");
    git(descendant.repoRoot, ["add", "post-evidence.txt"]);
    git(descendant.repoRoot, ["commit", "-q", "-m", "descendant"]);
    git(descendant.repoRoot, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
    const verified = runWorkspacePreservationQuarantine(applyOptions(descendant, evidence, { resume: true }));
    assert.equal(verified.head, evidenceHead);
    assert.equal(verified.status, "complete");
  } finally {
    cleanup(descendant);
  }
});

test("a completed receipt rejects a divergent clean-main head", () => {
  const fixture = createFixture();
  try {
    const evidence = secondWaveEvidence(fixture);
    runWorkspacePreservationQuarantine(applyOptions(fixture, evidence));
    const tree = git(fixture.repoRoot, ["rev-parse", "HEAD^{tree}"]);
    const divergentHead = git(fixture.repoRoot, ["commit-tree", tree, "-m", "divergent evidence branch"]);
    git(fixture.repoRoot, ["update-ref", "refs/heads/main", divergentHead]);
    git(fixture.repoRoot, ["checkout", "-q", "main"]);
    git(fixture.repoRoot, ["update-ref", "refs/remotes/origin/main", divergentHead]);
    assert.throws(() => runWorkspacePreservationQuarantine(applyOptions(fixture, evidence, { resume: true })), /not an ancestor|head does not match/u);
  } finally {
    cleanup(fixture);
  }
});
