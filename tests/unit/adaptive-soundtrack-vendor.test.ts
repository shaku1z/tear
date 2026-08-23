import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
async function bytes(path: string): Promise<Buffer> {
  return readFile(resolve(root, path));
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("Adaptive Soundtrack canonical vendor", () => {
  it("passes the independent canonical provenance verifier", () => {
    const result = spawnSync(process.execPath, ["scripts/verify-adaptive-soundtrack-provenance.mjs"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("PASS source shaku1z/tear-music@7662fc95769d2ed022593c10f308ec10f054edfc");
  });

  it("matches the schema-v2 handoff for the selected ESM entrypoint", async () => {
    const [manifestBytes, moduleBytes, provenanceBytes] = await Promise.all([
      bytes("public/vendor/tear-music/adaptive-soundtrack.manifest.json"),
      bytes("public/vendor/tear-music/adaptive-soundtrack.esm.js"),
      bytes("public/vendor/tear-music/adaptive-soundtrack.provenance.json"),
    ]);
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
      artifactIntegrity: { module: { path: string; bytes: number; sha256: string } };
      engineRepository: string;
      engineCommit: string;
      version: string;
      toneVersion: string;
      [key: string]: unknown;
    };
    const provenance = JSON.parse(provenanceBytes.toString("utf8")) as Record<string, unknown>;
    const moduleIntegrity = manifest.artifactIntegrity.module;

    expect(manifest).toMatchObject({
      format: "tear-music-adaptive-soundtrack-release",
      schemaVersion: 2,
      engineRepository: "shaku1z/tear-music",
      engineCommit: "7662fc95769d2ed022593c10f308ec10f054edfc",
      version: "0.1.0-alpha.1",
      toneVersion: "14.9.17",
    });
    expect(moduleIntegrity).toEqual({
      path: "index.mjs",
      bytes: 67717,
      sha256: "9b88e9597657c44ae5830c67666d089730c156e4b17a993596e9d0c0ab3a5eb7",
    });
    expect(manifestBytes.length).toBe(1898);
    expect(sha256(manifestBytes)).toBe("e6d9a62ebadfdea26a98a1371ba7e084bc8878f7623ad510deafe12d6a945c2a");
    expect(moduleBytes.length).toBe(67717);
    expect(sha256(moduleBytes)).toBe(moduleIntegrity.sha256);
    expect(provenance).toMatchObject({
      schemaVersion: 1,
      releaseSchemaVersion: 2,
      releaseManifestSha256: sha256(manifestBytes),
      engineRepository: manifest.engineRepository,
      engineCommit: manifest.engineCommit,
      releaseVersion: manifest.version,
      artifactBytes: moduleBytes.length,
      artifactSha256: sha256(moduleBytes),
      toneVersion: manifest.toneVersion,
    });
  });

  it("keeps the canonical Tone host byte-identical to the trusted legacy host", async () => {
    const [canonicalTone, legacyTone, canonicalLicense, legacyLicense] = await Promise.all([
      bytes("public/vendor/tear-music/tone-host-14.9.17.esm.js"),
      bytes("public/vendor/tear-score/tone-host-14.9.17.esm.js"),
      bytes("public/vendor/tear-music/TONE-LICENSE.md"),
      bytes("public/vendor/tear-score/TONE-LICENSE.md"),
    ]);
    expect(canonicalTone.equals(legacyTone)).toBe(true);
    expect(canonicalTone.length).toBe(337361);
    expect(sha256(canonicalTone)).toBe("5dd8825c21f50486eea7353b0abdf06119dd76409e4271e3fa54fe8545463446");
    expect(canonicalLicense.equals(legacyLicense)).toBe(true);
    expect(canonicalLicense.length).toBe(1072);
    expect(sha256(canonicalLicense)).toBe("391ed5af60b7b5d1f74b31040c5fa645e6e238f3d9b4c971941a262a675bbdcd");
  });

  it("preserves every legacy TearScore vendor file byte-for-byte", async () => {
    const expected = {
      "public/vendor/tear-score/tear-score.esm.js": "b4f304d85a1dfb8197abcb6c2e33ba1addc40e354c7689f717c22a1a7acd793c",
      "public/vendor/tear-score/tear-score.provenance.json": "2f6641667ebb7e1609e667cbd68b615f9bae5e3f7981a4c64b3cf298e4614d34",
      "public/vendor/tear-score/tone-host-14.9.17.esm.js": "5dd8825c21f50486eea7353b0abdf06119dd76409e4271e3fa54fe8545463446",
      "public/vendor/tear-score/TONE-LICENSE.md": "391ed5af60b7b5d1f74b31040c5fa645e6e238f3d9b4c971941a262a675bbdcd",
      "public/vendor/tear-score/upstream-manifest.json": "59924111fded47e3cb57f54af407ae9a20d474c9acdb71024bde5a87dd77dca6",
    } as const;
    for (const [path, hash] of Object.entries(expected)) {
      expect(sha256(await bytes(path)), path).toBe(hash);
    }
  });
});
