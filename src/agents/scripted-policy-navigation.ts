import { INPUT_AXIS_SCALE } from "../input/game-action";
import type { TearObservedActorV1 } from "../tearbench/contracts";
import type { TearAgentObservation } from "./contracts";

interface NavigationMotorInput {
  readonly observation: TearAgentObservation;
  readonly target?: TearObservedActorV1;
}

export interface NavigationDecision {
  readonly moveX?: number;
  readonly moveY?: number;
  readonly jump: boolean;
  readonly reason?: string;
}

export function movementThreatTarget(
  observation: TearAgentObservation,
  fallback?: TearObservedActorV1,
): TearObservedActorV1 | undefined {
  const player = observation.state.player;
  const local = observation.state.entities
    .filter((entity) => !["platform", "hazard", "projectile"].includes(entity.kind))
    .map((entity) => {
      const distance = Math.hypot(entity.x - player.x, entity.y - player.y);
      const speed = Math.hypot(entity.vx, entity.vy);
      const telegraph = /attack|charge|commit|wind|pounce|slam|stomp|strike|swing/u
        .test(entity.state ?? "");
      const threat = (distance < 180 ? 10_000 : 0) + (telegraph ? 8_000 : 0)
        + Math.max(0, 450 - distance) * 20 + speed * 4 + (entity.threat ?? 1) * 500;
      return { entity, distance, threat };
    })
    .filter((entry) => entry.distance <= 450)
    .sort((left, right) => right.threat - left.threat
      || left.distance - right.distance || left.entity.id.localeCompare(right.entity.id))[0];
  return local?.entity ?? fallback;
}

export function navigationDecision(input: NavigationMotorInput, intendedX: number): NavigationDecision {
  const navigation = input.observation.state.navigation;
  if (navigation === undefined) return { jump: false };
  const player = input.observation.state.player, target = input.target;
  const surfaces = navigation.surfaces.filter((surface) =>
    surface.collidable && surface.materializationState !== "gone");
  const support = [...surfaces].filter((surface) =>
    player.x >= surface.bounds.minX - 20 && player.x <= surface.bounds.maxX + 20
    && player.y <= surface.bounds.minY + 35)
    .sort((left, right) =>
      Math.abs(left.bounds.minY - player.y) - Math.abs(right.bounds.minY - player.y)
      || left.id.localeCompare(right.id))[0];
  const lookX = player.x + Math.sign(intendedX) * 80;
  const hazard = navigation.hazards.find((entry) =>
    entry.active
    && lookX >= entry.bounds.minX - 20 && lookX <= entry.bounds.maxX + 20
    && player.y >= entry.bounds.minY - 90 && player.y <= entry.bounds.maxY + 40);
  if (hazard !== undefined) {
    const escape = player.x <= (hazard.bounds.minX + hazard.bounds.maxX) / 2
      ? -INPUT_AXIS_SCALE : INPUT_AXIS_SCALE;
    return { moveX: escape, jump: player.grounded, reason: `avoid-${hazard.type}` };
  }
  if (support === undefined || target === undefined) return { jump: false };
  const targetSurface = [...surfaces].filter((surface) =>
    target.x >= surface.bounds.minX - 25 && target.x <= surface.bounds.maxX + 25
    && target.y <= surface.bounds.minY + 50)
    .sort((left, right) =>
      Math.abs(left.bounds.minY - target.y) - Math.abs(right.bounds.minY - target.y)
      || left.id.localeCompare(right.id))[0];
  if (targetSurface === undefined || targetSurface.id === support.id) return { jump: false };
  let waypoint = targetSurface;
  if (support.lane !== undefined && targetSurface.lane !== undefined
    && support.lane !== targetSurface.lane) {
    const transfer = surfaces.filter((surface) =>
      surface.transferNode === true && surface.lane === support.lane)
      .sort((left, right) => {
        const leftX = (left.bounds.minX + left.bounds.maxX) / 2;
        const rightX = (right.bounds.minX + right.bounds.maxX) / 2;
        return Math.abs(leftX - player.x) - Math.abs(rightX - player.x) || left.id.localeCompare(right.id);
      })[0];
    if (transfer !== undefined) waypoint = transfer;
  } else if (support.connectionIds.includes(targetSurface.id)) {
    waypoint = targetSurface;
  }
  const center = (waypoint.bounds.minX + waypoint.bounds.maxX) / 2;
  const moveX = Math.abs(center - player.x) < 35 ? 0
    : center > player.x ? INPUT_AXIS_SCALE : -INPUT_AXIS_SCALE;
  const upward = waypoint.bounds.minY < support.bounds.minY - 35;
  const downward = waypoint.bounds.minY > support.bounds.minY + 80;
  return {
    moveX,
    ...(downward ? { moveY: INPUT_AXIS_SCALE } : {}),
    jump: upward && player.grounded,
    reason: waypoint.transferNode === true ? "transfer-node" : "surface-route",
  };
}
