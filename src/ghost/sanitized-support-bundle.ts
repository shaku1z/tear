import { stableVerificationHash } from "../replay/hash";
import { GhostCapsuleReader } from "./capsule-reader";
import { ghostRootIntegrity, type GhostChunkKind, type GhostLocalVault } from "./capsule-vault";
import { readGhostReplayRunContext, type GhostReplayBuildFingerprint } from "./replay-admission";

const NOTE_LIMIT = 280;

export interface GhostSupportBundleApproval {
  /** Fresh explicit player action; never inferred from publication/training consent. */
  readonly approved: true;
  readonly approvedAt: string;
}

export interface GhostSupportBundleRequest {
  readonly capsuleId: string;
  readonly approval: GhostSupportBundleApproval;
  readonly range: Readonly<{ fromTick: number; toTick: number }>;
  readonly segments: readonly GhostChunkKind[];
  readonly settings: Readonly<{ inputScheme: string; audio: "on" | "off"; reducedMotion: boolean; language: string }>;
  readonly platform: Readonly<{ target: string; browserFamily: string; viewportClass: "compact" | "regular" | "wide" }>;
  readonly diagnostics: Readonly<{ errorCode?: string; softlockDetected: boolean; lastStateHash: string }>;
  readonly note?: string;
}

export interface GhostSanitizedSupportBundleV1 {
  readonly format: "tear-ghost-sanitized-support-bundle";
  readonly schemaVersion: 1;
  readonly capsule: Readonly<{ id: string; capsuleSchemaVersion: number; rootIntegrity: string; lineage?: Readonly<{ parentId: string; relation: "repaired-from" }>; build: GhostReplayBuildFingerprint }>;
  readonly requested: Readonly<{ range: Readonly<{ fromTick: number; toTick: number }>; segments: readonly GhostChunkKind[] }>;
  readonly settings: GhostSupportBundleRequest["settings"];
  readonly platform: GhostSupportBundleRequest["platform"];
  readonly diagnostics: GhostSupportBundleRequest["diagnostics"];
  readonly note?: string;
  readonly bundleHash: string;
}

function timestamp(value: string): boolean { return Number.isFinite(Date.parse(value)); }
function safeText(value: string, label: string, limit = 80): string {
  if (typeof value !== "string" || value.length === 0 || value.length > limit || !/^[A-Za-z0-9 ._:/+-]+$/u.test(value)) throw new TypeError(`${label} is unsafe`);
  return value;
}
function safeHash(value: string, label: string): string {
  if (!/^[a-f0-9]{16,128}$/iu.test(value)) throw new TypeError(`${label} must be a bounded hash`);
  return value.toLowerCase();
}
function safeNote(value: string): string {
  if (value.length === 0 || value.length > NOTE_LIMIT || !/^[A-Za-z0-9 .,!?;:'"()\-_/]+$/u.test(value)
    || /(?:https?:\/\/|www\.|@|bearer|firebase|token|uid|email)/iu.test(value)) throw new TypeError("support note is unsafe");
  return value;
}
function freeze(draft: Omit<GhostSanitizedSupportBundleV1, "bundleHash">): GhostSanitizedSupportBundleV1 {
  const copy = Object.freeze({ ...draft,
    capsule: Object.freeze({ ...draft.capsule, ...(draft.capsule.lineage === undefined ? {} : { lineage: Object.freeze({ ...draft.capsule.lineage }) }) }),
    requested: Object.freeze({ range: Object.freeze({ ...draft.requested.range }), segments: Object.freeze([...draft.requested.segments]) }),
    settings: Object.freeze({ ...draft.settings }), platform: Object.freeze({ ...draft.platform }), diagnostics: Object.freeze({ ...draft.diagnostics }),
  });
  return Object.freeze({ ...copy, bundleHash: stableVerificationHash(copy) });
}

/** Local data-only reproduction description: validates all source chunks but copies no replay bytes. */
export async function createGhostSanitizedSupportBundle(vault: GhostLocalVault, request: GhostSupportBundleRequest): Promise<GhostSanitizedSupportBundleV1> {
  const approval: unknown = request.approval;
  if (typeof approval !== "object" || approval === null || (approval as { approved?: unknown }).approved !== true
    || !timestamp((approval as { approvedAt?: unknown }).approvedAt as string)) throw new TypeError("player approval is required for a support bundle");
  if (!Number.isSafeInteger(request.range.fromTick) || !Number.isSafeInteger(request.range.toTick) || request.range.fromTick < 0 || request.range.toTick < request.range.fromTick) throw new RangeError("support range is invalid");
  const allowed: readonly GhostChunkKind[] = ["commands", "rng", "events", "results", "keyframes", "presentation"];
  if (request.segments.length === 0 || request.segments.some((segment) => !allowed.includes(segment)) || new Set(request.segments).size !== request.segments.length) throw new TypeError("support segments are invalid");
  const manifest = await vault.getManifest(request.capsuleId);
  if (manifest?.status !== "complete" || manifest.schemaVersion !== 2 || ghostRootIntegrity(manifest.chunks) !== manifest.rootIntegrity) throw new RangeError("support bundle requires a complete healthy current capsule");
  const context = readGhostReplayRunContext(manifest.provenance);
  if (context === undefined) throw new TypeError("support bundle requires declared immutable build provenance");
  if (request.range.toTick > Math.max(0, ...manifest.chunks.map((chunk) => chunk.toTick))) throw new RangeError("support range exceeds capsule");
  await new GhostCapsuleReader(vault).read(manifest.id);
  const settings = Object.freeze({ inputScheme: safeText(request.settings.inputScheme, "settings.inputScheme"), audio: request.settings.audio, reducedMotion: request.settings.reducedMotion, language: safeText(request.settings.language, "settings.language") });
  const audio: unknown = settings.audio;
  if ((audio !== "on" && audio !== "off") || typeof settings.reducedMotion !== "boolean") throw new TypeError("support settings are invalid");
  const platform = Object.freeze({ target: safeText(request.platform.target, "platform.target"), browserFamily: safeText(request.platform.browserFamily, "platform.browserFamily"), viewportClass: request.platform.viewportClass });
  if (!["compact", "regular", "wide"].includes(platform.viewportClass)) throw new TypeError("support platform is invalid");
  const diagnostics = Object.freeze({ ...(request.diagnostics.errorCode === undefined ? {} : { errorCode: safeText(request.diagnostics.errorCode, "diagnostics.errorCode") }), softlockDetected: request.diagnostics.softlockDetected, lastStateHash: safeHash(request.diagnostics.lastStateHash, "diagnostics.lastStateHash") });
  if (typeof diagnostics.softlockDetected !== "boolean") throw new TypeError("support diagnostics are invalid");
  return freeze({ format: "tear-ghost-sanitized-support-bundle", schemaVersion: 1,
    capsule: Object.freeze({ id: manifest.id, capsuleSchemaVersion: manifest.schemaVersion, rootIntegrity: manifest.rootIntegrity, ...(manifest.lineage === undefined ? {} : { lineage: manifest.lineage }), build: context.build }),
    requested: Object.freeze({ range: Object.freeze({ ...request.range }), segments: Object.freeze([...request.segments]) }), settings, platform, diagnostics,
    ...(request.note === undefined ? {} : { note: safeNote(request.note) }),
  });
}
