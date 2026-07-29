import type { BladePoint, GameConfig } from "./blade-contracts";

export interface ChainBladeState {
  readonly weapon: { readonly id: string } | null;
  readonly tipX: number;
  readonly tipY: number;
  chainPoints: BladePoint[];
  chainPrevious: BladePoint[];
}

export interface ChainCollisionSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly pad: number;
}

export function chainCollisionSegments(blade: ChainBladeState): readonly ChainCollisionSegment[] {
  if (blade.weapon?.id !== "chainblade" || blade.chainPoints.length < 2) return [];
  return blade.chainPoints.slice(1).map((point, index) => {
    const previous = blade.chainPoints[index] ?? point;
    return { x1: previous.x, y1: previous.y, x2: point.x, y2: point.y, pad: 3 };
  });
}

export function updateChainNodes(blade: ChainBladeState, dt: number, hand: BladePoint, config: GameConfig): void {
  if (blade.weapon?.id !== "chainblade") {
    blade.chainPoints.length = 0;
    blade.chainPrevious.length = 0;
    return;
  }
  const count = config.weapons.chainblade.linkSegments + 1;
  if (blade.chainPoints.length !== count || blade.chainPrevious.length !== count) {
    blade.chainPoints = [];
    blade.chainPrevious = [];
    for (let index = 0; index < count; index++) {
      const amount = index / (count - 1);
      const point = {
        x: hand.x + (blade.tipX - hand.x) * amount,
        y: hand.y + (blade.tipY - hand.y) * amount,
      };
      blade.chainPoints.push({ ...point });
      blade.chainPrevious.push({ ...point });
    }
  }
  for (let index = 1; index < count - 1; index++) {
    const point = Reflect.get(blade.chainPoints, index);
    const previous = Reflect.get(blade.chainPrevious, index);
    const vx = (point.x - previous.x) * 0.94, vy = (point.y - previous.y) * 0.94;
    previous.x = point.x;
    previous.y = point.y;
    point.x += vx;
    point.y += vy + 720 * dt * dt;
  }
  const first = Reflect.get(blade.chainPoints, 0);
  const last = Reflect.get(blade.chainPoints, count - 1);
  first.x = hand.x; first.y = hand.y;
  last.x = blade.tipX; last.y = blade.tipY;
  const spacing = Math.hypot(blade.tipX - hand.x, blade.tipY - hand.y) / (count - 1);
  for (let iteration = 0; iteration < 4; iteration++) {
    for (let index = 0; index < count - 1; index++) {
      const left = Reflect.get(blade.chainPoints, index);
      const right = Reflect.get(blade.chainPoints, index + 1);
      const dx = right.x - left.x, dy = right.y - left.y, distance = Math.hypot(dx, dy) || 1;
      const correction = (distance - spacing) / distance;
      if (index > 0) {
        left.x += dx * correction * 0.5;
        left.y += dy * correction * 0.5;
      }
      if (index + 1 < count - 1) {
        right.x -= dx * correction * 0.5;
        right.y -= dy * correction * 0.5;
      }
    }
    first.x = hand.x; first.y = hand.y;
    last.x = blade.tipX; last.y = blade.tipY;
  }
}
