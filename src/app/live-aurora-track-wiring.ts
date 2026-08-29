import type { AuroraTransportActor, AuroraTransportKind } from "../gameplay/environment/aurora-track-runtime";

interface DirectionInput { right(): boolean; left(): boolean }
interface LiveAuroraPlayer { x: number; y: number; vx: number; aiInput?: DirectionInput }
interface LiveAuroraBlade { x: number; y: number; vx: number; state: string }
interface LiveAuroraEnemy {
  x: number; y: number; vx: number; weight?: number; isBoss?: boolean; auroraBossChargeActive?: boolean;
  cfg?: Readonly<{ speed?: number }>;
  onAuroraTrackInfluence?(direction: -1 | 1, onTrack: boolean): void;
}
interface LiveAuroraProjectile { x: number; y: number; vx: number; dead: boolean; deflected: boolean }
interface AuroraEnvironment { setAuroraTrackActorsSource(source: () => readonly AuroraTransportActor[]): void }

export interface LiveAuroraTrackTuning {
  readonly playerAcceleration: number;
  readonly playerMaximumSpeed: number;
  readonly bladeAcceleration: number;
  readonly bladeMaximumSpeed: number;
  readonly projectileAcceleration: number;
  readonly projectileMaximumSpeed: number;
}

function velocityIntent(value: number): number { return value === 0 ? 0 : Math.sign(value); }

/** Binds live mutable transport subjects to the shared fixed-step environment port. */
export function bindLiveAuroraTrackActors(
  environment: AuroraEnvironment,
  player: () => LiveAuroraPlayer,
  blade: () => LiveAuroraBlade,
  enemies: () => readonly LiveAuroraEnemy[],
  projectiles: () => readonly LiveAuroraProjectile[],
  actorId: (enemy: LiveAuroraEnemy) => string,
  projectileId: (projectile: LiveAuroraProjectile) => string,
  tuning: LiveAuroraTrackTuning,
): void {
  environment.setAuroraTrackActorsSource(() => {
    const hero = player();
    const input = hero.aiInput;
    const actors: AuroraTransportActor[] = [{
      id: "player", kind: "player", get x() { return hero.x; }, get y() { return hero.y; },
      get intentX() { return input === undefined ? 0 : (input.right() ? 1 : 0) - (input.left() ? 1 : 0); },
      normalAcceleration: tuning.playerAcceleration, maximumSpeed: tuning.playerMaximumSpeed,
      get vx() { return hero.vx; }, set vx(value: number) { hero.vx = value; },
    }];

    const liveBlade = blade();
    if (liveBlade.state !== "held" && liveBlade.state !== "embedded") actors.push({
      id: "blade", kind: "thrown-blade", get x() { return liveBlade.x; }, get y() { return liveBlade.y; },
      get intentX() { return velocityIntent(liveBlade.vx); }, normalAcceleration: tuning.bladeAcceleration,
      maximumSpeed: tuning.bladeMaximumSpeed, get vx() { return liveBlade.vx; }, set vx(value: number) { liveBlade.vx = value; },
    });

    for (const enemy of enemies()) {
      const speed = enemy.cfg?.speed ?? Math.max(1, Math.abs(enemy.vx));
      const kind: AuroraTransportKind = enemy.isBoss === true
        ? (enemy.auroraBossChargeActive === true ? "boss-charge" : "boss")
        : (enemy.weight ?? 1) >= 1.75 ? "heavy-enemy" : "light-enemy";
      actors.push({ id: actorId(enemy), kind, get x() { return enemy.x; }, get y() { return enemy.y; },
        get intentX() { return velocityIntent(enemy.vx); }, normalAcceleration: speed * 4, maximumSpeed: speed * 4,
        get vx() { return enemy.vx; }, set vx(value: number) { enemy.vx = value; },
        onInfluenced: (direction, onTrack) => enemy.onAuroraTrackInfluence?.(direction, onTrack) });
    }

    projectiles().forEach((projectile) => {
      if (projectile.dead || !projectile.deflected) return;
      actors.push({ id: projectileId(projectile), kind: "deflected-projectile",
        get x() { return projectile.x; }, get y() { return projectile.y; }, get intentX() { return velocityIntent(projectile.vx); },
        normalAcceleration: tuning.projectileAcceleration, maximumSpeed: tuning.projectileMaximumSpeed,
        get vx() { return projectile.vx; }, set vx(value: number) { projectile.vx = value; } });
    });
    return actors;
  });
}
