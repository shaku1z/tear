import { stableVerificationHash } from "../replay/hash";

/**
 * C25 treats controllers differently from keyboard, mouse, and touch.  The
 * browser Gamepad API can describe a connected device, but it cannot prove
 * that a process did not synthesize it.  This contract therefore records a
 * browser-observed device and requires a separate human review; it never
 * promotes a browser observation to hardware proof by itself.
 */
export const PHYSICAL_CONTROLLER_HARDWARE_SESSION_FORMAT = "tearbench-physical-controller-session";
export const PHYSICAL_CONTROLLER_HARDWARE_SESSION_SCHEMA_VERSION = 1;
export const PHYSICAL_CONTROLLER_HARDWARE_INTEGRITY_ALGORITHM = "tear-stable-verification-hash-v1";

export type ControllerOriginDisposition = "manual-attestation-required" | "rejected";
export type ControllerSessionReviewDisposition = "manual-review-required" | "accepted" | "rejected";
export type ControllerConnectionEventKind = "connected" | "disconnected" | "reconnected" | "remap-applied";

export interface BrowserGamepadView {
  readonly index: number;
  readonly id: string;
  readonly mapping: string;
  readonly connected: boolean;
  readonly timestamp: number;
  readonly buttons: readonly unknown[];
  readonly axes: readonly number[];
}

/** Browser adapter capability, expressed structurally so portable evidence has no DOM type dependency. */
export interface BrowserGamepadPort {
  getGamepads(): readonly (BrowserGamepadView | null)[];
}

/** A copy of the browser-visible subset used to identify an observed pad. */
export interface ControllerDeviceSnapshot {
  readonly index: number;
  readonly id: string;
  readonly mapping: string;
  readonly connected: boolean;
  readonly timestamp: number;
  readonly buttonCount: number;
  readonly axisCount: number;
}

export interface ControllerOriginAssessment {
  readonly disposition: ControllerOriginDisposition;
  /** Browser APIs cannot establish physical provenance; this is always false. */
  readonly automaticallyProvesPhysicalHardware: false;
  readonly reasons: readonly string[];
  readonly snapshot: Readonly<ControllerDeviceSnapshot>;
}

export interface ControllerArtifactReference {
  readonly path: string;
  readonly sha256: string;
}

export interface ControllerConnectionEvent {
  readonly kind: ControllerConnectionEventKind;
  readonly recordedAt: string;
  /** Connected/reconnected events contain the native browser observation. */
  readonly snapshot?: ControllerDeviceSnapshot;
  /** A remap must name two different, operator-visible binding profiles. */
  readonly fromBindingProfile?: string;
  readonly toBindingProfile?: string;
}

export interface PhysicalControllerHardwareSessionDraft {
  readonly format: typeof PHYSICAL_CONTROLLER_HARDWARE_SESSION_FORMAT;
  readonly schemaVersion: typeof PHYSICAL_CONTROLLER_HARDWARE_SESSION_SCHEMA_VERSION;
  readonly buildId: string;
  readonly recordedAt: string;
  /** A named operator, not an automated test process, observed the hardware. */
  readonly operatorId: string;
  readonly operatorAttestation: "hardware-observed-in-person";
  readonly events: readonly ControllerConnectionEvent[];
  readonly artifacts: Readonly<{
    readonly connectionTrace: ControllerArtifactReference;
    readonly remapTrace: ControllerArtifactReference;
    readonly visualTrace: ControllerArtifactReference;
  }>;
}

export interface PhysicalControllerHardwareSession extends PhysicalControllerHardwareSessionDraft {
  readonly integrity: Readonly<{
    readonly algorithm: typeof PHYSICAL_CONTROLLER_HARDWARE_INTEGRITY_ALGORITHM;
    readonly contentHash: string;
  }>;
  /** Always manual-review-required when first created; review may later change it. */
  readonly reviewDisposition: ControllerSessionReviewDisposition;
  readonly automaticallyProvesPhysicalHardware: false;
}

export interface ReviewedPhysicalControllerHardwareSession extends PhysicalControllerHardwareSession {
  readonly review: Readonly<{
    readonly reviewerId: string;
    readonly reviewedAt: string;
    readonly disposition: Exclude<ControllerSessionReviewDisposition, "manual-review-required">;
    readonly notes: string;
  }>;
  readonly reviewDisposition: Exclude<ControllerSessionReviewDisposition, "manual-review-required">;
}

const VIRTUAL_OR_SYNTHETIC_CONTROLLER_ID = /\b(?:virtual|synthetic|emulat(?:or|ed)|mock|test(?:ing)?|automation|playwright|webdriver|vjoy|vigem|rewasd)\b/iu;

function nonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) throw new TypeError(`${name} must be non-empty`);
}

function timestamp(value: string, name: string): void {
  nonEmpty(value, name);
  if (Number.isNaN(Date.parse(value))) throw new TypeError(`${name} must be an ISO-compatible timestamp`);
}

function sha256(value: string, name: string): void {
  if (!/^[a-f0-9]{64}$/iu.test(value)) throw new TypeError(`${name} must be a sha256 hex digest`);
}

function copySnapshot(snapshot: ControllerDeviceSnapshot): ControllerDeviceSnapshot {
  if (!Number.isSafeInteger(snapshot.index) || snapshot.index < 0) throw new RangeError("controller index must be a non-negative safe integer");
  nonEmpty(snapshot.id, "controller id");
  if (!Number.isFinite(snapshot.timestamp) || snapshot.timestamp < 0) throw new RangeError("controller timestamp must be non-negative");
  if (!Number.isSafeInteger(snapshot.buttonCount) || snapshot.buttonCount < 0) throw new RangeError("controller buttonCount must be non-negative");
  if (!Number.isSafeInteger(snapshot.axisCount) || snapshot.axisCount < 0) throw new RangeError("controller axisCount must be non-negative");
  return Object.freeze({ ...snapshot });
}

/**
 * Copies a Gamepad from the actual browser navigator supplied by the caller.
 * It neither writes browser state nor uses test-only globals; a missing index
 * simply means there is no browser-observed controller to attest.
 */
export function readBrowserControllerSnapshot(navigatorPort: BrowserGamepadPort, index: number): ControllerDeviceSnapshot | undefined {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError("controller index must be a non-negative safe integer");
  const gamepad = navigatorPort.getGamepads()[index];
  if (gamepad === null || gamepad === undefined) return undefined;
  return copySnapshot({
    index: gamepad.index,
    id: gamepad.id,
    mapping: gamepad.mapping,
    connected: gamepad.connected,
    timestamp: gamepad.timestamp,
    buttonCount: gamepad.buttons.length,
    axisCount: gamepad.axes.length,
  });
}

/**
 * Rejects identifiers that explicitly identify a virtual/synthetic controller.
 * Other devices remain *manual-attestation-required*, because the Gamepad API
 * has no trustworthy bit that proves a physical USB/Bluetooth controller.
 */
export function assessBrowserControllerOrigin(input: ControllerDeviceSnapshot): ControllerOriginAssessment {
  const snapshot = copySnapshot(input);
  const reasons: string[] = [];
  if (!snapshot.connected) reasons.push("browser reports the controller as disconnected");
  if (snapshot.timestamp <= 0) reasons.push("browser controller timestamp is unavailable");
  if (snapshot.buttonCount < 4 || snapshot.axisCount < 2) reasons.push("controller lacks the minimum interactive controls");
  if (VIRTUAL_OR_SYNTHETIC_CONTROLLER_ID.test(snapshot.id)) reasons.push("controller identifier declares a virtual or synthetic device");
  const disposition: ControllerOriginDisposition = reasons.length > 0 ? "rejected" : "manual-attestation-required";
  return Object.freeze({
    disposition,
    automaticallyProvesPhysicalHardware: false,
    reasons: Object.freeze(reasons),
    snapshot,
  });
}

function copyArtifact(reference: ControllerArtifactReference, name: string): ControllerArtifactReference {
  nonEmpty(reference.path, `${name}.path`);
  sha256(reference.sha256, `${name}.sha256`);
  return Object.freeze({ path: reference.path, sha256: reference.sha256.toLowerCase() });
}

function copyEvent(event: ControllerConnectionEvent): ControllerConnectionEvent {
  timestamp(event.recordedAt, "controller event recordedAt");
  if (event.kind === "connected" || event.kind === "reconnected") {
    if (event.snapshot === undefined) throw new TypeError(`${event.kind} event requires a browser controller snapshot`);
    const assessment = assessBrowserControllerOrigin(event.snapshot);
    if (assessment.disposition === "rejected") throw new TypeError(`${event.kind} controller is not eligible: ${assessment.reasons.join("; ")}`);
    return Object.freeze({ kind: event.kind, recordedAt: event.recordedAt, snapshot: assessment.snapshot });
  }
  if (event.kind === "disconnected") {
    return Object.freeze({ kind: event.kind, recordedAt: event.recordedAt });
  }
  if (event.fromBindingProfile === undefined || event.toBindingProfile === undefined) {
    throw new TypeError("remap-applied event requires fromBindingProfile and toBindingProfile");
  }
  nonEmpty(event.fromBindingProfile, "remap fromBindingProfile");
  nonEmpty(event.toBindingProfile, "remap toBindingProfile");
  if (event.fromBindingProfile === event.toBindingProfile) throw new TypeError("remap-applied event must change the binding profile");
  return Object.freeze({
    kind: "remap-applied", recordedAt: event.recordedAt,
    fromBindingProfile: event.fromBindingProfile, toBindingProfile: event.toBindingProfile,
  });
}

function validateEventSequence(events: readonly ControllerConnectionEvent[]): void {
  if (events.length < 4) throw new TypeError("controller hardware session requires connected, disconnected, reconnected, and remap evidence");
  if (events[0]?.kind !== "connected") throw new TypeError("controller hardware session must begin with a connected observation");
  let disconnected = false;
  let reconnected = false;
  let remapped = false;
  let lastAt = -Infinity;
  for (const event of events) {
    const at = Date.parse(event.recordedAt);
    if (at < lastAt) throw new TypeError("controller hardware events must be chronological");
    lastAt = at;
    if (event.kind === "disconnected") disconnected = true;
    if (event.kind === "reconnected") {
      if (!disconnected) throw new TypeError("controller reconnect evidence must follow a disconnect");
      reconnected = true;
    }
    if (event.kind === "remap-applied") {
      if (!reconnected) throw new TypeError("controller remap evidence must follow a reconnect");
      remapped = true;
    }
  }
  if (!disconnected || !reconnected || !remapped) throw new TypeError("controller hardware session lacks disconnect, reconnect, or remap evidence");
}

function integrityPayload(session: PhysicalControllerHardwareSessionDraft): PhysicalControllerHardwareSessionDraft {
  return {
    format: session.format, schemaVersion: session.schemaVersion, buildId: session.buildId, recordedAt: session.recordedAt,
    operatorId: session.operatorId, operatorAttestation: session.operatorAttestation,
    events: Object.freeze(session.events.map(copyEvent)),
    artifacts: Object.freeze({
      connectionTrace: copyArtifact(session.artifacts.connectionTrace, "connectionTrace"),
      remapTrace: copyArtifact(session.artifacts.remapTrace, "remapTrace"),
      visualTrace: copyArtifact(session.artifacts.visualTrace, "visualTrace"),
    }),
  };
}

/** Creates immutable manual-hardware evidence; it is intentionally not a certification result. */
export function createPhysicalControllerHardwareSession(draft: PhysicalControllerHardwareSessionDraft): PhysicalControllerHardwareSession {
  nonEmpty(draft.buildId, "controller buildId");
  timestamp(draft.recordedAt, "controller session recordedAt");
  nonEmpty(draft.operatorId, "controller operatorId");
  const payload = integrityPayload(draft);
  validateEventSequence(payload.events);
  return Object.freeze({
    ...payload,
    integrity: Object.freeze({ algorithm: PHYSICAL_CONTROLLER_HARDWARE_INTEGRITY_ALGORITHM, contentHash: stableVerificationHash(payload) }),
    reviewDisposition: "manual-review-required",
    automaticallyProvesPhysicalHardware: false,
  });
}

/**
 * Adds a named human review.  Even an accepted review is manual evidence, not
 * an automatically established fact about a controller's physical provenance.
 */
export function reviewPhysicalControllerHardwareSession(
  session: PhysicalControllerHardwareSession,
  review: Readonly<{ reviewerId: string; reviewedAt: string; disposition: "accepted" | "rejected"; notes: string }>,
): ReviewedPhysicalControllerHardwareSession {
  const expected = stableVerificationHash(integrityPayload(session));
  if (session.integrity.contentHash !== expected) {
    throw new TypeError("controller hardware session integrity does not match its evidence payload");
  }
  nonEmpty(review.reviewerId, "controller reviewerId");
  timestamp(review.reviewedAt, "controller reviewedAt");
  nonEmpty(review.notes, "controller review notes");
  return Object.freeze({
    ...session,
    reviewDisposition: review.disposition,
    review: Object.freeze({ ...review }),
  });
}
