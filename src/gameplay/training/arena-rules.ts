import { VoidGen } from "../voidgen";
import type { VoidChunk, VoidGeneratorState, VoidLane, VoidOptions, VoidPlatform } from "../voidgen-contracts";

export interface ArenaPlatform {
  x: number; y: number; w: number; h: number;
  floor?: boolean; oneway?: boolean;
  platformId?: string; arenaBoss?: string; arenaPlatId?: string; arenaMaterial?: string; material?: string;
  arenaState?: "stable" | "stressed" | "warning" | "broken" | "reforming";
  stress?: number; stressDelay?: number; crackWarn?: number; respawnIn?: number; respawnWarn?: number;
  crackColor?: string | null; fractureReason?: string | null;
  arenaFractureRequest?: { reason: string; color: string } | null;
  crackT?: number; crackMax?: number;
  baseSpec?: Readonly<Partial<ArenaPlatform>>;
}

export interface ArenaActor {
  readonly x: number; readonly y: number; readonly hw: number; readonly hh: number;
  readonly onGround: boolean; readonly dead?: boolean; readonly presentationId?: string;
}

export interface BossArenaConfig {
  readonly reformWarn: number;
  readonly reformClearMargin: number;
  readonly minElevatedActive: number;
  readonly crackWarn: number;
  readonly standBeforeWarn: number;
  readonly stressDrainDelay: number;
  readonly stressDrainRate: number;
  readonly brokenDuration: number;
}

export type ArenaIntent =
  | Readonly<{ type: "burst"; x: number; y: number; dx: number; dy: number; count: number; color: string }>
  | Readonly<{ type: "ring"; x: number; y: number; radius: number; color: string }>
  | Readonly<{ type: "boss-event"; ownerId: string; event: "platformBreak" | "platformRebuild"; color: string; quiet: true }>;

export interface ArenaRuleState {
  readonly platforms: ArenaPlatform[];
  readonly broken: ArenaPlatform[];
}

function authoredPlatform(bossId: string, material: string, x: number, y: number, width: number, index: number, offsetX: number, offsetY: number, reformWarn: number): ArenaPlatform {
  const platformId = `arena:${bossId}:${String(index)}`, arenaPlatId = `${bossId}:${String(index)}`;
  const platform: ArenaPlatform = { x: x + offsetX, y: y + offsetY, w: width, h: 22, oneway: true,
    platformId, arenaBoss: bossId, arenaPlatId,
    arenaMaterial: material, material, arenaState: "stable", stress: 0, stressDelay: 0, crackWarn: 0, respawnIn: 0, respawnWarn: reformWarn };
  platform.baseSpec = { x: platform.x, y: platform.y, w: platform.w, h: platform.h, oneway: true,
    platformId, arenaBoss: bossId, arenaPlatId, arenaMaterial: material, material };
  return platform;
}

export function createBossArena(bossId: string, viewportWidth: number, viewportHeight: number, groundY: number, reformWarn: number): readonly ArenaPlatform[] | null {
  const materials: Readonly<Record<string, string>> = { warden: "wardenSteel", colossus: "colossusGantry", aldric: "aldricStone" };
  const material = materials[bossId] ?? "arena";
  const floor: ArenaPlatform = { x: 0, y: groundY, w: viewportWidth, h: viewportHeight - groundY, floor: true,
    platformId: `arena:${bossId}:floor`, arenaBoss: bossId, arenaPlatId: `${bossId}:floor`, arenaMaterial: `${material}Floor` };
  const offsetX = (viewportWidth - 1600) / 2, offsetY = (viewportHeight - 900) / 2;
  const platform = (x: number, y: number, width: number, index: number) => authoredPlatform(bossId, material, x, y, width, index, offsetX, offsetY, reformWarn);
  if (bossId === "warden") return [floor, platform(150, 430, 240, 0), platform(1210, 430, 240, 1), platform(680, 555, 240, 2)];
  if (bossId === "colossus") return [floor, platform(430, 400, 230, 0), platform(685, 400, 230, 1), platform(940, 400, 230, 2), platform(110, 645, 210, 3), platform(1280, 645, 210, 4)];
  if (bossId === "aldric") return [floor, platform(250, 610, 260, 0), platform(690, 500, 220, 1), platform(1090, 610, 260, 2)];
  return null;
}

export function standingArenaPlatform(platforms: readonly ArenaPlatform[], actor: ArenaActor | null): ArenaPlatform | null {
  if (!actor?.onGround) return null;
  const feet = actor.y + actor.hh;
  return platforms.find((platform) => platform.arenaPlatId && !platform.floor && platform.oneway &&
    Math.abs(feet - platform.y) < 8 && actor.x + actor.hw > platform.x && actor.x - actor.hw < platform.x + platform.w) ?? null;
}

function materialColor(platform: ArenaPlatform, colors: Readonly<{ boss: string; armoredShield: string }>): string {
  if (platform.arenaMaterial === "aldricStone") return "#caa85c";
  if (platform.arenaMaterial === "colossusGantry") return colors.armoredShield;
  return colors.boss;
}

export class BossArenaRules {
  constructor(private readonly config: BossArenaConfig, private readonly colors: Readonly<{ boss: string; armoredShield: string }>) {}

  private activeRouteCount(platforms: readonly ArenaPlatform[]): number {
    return platforms.filter((platform) => platform.arenaPlatId && !platform.floor && platform.oneway).length;
  }

  private startWarning(platform: ArenaPlatform, platforms: readonly ArenaPlatform[], request?: Readonly<{ reason: string; color: string }> | null): boolean {
    if (!platform.arenaPlatId || platform.floor || !["stable", "stressed"].includes(platform.arenaState ?? "") || this.activeRouteCount(platforms) <= this.config.minElevatedActive) return false;
    platform.arenaState = "warning"; platform.crackWarn = this.config.crackWarn;
    platform.crackColor = request?.color ?? materialColor(platform, this.colors);
    platform.fractureReason = request?.reason ?? "standing";
    return true;
  }

  update(state: ArenaRuleState, dt: number, player: ArenaActor | null, enemies: readonly ArenaActor[], lowGraphics: boolean): readonly ArenaIntent[] {
    const intents: ArenaIntent[] = [], standing = standingArenaPlatform(state.platforms, player), config = this.config;
    for (let index = state.platforms.length - 1; index >= 0; index--) {
      const platform = state.platforms[index];
      if (!platform?.arenaPlatId || platform.floor) continue;
      if (platform.arenaFractureRequest) {
        const request = platform.arenaFractureRequest; platform.arenaFractureRequest = null;
        if (this.startWarning(platform, state.platforms, request)) continue;
      }
      if (platform.arenaState === "warning") {
        platform.crackWarn = Math.max(0, (platform.crackWarn ?? 0) - dt);
        if (platform.crackWarn <= 0) {
          if (this.activeRouteCount(state.platforms) <= config.minElevatedActive) {
            platform.arenaState = "stressed"; platform.stress = config.standBeforeWarn * 0.65; platform.stressDelay = config.stressDrainDelay;
          } else {
            state.platforms.splice(index, 1); platform.arenaState = "broken"; platform.stress = 0; platform.stressDelay = 0;
            platform.respawnWarn = config.reformWarn; platform.respawnIn = config.brokenDuration + config.reformWarn; state.broken.push(platform);
            const color = platform.crackColor ?? materialColor(platform, this.colors), x = platform.x + platform.w / 2;
            intents.push({ type: "ring", x, y: platform.y, radius: 18, color }, { type: "burst", x, y: platform.y, dx: 0, dy: 1, count: 8, color });
            const owner = enemies.find((enemy) => !enemy.dead && enemy.presentationId === platform.arenaBoss);
            if (owner?.presentationId) intents.push({ type: "boss-event", ownerId: owner.presentationId, event: "platformBreak", color, quiet: true });
          }
        }
        continue;
      }
      if (standing === platform) { platform.stress = Math.min(config.standBeforeWarn, (platform.stress ?? 0) + dt); platform.stressDelay = config.stressDrainDelay; }
      else if ((platform.stressDelay ?? 0) > 0) platform.stressDelay = Math.max(0, (platform.stressDelay ?? 0) - dt);
      else platform.stress = Math.max(0, (platform.stress ?? 0) - config.stressDrainRate * dt);
      platform.arenaState = (platform.stress ?? 0) > 0 ? "stressed" : "stable";
      if ((platform.stress ?? 0) >= config.standBeforeWarn) this.startWarning(platform, state.platforms);
    }
    for (let index = state.broken.length - 1; index >= 0; index--) {
      const platform = state.broken[index]; if (!platform) continue;
      platform.respawnIn = Math.max(0, (platform.respawnIn ?? 0) - dt);
      if (platform.respawnIn <= (platform.respawnWarn ?? 0)) platform.arenaState = "reforming";
      const clearMargin = config.reformClearMargin;
      const playerClear = !player || Math.abs(player.x - (platform.x + platform.w / 2)) >= player.hw + platform.w / 2 + clearMargin || Math.abs(player.y - (platform.y + platform.h / 2)) >= player.hh + platform.h / 2 + clearMargin;
      if (platform.respawnIn > 0 || !playerClear) continue;
      Object.assign(platform, platform.baseSpec); platform.arenaState = "stable"; platform.stress = 0; platform.stressDelay = 0;
      platform.crackWarn = 0; platform.respawnIn = 0; platform.respawnWarn = config.reformWarn; platform.crackColor = null; platform.fractureReason = null; platform.arenaFractureRequest = null;
      state.platforms.push(platform); state.broken.splice(index, 1);
      const color = materialColor(platform, this.colors), x = platform.x + platform.w / 2;
      intents.push({ type: "ring", x, y: platform.y, radius: 12, color });
      if (!lowGraphics) intents.push({ type: "burst", x, y: platform.y, dx: 0, dy: -1, count: 5, color });
      const owner = enemies.find((enemy) => !enemy.dead && enemy.presentationId === platform.arenaBoss);
      if (owner?.presentationId) intents.push({ type: "boss-event", ownerId: owner.presentationId, event: "platformRebuild", color, quiet: true });
    }
    return intents;
  }
}

export interface SourceVoidConfig {
  readonly voidSpawnBehind: number; readonly voidSpawnAhead: number;
  readonly voidChunkWidthMin: number; readonly voidChunkWidthMax: number;
  readonly voidPlatformWidthMin: number; readonly voidPlatformWidthMax: number;
  readonly voidLowerMin: number; readonly voidLowerMax: number; readonly voidUpperMin: number; readonly voidUpperMax: number;
  readonly voidLaneClearance: number; readonly voidTransferMin: number; readonly voidTransferMax: number;
  readonly scrollSpeed: number; readonly scrollSpeedMax: number; readonly thawSpeedMult: number;
  readonly voidFirePeriod: number; readonly voidFireArm: number; readonly voidFireHot: number;
  readonly voidCageH: number; readonly voidCageHalfW: number; readonly descentArrival: number;
  readonly descentIngressBelow: number; readonly voidTransferGrace: number; readonly voidCamZoom: number;
  readonly voidRecycleMargin: number; readonly scrollRamp: number; readonly voidWispCooldown: number; readonly arrivalFxStep: number;
  readonly crackWarn: number; readonly descentDissolve: number; readonly descentLift: number; readonly descentReveal: number;
  readonly voidCrumbleStand: number; readonly voidFallDamage: number; readonly voidSlowDuration: number;
}

export interface SourceDescentTiming {
  readonly dialogueDuck: number; readonly unmakeMix: number; readonly releaseMix: number; readonly revealMix: number;
}

export interface SourceVoidActor { readonly id: string; readonly x: number; readonly y: number; readonly color: string; readonly dead?: boolean; readonly dying?: boolean }
export interface SourceVoidPlayer { x: number; y: number; vx: number; vy: number; hw: number; hh: number; onGround: boolean; iframe: number; voidSlowT: number; voidTransferT: number; voidLane: VoidLane | null; supportPlatform: VoidPlatform | null; voidMajorWindow: boolean }
export interface SourceVoidState {
  active: boolean; frozen: boolean; forming: boolean; owner: SourceVoidActor; speed: number; speedCap: number;
  wispTime: number; rescueCooldown: number; arrivalTime: number; options: VoidOptions; generator: VoidGeneratorState;
  chunks: VoidChunk[]; platforms: VoidPlatform[]; scrollOffset: number; playerLane: VoidLane | null;
  arrivalQueue: VoidPlatform[]; arrivalIndex: number; arrivalFxTime: number; ingress: VoidPlatform;
}

export interface SourceVoidTransitionState {
  readonly owner: SourceVoidActor;
  unmade: boolean;
  floorReleased: boolean;
  stream: SourceVoidState | null;
}

export interface SourceDescentBeat {
  readonly id: "challenge" | "declaration" | "unmake" | "release" | "reveal" | "land";
  readonly duration?: number; readonly minDuration?: number;
  readonly completion?: "confirm-or-timeout";
  readonly playerMode: "locked" | "float" | "landing";
  readonly speaker?: "THE SOURCE"; readonly line?: string;
}

export interface SourceDescentSequence {
  readonly id: "voidDescent"; readonly color: string; readonly blocksCombat: true; readonly hideHud: true;
  readonly beats: readonly SourceDescentBeat[];
}

export type SourceVoidIntent =
  | Readonly<{ type: "clear-owner-projectiles"; ownerId: string }>
  | Readonly<{ type: "flash"; amount: number }>
  | Readonly<{ type: "shake"; amount: number }>
  | Readonly<{ type: "explode"; x: number; y: number; color: string; scale: number }>
  | Readonly<{ type: "burst"; x: number; y: number; dx: number; dy: number; count: number; color: string }>
  | Readonly<{ type: "ring"; x: number; y: number; radius: number; color: string }>
  | Readonly<{ type: "remove-surface-projectiles"; platformId: string }>
  | Readonly<{ type: "shift-surface-projectiles"; amount: number }>
  | Readonly<{ type: "spawn-wisp"; lane: VoidLane; x: number; y: number }>
  | Readonly<{ type: "source-breach-lock"; ownerId: string }>
  | Readonly<{ type: "begin-void-run"; ownerId: string }>
  | Readonly<{ type: "shockwave"; x: number; y: number; radius: number; color: string; speed: number; width: number }>
  | Readonly<{ type: "music-duck"; amount: number; duration: number }>
  | Readonly<{ type: "void-mix"; amount: number; duration: number }>
  | Readonly<{ type: "world-zoom"; value: number }>
  | Readonly<{ type: "clear-void-transition" }>
  | Readonly<{ type: "sound"; cue: "source-dialogue" | "void-ground-tear" }>
  | Readonly<{ type: "damage-player"; damage: number; sourceX: number; cooldown: number }>
  | Readonly<{ type: "rescue-player"; damage: number; x: number; y: number; lane: VoidLane | null;
      verticalSpeed: number; iframe: number; slowDuration: number; transferGrace: number }>;

export class SourceVoidController {
  constructor(private readonly config: SourceVoidConfig, private readonly viewport: Readonly<{ width: number; height?: number; groundY: number }>, private readonly physics: Readonly<{ jumpSpeed: number; gravity: number; moveSpeed: number; dashSpeed: number; dashDuration: number }>, private readonly descentTiming: SourceDescentTiming) {}

  beginDescent(owner: SourceVoidActor): Readonly<{ transition: SourceVoidTransitionState; sequence: SourceDescentSequence; intents: readonly SourceVoidIntent[] }> {
    const transition: SourceVoidTransitionState = { owner, unmade: false, floorReleased: false, stream: null };
    const sequence: SourceDescentSequence = { id: "voidDescent", color: owner.color, blocksCombat: true, hideHud: true, beats: [
      { id: "challenge", completion: "confirm-or-timeout", playerMode: "locked", speaker: "THE SOURCE", line: "YOU MISTOOK THE FLOOR FOR MERCY." },
      { id: "declaration", completion: "confirm-or-timeout", playerMode: "locked", speaker: "THE SOURCE", line: "THERE IS NO BELOW." },
      { id: "unmake", duration: this.config.descentDissolve, playerMode: "locked" },
      { id: "release", duration: this.config.descentLift, playerMode: "float" },
      { id: "reveal", duration: this.config.descentReveal, playerMode: "float" },
      { id: "land", minDuration: 0.18, playerMode: "landing" },
    ] };
    return { transition, sequence, intents: [{ type: "source-breach-lock", ownerId: owner.id },
      { type: "clear-owner-projectiles", ownerId: owner.id }, { type: "world-zoom", value: 1 },
      { type: "music-duck", amount: this.descentTiming.dialogueDuck, duration: 0.18 }, { type: "void-mix", amount: 0, duration: 0.05 }] };
  }

  unmakeArena(transition: SourceVoidTransitionState, platforms: readonly ArenaPlatform[]): readonly SourceVoidIntent[] {
    if (transition.unmade) return [];
    transition.unmade = true; let index = 0;
    for (const platform of platforms) if (platform.oneway && !platform.floor) {
      platform.crackT = this.config.crackWarn * (0.38 + (index++ % 5) * 0.11); platform.crackMax = platform.crackT; platform.crackColor = transition.owner.color;
    }
    return [{ type: "clear-owner-projectiles", ownerId: transition.owner.id },
      { type: "explode", x: transition.owner.x, y: transition.owner.y, color: transition.owner.color, scale: 1.35 },
      { type: "flash", amount: 0.24 }, { type: "shake", amount: 5 }];
  }

  releaseFloor(transition: SourceVoidTransitionState, platforms: ArenaPlatform[], player: SourceVoidPlayer): readonly SourceVoidIntent[] {
    const intents = [...this.unmakeArena(transition, platforms)];
    if (transition.floorReleased) return intents;
    transition.floorReleased = true;
    for (let index = platforms.length - 1; index >= 0; index--) if (platforms[index]?.floor) platforms.splice(index, 1);
    player.onGround = false; player.vy = Math.min(player.vy, -80);
    intents.push({ type: "shockwave", x: player.x, y: this.viewport.groundY, radius: 15, color: transition.owner.color, speed: 420, width: 7 });
    return intents;
  }

  ensureStream(transition: SourceVoidTransitionState, platforms: ArenaPlatform[], seed: string | number, player: SourceVoidPlayer): Readonly<{ state: SourceVoidState; intents: readonly SourceVoidIntent[] }> {
    if (transition.stream) return { state: transition.stream, intents: [] };
    const releaseIntents = this.releaseFloor(transition, platforms, player), started = this.start(transition.owner, seed, player, true);
    transition.stream = started.state;
    return { state: started.state, intents: [...releaseIntents, ...started.intents,
      { type: "ring", x: started.state.ingress.x + started.state.ingress.w / 2, y: started.state.ingress.y, radius: 18, color: transition.owner.color }] };
  }

  completeDescent(transition: SourceVoidTransitionState, player: SourceVoidPlayer): readonly SourceVoidIntent[] {
    const stream = transition.stream;
    if (stream) { stream.forming = false; stream.frozen = false; stream.active = true; for (const platform of stream.platforms) platform.materializationState = "active"; }
    player.voidTransferT = Math.max(player.voidTransferT, this.config.voidTransferGrace);
    return [{ type: "begin-void-run", ownerId: transition.owner.id }, { type: "world-zoom", value: this.config.voidCamZoom },
      { type: "clear-void-transition" }, { type: "void-mix", amount: 0, duration: 0.9 }, { type: "music-duck", amount: 1, duration: 0.75 }];
  }

  cancelDescent(): readonly SourceVoidIntent[] {
    return [{ type: "void-mix", amount: 0, duration: 0.2 }, { type: "music-duck", amount: 1, duration: 0.25 }];
  }

  enterDescentBeat(transition: SourceVoidTransitionState, beat: SourceDescentBeat["id"], platforms: ArenaPlatform[], seed: string | number, player: SourceVoidPlayer): readonly SourceVoidIntent[] {
    if (beat === "challenge" || beat === "declaration") return [{ type: "sound", cue: "source-dialogue" }];
    if (beat === "unmake") return [...this.unmakeArena(transition, platforms), { type: "void-mix", amount: this.descentTiming.unmakeMix, duration: 0.3 }];
    if (beat === "release") return [...this.releaseFloor(transition, platforms, player), { type: "sound", cue: "void-ground-tear" }, { type: "void-mix", amount: this.descentTiming.releaseMix, duration: 0.45 }];
    const stream = this.ensureStream(transition, platforms, seed, player);
    if (beat === "land") { player.vy = Math.max(player.vy, 90); player.onGround = false; return stream.intents; }
    return [...stream.intents, { type: "flash", amount: 0.36 }, { type: "shake", amount: 7 },
      { type: "void-mix", amount: this.descentTiming.revealMix, duration: 0.55 }];
  }

  updateDescentBeat(beat: SourceDescentBeat["id"], progress: number): readonly SourceVoidIntent[] {
    if (beat === "unmake") return [{ type: "world-zoom", value: 1 + (this.config.voidCamZoom - 1) * progress * 0.45 }];
    if (beat === "release") return [{ type: "world-zoom", value: 0.92 + (this.config.voidCamZoom - 0.92) * progress }];
    return [];
  }

  options(startX: number, player: Readonly<{ hw: number; hh: number }>): VoidOptions {
    const config = this.config;
    return { ...VoidGen.defaults, startX, chunkWidthMin: config.voidChunkWidthMin, chunkWidthMax: config.voidChunkWidthMax,
      platformWidthMin: config.voidPlatformWidthMin, platformWidthMax: config.voidPlatformWidthMax,
      lowerBandMin: config.voidLowerMin, lowerBandMax: config.voidLowerMax, upperBandMin: config.voidUpperMin, upperBandMax: config.voidUpperMax,
      laneClearance: config.voidLaneClearance, transferDeltaMin: config.voidTransferMin, transferDeltaMax: config.voidTransferMax,
      scrollSpeedMin: config.scrollSpeed, scrollSpeedMax: config.scrollSpeedMax * (config.thawSpeedMult || 1.35),
      firePeriod: config.voidFirePeriod, fireArmTime: config.voidFireArm, fireHotTime: config.voidFireHot,
      cageHeight: config.voidCageH, cageHalfWidth: config.voidCageHalfW, viewportWidth: this.viewport.width,
      playerHalfWidth: player.hw, playerHalfHeight: player.hh, physics: this.physics };
  }

  start(owner: SourceVoidActor, seed: string | number, player: SourceVoidPlayer, cinematic: boolean): Readonly<{ state: SourceVoidState; intents: readonly SourceVoidIntent[] }> {
    const options = this.options(-this.config.voidSpawnBehind, player), chunks: VoidChunk[] = [], platforms: VoidPlatform[] = [];
    let generator = VoidGen.create(seed, options);
    while (generator.nextX < this.viewport.width + this.config.voidSpawnAhead) {
      const next = VoidGen.next(generator); generator = next.state;
      const chunk = VoidGen.materialize(next.chunk, 0, cinematic ? "forming" : "active"); chunks.push(chunk); platforms.push(...chunk.platforms);
    }
    const ingressChunk = VoidGen.ingress(seed, player.x + player.vx * 0.18, player.y + player.hh + this.config.descentIngressBelow, options);
    const ingress = ingressChunk.platforms[0]; if (!ingress) throw new Error("Void ingress did not contain a platform");
    chunks.unshift(ingressChunk); platforms.push(ingress); player.onGround = false; player.iframe = Math.max(player.iframe, 1.1); player.voidSlowT = 0; player.voidTransferT = this.config.voidTransferGrace;
    const state: SourceVoidState = { active: !cinematic, frozen: cinematic, forming: cinematic, owner, speed: this.config.scrollSpeed,
      speedCap: this.config.scrollSpeedMax, wispTime: 1.8, rescueCooldown: 0, arrivalTime: this.config.descentArrival,
      options, generator, chunks, platforms, scrollOffset: 0, playerLane: null,
      arrivalQueue: [...platforms].sort((a, b) => Math.abs(a.x + a.w / 2 - this.viewport.width / 2) - Math.abs(b.x + b.w / 2 - this.viewport.width / 2)), arrivalIndex: 0, arrivalFxTime: 0, ingress };
    return { state, intents: [{ type: "clear-owner-projectiles", ownerId: owner.id }, { type: "explode", x: this.viewport.width / 2, y: this.viewport.groundY, color: owner.color, scale: 2.4 }, { type: "flash", amount: 0.55 }, { type: "shake", amount: 9 }] };
  }

  supportingPlatform(state: SourceVoidState, actor: Readonly<{ x: number; y: number; hw: number; hh: number }>): VoidPlatform | null {
    const feet = actor.y + actor.hh; let best: VoidPlatform | null = null, bestDistance = 8;
    for (const platform of state.platforms) {
      if (!platform.void || !platform.oneway || platform.materializationState === "gone" || actor.x + actor.hw <= platform.x || actor.x - actor.hw >= platform.x + platform.w) continue;
      const distance = Math.abs(feet - platform.y); if (distance < bestDistance) { best = platform; bestDistance = distance; }
    }
    return best;
  }

  syncPlayer(state: SourceVoidState, player: SourceVoidPlayer): VoidPlatform | null {
    const standing = this.supportingPlatform(state, player), chunk = state.chunks.find((candidate) => player.x >= candidate.x && player.x <= candidate.x + candidate.width);
    player.voidMajorWindow = chunk?.majorAttackWindow === true; player.supportPlatform = standing;
    if (standing) { if (state.playerLane && standing.voidLane !== state.playerLane) player.voidTransferT = Math.max(player.voidTransferT, this.config.voidTransferGrace); state.playerLane = standing.voidLane; player.voidLane = standing.voidLane; }
    else { player.voidLane = state.playerLane; if (state.chunks.some((candidate) => candidate.transferWindow && player.x >= candidate.transferWindow.x0 && player.x <= candidate.transferWindow.x1)) player.voidTransferT = Math.max(player.voidTransferT, this.config.voidTransferGrace * 0.45); }
    return standing;
  }

  updateHazards(
    state: SourceVoidState,
    dt: number,
    player: SourceVoidPlayer & { hazardT: number; hazardDmgMult: number },
    runTime: number,
  ): readonly SourceVoidIntent[] {
    const intents: SourceVoidIntent[] = [];
    const standing = this.syncPlayer(state, player);
    const dangerous = state.owner.dead !== true && state.owner.dying !== true;
    for (const platform of [...state.platforms]) {
      if (!platform.void) continue;
      const onPlatform = standing === platform;
      if (platform.voidType === "crumble" && onPlatform && platform.touchT < 0) {
        platform.touchT = this.config.voidCrumbleStand;
        platform.materializationState = "cracking";
      }
      if (platform.touchT >= 0) {
        platform.touchT -= dt;
        if (platform.touchT <= 0) {
          platform.touchT = 0;
          platform.materializationState = "gone";
          const index = state.platforms.indexOf(platform);
          if (index >= 0) state.platforms.splice(index, 1);
          intents.push(
            { type: "remove-surface-projectiles", platformId: platform.platformId },
            { type: "ring", x: platform.x + platform.w / 2, y: platform.y, radius: 12, color: state.owner.color },
            { type: "burst", x: platform.x + platform.w / 2, y: platform.y, dx: 0, dy: 1, count: 7, color: state.owner.color },
          );
          continue;
        }
      }
      platform.fireState = VoidGen.hazardState(platform, runTime, state.options);
      platform.fireOn = platform.fireState === "hot";
      if (dangerous && onPlatform && platform.fireOn && player.hazardT <= 0) {
        player.hazardT = 0.48;
        intents.push({ type: "damage-player", damage: 12 * player.hazardDmgMult, sourceX: platform.x + platform.w / 2, cooldown: 0.48 });
      }
      if (dangerous && platform.voidType === "cage" && player.hazardT <= 0) {
        const cage = VoidGen.cageGeometry(platform, state.options);
        if (cage === null) continue;
        const overlaps = Math.abs(player.x - (cage.x + cage.w / 2)) < player.hw + cage.w / 2
          && Math.abs(player.y - (cage.y + cage.h / 2)) < player.hh + cage.h / 2;
        if (overlaps) {
          player.hazardT = 0.48;
          intents.push({ type: "damage-player", damage: 14 * player.hazardDmgMult, sourceX: cage.centerX, cooldown: 0.48 });
        }
      }
    }
    const viewportHeight = this.viewport.height ?? this.viewport.groundY + 100;
    if (player.y > viewportHeight + 70 && state.rescueCooldown <= 0) {
      const safe = VoidGen.selectRescue(state.platforms, this.viewport.width * 0.45, runTime, state.options);
      const x = safe ? Math.max(player.hw, Math.min(safe.x + safe.w / 2, this.viewport.width - player.hw)) : this.viewport.width / 2;
      const y = safe ? safe.y - 190 : 420;
      state.rescueCooldown = 0.8;
      intents.push({ type: "rescue-player", damage: this.config.voidFallDamage * player.hazardDmgMult,
        x, y, lane: safe?.voidLane ?? null, verticalSpeed: -1350, iframe: 1,
        slowDuration: this.config.voidSlowDuration, transferGrace: this.config.voidTransferGrace });
    }
    return intents;
  }

  update(state: SourceVoidState, dt: number, player: SourceVoidPlayer, liveWispCount: number): readonly SourceVoidIntent[] {
    const intents: SourceVoidIntent[] = [];
    state.rescueCooldown = Math.max(0, state.rescueCooldown - dt); player.voidTransferT = Math.max(0, player.voidTransferT - dt);
    if (state.arrivalIndex < state.arrivalQueue.length) {
      state.arrivalFxTime -= dt;
      if (state.arrivalFxTime <= 0) {
        state.arrivalFxTime = this.config.arrivalFxStep; const platform = state.arrivalQueue[state.arrivalIndex++];
        if (platform && platform.materializationState !== "gone") intents.push({ type: "ring", x: platform.x + platform.w / 2, y: platform.y, radius: 10, color: state.owner.color });
        if (state.arrivalIndex >= state.arrivalQueue.length) { state.arrivalQueue.length = 0; state.arrivalIndex = 0; }
      }
    }
    state.arrivalTime = Math.max(0, state.arrivalTime - dt);
    const arrival = state.arrivalTime > 0 ? 1 - Math.max(0, Math.min(state.arrivalTime / this.config.descentArrival, 1)) : 1;
    if (state.active && !state.frozen) {
      state.speed = Math.min(state.speedCap || this.config.scrollSpeedMax || 260, state.speed + this.config.scrollRamp * dt);
      const standing = this.supportingPlatform(state, player), amount = -state.speed * arrival * dt; state.scrollOffset += amount;
      for (const chunk of state.chunks) { chunk.x += amount; if (chunk.transferWindow) { chunk.transferWindow.x0 += amount; chunk.transferWindow.x1 += amount; } for (const platform of chunk.platforms) { platform.x += amount; if (platform.cageX !== undefined) platform.cageX += amount; if (platform.cageRect) platform.cageRect.x += amount; } }
      if (standing) player.x += amount; intents.push({ type: "shift-surface-projectiles", amount });
      for (let index = state.chunks.length - 1; index >= 0; index--) { const chunk = state.chunks[index]; if (!chunk || chunk.x + chunk.width >= -this.config.voidRecycleMargin) continue; for (const platform of chunk.platforms) { const liveIndex = state.platforms.indexOf(platform); if (liveIndex >= 0) state.platforms.splice(liveIndex, 1); intents.push({ type: "remove-surface-projectiles", platformId: platform.platformId }); } state.chunks.splice(index, 1); }
      while (state.generator.nextX + state.scrollOffset < this.viewport.width + this.config.voidSpawnAhead) { const next = VoidGen.next(state.generator); state.generator = next.state; const chunk = VoidGen.materialize(next.chunk, state.scrollOffset, state.forming ? "forming" : "active"); state.chunks.push(chunk); state.platforms.push(...chunk.platforms); }
      this.syncPlayer(state, player); state.wispTime -= dt;
      if (state.wispTime <= 0) { state.wispTime = this.config.voidWispCooldown; if (liveWispCount < 2) { const pressure = state.chunks.find((chunk) => chunk.x + chunk.width > this.viewport.width * 0.68) ?? state.chunks.at(-1); const lane = pressure?.wispLane ?? pressure?.pressureLane ?? (state.playerLane === "upper" ? "lower" : "upper"); const landing = pressure?.lanes[lane][0]; intents.push({ type: "spawn-wisp", lane, x: this.viewport.width + 60, y: landing ? landing.y - 80 : lane === "upper" ? 330 : 535 }); } }
    }
    return intents;
  }
}
