import type { VoidChunk, VoidGeneratorState, VoidHazardType, VoidLane, VoidOptions, VoidOptionsInput, VoidPlatform, VoidSeed } from "./voidgen-contracts";
import { CONNECTOR_MOTIFS, LANES, ROUTE_MOTIFS, clamp, finite, mix32, normaliseOptions, random, randomInt, randomRange, seed32 } from "./voidgen-core";
import type { PendingConnector, RawPlatformSpec, RngState } from "./voidgen-core";
import { cageGeometry, fitCageHeights } from "./voidgen-hazards";
import { inspect } from "./voidgen-inspection";

export function create(seed: VoidSeed, overrides?: VoidOptionsInput): VoidGeneratorState {
  const options = normaliseOptions(overrides);
  const value = seed32(seed);
  return {
    version: 2,
    seed: value,
    rngState: mix32(value ^ 0x4f1bbcdc),
    nextChunkId: 0,
    nextX: finite(options.startX, 0),
    nextConnectorAt: 0,
    lastExitY: { lower: 625, upper: 445 },
    laneThreat: { lower: 0, upper: 0 },
    densityOffset: value & 3,
    lastMotif: "",
    recentChunks: [],
    options,
  };
}

function choosePressureLane(state: VoidGeneratorState, rng: RngState): VoidLane {
  const d = state.laneThreat.lower - state.laneThreat.upper;
  if (Math.abs(d) < 0.001) return random(rng) < 0.5 ? "lower" : "upper";
  return d < 0 ? "lower" : "upper";
}

function chooseMotif(state: VoidGeneratorState, rng: RngState, connectorDue: boolean): string {
  const pool = connectorDue ? CONNECTOR_MOTIFS : ROUTE_MOTIFS;
  const index = randomInt(rng, pool.length);
  let motif = pool[index];
  if (motif === undefined) throw new Error("VoidGen motif pool is empty");
  if (motif === state.lastMotif && pool.length > 1) {
    const alternative = pool[(index + 1 + randomInt(rng, pool.length - 1)) % pool.length];
    if (alternative !== undefined) motif = alternative;
  }
  // Wisp pressure is intentionally upper-lane, but never let it amplify a
  // large existing upper-lane threat lead.
  if (motif === "wispBridge" && state.laneThreat.upper - state.laneThreat.lower > 3) motif = "fork";
  return motif;
}

function chooseLaneY(state: VoidGeneratorState, motif: string, rng: RngState, options: VoidOptions): Record<VoidLane, [number, number]> {
  let lower = clamp(state.lastExitY.lower + randomRange(rng, -24, 24),
    Math.max(options.lowerBandMin, 580), Math.min(options.lowerBandMax, 680));
  const tightTransfer = motif === "braidRise" || motif === "braidDrop" || motif === "eclipse" || motif === "fractureBypass";
  let upper;
  if (tightTransfer) {
    const delta = randomRange(rng, options.transferDeltaMin, options.transferDeltaMax);
    upper = lower - delta;
    if (upper < options.upperBandMin) { upper = options.upperBandMin; lower = upper + delta; }
    if (upper > options.upperBandMax) { upper = options.upperBandMax; lower = upper + delta; }
  } else {
    upper = clamp(state.lastExitY.upper + randomRange(rng, -24, 24), options.upperBandMin, options.upperBandMax);
  }
  const minSurfaceDelta = options.platformHeight + options.laneClearance;
  if (lower - upper < minSurfaceDelta) upper = lower - minSurfaceDelta;
  upper = clamp(upper, options.upperBandMin, options.upperBandMax);
  lower = clamp(lower, Math.max(options.lowerBandMin, upper + minSurfaceDelta), options.lowerBandMax);
  // Each stratum gets its own vertical cadence. The bands remain physically
  // legible, but no shared step makes the upper route look copied from below.
  const lowerStep = randomRange(rng, -22, 22), upperStep = randomRange(rng, -22, 22);
  return {
    lower: [lower, clamp(lower + lowerStep, options.lowerBandMin, options.lowerBandMax)],
    upper: [upper, clamp(upper + upperStep, options.upperBandMin, options.upperBandMax)],
  };
}

function platformSeed(seed: number, chunkId: number, lane: VoidLane, index: number): number {
  const laneSalt = lane === "lower" ? 0x13579bdf : 0x2468ace0;
  return mix32(seed ^ Math.imul(chunkId + 1, 0x9e3779b1) ^ laneSalt ^ Math.imul(index + 3, 0x85ebca6b));
}

function threatForType(type: VoidHazardType): number {
  if (type === "fire" || type === "cage") return 2.5;
  if (type === "crumble") return 1.1;
  return 0;
}

function buildChunk(state: VoidGeneratorState, motif: string, pressureLane: VoidLane, width: number, rng: RngState, sparse: boolean): VoidChunk {
  const o = state.options, chunkId = state.nextChunkId, x = state.nextX;
  const ys = chooseLaneY(state, motif, rng, o);
  const raw: Record<VoidLane, RawPlatformSpec[]> = { lower: [], upper: [] };
  const pendingConnectors: PendingConnector[] = [];
  const edge = o.edgeInset;

  function fitWidth(w: number, count: number): number {
    if (count === 1) return clamp(w, o.platformWidthMin, Math.max(o.platformWidthMax, width - edge * 2));
    const maxEach = Math.max(o.platformWidthMin, (width - edge * 2 - 48) / 2);
    return clamp(w, o.platformWidthMin, Math.min(o.platformWidthMax, maxEach));
  }

  function addPair(lane: VoidLane, types: readonly [VoidHazardType, VoidHazardType], style?: "roomy" | "compact"): void {
    const roomy = style === "roomy", compact = style === "compact";
    const base = compact ? o.platformWidthMax : (roomy ? o.platformWidthMin : (o.platformWidthMin + o.platformWidthMax) * 0.5);
    const w0 = fitWidth(base + randomRange(rng, -12, 12), 2);
    const w1 = fitWidth(base + randomRange(rng, -12, 12), 2);
    // Alternate which stratum leads. A guaranteed 66px+ phase difference
    // prevents paired entries/exits from resolving into two aligned rows.
    const leadLower = (chunkId & 1) === 0;
    const leads = lane === (leadLower ? "lower" : "upper");
    const near = randomRange(rng, 0, 24), far = randomRange(rng, 90, 125);
    const entryShift = leads ? near : far, exitInset = leads ? far : near;
    raw[lane].push({ rx: edge + entryShift, y: ys[lane][0], w: w0, type: types[0], role: "entry" });
    raw[lane].push({ rx: width - edge - exitInset - w1, y: ys[lane][1], w: w1, type: types[1], role: "exit" });
  }

  function addSingle(lane: VoidLane, type: VoidHazardType): void {
    const w = clamp(width * 0.54 + randomRange(rng, -18, 18), 290, Math.min(390, width - edge * 2));
    const leadLower = (chunkId & 1) === 0, dir = lane === (leadLower ? "lower" : "upper") ? -1 : 1;
    raw[lane].push({ rx: clamp((width - w) * 0.5 + dir * 78, edge, width - edge - w),
      y: (ys[lane][0] + ys[lane][1]) * 0.5, w, type, role: "bridge" });
  }

  // Exactly one sparse paired chunk in every four keeps the zoomed-out stream
  // at 5-7 live surfaces per lane without ever thinning only one route. Sparse
  // chunks stay stable; their pressureLane lets wisps/breaches supply movement
  // pressure without turning the sole landing into a trap.
  if (sparse) {
    addSingle("lower", "plain"); addSingle("upper", "plain");
    if (motif === "braidRise" || motif === "eclipse") {
      pendingConnectors.push(["lower", 0, "upper", 0, motif === "braidRise" ? "rise" : "eclipseUp"],
        ["upper", 0, "lower", 0, motif === "braidRise" ? "fall" : "eclipseDown"]);
    } else if (motif === "braidDrop") {
      pendingConnectors.push(["upper", 0, "lower", 0, "drop"]);
    } else if (motif === "fractureBypass") {
      if (pressureLane === "lower") pendingConnectors.push(["lower", 0, "upper", 0, "bypassUp"]);
      else pendingConnectors.push(["upper", 0, "lower", 0, "bypassDown"]);
    }
  } else if (motif === "fork") {
    addPair("lower", pressureLane === "lower" ? ["crumble", "plain"] : ["plain", "plain"]);
    addPair("upper", pressureLane === "upper" ? ["crumble", "plain"] : ["plain", "plain"]);
  } else if (motif === "braidRise") {
    addPair("lower", ["plain", "plain"]); addPair("upper", ["plain", "plain"]);
    pendingConnectors.push(["lower", 0, "upper", 1, "rise"], ["upper", 0, "lower", 1, "fall"]);
  } else if (motif === "braidDrop") {
    addPair("lower", ["plain", "plain"]); addPair("upper", ["plain", "plain"]);
    pendingConnectors.push(["upper", 0, "lower", 1, "drop"]);
  } else if (motif === "riskReward") {
    const safe = pressureLane === "lower" ? "upper" : "lower";
    addPair(pressureLane, ["fire", "plain"], "compact");
    addPair(safe, ["plain", "plain"], "roomy");
  } else if (motif === "fractureBypass") {
    const safe = pressureLane === "lower" ? "upper" : "lower";
    addPair(pressureLane, ["crumble", "plain"]); addPair(safe, ["plain", "plain"]);
    if (pressureLane === "lower") {
      pendingConnectors.push(["lower", 0, "upper", 0, "bypassUp"], ["upper", 1, "lower", 1, "bypassDown"]);
    } else {
      pendingConnectors.push(["upper", 0, "lower", 0, "bypassDown"], ["lower", 1, "upper", 1, "bypassUp"]);
    }
  } else if (motif === "staggeredFire") {
    if (pressureLane === "lower") {
      addPair("lower", ["fire", "plain"]); addPair("upper", ["plain", "fire"]);
    } else {
      addPair("lower", ["plain", "fire"]); addPair("upper", ["fire", "plain"]);
    }
  } else if (motif === "wispBridge") {
    addPair("lower", ["crumble", "plain"], "roomy"); addPair("upper", ["plain", "plain"], "compact");
  } else { // eclipse
    addPair("lower", ["plain", "plain"]); addPair("upper", ["plain", "plain"]);
    pendingConnectors.push(["lower", 0, "upper", 1, "eclipseUp"], ["upper", 0, "lower", 1, "eclipseDown"]);
  }

  const platforms: VoidPlatform[] = [];
  const seedHex = state.seed.toString(16).padStart(8, "0");
  for (const lane of LANES) {
    for (const [index, spec] of raw[lane].entries()) {
      const hazardSeed = platformSeed(state.seed, chunkId, lane, index);
      const id = `void:${seedHex}:${String(chunkId)}:${lane.slice(0, 1)}:${String(index)}`;
      const p: VoidPlatform = {
        id,
        platformId: id,
        voidId: `${String(chunkId)}:${lane}:${String(index)}`,
        chunkId,
        x: x + spec.rx,
        y: spec.y,
        w: spec.w,
        h: o.platformHeight,
        oneway: true,
        void: true,
        voidLane: lane,
        voidType: spec.type,
        voidRole: spec.role,
        hazardSeed,
        hazardPhaseOffset: hazardSeed / 4294967296 * o.firePeriod,
        hazardPhase: hazardSeed / 4294967296 * o.firePeriod,
        materializationState: o.materializationState,
        material: "voidShard",
        arenaMaterial: "voidShard",
        touchT: -1,
        fireOn: false,
        fireState: "cold",
        transferNode: false,
        connectionIds: [],
      };
      if (spec.type === "cage") {
        p.cage = { offsetX: p.w + 18, halfWidth: o.cageHalfWidth, height: o.cageHeight };
        p.cageX = p.x + p.cage.offsetX;
        p.cageHeight = o.cageHeight;
        p.cageHalfWidth = o.cageHalfWidth;
        p.cageRect = cageGeometry(p, o);
      }
      spec.platform = p;
      platforms.push(p);
    }
  }
  fitCageHeights(platforms, o);

  const connectors = pendingConnectors.map(([fromLane, fromIndex, toLane, toIndex, kind], index) => {
    const from = raw[fromLane][fromIndex]?.platform;
    const to = raw[toLane][toIndex]?.platform;
    if (from === undefined || to === undefined) throw new Error("VoidGen connector references a missing platform");
    from.transferNode = true; to.transferNode = true;
    const connection = { id: `void:${seedHex}:${String(chunkId)}:transfer:${String(index)}`, from: from.id, to: to.id, kind };
    from.connectionIds.push(connection.id); to.connectionIds.push(connection.id);
    return connection;
  });
  const transferXs = connectors.flatMap((c) => {
    const a = platforms.find((p) => p.id === c.from), b = platforms.find((p) => p.id === c.to);
    if (a === undefined || b === undefined) return [];
    return [a.x + a.w * 0.5, b.x + b.w * 0.5];
  });
  const plainByLane = (lane: VoidLane): VoidPlatform | undefined => platforms.filter((p) => p.voidLane === lane && p.voidType === "plain")
    .sort((a, b) => (b.x + b.w) - (a.x + a.w))[0];
  const terminalPlain = plainByLane("lower") ?? plainByLane("upper");
  const threat = { lower: 0, upper: 0 };
  for (const p of platforms) threat[p.voidLane] += threatForType(p.voidType);
  threat[pressureLane] += 0.45; // lane-aware Source pressure keeps plain routes from becoming shelter
  if (motif === "wispBridge") threat.upper += 1.6;
  if (motif === "eclipse") { threat.lower += 0.7; threat.upper += 0.7; }

  return {
    id: `void:${seedHex}:chunk:${String(chunkId)}`,
    chunkId,
    seed: mix32(state.seed ^ Math.imul(chunkId + 1, 0x27d4eb2d)),
    x,
    width,
    motif,
    pressureLane,
    wispLane: motif === "wispBridge" ? "upper" : null,
    majorAttackWindow: motif === "eclipse",
    hasTransfer: connectors.length > 0,
    transferWindow: transferXs.length ? { x0: Math.min(...transferXs) - 72, x1: Math.max(...transferXs) + 72 } : null,
    transferWindowLocal: transferXs.length ? { x0: Math.min(...transferXs) - x - 72, x1: Math.max(...transferXs) - x + 72 } : null,
    connectors,
    connections: connectors,
    platforms,
    lanes: {
      lower: platforms.filter((p) => p.voidLane === "lower"),
      upper: platforms.filter((p) => p.voidLane === "upper"),
    },
    threat,
    rescuePlatformId: terminalPlain ? terminalPlain.id : null,
  };
}

export function cloneChunk(chunk: VoidChunk, dx: number, materializationState?: string): VoidChunk {
  const shift = finite(dx, 0);
  const platforms = chunk.platforms.map((p) => {
    const copy: VoidPlatform = {
      ...p,
      x: p.x + shift,
      connectionIds: p.connectionIds.slice(),
    };
    if (p.cage) copy.cage = { ...p.cage };
    if (copy.voidType === "cage") {
      const rect = cageGeometry(copy);
      if (rect !== null) {
        copy.cageX = rect.centerX;
        copy.cageRect = rect;
      }
    }
    if (materializationState) copy.materializationState = materializationState;
    return copy;
  });
  const connectors = chunk.connectors.map((c) => ({ ...c }));
  return {
    ...chunk,
    x: chunk.x + shift,
    transferWindow: chunk.transferWindow ? { x0: chunk.transferWindow.x0 + shift, x1: chunk.transferWindow.x1 + shift } : null,
    transferWindowLocal: chunk.transferWindowLocal ? { ...chunk.transferWindowLocal } : null,
    platforms,
    lanes: {
      lower: platforms.filter((p) => p.voidLane === "lower"),
      upper: platforms.filter((p) => p.voidLane === "upper"),
    },
    connectors,
    connections: connectors,
  };
}

// Runtime chunks are disposable translated clones. Keeping the canonical
// generated chunk untouched means conveyor scrolling can never alter RNG
// history or the reachability window used by a later append.
export function materialize(chunk: VoidChunk | null | undefined, offsetX: number, materializationState?: string): VoidChunk {
  if (chunk === null || chunk === undefined) throw new Error("VoidGen.materialize requires a generated chunk");
  return cloneChunk(chunk, offsetX, materializationState);
}

export function next(initialState: VoidGeneratorState | null | undefined, appendX?: number): { state: VoidGeneratorState; chunk: VoidChunk } {
  if (initialState === null || initialState === undefined) throw new Error("VoidGen.next requires a state from VoidGen.create");
  let state = initialState;
  // A scrolling integration may pass the current right edge. Route identity,
  // RNG, ids, and hazards remain unchanged; only the screen-space placement is
  // rebased, so no mutable global scroll offset leaks into generation.
  if (typeof appendX === "number" && Number.isFinite(appendX) && appendX !== state.nextX) {
    const dx = appendX - state.nextX;
    state = { ...state, nextX: appendX, recentChunks: state.recentChunks.map((c) => cloneChunk(c, dx)) };
  }
  const rng = { value: state.rngState >>> 0 };
  const connectorDue = state.nextChunkId >= state.nextConnectorAt;
  let chunk: VoidChunk | null = null, motif = "";
  // Braided placement deliberately rejects mirrored silhouettes in addition
  // to unreachable geometry. Keep a generous finite retry budget so an
  // unlucky RNG run never turns a valid seed into a runtime failure.
  for (let attempt = 0; attempt < 48; attempt++) {
    motif = chooseMotif(state, rng, connectorDue);
    const sparse = ((state.nextChunkId + state.densityOffset) & 3) === 0;
    if (sparse && motif === "staggeredFire") motif = "riskReward";
    const pressureLane = choosePressureLane(state, rng);
    const width = randomRange(rng, state.options.chunkWidthMin, state.options.chunkWidthMax);
    const candidate = buildChunk(state, motif, pressureLane, width, rng, sparse);
    const window = state.recentChunks.concat(candidate).slice(-3);
    const audit = inspect(window, state.options);
    const structuralErrors = audit.errors.filter((e) => !e.startsWith("connector cadence"));
    if (!structuralErrors.length) { chunk = candidate; break; }
  }
  if (chunk === null) throw new Error(`VoidGen could not build chunk ${String(state.nextChunkId)} from seed ${String(state.seed)}`);

  const exits: Record<VoidLane, number> = { lower: 0, upper: 0 };
  for (const lane of LANES) {
    const exit = chunk.lanes[lane].slice().sort((a, b) => (b.x + b.w) - (a.x + a.w))[0];
    if (exit === undefined) throw new Error(`VoidGen chunk has no ${lane} exit`);
    exits[lane] = exit.y;
  }
  const nextState: VoidGeneratorState = {
    ...state,
    rngState: rng.value >>> 0,
    nextChunkId: state.nextChunkId + 1,
    nextX: state.nextX + chunk.width,
    nextConnectorAt: connectorDue ? state.nextChunkId + 2 + randomInt(rng, 2) : state.nextConnectorAt,
    lastExitY: exits,
    laneThreat: {
      lower: state.laneThreat.lower + chunk.threat.lower,
      upper: state.laneThreat.upper + chunk.threat.upper,
    },
    lastMotif: motif,
    // Never retain the emitted object: game code is free to translate or
    // annotate it without mutating the canonical generator state.
    recentChunks: state.recentChunks.concat(cloneChunk(chunk, 0)).slice(-3),
  };
  return { state: nextState, chunk };
}

export function generate(seed: VoidSeed, count: number, overrides?: VoidOptionsInput): { state: VoidGeneratorState; chunks: VoidChunk[]; platforms: VoidPlatform[] } {
  let state = create(seed, overrides);
  const chunks: VoidChunk[] = [];
  const total = Math.max(0, count | 0);
  for (let i = 0; i < total; i++) {
    const result = next(state);
    state = result.state;
    chunks.push(result.chunk);
  }
  return { state, chunks, platforms: chunks.flatMap((c) => c.platforms) };
}

// A cinematic ingress is generated from the player's projected position,
// never by relocating the player. It is deliberately a normal-looking plain
// ruin, carried by the same conveyor and collision code as every later shard.
export function ingress(seed: VoidSeed, anchorX: number, anchorY: number, overrides?: VoidOptionsInput): VoidChunk {
  const o = normaliseOptions(overrides), s = mix32(seed32(seed) ^ 0x71f3a95b);
  const viewportW = Math.max(o.platformWidthMax, finite(o.viewportWidth, 1600));
  const w = clamp(Math.max(320, o.playerHalfWidth * 8), 300, Math.min(390, viewportW - o.edgeInset * 2));
  const x = clamp(finite(anchorX, viewportW * 0.45) - w * 0.5, o.edgeInset, viewportW - o.edgeInset - w);
  const y = clamp(finite(anchorY, o.lowerBandMin), o.lowerBandMin, o.lowerBandMax);
  const id = `void:${seed32(seed).toString(16).padStart(8, "0")}:ingress`;
  const platform: VoidPlatform = {
    id, platformId: id, voidId: "ingress", chunkId: -1, x, y, w, h: o.platformHeight,
    oneway: true, void: true, voidLane: "lower", voidType: "plain", voidRole: "ingress",
    hazardSeed: s, hazardPhaseOffset: s / 4294967296 * o.firePeriod,
    hazardPhase: s / 4294967296 * o.firePeriod, materializationState: "forming",
    material: "voidShard", arenaMaterial: "voidShard", touchT: -1,
    fireOn: false, fireState: "cold", transferNode: false, connectionIds: [], cinematicIngress: true,
  };
  return {
    id: `${id}:chunk`, chunkId: -1, seed: s, x, width: w, motif: "ingress",
    pressureLane: "lower", wispLane: null, majorAttackWindow: false, hasTransfer: false,
    transferWindow: null, transferWindowLocal: null, connectors: [], connections: [],
    platforms: [platform], lanes: { lower: [platform], upper: [] },
    threat: { lower: 0, upper: 0 }, rescuePlatformId: id, cinematicIngress: true,
  };
}
