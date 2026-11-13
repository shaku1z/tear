import type { TearCodecWorld } from "./state-codecs";

/** Authored arena slots are aliases, never constructors for live actors. */
export function isAuthoredArenaSlotReference(world: TearCodecWorld, source: string, target: string): boolean {
  const canopy = /^tear\.boss\.v1:\$\[(\d+)\]\.canopyDestination\.platformId$/u.exec(source);
  if (!canopy) return false;
  const bosses = world.components.get("tear.boss.v1"), platforms = world.components.get("tear.platform.v1");
  const boss: unknown = Array.isArray(bosses) ? (bosses as readonly unknown[])[Number(canopy[1])] : undefined;
  if (!boss || typeof boss !== "object" || Array.isArray(boss) || (boss as Record<string, unknown>).bossId !== "rootbound" || !Array.isArray(platforms)) return false;
  return (platforms as readonly unknown[]).filter(p => p !== null && typeof p === "object" && !Array.isArray(p)
    && (p as Record<string, unknown>).arenaPlatId === target).length === 1;
}
