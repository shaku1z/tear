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
import { movementThreatTarget, navigationDecision } from "./scripted-policy-navigation";

export interface TearTargetDecision {
  readonly target?: TearObservedActorV1;
  readonly threat: number;
}

interface ProjectileIntercept {
  readonly entity: TearObservedActorV1;
  readonly time: number;
  readonly missDistance: number;
  readonly distance: number;
}

function incomingProjectiles(
  observation: TearAgentObservation,
  horizon = 0.9,
): readonly ProjectileIntercept[] {
  const player = observation.state.player;
  return observation.state.entities.flatMap((entity) => {
    if (entity.kind !== "projectile") return [];
    const dx = player.x - entity.x, dy = player.y - entity.y;
    const speedSquared = entity.vx * entity.vx + entity.vy * entity.vy;
    if (speedSquared < 1) return [];
    const time = (dx * entity.vx + dy * entity.vy) / speedSquared;
    if (time < 0 || time > horizon) return [];
    const missDistance = Math.hypot(entity.x + entity.vx * time - player.x,
      entity.y + entity.vy * time - player.y);
    return [{ entity, time, missDistance, distance: Math.hypot(dx, dy) }];
  }).sort((left, right) => left.missDistance - right.missDistance
    || left.time - right.time || left.entity.id.localeCompare(right.entity.id));
}

export class TacticalCombatModule implements TearAgentModule<TearAgentObservation, TearTargetDecision> {
  decide(observation: TearAgentObservation, preferredId?: string): TearTargetDecision {
    const player = observation.state.player;
    const ranked = observation.state.entities
      .filter((entity) => !["platform", "hazard", "projectile"].includes(entity.kind))
      .map((entity) => {
        const distance = Math.hypot(entity.x - player.x, entity.y - player.y);
        const execute = (1 - (entity.hpRatio ?? 1)) * 3_000;
        const kindPriority = ["bomber", "ranged", "flyer", "wraith", "priest", "mender", "herald"]
          .includes(entity.kind) ? 2_000 : 0;
        const windup = /attack|charge|commit|wind|pounce|slam|stomp|strike|swing/u.test(entity.state ?? "") ? 2_500 : 0;
        const proximity = Math.max(0, 450 - distance) * 8;
        const immediate = distance < 260 ? 7_000 : distance < 400 ? 4_000 : 0;
        const threat = (entity.threat ?? 1) * 6_000 + execute + kindPriority + windup
          + proximity + immediate - distance;
        return { entity, threat };
      })
      .sort((left, right) => right.threat - left.threat || left.entity.id.localeCompare(right.entity.id));
    const preferred = ranked.find((entry) => entry.entity.id === preferredId);
    const immediate = ranked.find((entry) =>
      Math.hypot(entry.entity.x - player.x, entry.entity.y - player.y) < 120
      && /attack|charge|commit|pounce|slam/u.test(entry.entity.state ?? ""));
    if (immediate !== undefined && immediate.entity.id !== preferred?.entity.id) {
      return { target: immediate.entity, threat: immediate.threat };
    }
    if (preferred !== undefined) return { target: preferred.entity, threat: preferred.threat };
    const first = ranked[0];
    return first === undefined ? { threat: 0 } : { target: first.entity, threat: first.threat };
  }
}

function aimTurn(dx: number, dy: number): number {
  const radians = Math.atan2(dy, dx);
  const normalized = radians < 0 ? radians + Math.PI * 2 : radians;
  return Math.min(AIM_TURN_SCALE - 1, Math.floor(normalized / (Math.PI * 2) * AIM_TURN_SCALE));
}

function swingTurn(dx: number, dy: number, tick: number): number {
  const base = Math.atan2(dy, dx), phase = tick % 20;
  const offset = phase < 12 ? -1.05 + 2.1 * (phase / 11) : 0;
  return aimTurn(Math.cos(base + offset), Math.sin(base + offset));
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
    const observedBoss = input.observation.boss ?? state.diagnostics?.boss;
    const sourceEncounter = observedBoss?.id === "source";
    const sourceVoidWindow = sourceEncounter && target?.behaviorMode === "void";
    if (["thrown", "embedded", "hooked"].includes(state.blade.state)) {
      return { maneuver: "recall", actions: [{ type: "weapon", intent: "recall", phase: "pressed" }] };
    }
    if (state.blade.state === "flying" && state.run.weapon === "riftlock") {
      return { maneuver: "recall", actions: [{ type: "weapon", intent: "recall", phase: "pressed" }] };
    }
    if (["flying", "returning", "slinging"].includes(state.blade.state)) {
      return { maneuver: "recall", actions: [] };
    }
    if (target !== undefined && sourceVoidWindow) {
      return {
        maneuver: "throw",
        actions: [
          { type: "aim", turn: aimTurn(target.x - state.blade.handX, target.y - state.blade.handY) },
          { type: "weapon", intent: "throw", phase: "pressed" },
        ],
      };
    }
    const incoming = incomingProjectiles(input.observation)
      .find(({ entity, missDistance, distance }) =>
        entity.state?.includes("groundShock") !== true && missDistance < 90 && distance < 430)?.entity;
    if (incoming !== undefined) {
      const leadSeconds = Math.min(0.18, Math.hypot(incoming.x - state.player.x,
        incoming.y - state.player.y) / Math.max(1, Math.hypot(incoming.vx, incoming.vy)));
      return {
        maneuver: "parry",
        actions: [
          { type: "aim", turn: swingTurn(incoming.x + incoming.vx * leadSeconds - state.blade.handX,
            incoming.y + incoming.vy * leadSeconds - state.blade.handY, state.tick) },
          { type: "weapon", intent: "primary", phase: "pressed" },
        ],
      };
    }
    if (target === undefined) return { maneuver: "recover", actions: [] };
    const dx = target.x - state.blade.handX, dy = target.y - state.blade.handY;
    const distance = Math.hypot(dx, dy);
    const directAim: GameAction = { type: "aim", turn: aimTurn(dx, dy) };
    const swingAim: GameAction = { type: "aim", turn: swingTurn(dx, dy, state.tick) };
    const nearbyHostile = state.entities.some((entity) =>
      !["platform", "hazard", "projectile"].includes(entity.kind)
      && Math.hypot(entity.x - state.player.x, entity.y - state.player.y) < 260);
    const scheduledStyleThrow = (input.profile === "style" || input.profile === "chaos")
      && state.tick % 120 < 2;
    const riftlockLaunch = state.run.weapon === "riftlock" && distance > 120;
    if (target.kind === "wraith"
      || riftlockLaunch
      || (!nearbyHostile && distance > 420 && scheduledStyleThrow)) {
      return { maneuver: "throw", actions: [directAim, { type: "weapon", intent: "throw", phase: "pressed" }] };
    }
    if (input.profile === "style" && state.tick % 180 < 2) {
      return { maneuver: "secondary", actions: [swingAim, { type: "weapon", intent: "secondary", phase: "pressed" }] };
    }
    return {
      maneuver: "slash",
      actions: [swingAim, { type: "weapon", intent: "primary", phase: "pressed" }],
    };
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
    const pressure = input.observation.state.entities.filter((entity) =>
      !["platform", "hazard", "projectile"].includes(entity.kind)).length;
    const healthRatio = player.hp / player.maxHp;
    const threshold = input.profile === "survival" ? 0.65
      : input.profile === "competent" || input.profile === "style" ? 0.52 : 0;
    const lowHealth = healthRatio < threshold || (pressure >= 5 && healthRatio < threshold + 0.08);
    const recoveryRange = 400;
    if (!lowHealth || target === undefined
      || Math.hypot(target.x - player.x, target.y - player.y) > recoveryRange) return null;
    const bounds = input.observation.state.diagnostics?.worldBounds;
    const retreat = bounds !== undefined && player.x > bounds.maxX - 140 ? -INPUT_AXIS_SCALE
      : bounds !== undefined && player.x < bounds.minX + 140 ? INPUT_AXIS_SCALE
        : target.x >= player.x ? -INPUT_AXIS_SCALE : INPUT_AXIS_SCALE;
    return {
      actions: [
        { type: "move", x: retreat, y: 0 },
        ...(player.grounded ? [{ type: "jump", phase: "pressed" } as const] : []),
        ...(player.dashCharges > 0 ? [{ type: "dash", x: retreat, y: 0 } as const] : []),
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
    const blade = input.observation.state.blade;
    const riftlock = input.observation.state.run.weapon === "riftlock";
    if (["embedded", "hooked"].includes(blade.state)
      && Math.hypot(blade.handX - player.x, blade.handY - player.y) > 210) {
      const x = blade.handX >= player.x ? INPUT_AXIS_SCALE : -INPUT_AXIS_SCALE;
      return {
        actions: [
          { type: "move", x, y: blade.handY > player.y + 100 ? INPUT_AXIS_SCALE : 0 },
          ...(blade.handY < player.y - 70 && player.grounded ? [{ type: "jump", phase: "pressed" } as const] : []),
          ...(player.dashCharges > 0 ? [{ type: "dash", x, y: 0 } as const] : []),
        ],
        recovering: true,
      };
    }
    const incoming = incomingProjectiles(input.observation)
      .find(({ entity, missDistance }) =>
        missDistance < (entity.state?.includes("groundShock") === true ? 95 : 70));
    if (incoming !== undefined && incoming.distance < 430) {
      const projectile = incoming.entity;
      const jumpable = projectile.state?.includes("groundShock") === true;
      const bounds = input.observation.state.diagnostics?.worldBounds;
      const away = bounds !== undefined && player.x > bounds.maxX - 140 ? -INPUT_AXIS_SCALE
        : bounds !== undefined && player.x < bounds.minX + 140 ? INPUT_AXIS_SCALE
          : projectile.x >= player.x ? -INPUT_AXIS_SCALE : INPUT_AXIS_SCALE;
      return {
        actions: [
          { type: "move", x: away, y: 0 },
          ...(jumpable && player.grounded ? [{ type: "jump", phase: "pressed" } as const] : []),
          ...(!jumpable && incoming.distance < 115 && player.dashCharges > 0
            ? [{ type: "dash", x: away, y: 0 } as const] : []),
        ],
        recovering: true,
      };
    }
    const recovery = this.#recovery.decide(input);
    if (recovery !== null) return recovery;
    if (target === undefined) return { actions: [{ type: "move", x: 0, y: 0 }], recovering: false };
    const dx = target.x - player.x;
    const distance = Math.hypot(dx, target.y - player.y);
    const toward = dx > 0 ? INPUT_AXIS_SCALE : -INPUT_AXIS_SCALE, away = -toward;
    const bounds = input.observation.state.diagnostics?.worldBounds;
    const atLeftEdge = bounds !== undefined && player.x < bounds.minX + 140;
    const atRightEdge = bounds !== undefined && player.x > bounds.maxX - 140;
    const orbit = Math.floor(input.observation.state.tick / 150) % 2 === 0 ? INPUT_AXIS_SCALE : -INPUT_AXIS_SCALE;
    const armoredTarget = target.kind === "armored" && distance < 280;
    const armoredFlank = armoredTarget && !player.grounded;
    const danger = Math.hypot(target.vx, target.vy) > 320
      || /attack|charge|commit|wind|pounce|slam|stomp|strike|swing/u.test(target.state ?? "");
    const evade = away;
    const moveX = atLeftEdge ? INPUT_AXIS_SCALE : atRightEdge ? -INPUT_AXIS_SCALE
      : danger ? evade : riftlock ? away : distance < 100 ? away : distance > 145 ? toward : orbit;
    const dropThrough = target.y > player.y + 100 && player.grounded;
    const powerSlam = target.y > player.y + (armoredTarget ? 25 : 70)
      && !player.grounded && distance < 300;
    const route = navigationDecision(input, moveX);
    const routedX = route.moveX ?? moveX;
    const actions: GameAction[] = [{
      type: "move",
      x: routedX,
      y: route.moveY ?? (dropThrough ? INPUT_AXIS_SCALE : 0),
    }];
    if ((dropThrough && input.observation.state.tick % 45 < 2) || route.jump) {
      actions.push({ type: "jump", phase: "pressed" });
    }
    if ((riftlock || danger || target.y < player.y - 70 || distance < 240)
      && player.grounded && !dropThrough) actions.push({ type: "jump", phase: "pressed" });
    if (riftlock && player.dashCharges > 0 && (distance < 360 || atLeftEdge || atRightEdge)) {
      actions.push({ type: "dash", x: routedX, y: 0 });
    } else if (armoredTarget && player.grounded && distance < 180 && player.dashCharges > 0) {
      actions.push({ type: "dash", x: 0, y: -INPUT_AXIS_SCALE });
    } else if ((powerSlam || armoredFlank || danger || distance < 100
      || distance > 560 || atLeftEdge || atRightEdge) && player.dashCharges > 0) {
      actions.push(powerSlam ? { type: "dash", x: 0, y: INPUT_AXIS_SCALE }
        : { type: "dash", x: routedX, y: 0 });
    }
    return { actions, recovering: false };
  }
}

export class DraftModule implements TearAgentModule<TearAgentObservation, readonly GameAction[]> {
  decide(observation: TearAgentObservation): readonly GameAction[] {
    const choices = observation.ui?.choices;
    if (choices === undefined || choices.length === 0) return [];
    const selected = [...choices].sort((left, right) =>
      (right.score ?? 0) - (left.score ?? 0) || left.id.localeCompare(right.id))[0];
    if (selected === undefined) return [];
    if (observation.ui?.screen === "tierup") return [{ type: "tier-up-choice", choiceId: selected.id }];
    if (observation.ui?.screen === "reserve") return [{ type: "reserve-choice", choiceId: selected.id }];
    return [{ type: "draft-choice", choiceId: selected.id }];
  }
}

export class MenuJourneyModule implements TearAgentModule<TearAgentObservation, readonly GameAction[]> {
  readonly #menu = new MenuModule();

  decide(observation: TearAgentObservation): readonly GameAction[] {
    const screen = observation.ui?.screen;
    if (screen === undefined || screen === "playing") return [];
    if (screen === "draft" || screen === "tierup" || screen === "reserve") {
      return new DraftModule().decide(observation);
    }
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
  #targetId: string | undefined;

  constructor(profile: TearAgentProfileId) {
    this.#profile = profile;
  }

  decide(observation: TearAgentObservation): TearAgentDecision {
    const safe = this.#sentinel.decide(observation);
    const targetDecision = this.#tactical.decide(observation, this.#targetId);
    this.#targetId = targetDecision.target?.id;
    const motorInput: BladeMotorInput = {
      observation,
      profile: this.#profile,
      ...(targetDecision.target === undefined ? {} : { target: targetDecision.target }),
    };
    const movementTarget = movementThreatTarget(observation, targetDecision.target);
    const movementInput: BladeMotorInput = {
      observation,
      profile: this.#profile,
      ...(movementTarget === undefined ? {} : { target: movementTarget }),
    };
    const blade = this.#blade.decide(motorInput);
    const movement = this.#movement.decide(movementInput);
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
