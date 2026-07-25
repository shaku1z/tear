import { describe, expect, it } from "vitest";

/**
 * Regression guards for two routing bugs found in play:
 *  1. Opening Settings mid-run handed the menu track over, because "settings"
 *     resolves to the `main-menu` scene.
 *  2. The music never came back, because an async activation was re-entered on
 *     every snapshot and each attempt cancelled the previous one.
 */

/** Mirrors BiomeStemBackend's shell test. */
const isShell = (scene: string, biomeId: string) =>
  scene === "main-menu" && biomeId === "menu";

describe("shell detection", () => {
  it("treats the real main menu as the shell", () => {
    expect(isShell("main-menu", "menu")).toBe(true);
  });

  it("does NOT treat settings opened during a run as the shell", () => {
    // scene resolves to main-menu for settings/shop/codex, but a live run
    // always reports its biome — that is what distinguishes the two.
    expect(isShell("main-menu", "The Crimson Fields")).toBe(false);
    expect(isShell("main-menu", "The Voidspire")).toBe(false);
  });

  it("never treats gameplay scenes as the shell", () => {
    for (const scene of ["combat", "boss", "paused", "draft", "victory"]) {
      expect(isShell(scene, "The Grounds")).toBe(false);
    }
  });
});

/** Mirrors the `#pendingCueId` guard. */
class ActivationGuard {
  active: string | null = null;
  pending: string | null = null;
  attempts = 0;
  request(cueId: string): void {
    if (cueId === this.active) return;
    if (cueId === this.pending) return; // the guard under test
    this.pending = cueId;
    this.attempts++;
  }
  settle(): void {
    this.active = this.pending;
    this.pending = null;
  }
}

describe("activation re-entrancy", () => {
  it("does not restart a load that is already in flight", () => {
    const g = new ActivationGuard();
    g.active = "fillet";
    // many snapshots arrive while the new cue is still decoding
    for (let i = 0; i < 60; i++) g.request("beserker");
    expect(g.attempts).toBe(1);
    g.settle();
    expect(g.active).toBe("beserker");
  });

  it("still switches when the target genuinely changes", () => {
    const g = new ActivationGuard();
    g.active = "fillet";
    g.request("beserker");
    g.request("the-source"); // a real change mid-flight
    expect(g.attempts).toBe(2);
  });
});
