import type { GhostPublicationScreenView } from "../presentation/screens/contracts";
import { GhostLocalPublicationConsentLedger, GhostLocalPublicationJobs, GhostLocalVault, createGhostPlayerPublicationSourceConsent, createIndexedDbGhostVaultBackend } from "../ghost";
import type { GhostPublicationRuntime } from "../platform/ghost-publication-runtime";

/** Normal C38 review boundary. It records local consent/custody and queues intent only. */
export class LiveGhostPublicationController {
  #view: GhostPublicationScreenView = Object.freeze({ id: "ghostpublication", status: "unavailable", detail: "Choose a healthy complete Ghost Vault capsule first.", capability: "unavailable", privacy: "pseudonymous", visibility: "private", training: "no-training", canGrant: false });
  #capsuleId: string | undefined;
  readonly #factory: IDBFactory | undefined; readonly #runtime: GhostPublicationRuntime; readonly #actor: () => string | undefined;
  constructor(factory: IDBFactory | undefined, runtime: GhostPublicationRuntime, actor: () => string | undefined) { this.#factory = factory; this.#runtime = runtime; this.#actor = actor; }
  snapshot = (): GhostPublicationScreenView => this.#view;
  async open(capsuleId: string): Promise<void> {
    this.#capsuleId = capsuleId;
    if (this.#factory === undefined) return void this.#set("Ghost Vault is unavailable in this browser.");
    if (!this.#runtime.available) return void this.#set(`Publication unavailable: ${this.#runtime.reason ?? "capability unavailable"}.`);
    const actor = this.#actor(); if (actor === undefined) return void this.#set("Publication requires a signed-in nonanonymous account.");
    try {
      const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(this.#factory));
      const manifest = await vault.getManifest(capsuleId);
      if (manifest?.status !== "complete") return void this.#set("Only a healthy complete Ghost Vault capsule can be reviewed.");
      this.#view = Object.freeze({ id: "ghostpublication", status: "ready", detail: "Review the fixed pseudonymous/private and no-training constraints before explicitly granting local publication custody.", capsuleId, rootIntegrity: manifest.rootIntegrity, capability: "standalone foreground capability ready", privacy: "pseudonymous", visibility: "private", training: "no-training", canGrant: true });
    } catch { this.#set("This Ghost capsule is unhealthy or unavailable."); }
  }
  async grant(): Promise<void> {
    const capsuleId = this.#capsuleId, actor = this.#actor();
    if (capsuleId === undefined || this.#factory === undefined || !this.#runtime.available || actor === undefined || !this.#view.canGrant) return;
    try {
      const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(this.#factory));
      const manifest = await vault.getManifest(capsuleId); if (manifest?.status !== "complete") throw new Error();
      const ledger = new GhostLocalPublicationConsentLedger(vault.backend());
      const current = await ledger.read({ subject: actor, isAnonymous: false });
      const decidedAt = new Date().toISOString();
      const consent = await ledger.decide({ subject: actor, isAnonymous: false }, { revision: current.revision + 1, cloudPublication: "granted", decidedAt });
      const sourceConsent = createGhostPlayerPublicationSourceConsent({ actorHash: consent.actorHash, revision: consent.revision, capsuleId, rootIntegrity: manifest.rootIntegrity, decidedAt });
      await new GhostLocalPublicationJobs(vault, ledger).enqueue({ capsuleId, createdAt: decidedAt, partBytes: 1024 * 1024, custody: { sourceConsent, publicationConsent: consent, privacy: "pseudonymous", visibility: "private", eligibility: { resumed: false, modded: false, coached: false, ghostAssisted: false, bot: false, debug: false, stateForge: false }, decidedAt } });
      this.#view = Object.freeze({ ...this.#view, status: "queued", detail: "Local publication custody and a queued job were recorded. Upload remains a separate explicit foreground action.", canGrant: false });
    } catch { this.#set("Publication custody could not be created; no upload was started."); }
  }
  #set(detail: string): void { this.#view = Object.freeze({ id: "ghostpublication", status: "unavailable", detail, capability: this.#runtime.reason ?? "unavailable", privacy: "pseudonymous", visibility: "private", training: "no-training", canGrant: false }); }
}
