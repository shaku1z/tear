import { describe, expect, it, vi } from "vitest";
import type { AttackPresentationCue } from "../../src/gameplay/combat/attack-presentation-cue";
import {
  ATTACK_PRESENTATION_PROFILES,
  AttackPresentationDirector,
  type AttackPresentationDirectorPorts,
} from "../../src/presentation/combat/attack-presentation-director";
import {
  decodeAttackPresentationEffect,
  encodeAttackPresentationEffect,
} from "../../src/presentation/combat/attack-presentation-effect-codec";

function makePorts(overrides: Partial<AttackPresentationDirectorPorts> = {}): AttackPresentationDirectorPorts {
  return {
    scope: () => "run", tick: () => 12, lowGraphics: () => false, reducedMotion: () => false,
    highContrast: () => false, contrastColor: () => "#000000",
    edgeTrace: vi.fn(), contactMark: vi.fn(), groundPulse: vi.fn(), muzzleWedge: vi.fn(), burst: vi.fn(),
    ...overrides,
  };
}

describe("AttackPresentationDirector", () => {
  it("defines one bounded physical motion identity for every canonical weapon", () => {
    expect(Object.keys(ATTACK_PRESENTATION_PROFILES)).toEqual([
      "sword", "hammer", "greatsword", "chainblade", "riftlock",
    ]);
    expect(new Set(Object.values(ATTACK_PRESENTATION_PROFILES).map((profile) => profile.motion)).size).toBe(5);
    for (const profile of Object.values(ATTACK_PRESENTATION_PROFILES)) {
      expect(profile.lowParticleBudget).toBeLessThan(profile.highParticleBudget);
      expect(profile.trailPersistence).toBeGreaterThan(0);
      expect(profile.trailPersistence).toBeLessThanOrEqual(0.16);
    }
  });

  it("renders and deduplicates Sword reversal with measured geometry", () => {
    let tick = 42;
    const scope = {};
    const edgeTrace = vi.fn(), contactMark = vi.fn(), burst = vi.fn();
    const director = new AttackPresentationDirector(makePorts({ scope: () => scope, tick: () => tick,
      edgeTrace, contactMark, burst }));
    const cue = { weaponId: "sword" as const, attackId: 7, swingId: 3, throwId: 1,
      action: "held" as const, phase: "contact" as const, variant: "reversal",
      sourceX: 10, sourceY: 20, x: 30, y: 40, directionX: 900, directionY: -100, intensity: 0.8 };
    director.emit(cue); director.emit(cue);
    expect(edgeTrace).toHaveBeenCalledWith(10, 20, 30, 40, 2, 0.09, "#f2ffff");
    expect(contactMark).toHaveBeenCalledOnce();
    expect(burst).toHaveBeenCalledOnce();
    tick += 1; director.emit(cue);
    expect(edgeTrace).toHaveBeenCalledTimes(2);
  });

  it("keeps reduced-motion Threadcut readable as a static contact mark", () => {
    const edgeTrace = vi.fn(), contactMark = vi.fn(), burst = vi.fn();
    const director = new AttackPresentationDirector(makePorts({ reducedMotion: () => true,
      edgeTrace, contactMark, burst }));
    director.emit({ weaponId: "sword", attackId: 2, throwId: 2, action: "secondary", phase: "return",
      variant: "threadcut", sourceX: 0, sourceY: 0, x: 100, y: 80, directionX: -500, directionY: 0, intensity: 1 });
    expect(edgeTrace).not.toHaveBeenCalled();
    expect(burst).not.toHaveBeenCalled();
    expect(contactMark).toHaveBeenCalledOnce();
  });

  it("keeps low graphics to the primary contact silhouette and resolves high-contrast color", () => {
    const edgeTrace = vi.fn(), contactMark = vi.fn(), burst = vi.fn();
    const director = new AttackPresentationDirector(makePorts({ lowGraphics: () => true,
      highContrast: () => true, contrastColor: () => "#111111", edgeTrace, contactMark, burst }));
    director.emit({ weaponId: "greatsword", attackId: 9, action: "held", phase: "contact", variant: "cleave",
      sourceX: 0, sourceY: 0, x: 30, y: 40, directionX: 300, directionY: 0, intensity: 1 });

    expect(edgeTrace).not.toHaveBeenCalled();
    expect(contactMark).toHaveBeenCalledWith(30, 40, 0, -1, 26, 4, 0.1, "#111111");
    expect(burst).toHaveBeenCalledWith(30, 40, 1, 0, 2, "#111111");
  });

  it("uses a surface-tangent ground pulse for Hammer Meteor", () => {
    const groundPulse = vi.fn();
    const director = new AttackPresentationDirector(makePorts({ groundPulse }));
    director.emit({ weaponId: "hammer", attackId: 3, action: "impact", phase: "impact", variant: "meteor",
      sourceX: 50, sourceY: 10, x: 50, y: 60, directionX: 0, directionY: 500,
      normalX: 0, normalY: -1, material: "stone", intensity: 1 });
    expect(groundPulse).toHaveBeenCalledWith(50, 60, 0, -1, 34, 0.16, "#332614");
  });

  it.each([
    ["hammer", "break"], ["hammer", "meteor"], ["hammer", "hammerReturn"],
    ["greatsword", "cleave"], ["greatsword", "wheelCut"], ["greatsword", "wheelReturn"],
    ["chainblade", "lash"], ["chainblade", "hook"], ["chainblade", "sling"],
    ["riftlock", "recoilCut"], ["riftlock", "chamberCut"], ["riftlock", "bayonet"],
    ["riftlock", "capture"], ["riftlock", "backblast"], ["riftlock", "razorRound"],
    ["riftlock", "backblastRound"],
  ] as const)("renders the bounded %s %s physical recipe", (weaponId, variant) => {
    const edgeTrace = vi.fn(), contactMark = vi.fn(), groundPulse = vi.fn(), muzzleWedge = vi.fn(), burst = vi.fn();
    const director = new AttackPresentationDirector(makePorts({ edgeTrace, contactMark, groundPulse, muzzleWedge, burst }));
    director.emit({ weaponId, attackId: 3, action: "held", phase: "contact", variant,
      sourceX: 1, sourceY: 2, x: 30, y: 40, directionX: 300, directionY: -120, intensity: 0.75 });

    expect(edgeTrace.mock.calls.length + contactMark.mock.calls.length + groundPulse.mock.calls.length
      + muzzleWedge.mock.calls.length + burst.mock.calls.length).toBeGreaterThan(0);
    expect(edgeTrace.mock.calls.length).toBeLessThanOrEqual(1);
    expect(contactMark.mock.calls.length).toBeLessThanOrEqual(1);
    expect(groundPulse.mock.calls.length).toBeLessThanOrEqual(1);
    expect(muzzleWedge.mock.calls.length).toBeLessThanOrEqual(1);
    expect(burst.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("never calls the rejected generic ribbon or ring grammar", () => {
    const ports = makePorts();
    expect("ribbon" in ports).toBe(false);
    expect("ring" in ports).toBe(false);
  });

  it("keeps every weapon-family recipe inside the reduced-motion particle boundary", () => {
    const burst = vi.fn(), edgeTrace = vi.fn(), contactMark = vi.fn();
    const director = new AttackPresentationDirector(makePorts({ lowGraphics: () => true, reducedMotion: () => true,
      burst, edgeTrace, contactMark }));
    for (const [index, [weaponId, variant]] of ([
      ["hammer", "meteor"], ["greatsword", "wheelCut"], ["chainblade", "sling"], ["riftlock", "backblast"],
    ] as const).entries()) {
      director.emit({ weaponId, attackId: index, action: "throw", phase: "contact", variant,
        sourceX: 0, sourceY: 0, x: 10, y: 10, directionX: 100, directionY: 0, intensity: 1 });
    }
    expect(burst).not.toHaveBeenCalled();
    expect(edgeTrace).not.toHaveBeenCalled();
    expect(contactMark).toHaveBeenCalledTimes(4);
  });

  it("accepts an identical first cue after the active run scope changes", () => {
    let scope: object = {};
    const edgeTrace = vi.fn();
    const director = new AttackPresentationDirector(makePorts({ scope: () => scope, tick: () => 42, edgeTrace }));
    const cue = { weaponId: "sword" as const, attackId: 7, action: "held" as const, phase: "contact" as const,
      variant: "reversal", sourceX: 10, sourceY: 20, x: 30, y: 40, directionX: 1, directionY: 0, intensity: 0.8 };

    director.emit(cue); director.emit(cue);
    scope = {};
    director.emit(cue);
    expect(edgeTrace).toHaveBeenCalledTimes(2);
  });

  it("round-trips a bounded cosmetic replay fact without changing authoritative state", () => {
    const cue = { weaponId: "chainblade" as const, attackId: 19, throwId: 4,
      action: "secondary" as const, phase: "return" as const, variant: "sling",
      sourceX: 40.4, sourceY: 55.6, x: 180, y: 90, directionX: -920.4, directionY: 311.2,
      normalX: 0, normalY: -1, material: "metal" as const, intensity: 0.84 };
    const effect = encodeAttackPresentationEffect(cue);
    const decoded = decodeAttackPresentationEffect(effect, cue.x, cue.y, cue.attackId);

    expect(effect).toMatch(/^attack:v1:chainblade:/);
    expect(decoded).toEqual(expect.objectContaining({ weaponId: "chainblade", attackId: 19,
      action: "secondary", phase: "return", variant: "sling", x: 180, y: 90,
      directionX: -920, directionY: 311, intensity: 0.84 }));
    expect(decoded?.sourceX).toBeCloseTo(40);
    expect(decoded?.sourceY).toBeCloseTo(56);
    expect(decoded?.normalX).toBeUndefined();
    expect(decoded?.material).toBeUndefined();
    expect(decodeAttackPresentationEffect("attack:v99:sword:held:contact:reversal:0:0:0:0:100", 0, 0, 1)).toBeNull();
  });

  it("records a semantic cue once after deduplication", () => {
    const record = vi.fn();
    const director = new AttackPresentationDirector(makePorts({ reducedMotion: () => true, record }));
    const cue: AttackPresentationCue = { weaponId: "hammer", attackId: 3, action: "impact", phase: "impact",
      variant: "meteor", sourceX: 0, sourceY: 0, x: 50, y: 60, directionX: 0, directionY: 500, intensity: 1 };
    director.emit(cue); director.emit(cue);
    expect(record).toHaveBeenCalledOnce();
  });
});
