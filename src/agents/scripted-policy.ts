import { AIM_TURN_SCALE, INPUT_AXIS_SCALE, type GameAction } from "../input/game-action";
import type { TearObservedActorV1 } from "../tearbench/contracts";
import type {
  TearAgentDecision,
  TearAgentModule,
  TearAgentObjective,
  TearAgentObservation,
  TearAgentProfileId,
  TearBladeManeuver,
} from "./contracts";

export interface TearTargetDecision {
  readonly target?: TearObservedActorV1;
  readonly threat: number;
}

export class TacticalCombatModule implements TearAgentModule<TearAgentObservation, TearTargetDecision> {
  decide(observation: TearAgentObservation): TearTargetDecision {
    const player = observation.state.player;
    const ranked = observation.state.entities
      .filter((entity) => entity.kind !== "platform" && entity.kind !== "hazard")
      .map((entity) => {
        const distance = Math.hypot(entity.x - player.x, entity.y - player.y);
        const threat = (entity.threat ?? 1) * 10_000 - distance;
        return { entity, threat };
      })
      .sort((left, right) => right.threat - left.threat || left.entity.id.localeCompare(right.entity.id));
    const first = ranked[0];
    return first === undefined ? { threat: 0 } : { target: first.entity, threat: first.threat };
  }
}

function aimTurn(dx: number, dy: number): number {
  const radians = Math.atan2(dy, dx);
  const normalized = radians < 0 ? radians + Math.PI * 2 : radians;
  return Math.min(AIM_TURN_SCALE - 1, Math.floor(normalized / (Math.PI * 2) * AIM_TURN_SCALE));
}

export interface BladeMotorInput {
  readonly observation: TearAgentObservation;
  readonly target?: TearObservedActorV1;
  readonly profile: TearAgentProfileId;
}

export interface BladeMotorDecision {
  readonly maneuver: TearBladeManeuver;
  readonly actions: readonly GameAction[];
}

export class BladeMotorModule implements TearAgentModule<BladeMotorInput, BladeMotorDecision> {
  decide(input: BladeMotorInput): BladeMotorDecision {
    const { state } = input.observation;
    const target = input.target;
    if (state.blade.state === "thrown" || state.blade.state === "embedded") {
      return { maneuver: "recall", actions: [{ type: "weapon", intent: "recall", phase: "pressed" }] };
    }
    const incoming = state.entities.find((entity) =>
      entity.kind === "projectile" && Math.hypot(entity.x - state.player.x, entity.y - state.player.y) < 170);
    if (incoming !== undefined) {
      return {
        maneuver: "parry",
        actions: [
          { type: "aim", turn: aimTurn(incoming.x - state.player.x, incoming.y - state.player.y) },
          { type: "weapon", intent: "primary", phase: "pressed" },
        ],
      };
    }
    if (target === undefined) return { maneuver: "recover", actions: [] };
    const dx = target.x - state.player.x;
    const dy = target.y - state.player.y;
    const distance = Math.hypot(dx, dy);
    const aim: GameAction = { type: "aim", turn: aimTurn(dx, dy) };
    if (distance > 330) {
      return { maneuver: "throw", actions: [aim, { type: "weapon", intent: "throw", phase: "pressed" }] };
    }
    if (input.profile === "style" && state.tick % 180 < 2) {
      return { maneuver: "secondary", actions: [aim, { type: "weapon", intent: "secondary", phase: "pressed" }] };
    }
    return { maneuver: "slash", actions: [aim, { type: "weapon", intent: "primary", phase: "pressed" }] };
  }
}

export interface MovementDecision {
  readonly actions: readonly GameAction[];
  readonly recovering: boolean;
}

export class RecoveryModule implements TearAgentModule<BladeMotorInput, MovementDecision | null> {
  decide(input: BladeMotorInput): MovementDecision | null {
    const player = input.observation.state.player;
    const target = input.target;
    const lowHealth = player.hp / player.maxHp < (input.profile === "survival" ? 0.65 : 0.3);
    if (!lowHealth || target === undefined) return null;
    const away = target.x >= player.x ? -INPUT_AXIS_SCALE : INPUT_AXIS_SCALE;
    return {
      actions: [
        { type: "move", x: away, y: 0 },
        ...(player.dashCharges > 0 ? [{ type: "dash", x: away, y: 0 } as const] : []),
      ],
      recovering: true,
    };
  }
}

export class MovementModule implements TearAgentModule<BladeMotorInput, MovementDecision> {
  readonly #recovery = new RecoveryModule();

  decide(input: BladeMotorInput): MovementDecision {
    const player = input.observation.state.player;
    const target = input.target;
    const recovery = this.#recovery.decide(input);
    if (recovery !== null) return recovery;
    if (target === undefined) return { actions: [{ type: "move", x: 0, y: 0 }], recovering: false };
    const dx = target.x - player.x;
    const moveX = Math.abs(dx) < 90 ? 0 : dx > 0 ? INPUT_AXIS_SCALE : -INPUT_AXIS_SCALE;
    const actions: GameAction[] = [{ type: "move", x: moveX, y: 0 }];
    if (target.y < player.y - 90 && player.grounded) actions.push({ type: "jump", phase: "pressed" });
    if (Math.abs(dx) > 280 && player.dashCharges > 0) actions.push({ type: "dash", x: moveX, y: 0 });
    return { actions, recovering: false };
  }
}

export class DraftModule implements TearAgentModule<TearAgentObservation, readonly GameAction[]> {
  decide(observation: TearAgentObservation): readonly GameAction[] {
    const choices = observation.ui?.choices;
    if (choices === undefined || choices.length === 0) return [];
    const selected = [...choices].sort((left, right) =>
      (right.score ?? 0) - (left.score ?? 0) || left.id.localeCompare(right.id))[0];
    return selected === undefined ? [] : [{ type: "draft-choice", choiceId: selected.id }];
  }
}

export class MenuJourneyModule implements TearAgentModule<TearAgentObservation, readonly GameAction[]> {
  readonly #menu = new MenuModule();

  decide(observation: TearAgentObservation): readonly GameAction[] {
    const screen = observation.ui?.screen;
    if (screen === undefined || screen === "playing") return [];
    if (screen === "draft") return new DraftModule().decide(observation);
    return this.#menu.decide(observation);
  }
}

export class MenuModule implements TearAgentModule<TearAgentObservation, readonly GameAction[]> {
  decide(observation: TearAgentObservation): readonly GameAction[] {
    return observation.ui?.screen === "playing" ? [] : [{ type: "confirm" }];
  }
}

export class CriticModule implements TearAgentModule<TearAgentObservation, readonly string[]> {
  decide(observation: TearAgentObservation): readonly string[] {
    const notes: string[] = [];
    if (observation.state.player.hp <= 0) notes.push("player-defeated");
    if (observation.state.availableActions.length === 0) notes.push("no-actions-advertised");
    if (observation.ui?.screen === "playing" && observation.state.entities.length === 0) notes.push("awaiting-wave-progress");
    return Object.freeze(notes);
  }
}

export class InvariantSentinelModule implements TearAgentModule<TearAgentObservation, boolean> {
  decide(observation: TearAgentObservation): boolean {
    const { player, blade } = observation.state;
    return [player.x, player.y, player.hp, blade.tipX, blade.tipY, blade.tipSpeed].every(Number.isFinite)
      && player.hp >= 0
      && player.hp <= player.maxHp;
  }
}

export class RunStrategyModule implements TearAgentModule<
  Readonly<{ observation: TearAgentObservation; recovering: boolean }>,
  TearAgentObjective
> {
  decide(input: Readonly<{ observation: TearAgentObservation; recovering: boolean }>): TearAgentObjective {
    if (input.recovering) return "recover";
    const screen = input.observation.ui?.screen;
    if (screen === "draft" || screen === "tierup") return "select-reward";
    if (screen !== undefined && screen !== "playing") {
      return screen === "gameover" || screen === "win" ? "return-to-menu" : "navigate-menu";
    }
    if (input.observation.boss !== undefined) return "defeat-boss";
    return "clear-wave";
  }
}

export class TearScriptedPolicy {
  readonly #profile: TearAgentProfileId;
  readonly #tactical = new TacticalCombatModule();
  readonly #blade = new BladeMotorModule();
  readonly #movement = new MovementModule();
  readonly #journey = new MenuJourneyModule();
  readonly #critic = new CriticModule();
  readonly #sentinel = new InvariantSentinelModule();
  readonly #strategy = new RunStrategyModule();

  constructor(profile: TearAgentProfileId) {
    this.#profile = profile;
  }

  decide(observation: TearAgentObservation): TearAgentDecision {
    const safe = this.#sentinel.decide(observation);
    const targetDecision = this.#tactical.decide(observation);
    const motorInput: BladeMotorInput = {
      observation,
      profile: this.#profile,
      ...(targetDecision.target === undefined ? {} : { target: targetDecision.target }),
    };
    const blade = this.#blade.decide(motorInput);
    const movement = this.#movement.decide(motorInput);
    const menuActions = this.#journey.decide(observation);
    const actions = safe
      ? [...menuActions, ...(menuActions.length === 0 ? [...movement.actions, ...blade.actions] : [])]
      : [{ type: "pause" } as const];
    const critic = this.#critic.decide(observation);
    return Object.freeze({
      actions: Object.freeze(actions),
      trace: Object.freeze({
        tick: observation.state.tick,
        profile: this.#profile,
        objective: safe ? this.#strategy.decide({ observation, recovering: movement.recovering }) : "recover",
        ...(targetDecision.target === undefined ? {} : { targetId: targetDecision.target.id }),
        maneuver: safe ? blade.maneuver : "recover",
        confidence: safe ? Math.max(0, Math.min(1, 0.55 + targetDecision.threat / 100_000)) : 0,
        recovery: movement.recovering || !safe,
        observationClass: observation.state.observationClass,
        critic,
      }),
    });
  }
}

/** Public orchestration boundary; scripted and future learned policies share its decision contract. */
export class TearAgentOrchestrator extends TearScriptedPolicy {}

export const SCRIPTED_POLICY_PROFILES = Object.freeze([
  "smoke", "competent", "style", "survival", "chaos", "menu", "transition-hunter",
] as const satisfies readonly TearAgentProfileId[]);
