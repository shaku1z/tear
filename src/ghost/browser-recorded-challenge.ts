import { stableVerificationHash } from "../replay/hash";
import { GhostLocalVault } from "./capsule-vault";
import { GhostCapsuleReader, type GhostReadCapsule } from "./capsule-reader";
import { createIndexedDbGhostVaultBackend } from "./indexeddb-vault-backend";
import { issueGhostForkPermit, readGhostForkOrigin } from "./fork-origin";
import { verifyRecordedGhostChallenge } from "./recorded-challenge";

/** Selected attempt plus its explicit parent only. No maintenance, publication or profile writes. */
export async function reopenRecordedGhostChallenge(
  factory: IDBFactory | undefined,
  capsule: GhostReadCapsule,
  persist = false,
) {
  const origin = readGhostForkOrigin(capsule.manifest.provenance);
  if (origin === undefined) return undefined;
  if (factory === undefined) throw new TypeError("Local challenge storage unavailable.");
  const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(factory)),
    reader = new GhostCapsuleReader(vault);
  const parent = await reader.read(origin.parent.capsuleId),
    permit = issueGhostForkPermit(capsule, parent);
  const result = verifyRecordedGhostChallenge(capsule, parent, permit);
  const backend = vault.backend(),
    attemptRaw = await backend.get("manifests", capsule.manifest.id),
    parentRaw = await backend.get("manifests", parent.manifest.id);
  if (
    attemptRaw === undefined ||
    parentRaw === undefined ||
    stableVerificationHash(JSON.parse(attemptRaw) as unknown) !== stableVerificationHash(capsule.manifest) ||
    stableVerificationHash(JSON.parse(parentRaw) as unknown) !== stableVerificationHash(parent.manifest)
  )
    throw new TypeError("Challenge source changed during verification.");
  const key = `recorded-challenge:${capsule.manifest.id}`,
    raw = await backend.get("analysis", key),
    serialized = JSON.stringify(result);
  if (raw !== undefined && raw !== serialized)
    throw new TypeError("Retained challenge result does not match the recording.");
  await backend.commitIfMatches(
    [
      { store: "manifests", key: capsule.manifest.id, expected: attemptRaw },
      { store: "manifests", key: parent.manifest.id, expected: parentRaw },
      { store: "analysis", key, ...(raw === undefined ? {} : { expected: raw }) },
    ],
    persist && raw === undefined ? [{ store: "analysis", key, value: serialized }] : [],
  );
  return Object.freeze({ permit, result });
}
