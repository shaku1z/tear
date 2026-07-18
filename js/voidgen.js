// ------- braided-strata generator for The Source's Void Run ----------------
//
// VoidGen deliberately owns no game state and never calls Math.random(). A run
// seed plus the returned generator state completely determines every chunk, so a
// failed route can be reproduced from its seed and chunk id. The game integrates
// the returned objects as ordinary one-way platforms and recycles whole chunks.

const VoidGen = (() => {
  "use strict";

  const LANES = Object.freeze(["lower", "upper"]);
  // These names describe invisible reachability relationships, not scenery.
  // The release renderer never paints ladders, nodes or connector filaments.
  const CONNECTOR_MOTIFS = Object.freeze(["braidRise", "braidDrop", "eclipse"]);
  const ROUTE_MOTIFS = Object.freeze(["fork", "riskReward", "fractureBypass", "staggeredFire", "wispBridge"]);
  const MOTIFS = Object.freeze([...ROUTE_MOTIFS, ...CONNECTOR_MOTIFS]);

  const DEFAULTS = Object.freeze({
    startX: 0,
    chunkWidthMin: 580,
    chunkWidthMax: 720,
    platformHeight: 22,
    platformWidthMin: 150,
    platformWidthMax: 285,
    edgeInset: 24,
    laneClearance: 76,
    lowerBandMin: 550,
    lowerBandMax: 700,
    upperBandMin: 350,
    upperBandMax: 510,
    transferDeltaMin: 145,
    transferDeltaMax: 165,
    scrollSpeedMin: 170,
    scrollSpeedMax: 351,
    materializationState: "active",
    firePeriod: 3.0,
    fireArmTime: 0.65,
    fireHotTime: 1.05,
    cageHeight: 170,
    cageHalfWidth: 22,
    cageVerticalClearance: 2,
    cageMinBlockHeight: 96,
    playerHalfWidth: 16,
    playerHalfHeight: 25,
    physics: Object.freeze({
      jumpSpeed: 920,
      gravity: 2400,
      moveSpeed: 430,
      dashSpeed: 1500,
      dashDuration: 0.15,
    }),
  });

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function overlap(a0, a1, b0, b1) { return Math.max(a0, b0) < Math.min(a1, b1); }
  function finite(v, fallback) { return Number.isFinite(v) ? v : fallback; }

  function seed32(value) {
    if (typeof value === "number" && Number.isFinite(value)) return (value >>> 0) || 1;
    const text = String(value == null ? "void" : value);
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) || 1;
  }

  function mix32(value) {
    let x = value >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return (x >>> 0) || 1;
  }

  function rngStep(value) {
    let x = value >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) || 0x9e3779b9;
  }

  function random(rng) {
    rng.value = rngStep(rng.value);
    return rng.value / 4294967296;
  }

  function randomInt(rng, count) { return Math.floor(random(rng) * count); }
  function randomRange(rng, lo, hi) { return lo + (hi - lo) * random(rng); }

  function normaliseOptions(overrides) {
    const src = overrides || {};
    const physics = { ...DEFAULTS.physics, ...(src.physics || {}) };
    const out = { ...DEFAULTS, ...src, physics };
    // Below 580px, two non-adjacent partial chunks can enter a 2000px
    // zoom-0.8 view and push a lane above the seven-surface readability cap.
    out.chunkWidthMin = Math.max(580, finite(out.chunkWidthMin, DEFAULTS.chunkWidthMin));
    out.chunkWidthMax = Math.max(out.chunkWidthMin, finite(out.chunkWidthMax, DEFAULTS.chunkWidthMax));
    out.platformHeight = Math.max(8, finite(out.platformHeight, DEFAULTS.platformHeight));
    out.platformWidthMin = Math.max(100, finite(out.platformWidthMin, DEFAULTS.platformWidthMin));
    out.platformWidthMax = Math.max(out.platformWidthMin, finite(out.platformWidthMax, DEFAULTS.platformWidthMax));
    out.edgeInset = Math.max(0, finite(out.edgeInset, DEFAULTS.edgeInset));
    out.laneClearance = Math.max(48, finite(out.laneClearance, DEFAULTS.laneClearance));
    out.transferDeltaMin = Math.max(80, finite(out.transferDeltaMin, DEFAULTS.transferDeltaMin));
    out.transferDeltaMax = Math.max(out.transferDeltaMin, finite(out.transferDeltaMax, DEFAULTS.transferDeltaMax));
    out.scrollSpeedMin = Math.max(0, finite(out.scrollSpeedMin, DEFAULTS.scrollSpeedMin));
    out.scrollSpeedMax = Math.max(out.scrollSpeedMin, finite(out.scrollSpeedMax, DEFAULTS.scrollSpeedMax));
    out.firePeriod = Math.max(1, finite(out.firePeriod, DEFAULTS.firePeriod));
    out.fireArmTime = Math.max(0.1, finite(out.fireArmTime, DEFAULTS.fireArmTime));
    out.fireHotTime = Math.max(0.1, finite(out.fireHotTime, DEFAULTS.fireHotTime));
    out.firePeriod = Math.max(out.firePeriod, out.fireArmTime + out.fireHotTime + 0.1);
    out.cageHeight = Math.max(24, finite(out.cageHeight, DEFAULTS.cageHeight));
    out.cageHalfWidth = Math.max(4, finite(out.cageHalfWidth, DEFAULTS.cageHalfWidth));
    out.cageVerticalClearance = Math.max(0, finite(out.cageVerticalClearance, DEFAULTS.cageVerticalClearance));
    out.cageMinBlockHeight = Math.max(24, finite(out.cageMinBlockHeight, DEFAULTS.cageMinBlockHeight));
    out.physics.jumpSpeed = Math.max(1, finite(out.physics.jumpSpeed, DEFAULTS.physics.jumpSpeed));
    out.physics.gravity = Math.max(1, finite(out.physics.gravity, DEFAULTS.physics.gravity));
    out.physics.moveSpeed = Math.max(1, finite(out.physics.moveSpeed, DEFAULTS.physics.moveSpeed));
    out.physics.dashSpeed = Math.max(0, finite(out.physics.dashSpeed, DEFAULTS.physics.dashSpeed));
    out.physics.dashDuration = Math.max(0, finite(out.physics.dashDuration, DEFAULTS.physics.dashDuration));
    return out;
  }

  function create(seed, overrides) {
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

  function choosePressureLane(state, rng) {
    const d = state.laneThreat.lower - state.laneThreat.upper;
    if (Math.abs(d) < 0.001) return random(rng) < 0.5 ? "lower" : "upper";
    return d < 0 ? "lower" : "upper";
  }

  function chooseMotif(state, rng, connectorDue) {
    const pool = connectorDue ? CONNECTOR_MOTIFS : ROUTE_MOTIFS;
    let index = randomInt(rng, pool.length), motif = pool[index];
    if (motif === state.lastMotif && pool.length > 1) motif = pool[(index + 1 + randomInt(rng, pool.length - 1)) % pool.length];
    // Wisp pressure is intentionally upper-lane, but never let it amplify a
    // large existing upper-lane threat lead.
    if (motif === "wispBridge" && state.laneThreat.upper - state.laneThreat.lower > 3) motif = "fork";
    return motif;
  }

  function chooseLaneY(state, motif, rng, options) {
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

  function platformSeed(seed, chunkId, lane, index) {
    const laneSalt = lane === "lower" ? 0x13579bdf : 0x2468ace0;
    return mix32(seed ^ Math.imul(chunkId + 1, 0x9e3779b1) ^ laneSalt ^ Math.imul(index + 3, 0x85ebca6b));
  }

  function threatForType(type) {
    if (type === "fire" || type === "cage") return 2.5;
    if (type === "crumble") return 1.1;
    return 0;
  }

  function buildChunk(state, motif, pressureLane, width, rng, sparse) {
    const o = state.options, chunkId = state.nextChunkId, x = state.nextX;
    const ys = chooseLaneY(state, motif, rng, o);
    const raw = { lower: [], upper: [] };
    const pendingConnectors = [];
    const edge = o.edgeInset;

    function fitWidth(w, count) {
      if (count === 1) return clamp(w, o.platformWidthMin, Math.max(o.platformWidthMax, width - edge * 2));
      const maxEach = Math.max(o.platformWidthMin, (width - edge * 2 - 48) / 2);
      return clamp(w, o.platformWidthMin, Math.min(o.platformWidthMax, maxEach));
    }

    function addPair(lane, types, style) {
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

    function addBridge(lane, type) {
      const w = clamp(width * 0.54 + randomRange(rng, -18, 18), 290, Math.min(390, width - edge * 2));
      raw[lane].push({ rx: (width - w) * 0.5, y: (ys[lane][0] + ys[lane][1]) * 0.5, w, type, role: "bridge" });
    }

    function addSingle(lane, type) {
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

    const platforms = [];
    const seedHex = state.seed.toString(16).padStart(8, "0");
    for (const lane of LANES) {
      for (let index = 0; index < raw[lane].length; index++) {
        const spec = raw[lane][index], hazardSeed = platformSeed(state.seed, chunkId, lane, index);
        const id = `void:${seedHex}:${chunkId}:${lane[0]}:${index}`;
        const p = {
          id,
          platformId: id,
          voidId: `${chunkId}:${lane}:${index}`,
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
        raw[lane][index].platform = p;
        platforms.push(p);
      }
    }
    fitCageHeights(platforms, o);

    const connectors = pendingConnectors.map((spec, index) => {
      const from = raw[spec[0]][spec[1]].platform, to = raw[spec[2]][spec[3]].platform;
      from.transferNode = true; to.transferNode = true;
      const connection = { id: `void:${seedHex}:${chunkId}:transfer:${index}`, from: from.id, to: to.id, kind: spec[4] };
      from.connectionIds.push(connection.id); to.connectionIds.push(connection.id);
      return connection;
    });
    const transferXs = connectors.flatMap((c) => {
      const a = platforms.find((p) => p.id === c.from), b = platforms.find((p) => p.id === c.to);
      return [a.x + a.w * 0.5, b.x + b.w * 0.5];
    });
    const plainByLane = (lane) => platforms.filter((p) => p.voidLane === lane && p.voidType === "plain")
      .sort((a, b) => (b.x + b.w) - (a.x + a.w))[0];
    const terminalPlain = plainByLane("lower") || plainByLane("upper");
    const threat = { lower: 0, upper: 0 };
    for (const p of platforms) threat[p.voidLane] += threatForType(p.voidType);
    threat[pressureLane] += 0.45; // lane-aware Source pressure keeps plain routes from becoming shelter
    if (motif === "wispBridge") threat.upper += 1.6;
    if (motif === "eclipse") { threat.lower += 0.7; threat.upper += 0.7; }

    return {
      id: `void:${seedHex}:chunk:${chunkId}`,
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

  function jumpEdge(a, b, options, scrollSpeed, allowDash) {
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

  function buildGraph(chunks, options, scrollSpeed) {
    const platforms = chunks.flatMap((c) => c.platforms);
    const byId = new Map(platforms.map((p) => [p.id, p]));
    const edges = [];
    for (const lane of LANES) {
      const ordered = platforms.filter((p) => p.voidLane === lane).sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
      for (let i = 0; i + 1 < ordered.length; i++) {
        const from = ordered[i], to = ordered[i + 1];
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

  function cloneChunk(chunk, dx, materializationState) {
    const shift = finite(dx, 0);
    const platforms = chunk.platforms.map((p) => {
      const copy = {
        ...p,
        x: p.x + shift,
        connectionIds: (p.connectionIds || []).slice(),
        cage: p.cage ? { ...p.cage } : p.cage,
      };
      if (copy.voidType === "cage") {
        const rect = cageGeometry(copy);
        copy.cageX = rect.centerX;
        copy.cageRect = rect;
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
  function materialize(chunk, offsetX, materializationState) {
    if (!chunk || !Array.isArray(chunk.platforms)) throw new Error("VoidGen.materialize requires a generated chunk");
    return cloneChunk(chunk, offsetX, materializationState);
  }

  function cageGeometry(platform, overrides) {
    if (!platform || platform.voidType !== "cage") return null;
    const options = normaliseOptions(overrides);
    const spec = platform.cage || {};
    const halfWidth = finite(spec.halfWidth, finite(platform.cageHalfWidth, options.cageHalfWidth));
    const height = finite(spec.height, finite(platform.cageHeight, options.cageHeight));
    const centerX = platform.x + finite(spec.offsetX, platform.w + 18);
    return { centerX, x: centerX - halfWidth, y: platform.y - height, w: halfWidth * 2, h: height };
  }

  function standingRange(surface, options) {
    // Platform support uses AABB overlap in the game, so a player can remain
    // supported while overhanging by almost one half-width at either edge.
    return { x0: surface.x - options.playerHalfWidth, x1: surface.x + surface.w + options.playerHalfWidth };
  }

  function cageCanReachStandingX(cage, surface, options) {
    const rect = cageGeometry(cage, options), stand = standingRange(surface, options);
    return overlap(rect.x - options.playerHalfWidth, rect.x + rect.w + options.playerHalfWidth, stand.x0, stand.x1);
  }

  function cageStandingOverlap(cage, surface, options) {
    if (!cage || !surface || cage.voidLane === surface.voidLane || !cageCanReachStandingX(cage, surface, options)) return false;
    const rect = cageGeometry(cage, options);
    const playerTop = surface.y - options.playerHalfHeight * 2;
    return overlap(rect.y, rect.y + rect.h, playerTop, surface.y);
  }

  function fitCageHeights(platforms, options) {
    for (const cage of platforms) {
      if (cage.voidType !== "cage") continue;
      let height = options.cageHeight;
      const adjustedFor = [];
      for (const surface of platforms) {
        if (surface.voidLane === cage.voidLane || surface.y >= cage.y || !cageCanReachStandingX(cage, surface, options)) continue;
        height = Math.min(height, Math.max(0, cage.y - surface.y - options.cageVerticalClearance));
        adjustedFor.push(surface.id);
      }
      cage.cage.height = height;
      cage.cageHeight = height;
      cage.cageAdjustedFor = adjustedFor;
      const rect = cageGeometry(cage, options);
      cage.cageX = rect.centerX;
      cage.cageRect = rect;
    }
  }

  function cageFree(platform, platforms, options) {
    const px = platform.x + platform.w * 0.5;
    const py = platform.y - options.playerHalfHeight;
    for (const cage of platforms) {
      if (cage.voidType !== "cage") continue;
      const rect = cageGeometry(cage, options);
      if (px + options.playerHalfWidth > rect.x && px - options.playerHalfWidth < rect.x + rect.w &&
        py + options.playerHalfHeight > rect.y && py - options.playerHalfHeight < rect.y + rect.h) return false;
    }
    return true;
  }

  function selectRescue(platforms, centerX, runTime, overrides) {
    const options = normaliseOptions(overrides);
    const active = platforms.filter((p) => p && p.void && p.voidType === "plain" &&
      (p.materializationState == null || p.materializationState === "active") && p.collidable !== false && cageFree(p, platforms, options));
    if (!active.length) return null;
    const lower = active.filter((p) => p.voidLane === "lower");
    const pool = lower.length ? lower : active.filter((p) => p.voidLane === "upper");
    return pool.sort((a, b) => Math.abs((a.x + a.w * 0.5) - centerX) - Math.abs((b.x + b.w * 0.5) - centerX) || a.id.localeCompare(b.id))[0] || null;
  }

  function hazardState(platform, runTime, overrides) {
    if (!platform || platform.voidType !== "fire") return platform && platform.voidType === "crumble" ? "crumble" : "cold";
    const options = normaliseOptions(overrides);
    const offset = Number.isFinite(platform.hazardPhaseOffset)
      ? platform.hazardPhaseOffset
      : ((platform.hazardSeed >>> 0) / 4294967296) * options.firePeriod;
    const t = ((finite(runTime, 0) + offset) % options.firePeriod + options.firePeriod) % options.firePeriod;
    const hotStart = options.firePeriod - options.fireHotTime;
    const armStart = hotStart - options.fireArmTime;
    if (t < armStart) return "cold";
    if (t < hotStart) return "arming";
    return "hot";
  }

  function lethalIntervals(platforms) {
    return platforms.filter((p) => p.voidType === "fire" || p.voidType === "cage").map((p) => {
      if (p.voidType === "cage") {
        const rect = cageGeometry(p);
        return { x0: rect.x, x1: rect.x + rect.w, id: p.id, lane: p.voidLane };
      }
      return { x0: p.x, x1: p.x + p.w, id: p.id, lane: p.voidLane };
    }).sort((a, b) => a.x0 - b.x0);
  }

  function simultaneousThreats(platforms) {
    const lower = lethalIntervals(platforms.filter((p) => p.voidLane === "lower"));
    const upper = lethalIntervals(platforms.filter((p) => p.voidLane === "upper"));
    const collisions = [];
    let i = 0, j = 0;
    while (i < lower.length && j < upper.length) {
      const a = lower[i], b = upper[j];
      if (overlap(a.x0, a.x1, b.x0, b.x1)) collisions.push([a.id, b.id]);
      if (a.x1 < b.x1) i++; else j++;
    }
    return collisions;
  }

  function clearanceFailures(platforms, options) {
    const lower = platforms.filter((p) => p.voidLane === "lower").sort((a, b) => a.x - b.x);
    const upper = platforms.filter((p) => p.voidLane === "upper").sort((a, b) => a.x - b.x);
    const failures = [];
    let start = 0;
    for (const lo of lower) {
      while (start < upper.length && upper[start].x + upper[start].w <= lo.x) start++;
      for (let i = start; i < upper.length && upper[i].x < lo.x + lo.w; i++) {
        const up = upper[i];
        if (lo.y - (up.y + up.h) < options.laneClearance) failures.push([lo.id, up.id]);
      }
    }
    return failures;
  }

  function cageStandingFailures(platforms, options) {
    const failures = [];
    for (const cage of platforms) {
      if (cage.voidType !== "cage") continue;
      if ((cage.cage && cage.cage.height) < options.cageMinBlockHeight) failures.push([cage.id, "too-short"]);
      for (const surface of platforms) {
        if (cageStandingOverlap(cage, surface, options)) failures.push([cage.id, surface.id]);
      }
    }
    return failures;
  }

  function inspect(chunks, overrides) {
    const source = chunks || [];
    const options = normaliseOptions(overrides || (source[0] && source[0].options));
    const errors = [];
    const ids = new Set();
    const platforms = source.flatMap((c) => c.platforms || []);
    for (const chunk of source) {
      if (!MOTIFS.includes(chunk.motif)) errors.push(`chunk ${chunk.chunkId}: unknown motif ${chunk.motif}`);
      if (chunk.width < options.chunkWidthMin - 0.001 || chunk.width > options.chunkWidthMax + 0.001) errors.push(`chunk ${chunk.chunkId}: width ${chunk.width}`);
      for (const lane of LANES) {
        const lanePlatforms = (chunk.lanes && chunk.lanes[lane]) || chunk.platforms.filter((p) => p.voidLane === lane);
        if (!lanePlatforms.length) errors.push(`chunk ${chunk.chunkId}: empty ${lane} lane`);
        for (let i = 1; i < lanePlatforms.length; i++) if (lanePlatforms[i].x <= lanePlatforms[i - 1].x) errors.push(`chunk ${chunk.chunkId}: unordered ${lane} lane`);
      }
      const lower = (chunk.lanes && chunk.lanes.lower) || [], upper = (chunk.lanes && chunk.lanes.upper) || [];
      for (let i = 0; i < Math.min(lower.length, upper.length); i++) {
        const lc = lower[i].x + lower[i].w * 0.5, uc = upper[i].x + upper[i].w * 0.5;
        if (Math.abs(lc - uc) < 48) errors.push(`chunk ${chunk.chunkId}: mirrored strata ${i}`);
      }
      if (!chunk.platforms.some((p) => p.voidType === "plain" && p.x + p.w >= chunk.x + chunk.width * 0.5)) errors.push(`chunk ${chunk.chunkId}: no stable forward landing`);
    }
    for (const p of platforms) {
      if (!p.id || ids.has(p.id)) errors.push(`duplicate platform id ${p.id || "<missing>"}`);
      ids.add(p.id);
      if (p.chunkId == null || !LANES.includes(p.voidLane) || !p.voidType || p.hazardSeed == null || !p.materializationState) errors.push(`${p.id || "platform"}: incomplete metadata`);
      const lo = p.voidLane === "lower" ? options.lowerBandMin : options.upperBandMin;
      const hi = p.voidLane === "lower" ? options.lowerBandMax : options.upperBandMax;
      if (p.y < lo - 0.001 || p.y > hi + 0.001) errors.push(`${p.id}: outside ${p.voidLane} band`);
    }
    const clearance = clearanceFailures(platforms, options);
    if (clearance.length) errors.push(`${clearance.length} lane-clearance overlap(s)`);
    const cageStanding = cageStandingFailures(platforms, options);
    if (cageStanding.length) errors.push(`${cageStanding.length} cage/opposite-lane standing overlap(s)`);
    const threats = simultaneousThreats(platforms);
    if (threats.length) errors.push(`${threats.length} simultaneous lethal slice(s)`);

    const speeds = [options.scrollSpeedMin, options.scrollSpeedMax];
    const graphs = speeds.map((speed) => buildGraph(source, options, speed));
    for (let gi = 0; gi < graphs.length; gi++) {
      const graph = graphs[gi], speed = speeds[gi];
      const adjacency = new Map();
      for (const e of graph.edges) {
        if (!e.ok) {
          if (e.kind !== "lane") errors.push(`${e.id}: unreachable connector at scroll ${speed}`);
          continue;
        }
        if (!adjacency.has(e.from)) adjacency.set(e.from, []);
        adjacency.get(e.from).push(e.to);
      }
      if (source.length) {
        const firstId = Math.min(...source.map((c) => c.chunkId));
        const lastId = Math.max(...source.map((c) => c.chunkId));
        const starts = platforms.filter((p) => p.chunkId === firstId && p.voidRole !== "exit").map((p) => p.id);
        const ends = new Set(platforms.filter((p) => p.chunkId === lastId && p.voidType === "plain" &&
          p.x + p.w >= source.find((c) => c.chunkId === lastId).x + source.find((c) => c.chunkId === lastId).width * 0.5).map((p) => p.id));
        const seen = new Set(starts), queue = starts.slice();
        for (let q = 0; q < queue.length; q++) for (const to of adjacency.get(queue[q]) || []) if (!seen.has(to)) { seen.add(to); queue.push(to); }
        if (![...ends].some((id) => seen.has(id))) errors.push(`no complete route at scroll ${speed}`);
      }
    }

    const connectorIds = source.filter((c) => c.hasTransfer).map((c) => c.chunkId).sort((a, b) => a - b);
    for (let i = 1; i < connectorIds.length; i++) {
      const gap = connectorIds[i] - connectorIds[i - 1];
      // A cage bypass may add an extra transfer between scheduled windows; only
      // a drought is invalid. Scheduled transfers themselves remain 2-3 apart.
      if (gap > 3) errors.push(`connector cadence ${connectorIds[i - 1]} -> ${connectorIds[i]}`);
    }
    const center = source.length ? (source[0].x + source[source.length - 1].x + source[source.length - 1].width) * 0.5 : 0;
    const rescue = selectRescue(platforms, center, 0, options);
    if (source.length && !rescue) errors.push("no safe rescue candidate");

    let live = null;
    if (overrides && overrides.visibleRect) {
      const left = overrides.visibleRect.left, right = overrides.visibleRect.right;
      live = { lower: 0, upper: 0 };
      for (const p of platforms) if (p.x < right && p.x + p.w > left) live[p.voidLane]++;
      const min = overrides.liveMin == null ? 5 : overrides.liveMin;
      const max = overrides.liveMax == null ? 7 : overrides.liveMax;
      for (const lane of LANES) if (live[lane] < min || live[lane] > max) errors.push(`${lane} live count ${live[lane]} outside ${min}-${max}`);
    }

    return {
      ok: errors.length === 0,
      errors,
      rescue,
      graphs,
      stats: {
        chunks: source.length,
        platforms: platforms.length,
        lower: platforms.filter((p) => p.voidLane === "lower").length,
        upper: platforms.filter((p) => p.voidLane === "upper").length,
        connectors: source.reduce((n, c) => n + c.connectors.length, 0),
        live,
      },
    };
  }

  function next(state, appendX) {
    if (!state || state.version !== 2 || !state.options) throw new Error("VoidGen.next requires a state from VoidGen.create");
    // A scrolling integration may pass the current right edge. Route identity,
    // RNG, ids, and hazards remain unchanged; only the screen-space placement is
    // rebased, so no mutable global scroll offset leaks into generation.
    if (Number.isFinite(appendX) && appendX !== state.nextX) {
      const dx = appendX - state.nextX;
      state = { ...state, nextX: appendX, recentChunks: state.recentChunks.map((c) => cloneChunk(c, dx)) };
    }
    const rng = { value: state.rngState >>> 0 };
    const connectorDue = state.nextChunkId >= state.nextConnectorAt;
    let chunk = null, motif = "";
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
    if (!chunk) throw new Error(`VoidGen could not build chunk ${state.nextChunkId} from seed ${state.seed}`);

    const connectorGap = connectorDue ? 2 + randomInt(rng, 2) : null;
    const exits = {};
    for (const lane of LANES) exits[lane] = chunk.lanes[lane].slice().sort((a, b) => (b.x + b.w) - (a.x + a.w))[0].y;
    const nextState = {
      ...state,
      rngState: rng.value >>> 0,
      nextChunkId: state.nextChunkId + 1,
      nextX: state.nextX + chunk.width,
      nextConnectorAt: connectorDue ? state.nextChunkId + connectorGap : state.nextConnectorAt,
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

  function generate(seed, count, overrides) {
    let state = create(seed, overrides);
    const chunks = [];
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
  function ingress(seed, anchorX, anchorY, overrides) {
    const o = normaliseOptions(overrides), s = mix32(seed32(seed) ^ 0x71f3a95b);
    const viewportW = Math.max(o.platformWidthMax, finite(o.viewportWidth, 1600));
    const w = clamp(Math.max(320, o.playerHalfWidth * 8), 300, Math.min(390, viewportW - o.edgeInset * 2));
    const x = clamp(finite(anchorX, viewportW * 0.45) - w * 0.5, o.edgeInset, viewportW - o.edgeInset - w);
    const y = clamp(finite(anchorY, o.lowerBandMin), o.lowerBandMin, o.lowerBandMax);
    const id = `void:${seed32(seed).toString(16).padStart(8, "0")}:ingress`;
    const platform = {
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

  return Object.freeze({
    defaults: DEFAULTS,
    motifs: MOTIFS,
    create,
    next,
    generate,
    inspect,
    hazardState,
    selectRescue,
    cageGeometry,
    materialize,
    ingress,
  });
})();

// Optional CommonJS bridge for the deterministic stress harness. Classic browser
// scripts use the top-level VoidGen binding above.
if (typeof module !== "undefined" && module.exports) module.exports = VoidGen;
