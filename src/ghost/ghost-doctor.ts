import { ghostRootIntegrity } from "./capsule-vault";
import type { GhostLocalVault, TearGhostManifest } from "./capsule-vault";

export interface GhostDoctorReport {
  readonly healthy: boolean;
  readonly corruptChunkIds: readonly string[];
  readonly missingChunkIds: readonly string[];
  readonly repairedChildId?: string;
}

export class GhostDoctor {
  readonly #vault: GhostLocalVault;

  constructor(vault: GhostLocalVault) { this.#vault = vault; }

  async scan(id: string): Promise<GhostDoctorReport> {
    const manifest = await this.#vault.getManifest(id);
    if (manifest === undefined) throw new RangeError(`manifest does not exist: ${id}`);
    const corrupt: string[] = [];
    const missing: string[] = [];
    for (const entry of manifest.chunks) {
      try { await this.#vault.readChunk(entry); }
      catch (error) {
        if (error instanceof RangeError) missing.push(entry.id);
        else corrupt.push(entry.id);
      }
    }
    return Object.freeze({
      healthy: corrupt.length === 0 && missing.length === 0
        && ghostRootIntegrity(manifest.chunks) === manifest.rootIntegrity,
      corruptChunkIds: Object.freeze(corrupt),
      missingChunkIds: Object.freeze(missing),
    });
  }

  async repairChild(id: string, repairedId: string): Promise<GhostDoctorReport> {
    const manifest = await this.#vault.getManifest(id);
    if (manifest === undefined) throw new RangeError(`manifest does not exist: ${id}`);
    const report = await this.scan(id);
    const excluded = new Set([...report.corruptChunkIds, ...report.missingChunkIds]);
    for (const chunkId of report.corruptChunkIds) {
      const encoded = await this.#vault.backend().get("chunks", chunkId);
      if (encoded !== undefined) await this.#vault.backend().put("quarantine", chunkId, encoded);
      await this.#vault.backend().remove("chunks", chunkId);
    }
    const chunks = Object.freeze(manifest.chunks.filter((chunk) => !excluded.has(chunk.id)));
    const child: TearGhostManifest = Object.freeze({
      ...manifest,
      id: repairedId,
      status: "repaired",
      chunks,
      rootIntegrity: ghostRootIntegrity(chunks),
      lineage: Object.freeze({ parentId: id, relation: "repaired-from" }),
    });
    await this.#vault.putManifest(child);
    return Object.freeze({ ...report, repairedChildId: repairedId });
  }

  async rebuildIndex(): Promise<number> {
    let rebuilt = 0;
    for (const id of await this.#vault.backend().keys("manifests")) {
      const manifest = await this.#vault.getManifest(id);
      if (manifest === undefined) continue;
      await this.#vault.backend().put("indexes", `manifest:${id}`, JSON.stringify({
        status: manifest.status, createdAt: manifest.createdAt, chunks: manifest.chunks.length,
      }));
      rebuilt += 1;
    }
    return rebuilt;
  }
}
