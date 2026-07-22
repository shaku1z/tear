import type { VoidChunk, VoidGraph, VoidGraphEdge, VoidOptions, VoidPlatform } from "./voidgen-contracts";
import { LANES } from "./voidgen-core";

function jumpEdge(a: VoidPlatform, b: VoidPlatform, options: VoidOptions, scrollSpeed: number, allowDash: boolean): Omit<VoidGraphEdge, "id" | "from" | "to" | "kind"> {
  const p = options.physics;
  const rise = a.y - b.y;
  const jumpHeight = p.jumpSpeed * p.jumpSpeed / (2 * p.gravity);
  const dashDistance = p.dashSpeed * p.dashDuration;
  const maxRise = jumpHeight + (allowDash ? dashDistance * 0.72 : 0);
  if (rise > maxRise + 0.001) return { ok: false, reason: "vertical", rise };
  const disc = p.jumpSpeed * p.jumpSpeed - 2 * p.gravity * rise;
  let airTime = disc >= 0 ? (p.jumpSpeed + Math.sqrt(disc)) / p.gravity : 0;
  if (rise > jumpHeight) airTime = Math.max(airTime, p.dashDuration + 0.16);
  const gap = Math.max(0, b.x - (a.x + a.w));
  const relativeSpeed = p.moveSpeed + Math.max(0, scrollSpeed);
  const jumpReach = relativeSpeed * airTime;
  const dashReach = jumpReach + dashDistance;
  const useDash = gap > jumpReach + 0.001;
  const ok = gap <= (allowDash ? dashReach : jumpReach) + 0.001;
  return {
    ok,
    reason: ok ? "" : "horizontal",
    gap,
    rise,
    airTime,
    relativeSpeed,
    jumpReach,
    dashReach,
    mode: useDash ? "dash" : "jump",
    requiresDash: useDash || rise > jumpHeight,
  };
}

export function buildGraph(chunks: readonly VoidChunk[], options: VoidOptions, scrollSpeed: number): VoidGraph {
  const platforms = chunks.flatMap((c) => c.platforms);
  const byId = new Map(platforms.map((p) => [p.id, p]));
  const edges: VoidGraphEdge[] = [];
  for (const lane of LANES) {
    const ordered = platforms.filter((p) => p.voidLane === lane).sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
    for (let i = 0; i + 1 < ordered.length; i++) {
      const from = ordered[i], to = ordered[i + 1];
      if (from === undefined || to === undefined) continue;
      if (from.voidType === "cage" && from.chunkId === to.chunkId) continue;
      const reach = jumpEdge(from, to, options, scrollSpeed, true);
      if (reach.ok) edges.push({ from: from.id, to: to.id, kind: "lane", ...reach });
    }
  }
  for (const chunk of chunks) for (const connector of chunk.connectors) {
    const from = byId.get(connector.from), to = byId.get(connector.to);
    if (!from || !to) continue;
    const reach = jumpEdge(from, to, options, scrollSpeed, true);
    edges.push({ ...connector, ...reach });
  }
  return { platforms, byId, edges };
}
