import { createGhostSanitizedSupportBundle, GhostLocalVault, createIndexedDbGhostVaultBackend, type GhostSanitizedSupportBundleV1 } from "../ghost";
import type { GhostSupportScreenView } from "../presentation/screens/contracts";

/** Normal C39 local support boundary. It retains no bundle and has no submission path. */
export class LiveGhostSupportController {
  #view: GhostSupportScreenView = Object.freeze({ id: "ghostsupport", status: "unavailable", detail: "Choose a healthy complete Ghost Vault capsule first.", canCreate: false });
  #capsuleId: string | undefined;
  readonly #factory: IDBFactory | undefined;
  constructor(factory: IDBFactory | undefined) { this.#factory = factory; }
  snapshot = (): GhostSupportScreenView => this.#view;
  async open(capsuleId: string): Promise<void> {
    this.#capsuleId = capsuleId;
    if (this.#factory === undefined) { this.#set("Ghost Vault is unavailable in this browser."); return; }
    try {
      const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(this.#factory));
      const manifest = await vault.getManifest(capsuleId);
      if (manifest?.status !== "complete" || manifest.schemaVersion !== 2) { this.#set("Only a healthy complete current Ghost Vault capsule can create a support bundle."); return; }
      this.#view = Object.freeze({ id: "ghostsupport", status: "ready", detail: "Review the sanitized local provenance. CREATE LOCAL BUNDLE requires this separate player approval and does not submit anything.", capsuleId, rootIntegrity: manifest.rootIntegrity, build: "declared immutable replay build", range: `0-${String(Math.max(0, ...manifest.chunks.map((chunk) => chunk.toTick)))}`, segments: [...new Set(manifest.chunks.map((chunk) => chunk.kind))].join(", "), canCreate: true });
    } catch { this.#set("This Ghost capsule is unhealthy or unavailable."); }
  }
  async create(): Promise<void> {
    const capsuleId = this.#capsuleId;
    if (capsuleId === undefined || this.#factory === undefined || !this.#view.canCreate) return;
    try {
      const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(this.#factory));
      const manifest = await vault.getManifest(capsuleId);
      if (manifest?.status !== "complete") throw new Error();
      const bundle = await createGhostSanitizedSupportBundle(vault, {
        capsuleId, approval: { approved: true, approvedAt: new Date().toISOString() },
        range: { fromTick: 0, toTick: Math.max(0, ...manifest.chunks.map((chunk) => chunk.toTick)) },
        segments: [...new Set(manifest.chunks.map((chunk) => chunk.kind))],
        settings: { inputScheme: "not-collected", audio: "off", reducedMotion: false, language: "not-collected" },
        platform: { target: "standalone", browserFamily: "not-collected", viewportClass: "regular" },
        diagnostics: { softlockDetected: false, lastStateHash: manifest.rootIntegrity },
      });
      this.#created(bundle);
    } catch { this.#set("Support bundle creation refused because capsule custody is no longer healthy."); }
  }
  #created(bundle: GhostSanitizedSupportBundleV1): void {
    this.#view = Object.freeze({ id: "ghostsupport", status: "created", detail: "A sanitized bundle was created in memory for this approved action only. It was not saved, uploaded, or submitted.", capsuleId: bundle.capsule.id, rootIntegrity: bundle.capsule.rootIntegrity, build: bundle.capsule.build.revision, range: `${String(bundle.requested.range.fromTick)}-${String(bundle.requested.range.toTick)}`, segments: bundle.requested.segments.join(", "), bundleHash: bundle.bundleHash, canCreate: false });
  }
  #set(detail: string): void { this.#view = Object.freeze({ id: "ghostsupport", status: "unavailable", detail, canCreate: false }); }
}
