import { INPUT_AXIS_SCALE, type GameAction } from "../input/game-action";
import type { TearObservedActorV1 } from "../tearbench/contracts";
import type { TearAgentObservation } from "./contracts";

const HORIZON = 0.75;
const SAMPLES = Object.freeze([0.05, 0.1, 0.15, 0.25, 0.4, 0.55, HORIZON]);
const PLAYER_SPEED = 430;
const GROUND_ACCEL = 5_000;
const AIR_ACCEL = 2_800;
const JUMP_SPEED = 920;
const GRAVITY = 2_400;
const MAX_FALL = 1_800;
const DASH_SPEED = 1_500;
const DASH_DURATION = 0.15;
const DASH_CARRY = 0.35;

type Direction = -1 | 0 | 1;

type CandidateId =
  | "left" | "neutral" | "right"
  | "jump-left" | "jump-neutral" | "jump-right"
  | "dash-left" | "dash-right";

interface Candidate {
  readonly id: CandidateId;
  readonly direction: Direction;
  readonly jump: boolean;
  readonly dash: boolean;
}

interface CandidateEvaluation {
  readonly candidate: Candidate;
  readonly risk: number;
  readonly earliestThreatSeconds?: number;
  readonly predictedDamage: number;
}

export interface PredictiveSurvivalMemory {
  readonly chosen?: CandidateId;
  readonly chosenUntilTick: number;
  readonly pendingDashUntilTick: number;
  readonly pendingDashCharges: number;
}

export interface PredictiveSurvivalDecision {
  readonly actions: readonly GameAction[];
  readonly memory: PredictiveSurvivalMemory;
  readonly candidate: CandidateId;
  readonly risk: number;
  readonly bestNonDashRisk: number;
  readonly dashRiskReduction: number;
  readonly predictedThreatSeconds?: number;
  readonly dashAttempted: boolean;
}

export const EMPTY_SURVIVAL_MEMORY: PredictiveSurvivalMemory = Object.freeze({
  chosenUntilTick: 0,
  pendingDashUntilTick: 0,
  pendingDashCharges: 0,
});

function clampedVelocity(initial: number, target: number, acceleration: number, time: number): number {
  const delta = target - initial;
  const change = Math.min(Math.abs(delta), acceleration * time) * Math.sign(delta);
  return initial + change;
}

function candidatePosition(
  observation: TearAgentObservation,
  candidate: Candidate,
  time: number,
): Readonly<{ x: number; y: number }> {
  const player = observation.state.player;
  let x: number;
  let y: number;
  if (candidate.dash) {
    const burstTime = Math.min(time, DASH_DURATION);
    const carryTime = Math.max(0, time - DASH_DURATION);
    x = player.x + candidate.direction * (
      DASH_SPEED * burstTime + DASH_SPEED * DASH_CARRY * carryTime
    );
    y = player.y + player.vy * time + GRAVITY * time * time / 2;
  } else {
    const acceleration = player.grounded ? GROUND_ACCEL : AIR_ACCEL;
    const targetVx = candidate.direction * PLAYER_SPEED;
    const vx = clampedVelocity(player.vx, targetVx, acceleration, time);
    x = player.x + (player.vx + vx) * time / 2;
    const initialVy = candidate.jump && player.grounded ? -JUMP_SPEED : player.vy;
    const vy = Math.min(MAX_FALL, initialVy + GRAVITY * time);
    y = player.y + (initialVy + vy) * time / 2;
  }
  const bounds = observation.state.diagnostics?.worldBounds;
  const halfWidth = player.halfWidth ?? 16;
  return Object.freeze({
    x: bounds === undefined ? x : Math.max(bounds.minX + halfWidth, Math.min(bounds.maxX - halfWidth, x)),
    y,
  });
}

function family(actor: TearObservedActorV1): string {
  return actor.state?.split(":")[0] ?? "";
}

function actorDamage(actor: TearObservedActorV1): number {
  return Math.max(0, actor.contactDamage ?? actor.damage ?? 0);
}

function actorOverlap(
  actor: TearObservedActorV1,
  x: number,
  y: number,
  playerHalfWidth: number,
  playerHalfHeight: number,
  time: number,
): boolean {
  const actorX = actor.x + actor.vx * time;
  const actorY = actor.y + actor.vy * time;
  if (actor.kind === "projectile") {
    const radius = actor.radius ?? 10;
    return Math.abs(actorX - x) <= playerHalfWidth + radius + 8
      && Math.abs(actorY - y) <= playerHalfHeight + radius + 8;
  }
  return Math.abs(actorX - x) <= playerHalfWidth + (actor.halfWidth ?? 24)
      + (actor.contactReach ?? 0) + 12
    && Math.abs(actorY - y) <= playerHalfHeight + (actor.halfHeight ?? 24) + 8;
}

function hazardRisk(observation: TearAgentObservation, x: number, y: number): number {
  return observation.state.navigation?.hazards.some((hazard) =>
    hazard.active
    && x >= hazard.bounds.minX - 16 && x <= hazard.bounds.maxX + 16
    && y >= hazard.bounds.minY - 25 && y <= hazard.bounds.maxY + 25) === true ? 0.5 : 0;
}

function edgeRisk(observation: TearAgentObservation, x: number): number {
  const bounds = observation.state.diagnostics?.worldBounds;
  if (bounds === undefined) return 0;
  const clearance = Math.min(x - bounds.minX, bounds.maxX - x);
  return clearance >= 140 ? 0 : (140 - Math.max(0, clearance)) / 140 * 0.18;
}

function trapRisk(observation: TearAgentObservation, x: number, y: number, time: number): number {
  let left = false, right = false;
  for (const actor of observation.state.entities) {
    if (actor.kind === "projectile" || actor.contactEnabled === false) continue;
    const actorX = actor.x + actor.vx * time;
    const actorY = actor.y + actor.vy * time;
    // A short jump does not make a closing corridor available: retain actors
    // within one full jump-height band so the planner exits the trap laterally
    // instead of repeatedly hopping in place between two bodies.
    if (Math.abs(actorY - y) > (actor.halfHeight ?? 24) + 180) continue;
    if (actorX < x && x - actorX < 180) left = true;
    if (actorX > x && actorX - x < 180) right = true;
  }
  return left && right ? 0.16 : 0;
}

function evaluate(
  observation: TearAgentObservation,
  candidate: Candidate,
): CandidateEvaluation {
  const player = observation.state.player;
  const playerHalfWidth = player.halfWidth ?? 16;
  const playerHalfHeight = player.halfHeight ?? 25;
  let risk = 0;
  let predictedDamage = 0;
  let earliestThreatSeconds: number | undefined;
  for (const time of SAMPLES) {
    const position = candidatePosition(observation, candidate, time);
    risk += edgeRisk(observation, position.x) + hazardRisk(observation, position.x, position.y);
    for (const actor of observation.state.entities) {
      if (actor.kind !== "projectile" && actor.contactEnabled === false) continue;
      if (!actorOverlap(actor, position.x, position.y, playerHalfWidth, playerHalfHeight, time)) continue;
      const dashProtected = candidate.dash && time <= Math.max(0, player.iframe ?? DASH_DURATION);
      if (dashProtected) continue;
      const rawDamage = actor.kind === "projectile"
        ? Math.max(0, actor.damage ?? 12)
        : actorDamage(actor) * Math.max(0, actor.chargeMult ?? 1) * Math.max(0, actor.auraDmg ?? 1);
      const normalizedDamage = rawDamage / Math.max(1, player.maxHp);
      const state = actor.state ?? "";
      const phaseMultiplier = /commit|strike|swoop|dive/u.test(state) ? 1.4
        : /wind|warn/u.test(state) ? 0.6 : 1;
      const weighted = normalizedDamage * phaseMultiplier * Math.exp(-time / 0.35);
      risk += weighted;
      predictedDamage += rawDamage;
      earliestThreatSeconds ??= time;
    }
    risk += trapRisk(observation, position.x, position.y, time);
  }
  return Object.freeze({
    candidate,
    risk,
    predictedDamage,
    ...(earliestThreatSeconds === undefined ? {} : { earliestThreatSeconds }),
  });
}

function desiredDirection(observation: TearAgentObservation, target?: TearObservedActorV1): Direction {
  if (target === undefined) return 0;
  const dx = target.x - observation.state.player.x;
  const distance = Math.hypot(dx, target.y - observation.state.player.y);
  const toward = Math.sign(dx) as Direction;
  const away = -toward as Direction;
  if (observation.state.run.weapon === "riftlock") {
    if (distance < 240) return away;
    if (distance > 420) return toward;
    return Math.floor(observation.state.tick / 150) % 2 === 0 ? 1 : -1;
  }
  if (distance < 100) return away;
  if (distance > 145) return toward;
  return 0;
}

function compareEvaluation(
  desired: Direction,
  left: CandidateEvaluation,
  right: CandidateEvaluation,
): number {
  const leftScore = left.risk + (left.candidate.direction === desired ? 0 : 0.015);
  const rightScore = right.risk + (right.candidate.direction === desired ? 0 : 0.015);
  return leftScore - rightScore;
}

function actions(candidate: Candidate): readonly GameAction[] {
  const result: GameAction[] = [{
    type: "move",
    x: candidate.direction * INPUT_AXIS_SCALE,
    y: 0,
  }];
  if (candidate.jump) result.push({ type: "jump", phase: "pressed" });
  if (candidate.dash) result.push({
    type: "dash",
    x: candidate.direction * INPUT_AXIS_SCALE,
    y: 0,
  });
  return Object.freeze(result);
}

function candidates(observation: TearAgentObservation): readonly Candidate[] {
  const player = observation.state.player;
  const ordinary: Candidate[] = [
    { id: "left", direction: -1, jump: false, dash: false },
    { id: "neutral", direction: 0, jump: false, dash: false },
    { id: "right", direction: 1, jump: false, dash: false },
  ];
  if (player.grounded) ordinary.push(
    { id: "jump-left", direction: -1, jump: true, dash: false },
    { id: "jump-neutral", direction: 0, jump: true, dash: false },
    { id: "jump-right", direction: 1, jump: true, dash: false },
  );
  const dashReady = player.dashCharges > 0
    && (player.dashTimer ?? 0) <= 0 && (player.dashCooldown ?? 0) <= 0;
  if (dashReady) ordinary.push(
    { id: "dash-left", direction: -1, jump: false, dash: true },
    { id: "dash-right", direction: 1, jump: false, dash: true },
  );
  return Object.freeze(ordinary);
}

function hasGroundShock(observation: TearAgentObservation): boolean {
  const player = observation.state.player;
  return observation.state.entities.some((actor) => {
    if (actor.kind !== "projectile" || family(actor) !== "groundShock") return false;
    const speedSquared = actor.vx * actor.vx + actor.vy * actor.vy;
    if (speedSquared < 1) return false;
    const dx = player.x - actor.x, dy = player.y - actor.y;
    const time = (dx * actor.vx + dy * actor.vy) / speedSquared;
    return time >= 0 && time <= 0.35;
  });
}

export function planPredictiveSurvival(
  observation: TearAgentObservation,
  target: TearObservedActorV1 | undefined,
  memory: PredictiveSurvivalMemory = EMPTY_SURVIVAL_MEMORY,
): PredictiveSurvivalDecision {
  const desired = desiredDirection(observation, target);
  const evaluated = candidates(observation).map((candidate) => evaluate(observation, candidate));
  const nonDash = evaluated.filter((entry) => !entry.candidate.dash)
    .sort((left, right) => compareEvaluation(desired, left, right));
  const walk = nonDash.find((entry) => !entry.candidate.jump);
  if (walk === undefined) throw new Error("Predictive survival planner requires a walking candidate");
  const jump = nonDash.find((entry) => entry.candidate.jump);
  let bestNonDash = walk;
  if (jump !== undefined
    && (walk.risk - jump.risk >= 0.04 || hasGroundShock(observation))) bestNonDash = jump;

  const dashPending = memory.pendingDashUntilTick >= observation.state.tick
    && (observation.state.player.dashTimer ?? 0) <= 0
    && observation.state.player.dashCharges >= memory.pendingDashCharges;
  const dash = evaluated.filter((entry) => entry.candidate.dash)
    .sort((left, right) => compareEvaluation(desired, left, right))[0];
  const dashReduction = dash === undefined ? 0 : bestNonDash.risk - dash.risk;
  const dashEmergency = bestNonDash.predictedDamage >= observation.state.player.hp;
  const useDash = !dashPending && dash !== undefined
    && bestNonDash.risk >= 0.12
    && (bestNonDash.earliestThreatSeconds ?? Number.POSITIVE_INFINITY) <= 0.2
    && (dashReduction >= 0.08 || dashEmergency);
  let selected = useDash ? dash : bestNonDash;

  const remembered = evaluated.find((entry) =>
    entry.candidate.id === memory.chosen && (!entry.candidate.dash || useDash));
  const imminent = (remembered?.earliestThreatSeconds ?? Number.POSITIVE_INFINITY) <= 0.2;
  if (!useDash && remembered !== undefined && observation.state.tick < memory.chosenUntilTick
    && !imminent && remembered.risk - selected.risk < 0.1) selected = remembered;

  const nextMemory: PredictiveSurvivalMemory = Object.freeze({
    chosen: selected.candidate.id,
    chosenUntilTick: observation.state.tick + 12,
    pendingDashUntilTick: useDash ? observation.state.tick + 4
      : dashPending ? memory.pendingDashUntilTick : 0,
    pendingDashCharges: useDash ? observation.state.player.dashCharges
      : dashPending ? memory.pendingDashCharges : 0,
  });
  return Object.freeze({
    actions: actions(selected.candidate),
    memory: nextMemory,
    candidate: selected.candidate.id,
    risk: selected.risk,
    bestNonDashRisk: bestNonDash.risk,
    dashRiskReduction: dashReduction,
    ...(selected.earliestThreatSeconds === undefined
      ? {} : { predictedThreatSeconds: selected.earliestThreatSeconds }),
    dashAttempted: useDash,
  });
}
