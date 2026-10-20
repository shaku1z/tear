import { GhostLocalVault } from "./capsule-vault";
import { GhostCapsuleReader, type GhostReadCapsule } from "./capsule-reader";
import { createIndexedDbGhostVaultBackend } from "./indexeddb-vault-backend";
import { prepareGhostCapsuleSourceGuards } from "./capsule-protection";
import { admitGhostFinaleCompanion, readGhostFinaleCompanion } from "./finale-companion";
import { stableVerificationHash } from "../replay/hash";

/** Read-only source lease: no index repair, maintenance, consent, or protection writes. */
export async function reopenGhostFinaleCompanion(factory: IDBFactory | undefined, capsule: GhostReadCapsule) {
  const declaration = readGhostFinaleCompanion(capsule.manifest.provenance);
  if (declaration === undefined || factory === undefined) throw new TypeError("Finale local storage unavailable");
  const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(factory)), backend = vault.backend();
  const parent = await new GhostCapsuleReader(vault).read(declaration.parentId);
  const guards = [...await prepareGhostCapsuleSourceGuards(backend, capsule.manifest.id, capsule.manifest.rootIntegrity),
    ...await prepareGhostCapsuleSourceGuards(backend, parent.manifest.id, parent.manifest.rootIntegrity)];
  for (const source of [capsule, parent]) {
    const raw = guards.find((guard) => guard.store === "manifests" && guard.key === source.manifest.id)?.expected;
    if (raw === undefined || stableVerificationHash(JSON.parse(raw)) !== stableVerificationHash(source.manifest)) throw new TypeError("Finale source metadata changed");
  }
  const permit = admitGhostFinaleCompanion(capsule, parent);
  const confirm = async () => { await backend.commitIfMatches(guards, []); };
  await confirm();
  return Object.freeze({ parent, permit, confirm });
}
