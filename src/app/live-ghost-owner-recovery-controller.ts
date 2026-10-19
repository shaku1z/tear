import { GhostForegroundOwnerRecovery, type GhostOwnerRecoveryResult } from "../ghost/foreground-owner-recovery";
import { GhostLocalVault } from "../ghost/capsule-vault";
import { createIndexedDbGhostVaultBackend } from "../ghost/indexeddb-vault-backend";
import type { GhostPublicationRuntime } from "../platform/ghost-publication-runtime";
import type { GhostOwnerRecoveryView } from "../presentation/screens/contracts";

export interface LiveGhostOwnerRecoveryOptions {
  readonly runtime: GhostPublicationRuntime;
  readonly currentActor: () => string | undefined;
  readonly openVault?: () => Promise<GhostLocalVault>;
  readonly fetch: typeof fetch;
  readonly recovered: () => void;
}
export interface GhostOwnerRecoveryCompletion {
  readonly operationId: number; readonly capsuleId: string;
  readonly status: GhostOwnerRecoveryResult["status"]; readonly superseded: boolean;
}

/** One explicit foreground operation. Construction/rendering never opens storage or credentials. */
export class LiveGhostOwnerRecoveryController {
  readonly #o: LiveGhostOwnerRecoveryOptions;
  #generation = 0; #nextOperation = 0; #viewActor: string | undefined;
  #view: GhostOwnerRecoveryView;
  constructor(options: LiveGhostOwnerRecoveryOptions) {
    this.#o = options; this.#viewActor = options.currentActor(); this.#view = this.#idle();
  }
  #unavailable(): string | undefined {
    const runtime = this.#o.runtime;
    if (!runtime.available || runtime.endpoint === undefined || runtime.acquireAuthorization === undefined) return "Cloud recovery is unavailable on this target or no valid endpoint is configured.";
    if (this.#o.openVault === undefined) return "Cloud recovery requires local Vault storage.";
    if (this.#o.currentActor() === undefined) return "Sign in to your account to recover your own cloud capsules.";
    return undefined;
  }
  #idle(): GhostOwnerRecoveryView {
    const reason = this.#unavailable();
    return Object.freeze({ status: reason === undefined ? "idle" : "unavailable", detail: reason ?? "Load your cloud catalog explicitly. Nothing uploads or syncs automatically.",
      catalogVisible: false, canLoad: reason === undefined, canRecover: false, entries: Object.freeze([]) });
  }
  snapshot(): GhostOwnerRecoveryView {
    if (this.#viewActor !== this.#o.currentActor()) return this.#idle();
    const reason = this.#unavailable(), busy = this.#view.status === "loading" || this.#view.status === "recovering";
    return Object.freeze({ ...this.#view, ...(reason === undefined ? {} : { detail: reason }), canLoad: reason === undefined && !busy,
      canRecover: reason === undefined && !busy && this.#view.status === "ready" });
  }
  /** Called by the real account lifecycle, including A→B→A transitions. */
  accountChanged(): void { this.close(); }
  close(): void { this.#generation++; this.#viewActor = this.#o.currentActor(); this.#view = this.#idle(); }
  #begin(status: "loading" | "recovering") {
    const actor = this.#o.currentActor(), generation = ++this.#generation, operationId = ++this.#nextOperation;
    this.#viewActor = actor;
    this.#view = Object.freeze({ ...this.#view, status, catalogVisible: true, detail: status === "loading" ? "Loading your cloud catalog…" : "Recovering the selected capsule to this device…", canLoad: false, canRecover: false,
      ...(status === "loading" ? { entries: Object.freeze([]) } : {}) });
    const current = () => generation === this.#generation && actor !== undefined && actor === this.#o.currentActor() && this.#unavailable() === undefined;
    return { operationId, current, assert: () => { if (!current()) throw new Error("Ghost recovery foreground action was superseded"); } };
  }
  async #service(assertCurrent: () => void): Promise<GhostForegroundOwnerRecovery> {
    assertCurrent(); const openVault = this.#o.openVault, runtime = this.#o.runtime;
    if (openVault === undefined || runtime.endpoint === undefined) throw new Error("Ghost recovery is unavailable");
    const vault = await openVault(); assertCurrent();
    return new GhostForegroundOwnerRecovery({ vault, endpoint: runtime.endpoint, fetch: this.#o.fetch, assertCurrent,
      bearer: { acquireAuthorization: () => { assertCurrent(); if (runtime.acquireAuthorization === undefined) throw new Error("Ghost recovery authorization is unavailable"); return runtime.acquireAuthorization(); } } });
  }
  async loadOwn(): Promise<void> {
    if (!this.snapshot().canLoad) return;
    const operation = this.#begin("loading");
    try {
      const service = await this.#service(operation.assert), entries = await service.listOwnOnce(); operation.assert();
      this.#view = Object.freeze({ ...this.#view, status: "ready", detail: entries.length === 0 ? "No finalized verified-cleared capsules found for this account." : "Select a capsule to recover. Local availability is checked separately.",
        canLoad: true, canRecover: true, entries: Object.freeze(entries.map((entry) => Object.freeze({ capsuleId: entry.capsuleId, buildId: entry.buildId, rootIntegrity: entry.rootIntegrity, byteLength: entry.byteLength }))) });
    } catch { if (operation.current()) this.#view = Object.freeze({ ...this.#view, status: "failed", canLoad: true, canRecover: false, detail: "Cloud catalog could not be loaded. Retry explicitly when available." }); }
  }
  async recover(capsuleId: string): Promise<GhostOwnerRecoveryCompletion | undefined> {
    const view = this.snapshot(); if (!view.canRecover || !view.entries.some((entry) => entry.capsuleId === capsuleId)) return undefined;
    const operation = this.#begin("recovering");
    try {
      const service = await this.#service(operation.assert), result = await service.recoverOnce(capsuleId);
      // Import may already have committed when the account changes. Preserve
      // its original operation identity; never paint it as the new account's action.
      const completion = Object.freeze({ operationId: operation.operationId, capsuleId, status: result.status, superseded: !operation.current() });
      if (operation.current()) {
        this.#view = Object.freeze({ ...this.#view, status: "ready", canLoad: true, canRecover: true,
          detail: result.status === "absent" ? "This capsule is no longer available in your cloud catalog." : result.status === "already-recovered" ? "Already stored on this device. Local health and playback availability are checked separately." : "Stored on this device. Return to the local Vault to inspect it.",
          entries: result.status === "absent" ? Object.freeze(this.#view.entries.filter((entry) => entry.capsuleId !== capsuleId))
            : Object.freeze(this.#view.entries.map((entry) => entry.capsuleId === capsuleId ? Object.freeze({ ...entry, localStatus: result.status }) : entry)) });
        if (result.status !== "absent") this.#o.recovered();
      }
      return completion;
    } catch { if (operation.current()) this.#view = Object.freeze({ ...this.#view, status: "ready", canLoad: true, canRecover: true, detail: "Recovery failed or local custody conflicts. No automatic retry; inspect the local Vault or retry explicitly." }); return undefined; }
  }
}

export function createBrowserLiveGhostOwnerRecoveryController(factory: IDBFactory | undefined, runtime: GhostPublicationRuntime,
  currentActor: () => string | undefined, recovered: () => void, fetcher: typeof fetch): LiveGhostOwnerRecoveryController {
  return new LiveGhostOwnerRecoveryController({ runtime, currentActor, recovered, fetch: fetcher,
    ...(factory === undefined ? {} : { openVault: async () => new GhostLocalVault(await createIndexedDbGhostVaultBackend(factory)) }) });
}
