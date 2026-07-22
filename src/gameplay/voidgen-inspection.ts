import type { VoidChunk, VoidInspection, VoidInspectOptions, VoidLane, VoidPlatform } from "./voidgen-contracts";
import { LANES, MOTIFS, normaliseOptions } from "./voidgen-core";
import { buildGraph } from "./voidgen-graph";
import { cageStandingFailures, clearanceFailures, selectRescue, simultaneousThreats } from "./voidgen-hazards";

function hasCompleteMetadata(platform: VoidPlatform): boolean {
  return typeof platform.chunkId === "number"
    && typeof platform.voidType === "string"
    && typeof platform.hazardSeed === "number"
    && typeof platform.materializationState === "string";
}

function describeChunk(chunkId: number): string {
  return `chunk ${String(chunkId)}`;
}

export function inspect(chunks: readonly VoidChunk[] = [], overrides?: VoidInspectOptions): VoidInspection {
  const source = chunks;
  const options = normaliseOptions(overrides ?? source[0]?.options);
  const errors: string[] = [];
  const ids = new Set<string>();
  const platforms = source.flatMap((chunk) => chunk.platforms);

  for (const chunk of source) {
    const label = describeChunk(chunk.chunkId);
    if (!MOTIFS.includes(chunk.motif)) errors.push(`${label}: unknown motif ${chunk.motif}`);
    if (chunk.width < options.chunkWidthMin - 0.001 || chunk.width > options.chunkWidthMax + 0.001) {
      errors.push(`${label}: width ${String(chunk.width)}`);
    }
    for (const lane of LANES) {
      const lanePlatforms = chunk.lanes[lane];
      if (lanePlatforms.length === 0) errors.push(`${label}: empty ${lane} lane`);
      for (let index = 1; index < lanePlatforms.length; index++) {
        const current = lanePlatforms[index];
        const previous = lanePlatforms[index - 1];
        if (current !== undefined && previous !== undefined && current.x <= previous.x) {
          errors.push(`${label}: unordered ${lane} lane`);
        }
      }
    }
    const lower = chunk.lanes.lower;
    const upper = chunk.lanes.upper;
    for (let index = 0; index < Math.min(lower.length, upper.length); index++) {
      const lowerPlatform = lower[index];
      const upperPlatform = upper[index];
      if (lowerPlatform === undefined || upperPlatform === undefined) continue;
      const lowerCenter = lowerPlatform.x + lowerPlatform.w * 0.5;
      const upperCenter = upperPlatform.x + upperPlatform.w * 0.5;
      if (Math.abs(lowerCenter - upperCenter) < 48) errors.push(`${label}: mirrored strata ${String(index)}`);
    }
    if (!chunk.platforms.some((platform) => platform.voidType === "plain" && platform.x + platform.w >= chunk.x + chunk.width * 0.5)) {
      errors.push(`${label}: no stable forward landing`);
    }
  }

  for (const platform of platforms) {
    const platformLabel = platform.id.length > 0 ? platform.id : "<missing>";
    if (platform.id.length === 0 || ids.has(platform.id)) errors.push(`duplicate platform id ${platformLabel}`);
    ids.add(platform.id);
    if (!hasCompleteMetadata(platform)) errors.push(`${platformLabel}: incomplete metadata`);
    const lo = platform.voidLane === "lower" ? options.lowerBandMin : options.upperBandMin;
    const hi = platform.voidLane === "lower" ? options.lowerBandMax : options.upperBandMax;
    if (platform.y < lo - 0.001 || platform.y > hi + 0.001) errors.push(`${platform.id}: outside ${platform.voidLane} band`);
  }

  const clearance = clearanceFailures(platforms, options);
  if (clearance.length > 0) errors.push(`${String(clearance.length)} lane-clearance overlap(s)`);
  const cageStanding = cageStandingFailures(platforms, options);
  if (cageStanding.length > 0) errors.push(`${String(cageStanding.length)} cage/opposite-lane standing overlap(s)`);
  const threats = simultaneousThreats(platforms);
  if (threats.length > 0) errors.push(`${String(threats.length)} simultaneous lethal slice(s)`);

  const speeds = [options.scrollSpeedMin, options.scrollSpeedMax];
  const graphs = speeds.map((speed) => buildGraph(source, options, speed));
  for (const [graphIndex, graph] of graphs.entries()) {
    const speed = speeds[graphIndex];
    if (speed === undefined) continue;
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
      if (!edge.ok) {
        if (edge.kind !== "lane") errors.push(`${edge.id ?? "connector"}: unreachable connector at scroll ${String(speed)}`);
        continue;
      }
      const destinations = adjacency.get(edge.from) ?? [];
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, destinations);
      destinations.push(edge.to);
    }
    if (source.length > 0) {
      const firstId = Math.min(...source.map((chunk) => chunk.chunkId));
      const lastId = Math.max(...source.map((chunk) => chunk.chunkId));
      const lastChunk = source.find((chunk) => chunk.chunkId === lastId);
      const starts = platforms.filter((platform) => platform.chunkId === firstId && platform.voidRole !== "exit").map((platform) => platform.id);
      const ends = new Set(lastChunk === undefined ? [] : platforms.filter((platform) => platform.chunkId === lastId
        && platform.voidType === "plain" && platform.x + platform.w >= lastChunk.x + lastChunk.width * 0.5).map((platform) => platform.id));
      const seen = new Set(starts);
      const queue = starts.slice();
      for (const from of queue) {
        for (const to of adjacency.get(from) ?? []) {
          if (!seen.has(to)) { seen.add(to); queue.push(to); }
        }
      }
      if (![...ends].some((id) => seen.has(id))) errors.push(`no complete route at scroll ${String(speed)}`);
    }
  }

  const connectorIds = source.filter((chunk) => chunk.hasTransfer).map((chunk) => chunk.chunkId).sort((a, b) => a - b);
  for (let index = 1; index < connectorIds.length; index++) {
    const current = connectorIds[index];
    const previous = connectorIds[index - 1];
    if (current === undefined || previous === undefined) continue;
    // A cage bypass may add an extra transfer between scheduled windows; only
    // a drought is invalid. Scheduled transfers themselves remain 2-3 apart.
    if (current - previous > 3) errors.push(`connector cadence ${String(previous)} -> ${String(current)}`);
  }

  const firstChunk = source[0];
  const lastChunk = source[source.length - 1];
  const center = firstChunk === undefined || lastChunk === undefined ? 0 : (firstChunk.x + lastChunk.x + lastChunk.width) * 0.5;
  const rescue = selectRescue(platforms, center, 0, options);
  if (source.length > 0 && rescue === null) errors.push("no safe rescue candidate");

  let live: Record<VoidLane, number> | null = null;
  if (overrides?.visibleRect !== undefined) {
    const { left, right } = overrides.visibleRect;
    live = { lower: 0, upper: 0 };
    for (const platform of platforms) if (platform.x < right && platform.x + platform.w > left) live[platform.voidLane]++;
    const min = overrides.liveMin ?? 5;
    const max = overrides.liveMax ?? 7;
    for (const lane of LANES) {
      if (live[lane] < min || live[lane] > max) errors.push(`${lane} live count ${String(live[lane])} outside ${String(min)}-${String(max)}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    rescue,
    graphs,
    stats: {
      chunks: source.length,
      platforms: platforms.length,
      lower: platforms.filter((platform) => platform.voidLane === "lower").length,
      upper: platforms.filter((platform) => platform.voidLane === "upper").length,
      connectors: source.reduce((count, chunk) => count + chunk.connectors.length, 0),
      live,
    },
  };
}
