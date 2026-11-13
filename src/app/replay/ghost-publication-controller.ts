import type { GhostPublicationScreenView } from "../../presentation/screens/contracts";
import {
  GhostLocalPublicationConsentLedger,
  GhostLocalPublicationJobs,
  GhostLocalVault,
  GhostPublicationTransport,
  createGhostPlayerPublicationSourceConsent,
  createIndexedDbGhostVaultBackend,
  ghostPublicationSourceEligibility,
} from "../../ghost";
import type { GhostLocalPublicationJobV1 } from "../../ghost";
import type { GhostPublicationTransportStateV1 } from "../../ghost";
import type { GhostPublicationRuntime } from "../../platform/ghost-publication-runtime";
import { readGhostRunAssistance } from "../../gameplay/run/ghost-assistance";

/** Normal C38 review boundary. Transport exists only during an explicit player action. */
export class LiveGhostPublicationController {
  #assisted = false;
  #view: GhostPublicationScreenView = Object.freeze({
    id: "ghostpublication",
    status: "unavailable",
    detail: "Choose a healthy complete Ghost Vault capsule first.",
    capability: "unavailable",
    privacy: "pseudonymous",
    visibility: "private",
    training: "no-training",
    canGrant: false,
  });
  #capsuleId: string | undefined;
  #jobId: string | undefined;
  #openGeneration = 0;
  #actionGeneration = 0;
  readonly #factory: IDBFactory | undefined;
  readonly #runtime: GhostPublicationRuntime;
  readonly #actor: () => string | undefined;
  constructor(factory: IDBFactory | undefined, runtime: GhostPublicationRuntime, actor: () => string | undefined) {
    this.#factory = factory;
    this.#runtime = runtime;
    this.#actor = actor;
  }
  snapshot = (): GhostPublicationScreenView =>
    this.#assisted
      ? Object.freeze({
          ...this.#view,
          detail: `ASSISTED / NONCOMPETITIVE. Original Chase source and recorded attribution remain in the capsule. ${this.#view.detail}`,
        })
      : this.#view;
  async open(capsuleId: string): Promise<void> {
    this.#assisted = false;
    const generation = ++this.#openGeneration;
    this.#capsuleId = capsuleId;
    this.#jobId = undefined;
    this.#set("Loading Ghost capsule review…", capsuleId);
    if (this.#factory === undefined) {
      this.#set("Ghost Vault is unavailable in this browser.");
      return;
    }
    try {
      const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(this.#factory));
      const manifest = await vault.getManifest(capsuleId);
      if (generation !== this.#openGeneration) return;
      if (manifest?.status !== "complete") {
        this.#set("Only a healthy complete Ghost Vault capsule can be reviewed.");
        return;
      }
      this.#assisted = readGhostRunAssistance(manifest.provenance?.ghostAssistance) !== undefined;
      if (!this.#runtime.available) {
        this.#set(
          `Publication unavailable: ${this.#runtime.reason ?? "capability unavailable"}.`,
          capsuleId,
          manifest.rootIntegrity,
        );
        return;
      }
      const actor = this.#actor();
      if (actor === undefined) {
        this.#set("Publication requires a signed-in nonanonymous account.", capsuleId, manifest.rootIntegrity);
        return;
      }
      const ledger = new GhostLocalPublicationConsentLedger(vault.backend()),
        current = await ledger.read({ subject: actor, isAnonymous: false });
      const job = await new GhostLocalPublicationJobs(vault, ledger).findForCapsule(capsuleId, current.actorHash);
      if (!this.#isCurrent(generation, capsuleId, actor)) return;
      this.#view = Object.freeze({
        id: "ghostpublication",
        status: "ready",
        detail:
          "Review the fixed pseudonymous/private and no-training constraints before explicitly granting local publication custody.",
        capsuleId,
        rootIntegrity: manifest.rootIntegrity,
        capability: "standalone foreground capability ready",
        privacy: "pseudonymous",
        visibility: "private",
        training: "no-training",
        canGrant: true,
      });
      if (job !== undefined) await this.#showJob(job, vault, generation, actor);
    } catch {
      if (generation === this.#openGeneration) this.#set("This Ghost capsule is unhealthy or unavailable.");
    }
  }
  async grant(): Promise<void> {
    const generation = this.#openGeneration,
      capsuleId = this.#capsuleId,
      actor = this.#actor();
    if (
      capsuleId === undefined ||
      this.#factory === undefined ||
      !this.#runtime.available ||
      actor === undefined ||
      !this.#view.canGrant ||
      !this.#isCurrent(generation, capsuleId, actor)
    )
      return;
    try {
      const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(this.#factory));
      const manifest = await vault.getManifest(capsuleId);
      if (manifest?.status !== "complete") throw new Error();
      if (!this.#isCurrent(generation, capsuleId, actor)) return;
      const ledger = new GhostLocalPublicationConsentLedger(vault.backend()),
        jobs = new GhostLocalPublicationJobs(vault, ledger),
        current = await ledger.read({ subject: actor, isAnonymous: false });
      const existing = await jobs.findForCapsule(capsuleId, current.actorHash);
      if (!this.#isCurrent(generation, capsuleId, actor)) return;
      if (existing !== undefined) {
        await this.#showJob(existing, vault, generation, actor);
        return;
      }
      const decidedAt = new Date().toISOString();
      const consent = await ledger.decide(
        { subject: actor, isAnonymous: false },
        { revision: current.revision + 1, cloudPublication: "granted", decidedAt },
      );
      const sourceConsent = createGhostPlayerPublicationSourceConsent({
        actorHash: consent.actorHash,
        revision: consent.revision,
        capsuleId,
        rootIntegrity: manifest.rootIntegrity,
        decidedAt,
      });
      const eligibility = ghostPublicationSourceEligibility(manifest, {
        resumed: false,
        modded: false,
        coached: false,
        ghostAssisted: false,
        bot: false,
        debug: false,
        stateForge: false,
      });
      const job = await jobs.enqueue({
        capsuleId,
        createdAt: decidedAt,
        partBytes: 1024 * 1024,
        custody: {
          sourceConsent,
          publicationConsent: consent,
          privacy: "pseudonymous",
          visibility: "private",
          eligibility,
          decidedAt,
        },
      });
      if (!this.#isCurrent(generation, capsuleId, actor)) return;
      this.#jobId = job.id;
      this.#view = Object.freeze({
        ...this.#view,
        status: "queued",
        detail:
          "Local publication custody and a queued job were recorded. Upload starts only when RUN UPLOAD ONCE is pressed.",
        canGrant: false,
        canRun: true,
        canCancel: true,
        attempts: 0,
      });
    } catch {
      if (this.#isCurrent(generation, capsuleId, actor))
        this.#set("Publication custody could not be created; no upload was started.");
    }
  }
  async runOnce(): Promise<void> {
    await this.#act("run");
  }
  async cancel(): Promise<void> {
    await this.#act("cancel");
  }
  async #act(action: "run" | "cancel"): Promise<void> {
    const generation = this.#openGeneration,
      capsuleId = this.#capsuleId,
      jobId = this.#jobId,
      actor = this.#actor();
    const actionGeneration = ++this.#actionGeneration;
    const endpoint = this.#runtime.endpoint,
      acquireAuthorization = this.#runtime.acquireAuthorization?.bind(this.#runtime);
    if (
      capsuleId === undefined ||
      jobId === undefined ||
      actor === undefined ||
      this.#factory === undefined ||
      !this.#runtime.available ||
      endpoint === undefined ||
      acquireAuthorization === undefined ||
      !this.#isCurrent(generation, capsuleId, actor, jobId)
    )
      return;
    const isActionCurrent = (): boolean =>
      actionGeneration === this.#actionGeneration && this.#isCurrent(generation, capsuleId, actor, jobId);
    try {
      const vault = new GhostLocalVault(await createIndexedDbGhostVaultBackend(this.#factory)),
        ledger = new GhostLocalPublicationConsentLedger(vault.backend()),
        jobs = new GhostLocalPublicationJobs(vault, ledger);
      const job = await jobs.read(jobId);
      if (job?.status !== "queued") throw new Error("publication job is unavailable");
      if (!isActionCurrent()) return;
      const current = await ledger.read({ subject: actor, isAnonymous: false }),
        custody = await jobs.readCustody(job.source.capsuleId);
      const accountMatches =
        custody?.publicationConsent.actorHash === current.actorHash &&
        custody.sourceConsent.actorHash === current.actorHash;
      if (!accountMatches) throw new Error("publication account binding changed");
      const transport = new GhostPublicationTransport({
        endpoint,
        fetch,
        bearer: { acquireAuthorization },
        jobs,
        vault,
        isActionCurrent,
      });
      if (!isActionCurrent()) return;
      this.#view = Object.freeze({
        ...this.#view,
        status: "uploading",
        detail:
          action === "run"
            ? "Foreground upload is running once; no background work is scheduled."
            : "Cancelling local publication custody.",
        canRun: false,
        canCancel: false,
      });
      const result = await (action === "run"
        ? transport.runOnce(jobId, new Date().toISOString())
        : transport.cancel(jobId, new Date().toISOString()));
      if (isActionCurrent()) this.#apply(result);
    } catch {
      if (isActionCurrent())
        this.#set(
          action === "run"
            ? "Upload could not start; local custody remains unchanged."
            : "Cancellation could not confirm local custody.",
        );
    }
  }
  #apply(state: GhostPublicationTransportStateV1): void {
    const terminal = state.terminal;
    this.#view = Object.freeze({
      ...this.#view,
      status: terminal === undefined ? "queued" : "terminal",
      detail:
        terminal === undefined
          ? "Foreground upload paused; press RUN UPLOAD ONCE to try again after the shown retry time."
          : `Publication ${terminal}.`,
      canRun: terminal === undefined,
      canCancel: terminal === undefined,
      attempts: state.attempts,
      ...(state.retryAt === undefined ? {} : { retryAt: state.retryAt }),
      ...(terminal === undefined ? {} : { terminal }),
    });
  }
  async #showJob(
    job: GhostLocalPublicationJobV1,
    vault: GhostLocalVault,
    generation = this.#openGeneration,
    actor = this.#actor(),
  ): Promise<void> {
    const jobs = new GhostLocalPublicationJobs(vault, new GhostLocalPublicationConsentLedger(vault.backend())),
      transport = new GhostPublicationTransport({
        endpoint: this.#runtime.endpoint ?? "",
        fetch,
        bearer: { acquireAuthorization: () => Promise.reject(new Error("state-only transport")) },
        jobs,
        vault,
      });
    const state = await transport.state(job.id);
    if (actor === undefined || !this.#isCurrent(generation, job.source.capsuleId, actor)) return;
    this.#jobId = job.id;
    const terminal = state?.terminal;
    this.#view = Object.freeze({
      ...this.#view,
      status: terminal === undefined ? "queued" : "terminal",
      detail:
        terminal === undefined
          ? "A durable local publication job was restored. Press RUN UPLOAD ONCE to resume the same authorized upload."
          : `Publication ${terminal}.`,
      canGrant: false,
      canRun: terminal === undefined,
      canCancel: terminal === undefined,
      attempts: state?.attempts ?? 0,
      ...(state?.retryAt === undefined ? {} : { retryAt: state.retryAt }),
      ...(terminal === undefined ? {} : { terminal }),
    });
  }
  #isCurrent(generation: number, capsuleId: string, actor: string, jobId?: string): boolean {
    return (
      generation === this.#openGeneration &&
      this.#capsuleId === capsuleId &&
      this.#actor() === actor &&
      (jobId === undefined || this.#jobId === jobId)
    );
  }
  #set(detail: string, capsuleId?: string, rootIntegrity?: string): void {
    this.#view = Object.freeze({
      id: "ghostpublication",
      status: "unavailable",
      detail,
      capability: this.#runtime.reason ?? "unavailable",
      privacy: "pseudonymous",
      visibility: "private",
      training: "no-training",
      canGrant: false,
      ...(capsuleId === undefined ? {} : { capsuleId }),
      ...(rootIntegrity === undefined ? {} : { rootIntegrity }),
    });
  }
}
