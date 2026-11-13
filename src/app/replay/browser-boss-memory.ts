import { createCareerTextPort } from "./browser-ghost-career-search";
import { normalBrowserGhostArchiveFiles } from "../library/browser-ghost-archive-files";
import { GhostLocalVault } from "../../ghost/capsule-vault";
import { createIndexedDbGhostVaultBackend } from "../../ghost/indexeddb-vault-backend";
import { GhostCapsuleReader, type GhostReadCapsule } from "../../ghost/capsule-reader";
import { saveBossMemory } from "../../ghost/boss-memory";
import { prepareCompleteGhostCapsuleArchive } from "../../ghost/capsule-archive";
import { stableVerificationHash } from "../../replay/hash";

export function createBrowserBossMemory(factory: IDBFactory | undefined, document: Document) {
  const text = createCareerTextPort(
    document,
    "Save only this encounter. Source membership is unproven without the parent; the derived encounter is independently replayed. Necessary entry build/gameplay state remains. Notes are player-authored.",
  );
  const open = async () => {
    if (!factory) throw new TypeError("Boss Memory local storage unavailable");
    return new GhostLocalVault(await createIndexedDbGhostVaultBackend(factory));
  };
  return Object.freeze({
    close: () => {
      text.close();
    },
    edit(submit: (title: string, notes: string) => void) {
      text.edit("SAVE BOSS MEMORY", { title: "Boss encounter", notes: "" }, (fields) => {
        submit(fields.title ?? "", fields.notes ?? "");
      });
    },
    async save(source: GhostReadCapsule, tick: number, title: string, notes: string, signal: AbortSignal) {
      const vault = await open(),
        current = await new GhostCapsuleReader(vault).read(source.manifest.id);
      signal.throwIfAborted();
      if (stableVerificationHash(current.manifest) !== stableVerificationHash(source.manifest))
        throw new TypeError("Selected Boss Memory source changed");
      return saveBossMemory(vault, current, tick, title, notes, signal);
    },
    async download(id: string) {
      const vault = await open(),
        archive = await prepareCompleteGhostCapsuleArchive(vault, id),
        files = normalBrowserGhostArchiveFiles();
      if (!files) throw new Error("Memory download unavailable");
      files.download(archive.bytes, `boss-memory-${archive.binding.sha256.slice(0, 16)}.tearghost.json`);
    },
  });
}
