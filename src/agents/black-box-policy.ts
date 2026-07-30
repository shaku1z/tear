import type { TearPixelTemporalObservation } from "./pixel-observation";

/** Inputs below are literal player-device gestures.  They intentionally do not
 * carry GameAction, ScreenAction, entity IDs, choice IDs, or any hidden state. */
export type TearClassCPhysicalIntent =
  | Readonly<{ device: "keyboard-mouse"; type: "key"; code: string; phase: "down" | "up" }>
  | Readonly<{ device: "keyboard-mouse"; type: "pointer"; x: number; y: number; button: 0 | 1 | 2; phase: "move" | "down" | "up" }>
  | Readonly<{ device: "touch"; type: "touch"; x: number; y: number; phase: "start" | "end"; identifier: number }>;

export type TearClassCPolicyStage = "boot" | "opening-menu" | "configuring-run" | "playing" | "selecting-reward" | "returning-menu" | "failed";

export interface TearClassCPolicyDecision {
  readonly stage: TearClassCPolicyStage;
  readonly confidence: number;
  readonly reason: string;
  readonly intents: readonly TearClassCPhysicalIntent[];
}

export type TearClassCPhysicalInputProfile = "keyboard-mouse" | "touch";

const pointerClick = (x: number, y: number): readonly TearClassCPhysicalIntent[] => Object.freeze([
  { device: "keyboard-mouse", type: "pointer", x, y, button: 0, phase: "move" },
  { device: "keyboard-mouse", type: "pointer", x, y, button: 0, phase: "down" },
  { device: "keyboard-mouse", type: "pointer", x, y, button: 0, phase: "up" },
]);

const touchTap = (x: number, y: number): readonly TearClassCPhysicalIntent[] => Object.freeze([
  { device: "touch", type: "touch", x, y, identifier: 1, phase: "start" },
  { device: "touch", type: "touch", x, y, identifier: 1, phase: "end" },
]);

/**
 * A deliberately small, auditable pixel-only bootstrap policy.  It can operate
 * public menu affordances and performs conservative human-valid combat pulses.
 * It is not a completion certificate by itself; a caller must retain the full
 * screenshot/gesture transcript and have the Class-C statistics gate assess it.
 */
export class TearClassCVisualPolicy {
  readonly #inputProfile: TearClassCPhysicalInputProfile;
  #stage: TearClassCPolicyStage = "boot";
  #setupStep = 0;

  constructor(inputProfile: TearClassCPhysicalInputProfile = "keyboard-mouse") {
    this.#inputProfile = inputProfile;
  }

  get stage(): TearClassCPolicyStage { return this.#stage; }

  decide(input: TearPixelTemporalObservation): TearClassCPolicyDecision {
    if (input.occluded || input.observation.confidence < 0.5) {
      return Object.freeze({ stage: this.#stage, confidence: input.observation.confidence, reason: "visual-surface-occluded-or-low-confidence", intents: Object.freeze([]) });
    }
    const screen = input.observation.kind;
    if ((this.#stage === "boot" || this.#stage === "opening-menu") && screen === "menu-like") {
      // Do not infer that a press navigated until the next visible frame says
      // so. This lets touch's legitimate focus-then-activate interaction
      // issue a second normal tap while keeping keyboard/mouse equally honest.
      this.#stage = "opening-menu";
      return Object.freeze({ stage: this.#stage, confidence: input.observation.confidence, reason: "visible-menu-primary-affordance", intents: this.#tap(260, 360) });
    }
    if ((this.#stage === "opening-menu" || this.#stage === "configuring-run") && screen === "setup-like") {
      this.#stage = "configuring-run";
      const targets = [[430, 195], [820, 197], [1180, 203], [800, 758]] as const;
      const target = targets[this.#setupStep++];
      if (target === undefined) {
        this.#stage = "playing";
        return Object.freeze({ stage: this.#stage, confidence: input.observation.confidence, reason: "visible-run-configuration-complete", intents: Object.freeze([]) });
      }
      return Object.freeze({ stage: this.#stage, confidence: input.observation.confidence, reason: "visible-setup-affordance", intents: this.#tap(target[0], target[1]) });
    }
    if ((this.#stage === "opening-menu" || this.#stage === "configuring-run" || this.#stage === "playing") && screen === "playing-like") {
      this.#stage = "playing";
      const aim = this.#combatAim(input);
      const intents: readonly TearClassCPhysicalIntent[] = Object.freeze([
        { device: "keyboard-mouse", type: "key", code: "KeyD", phase: "down" },
        { device: "keyboard-mouse", type: "key", code: "Space", phase: "down" },
        { device: "keyboard-mouse", type: "key", code: "Space", phase: "up" },
        { device: "keyboard-mouse", type: "pointer", x: aim.x, y: aim.y, button: 0, phase: "move" },
        { device: "keyboard-mouse", type: "pointer", x: aim.x, y: aim.y, button: 0, phase: "down" },
        { device: "keyboard-mouse", type: "pointer", x: aim.x, y: aim.y, button: 0, phase: "up" },
      ] as const);
      return Object.freeze({
        stage: this.#stage, confidence: input.observation.confidence, reason: "visible-combat-pulse",
        intents,
      });
    }
    if (this.#stage === "playing" && (screen === "overlay-like" || screen === "draft-like")) {
      this.#stage = "selecting-reward";
      const target = screen === "draft-like" ? this.#draftCardTarget(input) : Object.freeze({ x: 314, y: 300 });
      const intents = screen === "draft-like" && this.#inputProfile === "keyboard-mouse"
        // The rendered card row visibly advertises 1/2/3/4. Selecting its
        // left-most card with Digit1 is a normal player key, not a reward ID.
        ? Object.freeze([
          { device: "keyboard-mouse" as const, type: "key" as const, code: "Digit1", phase: "down" as const },
          { device: "keyboard-mouse" as const, type: "key" as const, code: "Digit1", phase: "up" as const },
        ])
        : this.#tap(target.x, target.y);
      return Object.freeze({ stage: this.#stage, confidence: input.observation.confidence, reason: `visible-${screen}-affordance`, intents });
    }
    if (this.#stage !== "boot" && screen === "terminal-like") {
      if (this.#inputProfile === "touch") {
        const target = this.#terminalMenuTarget(input);
        if (target === undefined) {
          return Object.freeze({ stage: this.#stage, confidence: input.observation.confidence, reason: "visible-terminal-awaiting-touch-return-affordance", intents: Object.freeze([]) });
        }
        this.#stage = "returning-menu";
        return Object.freeze({
          stage: this.#stage, confidence: input.observation.confidence, reason: "visible-terminal-touch-menu-affordance",
          intents: this.#tap(target.x, target.y),
        });
      }
      this.#stage = "returning-menu";
      return Object.freeze({
        stage: this.#stage, confidence: input.observation.confidence, reason: "visible-terminal-keyboard-menu-navigation",
        intents: Object.freeze([
          { device: "keyboard-mouse", type: "key", code: "ArrowDown", phase: "down" },
          { device: "keyboard-mouse", type: "key", code: "ArrowDown", phase: "up" },
          { device: "keyboard-mouse", type: "key", code: "Enter", phase: "down" },
          { device: "keyboard-mouse", type: "key", code: "Enter", phase: "up" },
        ] as const),
      });
    }
    if (this.#stage === "returning-menu" && screen === "menu-like") {
      this.#stage = "boot";
      return Object.freeze({ stage: this.#stage, confidence: input.observation.confidence, reason: "visible-menu-return-complete", intents: Object.freeze([]) });
    }
    // This explicit no-op is safer than inferring an unseen state from timing.
    return Object.freeze({ stage: this.#stage, confidence: input.observation.confidence, reason: `awaiting-visible-${screen}`, intents: Object.freeze([]) });
  }

  #tap(x: number, y: number): readonly TearClassCPhysicalIntent[] {
    return this.#inputProfile === "touch" ? touchTap(x, y) : pointerClick(x, y);
  }

  /** Aim at a moving visual region in the playfield when one is observable.
   * This is intentionally image geometry, never an enemy/player identifier. */
  #combatAim(input: TearPixelTemporalObservation): Readonly<{ x: number; y: number }> {
    const { calibration } = input.observation;
    const candidate = input.world.motionRegions.find((region) => {
      const centreY = region.y + region.height / 2;
      const relativeY = (centreY - calibration.bounds.y) / calibration.bounds.height;
      return relativeY > 0.12 && relativeY < 0.82;
    });
    if (candidate !== undefined) {
      return Object.freeze({
        x: Math.max(0, Math.min(1600, (candidate.x + candidate.width / 2 - calibration.bounds.x) / calibration.scaleX)),
        y: Math.max(0, Math.min(900, (candidate.y + candidate.height / 2 - calibration.bounds.y) / calibration.scaleY)),
      });
    }
    // A neutral, visible-frame fallback keeps the bootstrap agent conservative
    // until it has an unoccluded moving target; it is not hidden game state.
    return Object.freeze({ x: 1100, y: 450 });
  }

  /** Select the left-most visible reward-card frame.  The frame is detected
   * from pixels; no choice name, value, or runtime reward ID is available. */
  #draftCardTarget(input: TearPixelTemporalObservation): Readonly<{ x: number; y: number }> {
    const { bounds, scaleX, scaleY } = input.observation.calibration;
    const candidate = input.observation.brightRegions
      .filter((region) => {
        const relativeWidth = region.width / bounds.width, relativeHeight = region.height / bounds.height;
        const relativeY = (region.y + region.height / 2 - bounds.y) / bounds.height;
        return relativeWidth >= 0.08 && relativeWidth <= 0.28 && relativeHeight >= 0.2 && relativeHeight <= 0.65
          && relativeY >= 0.2 && relativeY <= 0.8;
      })
      .sort((left, right) => left.x - right.x)[0];
    if (candidate !== undefined) {
      return Object.freeze({
        x: Math.max(0, Math.min(1600, (candidate.x + candidate.width / 2 - bounds.x) / scaleX)),
        y: Math.max(0, Math.min(900, (candidate.y + candidate.height / 2 - bounds.y) / scaleY)),
      });
    }
    // The bootstrap fallback preserves the existing visible first-card target
    // only when the detector lacks a usable rectangular card frame.
    return Object.freeze({ x: 314, y: 428 });
  }

  /**
   * Result layouts expose a vertically stacked pair of visible actions.  The
   * lower action is the menu return in the shipped gameover and victory
   * layouts.  This uses only the top action's image-space rectangle and the
   * visible stack spacing; no button label or result route is read.
   */
  #terminalMenuTarget(input: TearPixelTemporalObservation): Readonly<{ x: number; y: number }> | undefined {
    const { bounds, scaleX, scaleY } = input.observation.calibration;
    const action = input.observation.brightRegions
      .filter((region) => {
        const width = region.width / bounds.width, height = region.height / bounds.height;
        const relativeY = (region.y + region.height / 2 - bounds.y) / bounds.height;
        return width >= 0.12 && width <= 0.4 && height >= 0.035 && height <= 0.12 && relativeY >= 0.25 && relativeY <= 0.8;
      })
      .sort((left, right) => left.y - right.y)[0];
    if (action === undefined) return undefined;
    const x = (action.x + action.width / 2 - bounds.x) / scaleX;
    // The lower panel begins one visible-action height plus its visible gap
    // below the first; its center is approximately 1.8 action heights down.
    const y = (action.y + action.height * 1.8 - bounds.y) / scaleY;
    return Object.freeze({ x: Math.max(0, Math.min(1600, x)), y: Math.max(0, Math.min(900, y)) });
  }
}
