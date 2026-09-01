import type { WeaponId } from "../../gameplay/weapon-selection";
import type { AttackPresentationCue, AttackPresentationCueSink } from "../../gameplay/combat/attack-presentation-cue";

export type AttackMotionFamily = "precision" | "weight" | "cleave" | "tether" | "ballistic";

export interface AttackPresentationProfile {
  readonly weaponId: WeaponId;
  readonly motion: AttackMotionFamily;
  readonly bodyColor: string;
  readonly edgeColor: string;
  readonly inkColor: string;
  readonly highParticleBudget: number;
  readonly lowParticleBudget: number;
  readonly trailPersistence: number;
}

export const ATTACK_PRESENTATION_PROFILES: Readonly<Record<WeaponId, AttackPresentationProfile>> = Object.freeze({
  sword: Object.freeze({ weaponId: "sword", motion: "precision", bodyColor: "#13c4d6", edgeColor: "#f2ffff",
    inkColor: "#12333d", highParticleBudget: 6, lowParticleBudget: 3, trailPersistence: 0.09 }),
  hammer: Object.freeze({ weaponId: "hammer", motion: "weight", bodyColor: "#b57a20", edgeColor: "#fff0bd",
    inkColor: "#332614", highParticleBudget: 9, lowParticleBudget: 4, trailPersistence: 0.16 }),
  greatsword: Object.freeze({ weaponId: "greatsword", motion: "cleave", bodyColor: "#8960a8", edgeColor: "#eee6f4",
    inkColor: "#30283a", highParticleBudget: 8, lowParticleBudget: 4, trailPersistence: 0.14 }),
  chainblade: Object.freeze({ weaponId: "chainblade", motion: "tether", bodyColor: "#39795d", edgeColor: "#e5fff1",
    inkColor: "#1c3028", highParticleBudget: 7, lowParticleBudget: 3, trailPersistence: 0.11 }),
  riftlock: Object.freeze({ weaponId: "riftlock", motion: "ballistic", bodyColor: "#4f94a3", edgeColor: "#f5ffff",
    inkColor: "#263947", highParticleBudget: 5, lowParticleBudget: 2, trailPersistence: 0.06 }),
});

export interface AttackPresentationDirectorPorts {
  readonly scope: () => unknown;
  readonly tick: () => number;
  readonly lowGraphics: () => boolean;
  readonly reducedMotion: () => boolean;
  readonly highContrast: () => boolean;
  readonly contrastColor: () => string;
  readonly edgeTrace: (x1: number, y1: number, x2: number, y2: number, thickness: number, life: number, color: string) => void;
  readonly contactMark: (x: number, y: number, tangentX: number, tangentY: number, length: number, thickness: number, life: number, color: string) => void;
  readonly groundPulse: (x: number, y: number, normalX: number, normalY: number, halfWidth: number, life: number, color: string) => void;
  readonly muzzleWedge: (x: number, y: number, directionX: number, directionY: number, length: number, halfWidth: number, life: number, color: string) => void;
  readonly burst: (x: number, y: number, dx: number, dy: number, count: number, color: string) => void;
  readonly record?: (cue: AttackPresentationCue) => void;
}

function normalized(x: number, y: number, fallbackX: number, fallbackY: number): readonly [number, number] {
  const magnitude = Math.hypot(x, y);
  return magnitude > 0.0001 ? [x / magnitude, y / magnitude] : [fallbackX, fallbackY];
}

/** Bounded one-shot recipe dispatcher. It never advances gameplay or owns time. */
export class AttackPresentationDirector implements AttackPresentationCueSink {
  readonly #seen = new Set<string>();
  readonly #order: string[] = [];
  #scope: unknown;
  #hasScope = false;

  constructor(private readonly ports: AttackPresentationDirectorPorts, private readonly dedupeCapacity = 64) {}

  emit(cue: AttackPresentationCue): void {
    const scope = this.ports.scope();
    if (!this.#hasScope || scope !== this.#scope) {
      this.#seen.clear();
      this.#order.length = 0;
      this.#scope = scope;
      this.#hasScope = true;
    }
    const tick = this.ports.tick();
    const key = `${String(tick)}:${cue.weaponId}:${String(cue.attackId)}:${cue.phase}:${cue.variant}:${String(Math.round(cue.x))}:${String(Math.round(cue.y))}`;
    if (this.#seen.has(key)) return;
    this.#seen.add(key); this.#order.push(key);
    if (this.#order.length > this.dedupeCapacity) {
      const expired = this.#order.shift();
      if (expired !== undefined) this.#seen.delete(expired);
    }
    this.ports.record?.(cue);

    const profile = ATTACK_PRESENTATION_PROFILES[cue.weaponId];
    const intensity = Math.max(0, Math.min(1, cue.intensity));
    const lowGraphics = this.ports.lowGraphics();
    const particles = lowGraphics ? profile.lowParticleBudget : profile.highParticleBudget;
    const reducedMotion = this.ports.reducedMotion();
    const contrastColor = this.ports.highContrast() ? this.ports.contrastColor() : null;
    const edgeColor = contrastColor ?? profile.edgeColor;
    const bodyColor = contrastColor ?? profile.bodyColor;
    const inkColor = contrastColor ?? profile.inkColor;
    const [directionX, directionY] = normalized(cue.directionX, cue.directionY, 1, 0);
    const [normalX, normalY] = normalized(cue.normalX ?? -directionX, cue.normalY ?? -directionY, 0, -1);
    const tangentX = -normalY, tangentY = normalX;
    const burst = (scale: number, color = edgeColor): void => {
      if (reducedMotion) return;
      this.ports.burst(cue.x, cue.y, directionX, directionY,
        Math.max(1, Math.round(particles * scale)), color);
    };
    const trace = (thickness: number, color = bodyColor): void => {
      if (reducedMotion || lowGraphics) return;
      this.ports.edgeTrace(cue.sourceX, cue.sourceY, cue.x, cue.y, thickness,
        profile.trailPersistence, color);
    };
    const contact = (length: number, thickness: number, life: number, color = edgeColor): void => {
      this.ports.contactMark(cue.x, cue.y, tangentX, tangentY, length, thickness, life, color);
    };

    switch (cue.variant) {
      case "reversal":
        trace(2, edgeColor); contact(14, 2, 0.07); burst(0.55 + intensity * 0.45);
        break;
      case "threadcut":
        trace(2); contact(14, 2, 0.07); burst(0.6, bodyColor);
        break;
      case "break":
        if (reducedMotion) contact(18, 3, 0.09, inkColor);
        else this.ports.groundPulse(cue.x, cue.y, normalX, normalY, 22, profile.trailPersistence, inkColor);
        burst(0.7 + intensity * 0.2, bodyColor);
        break;
      case "meteor":
        if (reducedMotion) contact(24, 4, 0.1, inkColor);
        else this.ports.groundPulse(cue.x, cue.y, normalX, normalY, 34, profile.trailPersistence, inkColor);
        burst(0.8 + intensity * 0.2, bodyColor);
        break;
      case "hammerReturn":
        trace(4, edgeColor); contact(18, 3, 0.09); burst(0.5, bodyColor);
        break;
      case "cleave":
        trace(5); contact(26, 4, 0.1); burst(0.6, bodyColor);
        break;
      case "wheelCut":
      case "wheelReturn":
        trace(5); contact(26, 4, 0.1);
        burst(cue.variant === "wheelReturn" ? 0.7 : 0.6, bodyColor);
        break;
      case "lash":
        trace(2); contact(12, 2, 0.08); burst(0.45, bodyColor);
        break;
      case "hook":
      case "sling":
        trace(cue.variant === "hook" ? 2 : 3, cue.variant === "hook" ? bodyColor : edgeColor);
        contact(cue.variant === "hook" ? 10 : 14, 2, 0.08);
        burst(cue.variant === "hook" ? 0.4 : 0.65, bodyColor);
        break;
      case "recoilCut":
      case "chamberCut":
      case "bayonet":
        trace(cue.variant === "bayonet" ? 2 : 3, cue.variant === "chamberCut" ? bodyColor : edgeColor);
        contact(cue.variant === "bayonet" ? 8 : 12, 2, 0.06);
        burst(cue.variant === "bayonet" ? 0.3 : 0.45);
        break;
      case "capture":
      case "backblast":
        trace(2, cue.variant === "capture" ? bodyColor : edgeColor);
        contact(cue.variant === "capture" ? 8 : 14, 2, cue.variant === "capture" ? 0.06 : 0.08);
        burst(cue.variant === "capture" ? 0.4 : 0.65);
        break;
      case "razorRound":
      case "backblastRound":
        if (cue.phase === "start") {
          this.ports.muzzleWedge(cue.sourceX, cue.sourceY, directionX, directionY,
            cue.variant === "backblastRound" ? 28 : 20, cue.variant === "backblastRound" ? 7 : 5,
            cue.variant === "backblastRound" ? 0.07 : 0.055,
            cue.variant === "backblastRound" ? edgeColor : bodyColor);
        } else {
          contact(cue.variant === "backblastRound" ? 12 : 8, 2,
            cue.variant === "backblastRound" ? 0.08 : 0.06,
            cue.variant === "backblastRound" ? edgeColor : bodyColor);
          burst(cue.variant === "backblastRound" ? 0.8 : 0.65,
            cue.variant === "backblastRound" ? edgeColor : bodyColor);
        }
        break;
    }
  }
}
