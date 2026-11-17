import { readGhostReplayRunContext } from "./replay-admission";
import { stableVerificationHash } from "../domain/hash";
import { GhostLocalVault, prepareGhostCapsuleSourceGuards } from "./capsule-vault";
import { GhostCapsuleReader } from "./capsule-reader";
import { createIndexedDbGhostVaultBackend } from "./indexeddb-vault-backend";
import { prepareGhostCapsuleArchive, ghostArchiveSha256 } from "./capsule-archive";
import { readPreparedGhostCapsuleArchive } from "./capsule-paired-archive";
import { GhostColdRestore } from "./cold-restore";
import {
  createBeatThisRunCode,
  validateBeatSource,
  evaluateBeatThisRun,
  readBeatThisRunCode,
  type BeatThisRunCode,
  type BeatRule,
} from "./beat-this-run";
import type { GhostPublicationRuntime } from "../platform/ghost-publication-runtime";

/** Foreground action only: no provider access on navigation, parsing, reload or retry preview. */
export function createBrowserBeatThisRun(factory: IDBFactory | undefined, provider: GhostPublicationRuntime) {
  return createBeatThisRunService(async () => {
    if (!factory) throw new Error("Beat This Run storage unavailable");
    return new GhostLocalVault(await createIndexedDbGhostVaultBackend(factory));
  }, provider);
}
/** The same guarded service over an owned Vault; browser supplies IndexedDB. */
export function createBeatThisRunService(open: () => Promise<GhostLocalVault>, provider: GhostPublicationRuntime) {
  const published = async (id: string, signal: AbortSignal) => {
    if (!provider.available || !provider.readPublished)
      throw new Error(`Published-source read unavailable: ${provider.reason ?? "unsupported"}`);
    const response = await provider.readPublished(id, signal);
    signal.throwIfAborted();
    if (!response.metadata || typeof response.metadata !== "object" || Array.isArray(response.metadata))
      throw new TypeError("Published metadata malformed");
    const row = response.metadata as Record<string, unknown>,
      verdict =
        typeof row.verdict_json === "string" ? (JSON.parse(row.verdict_json) as Record<string, unknown>) : undefined;
    if (
      row.capsule_id !== id ||
      row.visibility !== "public" ||
      verdict?.status !== "verified" ||
      verdict.moderation !== "cleared" ||
      verdict.capsuleId !== id ||
      verdict.contentHash !== (await ghostArchiveSha256(response.bytes))
    )
      throw new TypeError("Published source receipt or original bytes differ");
    const archive = await prepareGhostCapsuleArchive(response.bytes),
      capsule = await readPreparedGhostCapsuleArchive(archive);
    const context = readGhostReplayRunContext(archive.manifest.provenance);
    if (
      !context ||
      verdict.buildId !== stableVerificationHash(context.build) ||
      row.build_id !== verdict.buildId ||
      archive.manifest.id !== id ||
      verdict.resultHash !== archive.manifest.rootIntegrity
    )
      throw new TypeError("Published source manifest differs from provider verdict");
    return {
      capsule,
      bytes: response.bytes,
      source: {
        capsule: id,
        root: archive.manifest.rootIntegrity,
        manifest: stableVerificationHash(archive.manifest),
        contentSha256: archive.binding.sha256,
      },
    };
  };
  return Object.freeze({
    async create(id: string, rule: BeatRule, signal: AbortSignal, expectedManifestHash?: string) {
      const remote = await published(id, signal),
        vault = await open(),
        local = await new GhostCapsuleReader(vault).read(id);
      if (
        stableVerificationHash(local.manifest) !== remote.source.manifest ||
        (expectedManifestHash !== undefined && expectedManifestHash !== remote.source.manifest)
      )
        throw new TypeError("Selected local/published source custody differs");
      signal.throwIfAborted();
      return createBeatThisRunCode(remote.capsule, remote.source, rule);
    },
    async resolve(code: BeatThisRunCode, signal: AbortSignal) {
      const remote = await published(code.source.capsule, signal);
      validateBeatSource(code, remote.capsule);
      if (remote.source.contentSha256 !== code.source.contentSha256)
        throw new TypeError("Published original bytes differ from challenge code");
      const vault = await open(),
        service = new GhostColdRestore(vault),
        id = `beat-source-${crypto.randomUUID()}`;
      signal.throwIfAborted();
      const job = await service.select(id, remote.bytes);
      if (signal.aborted) {
        await service.cancel(id, job.revision);
        signal.throwIfAborted();
      }
      const cancel = () => {
        void service
          .read(id)
          .then((current) =>
            current && current.state !== "complete" ? service.cancel(id, current.revision) : undefined,
          )
          .catch(() => undefined);
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        await service.restore(id, remote.bytes, undefined, job);
        signal.throwIfAborted();
      } finally {
        signal.removeEventListener("abort", cancel);
      }
      return remote.capsule;
    },
    async current(code: BeatThisRunCode) {
      const vault = await open(),
        capsule = await new GhostCapsuleReader(vault).read(code.source.capsule);
      return stableVerificationHash(capsule.manifest) === code.source.manifest;
    },
    async review(attemptId: string, save: boolean, expectedManifestHash?: string) {
      const vault = await open(),
        reader = new GhostCapsuleReader(vault),
        attempt = await reader.read(attemptId);
      if (expectedManifestHash !== undefined && stableVerificationHash(attempt.manifest) !== expectedManifestHash)
        throw new TypeError("Selected attempt changed");
      const code = readBeatThisRunCode(attempt.manifest.provenance?.beatCode),
        source = await reader.read(code.source.capsule);
      const result = evaluateBeatThisRun(code, source, attempt),
        backend = vault.backend(),
        key = `beat-result:v1:${attemptId}`;
      const guards = [
        ...(await prepareGhostCapsuleSourceGuards(vault.backend(), source.manifest.id, source.manifest.rootIntegrity)),
        ...(await prepareGhostCapsuleSourceGuards(
          vault.backend(),
          attempt.manifest.id,
          attempt.manifest.rootIntegrity,
        )),
      ];
      for (const capsule of [source, attempt]) {
        const guard = guards.find((g) => g.store === "manifests" && g.key === capsule.manifest.id);
        if (
          !guard?.expected ||
          stableVerificationHash(JSON.parse(guard.expected) as unknown) !== stableVerificationHash(capsule.manifest)
        )
          throw new TypeError("Beat custody changed during verification");
      }
      const unique = new Map<string, (typeof guards)[number]>();
      for (const guard of guards) {
        const id = `${guard.store}:${guard.key}`,
          prior = unique.get(id);
        if (prior && prior.expected !== guard.expected) throw new TypeError("Beat joint custody conflicts");
        unique.set(id, guard);
      }
      const raw = await backend.get("analysis", key),
        value = JSON.stringify(result);
      if (raw !== undefined && raw !== value) throw new TypeError("Saved Beat result differs from native recording");
      const joint = [
        ...unique.values(),
        { store: "analysis" as const, key, ...(raw === undefined ? {} : { expected: raw }) },
      ];
      try {
        await backend.commitIfMatches(joint, save && raw === undefined ? [{ store: "analysis", key, value }] : []);
      } catch (error) {
        if (!save || (await backend.get("analysis", key)) !== value) throw error;
        await backend.commitIfMatches([...unique.values(), { store: "analysis", key, expected: value }], []);
      }
      return { code, result, saved: save || raw !== undefined };
    },
  });
}
