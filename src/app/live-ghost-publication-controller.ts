import type { GhostPublicationScreenView } from "../presentation/screens/contracts";
import { GhostLocalPublicationConsentLedger, GhostLocalPublicationJobs, GhostLocalVault, GhostPublicationTransport, createGhostPlayerPublicationSourceConsent, createIndexedDbGhostVaultBackend } from "../ghost";
import type { GhostPublicationTransportStateV1 } from "../ghost";
import type { GhostPublicationRuntime } from "../platform/ghost-publication-runtime";

/** Normal C38 review boundary. Transport exists only during an explicit player action. */
export class LiveGhostPublicationController {
  #view: GhostPublicationScreenView = Object.freeze({ id: "ghostpublication", status: "unavailable", detail: "Choose a healthy complete Ghost Vault capsule first.", capability: "unavailable", privacy: "pseudonymous", visibility: "private", training: "no-training", canGrant: false });
  #capsuleId: string | undefined; #jobId: string | undefined;
  readonly #factory: IDBFactory | undefined; readonly #runtime: GhostPublicationRuntime; readonly #actor: () => string | undefined;
  constructor(factory: IDBFactory | undefined, runtime: GhostPublicationRuntime, actor: () => string | undefined) { this.#factory = factory; this.#runtime = runtime; this.#actor = actor; }
  snapshot = (): GhostPublicationScreenView => this.#view;
  async open(capsuleId: string): Promise<void> {
    this.#capsuleId = capsuleId; this.#jobId = undefined;
    if (this.#factory === undefined) { this.#set("Ghost Vault is unavailable in this browser."); return; }
    if (!this.#runtime.available) { this.#set(`Publication unavailable: ${this.#runtime.reason ?? "capability unavailable"}.`); return; }
    const actor = this.#actor(); if (actor === undefined) { this.#set("Publication requires a signed-in nonanonymous account."); return; }
    try { const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(this.#factory)); const manifest = await vault.getManifest(capsuleId);
      if (manifest?.status !== "complete") { this.#set("Only a healthy complete Ghost Vault capsule can be reviewed."); return; }
      this.#view = Object.freeze({ id: "ghostpublication", status: "ready", detail: "Review the fixed pseudonymous/private and no-training constraints before explicitly granting local publication custody.", capsuleId, rootIntegrity: manifest.rootIntegrity, capability: "standalone foreground capability ready", privacy: "pseudonymous", visibility: "private", training: "no-training", canGrant: true });
    } catch { this.#set("This Ghost capsule is unhealthy or unavailable."); }
  }
  async grant(): Promise<void> {
    const capsuleId = this.#capsuleId, actor = this.#actor();
    if (capsuleId === undefined || this.#factory === undefined || !this.#runtime.available || actor === undefined || !this.#view.canGrant) return;
    try { const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(this.#factory)); const manifest = await vault.getManifest(capsuleId); if (manifest?.status !== "complete") throw new Error();
      const ledger = new GhostLocalPublicationConsentLedger(vault.backend()), current = await ledger.read({ subject: actor, isAnonymous: false }), decidedAt = new Date().toISOString();
      const consent = await ledger.decide({ subject: actor, isAnonymous: false }, { revision: current.revision + 1, cloudPublication: "granted", decidedAt });
      const sourceConsent = createGhostPlayerPublicationSourceConsent({ actorHash: consent.actorHash, revision: consent.revision, capsuleId, rootIntegrity: manifest.rootIntegrity, decidedAt });
      const job = await new GhostLocalPublicationJobs(vault, ledger).enqueue({ capsuleId, createdAt: decidedAt, partBytes: 1024 * 1024, custody: { sourceConsent, publicationConsent: consent, privacy: "pseudonymous", visibility: "private", eligibility: { resumed: false, modded: false, coached: false, ghostAssisted: false, bot: false, debug: false, stateForge: false }, decidedAt } });
      this.#jobId = job.id; this.#view = Object.freeze({ ...this.#view, status: "queued", detail: "Local publication custody and a queued job were recorded. Upload starts only when RUN UPLOAD ONCE is pressed.", canGrant: false, canRun: true, canCancel: true, attempts: 0 });
    } catch { this.#set("Publication custody could not be created; no upload was started."); }
  }
  async runOnce(): Promise<void> { await this.#act("run"); }
  async cancel(): Promise<void> { await this.#act("cancel"); }
  async #act(action: "run" | "cancel"): Promise<void> {
    const jobId = this.#jobId;
    const endpoint = this.#runtime.endpoint, acquireAuthorization = this.#runtime.acquireAuthorization?.bind(this.#runtime);
    if (jobId === undefined || this.#factory === undefined || !this.#runtime.available || endpoint === undefined || acquireAuthorization === undefined || this.#actor() === undefined) return;
    try { const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(this.#factory)), ledger = new GhostLocalPublicationConsentLedger(vault.backend()), jobs = new GhostLocalPublicationJobs(vault, ledger);
      const job = await jobs.read(jobId); if (job?.status !== "queued") throw new Error("publication job is unavailable");
      const transport = new GhostPublicationTransport({ endpoint, fetch, bearer: { acquireAuthorization }, jobs, vault });
      this.#view = Object.freeze({ ...this.#view, status: "uploading", detail: action === "run" ? "Foreground upload is running once; no background work is scheduled." : "Cancelling local publication custody.", canRun: false, canCancel: false });
      this.#apply(await (action === "run" ? transport.runOnce(jobId, new Date().toISOString()) : transport.cancel(jobId, new Date().toISOString())));
    } catch { this.#set(action === "run" ? "Upload could not start; local custody remains unchanged." : "Cancellation could not confirm local custody."); }
  }
  #apply(state: GhostPublicationTransportStateV1): void { const terminal = state.terminal;
    this.#view = Object.freeze({ ...this.#view, status: terminal === undefined ? "queued" : "terminal", detail: terminal === undefined ? "Foreground upload paused; press RUN UPLOAD ONCE to try again after the shown retry time." : `Publication ${terminal}.`, canRun: terminal === undefined, canCancel: terminal === undefined, attempts: state.attempts, ...(state.retryAt === undefined ? {} : { retryAt: state.retryAt }), ...(terminal === undefined ? {} : { terminal }) });
  }
  #set(detail: string): void { this.#view = Object.freeze({ id: "ghostpublication", status: "unavailable", detail, capability: this.#runtime.reason ?? "unavailable", privacy: "pseudonymous", visibility: "private", training: "no-training", canGrant: false }); }
}
