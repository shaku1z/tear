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
  readonly #now: () => string;

  constructor(vault: GhostLocalVault, now: () => string = () => new Date().toISOString()) {
    this.#vault = vault;
    this.#now = now;
  }

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
    if (report.healthy) throw new TypeError(`capsule does not need repair: ${id}`);
    if (await this.#vault.getManifest(repairedId) !== undefined) throw new RangeError(`repair child already exists: ${repairedId}`);
    const excluded = new Set([...report.corruptChunkIds, ...report.missingChunkIds]);
    const repairedAt = this.#now();
    const chunks = Object.freeze(manifest.chunks.filter((chunk) => !excluded.has(chunk.id)));
    const child: TearGhostManifest = Object.freeze({
      ...manifest,
      id: repairedId,
      status: "repaired",
      createdAt: repairedAt,
      completedAt: repairedAt,
      chunks,
      rootIntegrity: ghostRootIntegrity(chunks),
      lineage: Object.freeze({ parentId: id, relation: "repaired-from" }),
    });
    await this.#vault.createRepairChild(id, child, report.corruptChunkIds, repairedAt);
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
