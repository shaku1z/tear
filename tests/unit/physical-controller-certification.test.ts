import { describe, expect, it } from "vitest";

import {
  assessBrowserControllerOrigin,
  createPhysicalControllerHardwareSession,
  readBrowserControllerSnapshot,
  reviewPhysicalControllerHardwareSession,
  type ControllerDeviceSnapshot,
  type PhysicalControllerHardwareSessionDraft,
} from "../../src/tearbench/physical-controller-certification";

const HASH = "a".repeat(64);

function controller(overrides: Partial<ControllerDeviceSnapshot> = {}): ControllerDeviceSnapshot {
  return { index: 0, id: "Xbox Wireless Controller", mapping: "standard", connected: true, timestamp: 24, buttonCount: 16, axisCount: 4, ...overrides };
}

function draft(overrides: Partial<PhysicalControllerHardwareSessionDraft> = {}): PhysicalControllerHardwareSessionDraft {
  const observed = controller();
  return {
    format: "tearbench-physical-controller-session", schemaVersion: 1,
    buildId: "standalone-production", recordedAt: "2026-07-28T00:00:00.000Z",
    operatorId: "operator-1", operatorAttestation: "hardware-observed-in-person",
    events: [
      { kind: "connected", recordedAt: "2026-07-28T00:00:00.000Z", snapshot: observed },
      { kind: "disconnected", recordedAt: "2026-07-28T00:01:00.000Z" },
      { kind: "reconnected", recordedAt: "2026-07-28T00:02:00.000Z", snapshot: { ...observed, timestamp: 48 } },
      { kind: "remap-applied", recordedAt: "2026-07-28T00:03:00.000Z", fromBindingProfile: "default", toBindingProfile: "tear" },
    ],
    artifacts: {
      connectionTrace: { path: "artifacts/c25/controller-connections.json", sha256: HASH },
      remapTrace: { path: "artifacts/c25/controller-remap.json", sha256: HASH },
      visualTrace: { path: "artifacts/c25/controller-visual.mp4", sha256: HASH },
    },
    ...overrides,
  };
}

describe("C25 physical controller evidence", () => {
  it("reads a copied browser Gamepad snapshot without a test-only browser global", () => {
    const nativeLike = { ...controller(), buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] } as unknown as Gamepad;
    const snapshot = readBrowserControllerSnapshot({ getGamepads: () => [nativeLike] }, 0);
    expect(snapshot).toMatchObject({ id: "Xbox Wireless Controller", buttonCount: 16, axisCount: 4 });
    expect(readBrowserControllerSnapshot({ getGamepads: () => [] }, 0)).toBeUndefined();
  });

  it("refuses controller identifiers that declare virtual or synthetic provenance", () => {
    const virtual = assessBrowserControllerOrigin(controller({ id: "Playwright Virtual Gamepad" }));
    expect(virtual).toMatchObject({ disposition: "rejected", automaticallyProvesPhysicalHardware: false });
    expect(virtual.reasons).toContain("controller identifier declares a virtual or synthetic device");
    expect(assessBrowserControllerOrigin(controller())).toMatchObject({ disposition: "manual-attestation-required", automaticallyProvesPhysicalHardware: false });
  });

  it("records connected, disconnect, reconnect and remap evidence but never self-certifies hardware", () => {
    const session = createPhysicalControllerHardwareSession(draft());
    expect(session).toMatchObject({ reviewDisposition: "manual-review-required", automaticallyProvesPhysicalHardware: false });
    expect(session.events.map((event) => event.kind)).toEqual(["connected", "disconnected", "reconnected", "remap-applied"]);
    expect(Object.isFrozen(session)).toBe(true);
  });

  it("requires the complete chronological evidence protocol and rejects virtual reconnects", () => {
    expect(() => createPhysicalControllerHardwareSession(draft({ events: draft().events.slice(0, 3) }))).toThrow(/requires connected, disconnected, reconnected, and remap/u);
    const invalidEvents = [...draft().events];
    invalidEvents[2] = { kind: "reconnected", recordedAt: "2026-07-28T00:02:00.000Z", snapshot: controller({ id: "vJoy Virtual Device", timestamp: 48 }) };
    expect(() => createPhysicalControllerHardwareSession(draft({ events: invalidEvents }))).toThrow(/not eligible/u);
  });

  it("requires an explicit human review and verifies session integrity before accepting it", () => {
    const session = createPhysicalControllerHardwareSession(draft());
    const reviewed = reviewPhysicalControllerHardwareSession(session, {
      reviewerId: "reviewer-1", reviewedAt: "2026-07-28T00:04:00.000Z", disposition: "accepted", notes: "Observed physical reconnect and preset change.",
    });
    expect(reviewed.reviewDisposition).toBe("accepted");
    expect(() => reviewPhysicalControllerHardwareSession({ ...session, integrity: { ...session.integrity, contentHash: "b".repeat(64) } }, {
      reviewerId: "reviewer-1", reviewedAt: "2026-07-28T00:04:00.000Z", disposition: "accepted", notes: "tampered",
    })).toThrow(/integrity/u);
  });
});
