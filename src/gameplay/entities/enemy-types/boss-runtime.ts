import type { BossFxEvent, BossPresentationActor, BossTransformationSpec, EnemyDependencies, Point, WeaponActor, WeaponPose, WeaponSegment } from "../enemy-contracts";

export function createBossRuntime(dependencies: EnemyDependencies) {
  const { CLOCK, CONFIG, FX, SFX, segPointDist } = dependencies;
  // ====================================================================================
  //  BOSS THEATER — the shared ceremony layer every boss speaks through.
  //  BOSSFX mirrors the Echo's fxq (drained generically in game.js): any boss can push
  //  {shake, flash, hitstop, slowmo, zoom, txt, x, y, big, color, quiet} beats.
  // ====================================================================================
  const BOSS_PRESENTATION: Record<string, Record<string, BossFxEvent>> = {
    warden: {
      windup: { shake: 1.5, cue: "wardenLockdown", priority: 2 }, launch: { shake: 3, cue: "wardenMortarLaunch", priority: 3 },
      contact: { shake: 6, hitstop: 0.035, cue: "wardenClash", priority: 5 }, counter: { shake: 5, flash: 0.15, hitstop: 0.045, cue: "wardenClash", priority: 6 },
      stagger: { shake: 9, flash: 0.32, hitstop: 0.07, cue: "wardenGuardBreak", priority: 8 },
      phaseTransition: { shake: 8, flash: 0.34, slowmo: 0.42, zoom: 0.04, cue: "wardenLockdown", priority: 9 },
      platformBreak: { shake: 3, cue: "wardenLockdown", priority: 2 }, platformRebuild: { shake: 1, cue: "platformRebuild", priority: 1 },
      death: { shake: 10, flash: 0.42, slowmo: 0.7, zoom: 0.055, hitstop: 0.09, cue: "bossDeathWarden", priority: 10 },
    },
    colossus: {
      windup: { shake: 2, cue: "colossusServo", priority: 2 }, launch: { shake: 4, cue: "colossusServo", priority: 3 },
      contact: { shake: 9, hitstop: 0.055, cue: "colossusPlate", priority: 6 }, counter: { shake: 7, hitstop: 0.05, cue: "sweeperCounter", priority: 7 },
      stagger: { shake: 11, flash: 0.22, slowmo: 0.35, zoom: 0.055, hitstop: 0.075, cue: "colossusStagger", priority: 8 },
      phaseTransition: { shake: 10, flash: 0.3, slowmo: 0.4, zoom: 0.05, cue: "colossusServo", priority: 9 },
      platformBreak: { shake: 6, cue: "colossusPlate", priority: 4 }, platformRebuild: { shake: 2, cue: "platformRebuild", priority: 1 },
      death: { shake: 12, flash: 0.38, slowmo: 0.75, zoom: 0.065, hitstop: 0.1, cue: "bossDeathColossus", priority: 10 },
    },
    aldric: {
      windup: { shake: 1, cue: "aldricCleaver", priority: 2 }, launch: { shake: 3, cue: "aldricCleaver", priority: 3 },
      contact: { shake: 7, hitstop: 0.045, cue: "aldricCleaver", priority: 6 }, counter: { shake: 5, hitstop: 0.04, cue: "aldricCleaver", priority: 6 },
      stagger: { shake: 8, flash: 0.18, slowmo: 0.3, cue: "aldricCleaver", priority: 8 },
      phaseTransition: { shake: 8, flash: 0.3, slowmo: 0.4, zoom: 0.045, cue: "aldricIgnite", priority: 9 },
      platformBreak: { shake: 4, cue: "aldricCleaver", priority: 3 }, platformRebuild: { shake: 1, cue: "platformRebuild", priority: 1 },
      death: { shake: 10, flash: 0.36, slowmo: 0.72, zoom: 0.05, hitstop: 0.09, cue: "bossDeathAldric", priority: 10 },
    },
    echo: {
      windup: { shake: 0, cue: "echoResonance", priority: 2 }, launch: { shake: 2, cue: "echoResonance", priority: 3 },
      contact: { shake: 4, hitstop: 0.035, cue: "echoResonance", priority: 5 }, counter: { shake: 3, flash: 0.1, cue: "echoResonance", priority: 6 },
      stagger: { shake: 5, flash: 0.16, slowmo: 0.3, cue: "echoResonance", priority: 8 },
      phaseTransition: { shake: 4, flash: 0.24, slowmo: 0.38, zoom: 0.03, cue: "echoResonance", priority: 9 },
      platformBreak: { shake: 1, cue: "echoResonance", priority: 2 }, platformRebuild: { shake: 0, cue: "echoResonance", priority: 1 },
      death: { shake: 7, flash: 0.5, slowmo: 0.75, zoom: 0.035, hitstop: 0.08, cue: "bossDeathEcho", priority: 10 },
    },
    source: {
      windup: { shake: 0, cue: "sourceCross", priority: 2 }, launch: { shake: 3, cue: "sourceCross", priority: 3 },
      contact: { shake: 6, hitstop: 0.04, cue: "sourceFracture", priority: 6 }, counter: { shake: 5, flash: 0.12, hitstop: 0.045, cue: "sourceRepel", priority: 7 },
      stagger: { shake: 7, flash: 0.2, slowmo: 0.34, cue: "sourceFracture", priority: 8 },
      phaseTransition: { shake: 7, flash: 0.32, slowmo: 0.42, zoom: 0.045, cue: "sourceCross", priority: 9 },
      platformBreak: { shake: 2, cue: "sourceFracture", priority: 3 }, platformRebuild: { shake: 0, cue: "voidTransfer", priority: 1 },
      death: { shake: 9, flash: 0.5, slowmo: 0.85, zoom: 0.07, hitstop: 0.1, cue: "bossDeathSource", priority: 10 },
    },
  };
  interface BossFxQueue {
    q: BossFxEvent[];
    juice(event: BossFxEvent): void;
    event(boss: BossPresentationActor, name: string, overrides?: BossFxEvent): void;
    drain(): BossFxEvent[];
  }
  const BOSSFX: BossFxQueue = {
    q: [],
    juice(ev: BossFxEvent) { this.q.push(Object.assign({ priority: Math.max(1, ev.shake ?? 0) }, ev)); },
    event(boss: BossPresentationActor, name: string, overrides?: BossFxEvent) {
      const id = boss.presentationId || (boss.bossId ?? "source");
      const profile = BOSS_PRESENTATION[id] ?? BOSS_PRESENTATION.source ?? {};
      this.q.push(Object.assign({ bossId: id, event: name, priority: 1 }, profile[name] ?? {}, overrides ?? {}));
    },
    drain() {
      if (!this.q.length) return [];
      const requests = this.q.splice(0), out: BossFxEvent = { priority: -1, quiet: true }, numeric = ["shake", "flash", "hitstop", "slowmo", "zoom"] as const;
      let cuePriority = -1, textPriority = -1;
      for (const ev of requests) {
        for (const key of numeric) if ((ev[key] ?? 0) > (out[key] ?? 0)) out[key] = ev[key];
        const pr = ev.priority ?? 1;
        if (ev.cue && pr >= cuePriority) { out.cue = ev.cue; cuePriority = pr; }
        if ((ev.banner || ev.txt) && pr >= textPriority) {
          out.banner = ev.banner; out.txt = ev.txt; out.x = ev.x; out.y = ev.y; out.big = ev.big; out.color = ev.color; textPriority = pr;
        }
        out.priority = Math.max(out.priority ?? -1, pr); out.quiet = !!out.quiet && !!ev.quiet;
      }
      return [out];   // camera, flash, hit-stop and sound are one coalesced request per simulation frame
    },
  };
  function bossFeedback(boss: BossPresentationActor, name: string, overrides?: BossFxEvent) { BOSSFX.event(boss, name, overrides); }

  // a PHASE TURN, made ceremonial: slow-mo + flash + shake + a named banner + rings.
  // Also arms the HP bar's crack-flash (game.js reads boss._phaseFlashT).
  function bossPhaseBeat(boss: BossPresentationActor, title: string, color?: string) {
    const c = color ?? boss.color;
    bossFeedback(boss, "phaseTransition", { banner: title, color: c });
    try { FX.ring(boss.x, boss.y, 26, c); FX.shockwave(boss.x, boss.y, 12, c, 260, 5); } catch { /* cosmetic feedback is best-effort */ }
    boss._phaseFlashT = 0.7;
  }

  // Major pantheon transformations enter the single cinematic channel owned by
  // game.js. Minibosses keep the compact phase banner so endless waves are never
  // interrupted by full campaign theater.
  function bossTransformation(boss: BossPresentationActor, spec: BossTransformationSpec) {
    if (boss.isMiniBoss) { bossPhaseBeat(boss, spec.title || spec.line || "PHASE SHIFT", spec.color); return; }
    // where the spoken line anchors, so world choreography owns the frame center
    // (Pantheon VI P4). Colossus is a non-conversational upper-left warning; the
    // Source speaks from depth-center; the rest sit in a lower corner.
    const anchorByPose = {
      wardenRule: "lower-left", wardenBreak: "lower-left",
      colossusContainment: "upper-left", colossusCore: "upper-left",
      aldricCrownfall: "lower-right", aldricFeral: "lower-right",
      echoMirror: "lower-right", sourceTrue: "depth-center",
    };
    const anchor = anchorByPose[spec.pose as keyof typeof anchorByPose] || "lower-left";
    boss.cinematicRequest = Object.assign({ color: boss.color, speaker: boss.bossName, duration: 0.88, anchor }, spec);
    boss.cinematicPose = spec.pose || "transform"; boss.cinematicColor = spec.color || boss.color; boss._phaseFlashT = 0.7;
  }

  // the PERIL FLASH — the "this one cannot be parried" tell (crimson diamond + sting).
  // Call perilPing(boss) at the wind-up; the boss's draw calls drawPeril each frame.
  function perilPing(boss: BossPresentationActor) {
    boss._perilUntil = CLOCK.sim + 0.6;
    try { SFX.rankup(); } catch { /* audio feedback is best-effort */ }
    BOSSFX.juice({ txt: "⚠", x: boss.x, y: boss.y - boss.hh - 30, color: "#e23b3b", quiet: true });
  }

  // ====================================================================================
  //  BOSS FRAMEWORK — The Warden (Stage 1). HP-gated phases, an attack scheduler, and
  //  arena-effect hooks (floor shockwaves, mortar fire, prohibited zones, platform vaulting,
  //  a fake-death beat, and a ceiling-cling finale). Later bosses follow the same shape.
  // ====================================================================================
  // Authoritative boss-weapon poses. Drawing, attack damage, debug hulls, and the
  // Warden's blade clash all consume these exact points instead of parallel lengths.
  interface WeaponBasis extends Point { ux: number; uy: number; px: number; py: number }
  interface WeaponTarget extends Point { hw: number; hh: number }
  type WeaponAngleKey = "batonA" | "weaponA";
  type WeaponVelocityKey = "batonAV" | "weaponAV";

  function weaponBasis(x: number, y: number, a: number, facing: number): WeaponBasis {
    return { x, y, ux: facing * Math.cos(a), uy: Math.sin(a), px: -Math.sin(a) * facing, py: Math.cos(a) };
  }
  function weaponPoint(b: WeaponBasis, along: number, side: number): Point { return { x: b.x + b.ux * along + b.px * side, y: b.y + b.uy * along + b.py * side }; }
  function weaponSegment(a: Point, b: Point): WeaponSegment { return { a, b, x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }
  function freezeWeaponTemplate(points: readonly (readonly [number, number])[]) { return Object.freeze(points.map((p) => Object.freeze(p))); }
  // Static local-space silhouettes are cached once. Poses still transform into
  // fresh world points because collision/debug consumers own those snapshots.
  const WARDSTAFF_HEAD_LOCAL = freezeWeaponTemplate([
    [CONFIG.warden.staffFront - 8, -18], [CONFIG.warden.staffFront + CONFIG.warden.staffHead, -18],
    [CONFIG.warden.staffFront + CONFIG.warden.staffHead - 8, -6], [CONFIG.warden.staffFront + CONFIG.warden.staffHead + 3, -2],
    [CONFIG.warden.staffFront + CONFIG.warden.staffHead + 3, 7], [CONFIG.warden.staffFront + 7, 5],
    [CONFIG.warden.staffFront + CONFIG.warden.staffHead - 6, 18], [CONFIG.warden.staffFront - 8, 18],
  ]);
  const CLEAVER_HEAD_LOCAL = freezeWeaponTemplate([
    [CONFIG.aldric.cleaverShaft - 7, -14], [CONFIG.aldric.cleaverShaft + CONFIG.aldric.cleaverBlade * 0.54, -CONFIG.aldric.cleaverHalfW],
    [CONFIG.aldric.cleaverShaft + CONFIG.aldric.cleaverBlade, -CONFIG.aldric.cleaverHalfW * 0.82],
    [CONFIG.aldric.cleaverShaft + CONFIG.aldric.cleaverBlade * 0.78, -10], [CONFIG.aldric.cleaverShaft + CONFIG.aldric.cleaverBlade + 2, -2],
    [CONFIG.aldric.cleaverShaft + CONFIG.aldric.cleaverBlade * 0.78, 8],
    [CONFIG.aldric.cleaverShaft + CONFIG.aldric.cleaverBlade, CONFIG.aldric.cleaverHalfW * 0.82],
    [CONFIG.aldric.cleaverShaft + CONFIG.aldric.cleaverBlade * 0.42, CONFIG.aldric.cleaverHalfW], [CONFIG.aldric.cleaverShaft - 7, 15],
  ]);
  function springWeapon(actor: WeaponActor, angleKey: WeaponAngleKey, velocityKey: WeaponVelocityKey, target: number, dt: number, stiffness: number, damping: number) {
    const a = actor[angleKey], v = actor[velocityKey] || 0;
    const nv = (v + (target - a) * stiffness * dt) * Math.exp(-damping * dt);
    actor[velocityKey] = nv; actor[angleKey] = a + nv * dt;
  }
  function wardstaffPose(actor: WeaponActor, angle: number, prevAngle?: number | null): WeaponPose {
    const C = CONFIG.warden, origin = { x: actor.x + actor.facing * actor.hw * 0.08, y: actor.y - 7 };
    const build = (a: number) => {
      const b = weaponBasis(origin.x, origin.y, a, actor.facing), front = C.staffFront, head = C.staffHead;
      const shaftA = weaponPoint(b, -C.staffRear, 0), shaftB = weaponPoint(b, front, 0);
      const gripA = weaponPoint(b, -13, 0), gripB = weaponPoint(b, 18, 0);
      const headPolygon = WARDSTAFF_HEAD_LOCAL.map((p) => weaponPoint(b, p[0], p[1]));
      const edgeA = headPolygon[1], edgeB = headPolygon[6];
      if (!edgeA || !edgeB) throw new Error("Invalid wardstaff geometry");
      const cuttingEdge = weaponSegment(edgeA, edgeB);
      return { shaftA, shaftB, gripA, gripB, headPolygon, cuttingEdge, tip: weaponPoint(b, front + head + 3, 2),
        counterweight: weaponPoint(b, -C.staffRear, 0), guardRing: weaponPoint(b, 31, 0) };
    };
    const cur = build(angle), prev = build(prevAngle ?? angle);
    const swept = [cur.cuttingEdge, prev.cuttingEdge, weaponSegment(prev.tip, cur.tip), weaponSegment(cur.shaftA, cur.shaftB)];
    return { gripA: cur.gripA, gripB: cur.gripB, shaftA: cur.shaftA, shaftB: cur.shaftB,
      headPolygon: cur.headPolygon, cuttingEdge: cur.cuttingEdge, tip: cur.tip,
      counterweight: cur.counterweight, guardRing: cur.guardRing,
      sweptAttackHull: { segments: swept, radius: 10 },
      parryCapsule: Object.assign(weaponSegment(cur.gripB, cur.tip), { radius: C.staffParryR }) };
  }
  function greatCleaverPose(actor: WeaponActor, angle: number, prevAngle?: number | null, originOverride?: Point | null): WeaponPose {
    const C = CONFIG.aldric, hand = originOverride ?? { x: actor.x + actor.facing * actor.hw * 0.08, y: actor.y - 2 };
    const build = (a: number) => {
      const b = weaponBasis(hand.x, hand.y, a, actor.facing), shaft = C.cleaverShaft, blade = C.cleaverBlade;
      const shaftA = weaponPoint(b, -C.cleaverRear, 0), shaftB = weaponPoint(b, shaft + 5, 0);
      const gripA = weaponPoint(b, -15, 0), gripB = weaponPoint(b, 20, 0);
      // The double inward step at the nose is the broken-crown notch.
      const headPolygon = CLEAVER_HEAD_LOCAL.map((p) => weaponPoint(b, p[0], p[1]));
      const edgeA = headPolygon[2], edgeB = headPolygon[6];
      if (!edgeA || !edgeB) throw new Error("Invalid cleaver geometry");
      const cuttingEdge = weaponSegment(edgeA, edgeB);
      return { shaftA, shaftB, gripA, gripB, headPolygon, cuttingEdge,
        tip: weaponPoint(b, shaft + blade + 2, -2), guardRing: weaponPoint(b, shaft - 10, 0) };
    };
    const cur = build(angle), prev = build(prevAngle ?? angle);
    return { gripA: cur.gripA, gripB: cur.gripB, shaftA: cur.shaftA, shaftB: cur.shaftB,
      headPolygon: cur.headPolygon, cuttingEdge: cur.cuttingEdge, tip: cur.tip, guardRing: cur.guardRing,
      sweptAttackHull: { segments: [cur.cuttingEdge, prev.cuttingEdge, weaponSegment(prev.tip, cur.tip), weaponSegment(cur.shaftA, cur.shaftB)], radius: 12 },
      parryCapsule: Object.assign(weaponSegment(cur.gripB, cur.tip), { radius: 13 }) };
  }
  function weaponHullHitsTarget(pose: WeaponPose | null | undefined, target: WeaponTarget | null | undefined, pad = 0) {
    if (!pose?.sweptAttackHull || !target) return false;
    const targetR = Math.min(target.hw || 0, target.hh || 0) + (pad || 0) + pose.sweptAttackHull.radius;
    return pose.sweptAttackHull.segments.some((s) => segPointDist(s.a.x, s.a.y, s.b.x, s.b.y, target.x, target.y).dist <= targetR);
  }
  function weaponCapsuleIntersectsSegment(cap: (WeaponSegment & { radius?: number }) | null | undefined, ax: number, ay: number, bx: number, by: number) {
    if (!cap) return false;
    const orient = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const A = { x: ax, y: ay }, B = { x: bx, y: by }, C = cap.a, D = cap.b;
    const boxOverlap = Math.max(Math.min(A.x, B.x), Math.min(C.x, D.x)) <= Math.min(Math.max(A.x, B.x), Math.max(C.x, D.x)) + 1e-6 &&
      Math.max(Math.min(A.y, B.y), Math.min(C.y, D.y)) <= Math.min(Math.max(A.y, B.y), Math.max(C.y, D.y)) + 1e-6;
    const crosses = boxOverlap && orient(A, B, C) * orient(A, B, D) <= 0 && orient(C, D, A) * orient(C, D, B) <= 0;
    if (crosses) return true;
    const d = Math.min(segPointDist(ax, ay, bx, by, C.x, C.y).dist, segPointDist(ax, ay, bx, by, D.x, D.y).dist,
      segPointDist(C.x, C.y, D.x, D.y, ax, ay).dist, segPointDist(C.x, C.y, D.x, D.y, bx, by).dist);
    return d <= (cap.radius ?? 0);
  }
  function weaponDebugGeometry(pose: WeaponPose | null | undefined) { return pose ? pose.sweptAttackHull.segments.map((s) => ({ a: s.a, b: s.b, radius: pose.sweptAttackHull.radius })) : []; }

  return { BOSSFX, bossFeedback, bossPhaseBeat, bossTransformation, perilPing, springWeapon, wardstaffPose, greatCleaverPose, weaponHullHitsTarget, weaponCapsuleIntersectsSegment, weaponDebugGeometry };
}

export type BossRuntime = ReturnType<typeof createBossRuntime>;
