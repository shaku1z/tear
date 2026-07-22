import type {
  BossZonePlayerState,
  CombatActorState,
  CombatEntityIntent,
  SlowZoneState,
  TemporaryWallState,
  WallRequestState,
} from "./combat-entity-contracts";

export interface WorldHazardTuning {
  readonly groundY: number;
  readonly sludgeSlow: number;
  readonly geoWallW: number;
  readonly geoWallH: number;
  readonly geoWallLife: number;
  readonly sludgeColor: string;
}

export interface ResolveWorldHazardsInput {
  readonly dt: number;
  readonly slowZones: readonly SlowZoneState[];
  readonly walls: readonly TemporaryWallState[];
  readonly wallRequests: readonly WallRequestState[];
  readonly nextWallSequence: number;
  readonly player: Readonly<{ x: number; y: number; hh: number }>;
  readonly tuning: WorldHazardTuning;
}

export interface WorldHazardResolution {
  readonly slowZones: readonly SlowZoneState[];
  readonly walls: readonly TemporaryWallState[];
  readonly nextWallSequence: number;
  readonly playerSlowMultiplier: number;
  readonly intents: readonly CombatEntityIntent[];
}

export function resolveWorldHazards(input: ResolveWorldHazardsInput): WorldHazardResolution {
  if (!Number.isFinite(input.dt) || input.dt < 0) throw new RangeError("dt must be finite and non-negative");
  const intents: CombatEntityIntent[] = [];
  const slowZones = input.slowZones
    .map((zone) => ({ ...zone, life: zone.life - input.dt }))
    .filter((zone) => zone.life > 0);
  const walls: TemporaryWallState[] = [];
  for (let index = input.walls.length - 1; index >= 0; index -= 1) {
    const wall = input.walls[index];
    if (wall === undefined) continue;
    const aged = { ...wall, life: wall.life - input.dt };
    if (aged.life <= 0) intents.push({ type: "remove-wall", wallId: aged.id });
    else walls.unshift(aged);
  }

  let nextWallSequence = input.nextWallSequence;
  for (const request of input.wallRequests) {
    const wall: TemporaryWallState = {
      id: `geomancer-wall:${String(nextWallSequence)}`,
      x: request.x - input.tuning.geoWallW / 2,
      y: input.tuning.groundY - input.tuning.geoWallH,
      w: input.tuning.geoWallW,
      h: input.tuning.geoWallH,
      wall: true,
      life: input.tuning.geoWallLife,
      maxLife: input.tuning.geoWallLife,
    };
    nextWallSequence += 1;
    walls.push(wall);
    intents.push(
      { type: "materialize-wall", actorId: request.actorId, wall },
      { type: "fx-ring", x: request.x, y: input.tuning.groundY, radius: 18, color: input.tuning.sludgeColor },
      { type: "clear-wall-request", actorId: request.actorId },
    );
  }

  let playerSlowMultiplier = 1;
  const feet = input.player.y + input.player.hh;
  for (const zone of slowZones) {
    if (Math.abs(input.player.x - zone.x) < zone.r && feet >= zone.y - 12) {
      playerSlowMultiplier = Math.min(playerSlowMultiplier, input.tuning.sludgeSlow);
    }
  }
  intents.push({ type: "set-player-slow", multiplier: playerSlowMultiplier });
  return { slowZones, walls, nextWallSequence, playerSlowMultiplier, intents };
}

export interface BossZoneTuning {
  readonly groundY: number;
  readonly defaultWidth: number;
  readonly defaultDamage: number;
  readonly defaultTickCooldown: number;
}

function legacyPositiveFallback(value: number | undefined, fallback: number): number {
  return value === undefined || value === 0 ? fallback : value;
}

export function planBossZoneCollision(
  actors: readonly CombatActorState[],
  player: BossZonePlayerState,
  tuning: BossZoneTuning,
): readonly CombatEntityIntent[] {
  const boss = actors.find((actor) => actor.isBoss && actor.zones !== undefined && actor.zones.length > 0);
  if (boss === undefined) return [];
  const onFloor = player.y + player.hh >= tuning.groundY - 8;
  let selected: { damage: number; cooldown: number } | null = null;
  for (const zone of boss.zones ?? []) {
    const halfWidth = legacyPositiveFallback(zone.w, tuning.defaultWidth) / 2;
    if ((zone.fullHeight || onFloor) && zone.on !== false && Math.abs(player.x - zone.x) < halfWidth) {
      selected = {
        damage: zone.dmg ?? tuning.defaultDamage,
        cooldown: legacyPositiveFallback(zone.tickCd, tuning.defaultTickCooldown),
      };
      break;
    }
  }
  if (selected === null || player.hazardT > 0 || player.invulnerable) return [];
  return [
    {
      type: "damage-player",
      damage: selected.damage * player.hazardDmgMult,
      sourceX: boss.x,
      sourceId: boss.id,
      cause: "boss-zone",
      afterAttempt: [{ type: "set-player-hazard-cooldown", seconds: selected.cooldown }],
      onHit: [{ type: "sound", sound: "hurt" }, { type: "lose-style" }],
      onAbsorbed: [{ type: "shield-absorbed" }],
      onRejected: [],
    },
  ];
}
