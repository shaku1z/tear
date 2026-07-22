// ------- attract mode: the game playing itself behind the menu -------
// Uses the REAL Player + Blade (driven by a synthetic controller via player.aiInput /
// blade.aimOverride from blade.js & player.js), so movement, dashes, jumps, and the blade
// swing/trail are the genuine article. Enemies are lightweight bespoke actors with proper
// physics — ground types fall to the floor and never hover; only flyers stay airborne.
// FX is ticked/drawn here (the main loop only ticks FX while actually playing).
import type { createBlade } from "../gameplay/entities/blade";
import type { createPlayer } from "../gameplay/entities/player";
import type { CONFIG as ConfigValue, GFX as GraphicsValue, OVERSCAN as OverscanValue, THEME as ThemeValue } from "../config/game-config";
import type { STAGES as StageValues } from "../gameplay/stages";
import type { ParticleSystem } from "./particles";
import { cosmeticRandom } from "./cosmetic-random";

type Config = typeof ConfigValue;
type GraphicsSettings = typeof GraphicsValue;
type Overscan = typeof OverscanValue;
type Theme = typeof ThemeValue;
type Stage = (typeof StageValues)[number];
type PlayerConstructor = ReturnType<typeof createPlayer>;
type BladeConstructor = ReturnType<typeof createBlade>;
type PlayerEntity = InstanceType<PlayerConstructor>;
type BladeEntity = InstanceType<BladeConstructor>;

interface Platform { x: number; y: number; w: number; h: number; floor?: boolean; oneway?: boolean }
interface AiInput { left: boolean; right: boolean; up: boolean; down: boolean; _dash: boolean; _jump: boolean }
interface Point { x: number; y: number }
type FoeKind = "charger" | "ranged" | "bomber" | "armored" | "flyer" | "wraith";
interface Foe {
  x: number; y: number; vx: number; vy: number; onGround: boolean; kind: FoeKind; color: string;
  hw: number; hh: number; flyer: boolean; fireCd: number; spawnT: number; flash: number; dead: boolean;
  st: string; stT: number; ph: number; orbA: number; orbW: number; orbR: number; band: number;
  chVx: number; swVx: number; swVy: number;
}
interface Shot {
  x: number; y: number; vx: number; vy: number; r: number; tint: string; hist: Point[];
  deflected: boolean; dead: boolean;
}
interface BackdropPort {
  fillFull(context: CanvasRenderingContext2D): void;
  draw(context: CanvasRenderingContext2D, stage: Stage, time: number, cameraX: number): void;
  platform(context: CanvasRenderingContext2D, platform: Platform, stage: Stage, floor: boolean): void;
  post(context: CanvasRenderingContext2D, stage: Stage): void;
}
export interface AttractDependencies {
  Backdrop: BackdropPort;
  Blade: BladeConstructor;
  CONFIG: Config;
  FX: ParticleSystem;
  GFX: GraphicsSettings;
  OVERSCAN: Overscan;
  Player: PlayerConstructor;
  STAGES: readonly Stage[];
  THEME: Theme;
  clamp: (value: number, minimum: number, maximum: number) => number;
}
interface AttractController {
  readonly W: number; readonly H: number; readonly GY: number;
  t: number; biomeList: number[]; biomePtr: number; biomeT: number; fade: number;
  player: PlayerEntity | null; blade: BladeEntity | null; platforms: Platform[]; ai: AiInput | null;
  foes: Foe[]; shots: Shot[]; target: Foe | null; dashCd: number; jumpCd: number; aimAng: number;
  ready: boolean; scroll: number; swingT: number; swingDir: number; swingBase: number;
  onBiomeChange?: () => void;
  _biomes(): number[]; reset(): void; stage(): Stage; update(deltaSeconds: number): void;
  _nearest(): Foe | null;
  _segNear(ax: number, ay: number, bx: number, by: number, px: number, py: number, radius: number): boolean;
  _kill(foe: Foe, silent?: boolean): void; _spawn(): void;
  _updateFoe(foe: Foe, deltaSeconds: number, player: PlayerEntity): void;
  _fire(foe: Foe, player: PlayerEntity): void; _explode(x: number, y: number): void;
  _updateShot(shot: Shot, deltaSeconds: number, player: PlayerEntity, blade: BladeEntity): void;
  draw(context: CanvasRenderingContext2D): void;
  _drawFoe(context: CanvasRenderingContext2D, foe: Foe): void;
  _drawShot(context: CanvasRenderingContext2D, shot: Shot): void;
}

function createAttract(dependencies: AttractDependencies): AttractController {
  const { Backdrop, Blade, CONFIG, FX, GFX, OVERSCAN, Player, STAGES, THEME, clamp } = dependencies;

const Attract: AttractController = {
  get W() { return CONFIG.view.w; },
  get H() { return CONFIG.view.h; },
  get GY() { return CONFIG.world.groundY; },
  t: 0, biomeList: [], biomePtr: 0, biomeT: 0, fade: 0,
  player: null, blade: null, platforms: [], ai: null, foes: [], shots: [],
  target: null, dashCd: 0, jumpCd: 0, aimAng: -1, ready: false,
  scroll: 0, swingT: 0, swingDir: 1, swingBase: 0,

  _biomes() { const indices: number[] = []; for (let i = 0; i < STAGES.length; i++) if (!STAGES[i]?.dark) indices.push(i); return indices; },

  reset() {
    this.t = 0; this.biomeList = this._biomes(); this.biomePtr = Math.floor(cosmeticRandom() * this.biomeList.length);
    this.biomeT = 0; this.fade = 0; this.dashCd = 0; this.jumpCd = 0; this.aimAng = -1; this.target = null;
    this.scroll = 0;   // the stage TRAVELS: a slow constant camera drift (parallax + platform conveyor)
    this.swingT = 0; this.swingDir = 1; this.swingBase = 0;   // deliberate slash rhythm
    this.platforms = [
      { x: 0, y: this.GY, w: this.W, h: this.H - this.GY, floor: true },
      { x: this.W * 0.30, y: this.GY - 175, w: 250, h: 24, oneway: true },
      { x: this.W * 0.60, y: this.GY - 265, w: 240, h: 24, oneway: true },
    ];
    this.player = new Player(this.W / 2, this.GY - 60);
    this.player.maxHp = this.player.hp = 99999;   // the demo hero never falls
    const ai = this.ai = { left: false, right: false, up: false, down: false, _dash: false, _jump: false };
    this.player.aiInput = {
      left: () => ai.left, right: () => ai.right, up: () => ai.up, down: () => ai.down,
      dashPressed: () => { const v = ai._dash; ai._dash = false; return v; },
      jumpPressed: () => { const v = ai._jump; ai._jump = false; return v; },
    };
    this.blade = new Blade();
    this.blade.aimOverride = { x: this.W / 2, y: this.GY - 80 };
    this.foes = []; this.shots = [];
    try { FX.reset(); } catch { /* Attract mode remains optional if FX is unavailable. */ }
    for (let i = 0; i < 5; i++) this._spawn();
    this.ready = true;
  },
  stage() {
    const stageIndex = this.biomeList[this.biomePtr % this.biomeList.length];
    const stage = stageIndex === undefined ? undefined : STAGES[stageIndex];
    if (!stage) throw new Error("Attract mode requires at least one light stage");
    return stage;
  },

  update(dt) {
    if (!this.ready) this.reset();
    if (dt > 0.04) dt = 0.04;
    this.t += dt; this.fade = Math.min(1, this.fade + dt * 0.5);
    this.biomeT += dt;
    if (this.biomeT > 30) {   // linger in each biome, then TEAR into the next (game.js hooks the wipe)
      this.biomeT = 0; this.biomePtr = (this.biomePtr + 1) % this.biomeList.length;
      if (this.onBiomeChange) this.onBiomeChange();
    }
    this.dashCd -= dt; this.jumpCd -= dt;
    // the stage keeps moving: parallax layers travel past and the floating ledges
    // conveyor along with them (wrapping), so the demo reads as a journey, not a box
    this.scroll += 1200 * dt;
    for (let i = 1; i < this.platforms.length; i++) {
      const pl = this.platforms[i];
      if (!pl) continue;
      pl.x -= 60 * dt;
      if (pl.x + pl.w < -OVERSCAN.x - 40) pl.x = this.W + OVERSCAN.x + 40;
    }
    const p = this.player, b = this.blade, ai = this.ai;
    if (!p || !b || !ai) return;
    if (!this.target || this.target.dead || this.target.spawnT > 0) this.target = this._nearest();
    const tg = this.target;

    // ---- drive the real player via the synthetic controller ----
    ai.left = ai.right = ai.up = ai.down = false;
    if (tg) {
      const dx = tg.x - p.x, dy = tg.y - p.y, adx = Math.abs(dx);
      if (adx > 52) { if (dx > 0) ai.right = true; else ai.left = true; }       // pursue, don't camp
      if (tg.flyer && dy < -70 && p.onGround && this.jumpCd <= 0) { ai._jump = true; this.jumpCd = 1.0; }   // hop to a flyer
      // dash to close a gap, or a periodic flourish dash so the hero keeps moving & blinking around
      if (this.dashCd <= 0 && p.dashCharges > 0 && (adx > 240 || cosmeticRandom() < 0.016)) {
        if (dx > 0) ai.right = true; else ai.left = true; if (tg.flyer && dy < -50) ai.up = true;
        ai._dash = true; this.dashCd = 0.7 + cosmeticRandom() * 0.6;
      }
    }
    // dodge a near incoming shot (dash away)
    for (const s of this.shots) {
      if (s.dead || s.deflected) continue;
      if (Math.hypot(s.x - p.x, s.y - p.y) < 150 && this.dashCd <= 0 && p.dashCharges > 0) {
        ai.left = s.x > p.x; ai.right = s.x <= p.x; ai._dash = true; this.dashCd = 0.8; break;
      }
    }

    // ---- aim the blade: deliberate slashes, not a constant blur ----
    // Rest the aim on the target; when a foe is within reach, BURST a fast arc across it (that
    // 0.16s sweep clears minHitSpeed so the cut lands exactly where the blade visibly slashes),
    // then a brief recover. Reads as approach -> slash -> approach, like a real player.
    {
      const hand = { x: p.x, y: p.y - p.hh * 0.2 }, R = CONFIG.blade.aimRadius;
      const baseAng = tg ? Math.atan2(tg.y - hand.y, tg.x - hand.x) : this.aimAng;
      const reach = tg ? Math.hypot(tg.x - hand.x, tg.y - hand.y) : 9999;
      this.swingT -= dt;
      if (this.swingT <= -0.10 && reach < 150) { this.swingT = 0.16; this.swingDir = cosmeticRandom() < 0.5 ? -1 : 1; this.swingBase = baseAng; }
      if (this.swingT > 0) {
        const k = 1 - this.swingT / 0.16;                                  // 0 -> 1 across the slash
        this.aimAng = this.swingBase - this.swingDir * 1.05 + this.swingDir * 2.1 * k;
      } else {
        this.aimAng += (baseAng - this.aimAng) * clamp(7 * dt, 0, 1);      // rest: track the target (no cut)
      }
      const aim = b.aimOverride ?? (b.aimOverride = { x: hand.x, y: hand.y });
      aim.x = hand.x + Math.cos(this.aimAng) * R;
      aim.y = hand.y + Math.sin(this.aimAng) * R;
    }

    // ---- step the real entities ----
    p.update(dt, this.platforms);
    b.update(dt, p, this.platforms);
    if (tg) p.facing = tg.x >= p.x ? 1 : -1;

    // ---- the real blade cuts foes it sweeps through fast ----
    for (const f of this.foes) {
      if (f.dead || f.spawnT > 0) continue;
      if (b.tipSpeed > CONFIG.blade.minHitSpeed && this._segNear(b.x, b.y, b.tipX, b.tipY, f.x, f.y, f.hw + 12)) this._kill(f);
    }

    for (const f of this.foes) this._updateFoe(f, dt, p);
    for (const s of this.shots) this._updateShot(s, dt, p, b);
    this.shots = this.shots.filter((s) => !s.dead);
    this.foes = this.foes.filter((f) => !f.dead);
    while (this.foes.length < 5) this._spawn();
    try { FX.update(dt); } catch { /* Attract mode remains optional if FX is unavailable. */ }
  },

  _nearest() { const player = this.player; if (!player) return null; let bd = 1e9, best: Foe | null = null; for (const f of this.foes) { if (f.dead || f.spawnT > 0) continue; const d = Math.hypot(f.x - player.x, f.y - player.y); if (d < bd) { bd = d; best = f; } } return best; },
  _segNear(ax, ay, bx, by, px, py, r) { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1; let tt = ((px - ax) * dx + (py - ay) * dy) / l2; tt = clamp(tt, 0, 1); return Math.hypot(px - (ax + dx * tt), py - (ay + dy * tt)) <= r; },
  _kill(f, silent) { if (f.dead) return; f.dead = true; try { FX.death(f.x, f.y, 12, f.color); if (!silent) FX.burst(f.x, f.y, 0, -1, 6, CONFIG.colors.perfect); } catch { /* Visual feedback is best-effort. */ } },

  _spawn() {
    const side = cosmeticRandom() < 0.5 ? -1 : 1;
    const types: readonly FoeKind[] = ["charger", "ranged", "bomber", "armored", "flyer", "wraith"];
    const kind = types[(cosmeticRandom() * types.length) | 0] ?? "charger";
    const flyer = kind === "flyer" || kind === "wraith";
    this.foes.push({ x: this.W / 2 + side * (600 + cosmeticRandom() * 280), y: flyer ? this.GY - 200 - cosmeticRandom() * 150 : this.GY - 22,
      vx: 0, vy: 0, onGround: false, kind, color: CONFIG.colors[kind] || "#e23b3b", hw: 17, hh: 22, flyer,
      fireCd: 1.1 + cosmeticRandom() * 2, spawnT: 0.4, flash: 0, dead: false,
      // per-kind behaviour state (walk/windup/charge, orbit/swoop, kite band, blink)
      st: "walk", stT: cosmeticRandom(), ph: cosmeticRandom() * 6.2832,
      orbA: cosmeticRandom() * 6.2832, orbW: (0.6 + cosmeticRandom() * 0.5) * (cosmeticRandom() < 0.5 ? -1 : 1),
      orbR: 220 + cosmeticRandom() * 120, band: 380 + cosmeticRandom() * 180, chVx: 0, swVx: 0, swVy: 0 });
  },
  // per-kind AI so foes read like their in-game selves, not homing puppets:
  // chargers strut -> windup -> burst PAST the hero; armored trudge and pause; ranged
  // KITE a firing band; bombers rush and blink as they arm; flyers orbit then swoop;
  // wraiths drift and blink-teleport. Grounded foes keep a little spacing.
  _updateFoe(f, dt, p) {
    if (f.spawnT > 0) { f.spawnT -= dt; return; }
    f.flash = Math.max(0, f.flash - dt * 4);
    const dx = p.x - f.x, dir = Math.sign(dx) || 1, adx = Math.abs(dx);
    f.stT -= dt;
    if (f.flyer) {
      if (f.kind === "wraith") {
        f.x += (Math.sin(this.t * 0.7 + f.ph) * 40 + dir * 30) * dt;
        f.y += Math.cos(this.t * 0.9 + f.ph) * 26 * dt;
        if (f.stT <= 0) {   // ghostly BLINK across the field
          f.stT = 2.5 + cosmeticRandom() * 2.5;
          const nx = clamp(f.x + (cosmeticRandom() * 2 - 1) * 320, 80, this.W - 80);
          try { FX.ghost(f.x, f.y, f.hw, f.hh, f.color); FX.burst(nx, f.y, 0, -1, 5, f.color); } catch { /* Visual feedback is best-effort. */ }
          f.x = nx;
        }
      } else if (f.st === "swoop") {
        f.x += f.swVx * dt; f.y += f.swVy * dt; f.swVy += 900 * dt;   // dive arc, then break off
        if (f.stT <= 0 || f.y > p.y - 10) { f.st = "orbit"; f.stT = 2 + cosmeticRandom() * 2.5; }
      } else {
        f.orbA += dt * f.orbW;
        const tx = p.x + Math.cos(f.orbA) * f.orbR, ty = p.y - 170 + Math.sin(f.orbA * 1.7) * 46;
        f.x += (tx - f.x) * clamp(2.2 * dt, 0, 1); f.y += (ty - f.y) * clamp(2.2 * dt, 0, 1);
        if (f.stT <= 0 && adx < 340) {   // commit to a swoop
          f.st = "swoop"; f.stT = 0.8;
          const m = Math.hypot(p.x - f.x, p.y - f.y) || 1;
          f.swVx = (p.x - f.x) / m * 520; f.swVy = (p.y - f.y) / m * 380;
        }
      }
      f.y = Math.min(f.y, this.GY - 60);   // airborne stays airborne
    } else {
      f.vy += CONFIG.world.gravity * dt; f.y += f.vy * dt;
      const floorY = this.GY - f.hh;
      if (f.y >= floorY) { f.y = floorY; f.vy = 0; f.onGround = true; } else f.onGround = false;
      if (f.onGround) {
        if (f.kind === "charger") {
          if (f.st === "windup") { f.x += Math.sin(this.t * 60) * 1.2; if (f.stT <= 0) { f.st = "charge"; f.stT = 0.5; f.chVx = dir * 640; } }
          else if (f.st === "charge") { f.x += f.chVx * dt; if (f.stT <= 0) { f.st = "walk"; f.stT = 0.9 + cosmeticRandom(); } }
          else { f.x += dir * 95 * dt; if (f.stT <= 0 && adx < 520 && adx > 130) { f.st = "windup"; f.stT = 0.35; } }
        } else if (f.kind === "armored") {
          if (f.st === "pause") { if (f.stT <= 0) { f.st = "walk"; f.stT = 1.6 + cosmeticRandom(); } }
          else { f.x += dir * 55 * dt; if (f.stT <= 0) { f.st = "pause"; f.stT = 0.7; } }
        } else if (f.kind === "ranged") {
          if (adx < f.band - 40) f.x -= dir * 120 * dt;        // too close: back off
          else if (adx > f.band + 60) f.x += dir * 110 * dt;   // too far: close in
          else f.x += Math.sin(this.t * 1.3 + f.ph) * 46 * dt; // in the band: strafe
        } else {   // bomber: rush, blinking as it arms
          f.x += dir * 170 * dt;
          if (adx < 260) f.flash = 0.5 + 0.5 * Math.sin(this.t * 18);
        }
      }
      for (const o of this.foes) {   // spacing: don't stack into one blob
        if (o === f || o.dead || o.flyer || o.spawnT > 0) continue;
        const d = f.x - o.x;
        if (Math.abs(d) < 46) f.x += Math.sign(d || 1) * 60 * dt;
      }
    }
    f.x = clamp(f.x, 60, this.W - 60);
    f.fireCd -= dt;
    if (f.fireCd <= 0 && (f.kind === "ranged" || f.kind === "flyer")) { f.fireCd = 1.7 + cosmeticRandom() * 1.6; this._fire(f, p); }
    if (f.kind === "bomber" && f.onGround && adx < 120) { this._explode(f.x, f.y); this._kill(f, true); }
  },
  _fire(f, p) { const dx = p.x - f.x, dy = p.y - f.y, m = Math.hypot(dx, dy) || 1; this.shots.push({ x: f.x, y: f.y - 6, vx: dx / m * 440, vy: dy / m * 440, r: 8, tint: f.color, hist: [], deflected: false, dead: false }); },
  _explode(x, y) { try { FX.explode(x, y, CONFIG.colors.bomber, 1.3); } catch { /* Visual feedback is best-effort. */ } },
  _updateShot(s, dt, _p, b) {
    s.hist.push({ x: s.x, y: s.y }); if (s.hist.length > 7) s.hist.shift();
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (!s.deflected && b.tipSpeed > 850 && this._segNear(b.x, b.y, b.tipX, b.tipY, s.x, s.y, 20)) {
      s.deflected = true; const m = Math.hypot(s.vx, s.vy) || 1; s.vx = -s.vx / m * 780; s.vy = -260; s.tint = CONFIG.colors.perfect;
      FX.burst(s.x, s.y, s.vx, 0, 8, CONFIG.colors.perfect); FX.flash(s.x, s.y, 34, CONFIG.colors.perfect);
    }
    if (s.deflected) for (const f of this.foes) { if (f.dead || f.spawnT > 0) continue; if (Math.hypot(f.x - s.x, f.y - s.y) < 28) { this._kill(f); s.dead = true; break; } }
    if (s.x < -50 || s.x > this.W + 50 || s.y < -50 || s.y > this.H + 50) s.dead = true;
  },

  // ---- drawing ----
  draw(ctx) {
    const stage = this.stage();
    THEME.set(stage.bg);
    ctx.fillStyle = stage.bg; Backdrop.fillFull(ctx);   // include the fullscreen overscan bleed
    Backdrop.draw(ctx, stage, this.t, (this.player ? this.player.x : this.W / 2) + this.scroll);   // scrolled parallax = travel
    for (const pl of this.platforms) Backdrop.platform(ctx, pl, stage, !!pl.floor);
    for (const f of this.foes) this._drawFoe(ctx, f);
    for (const s of this.shots) this._drawShot(ctx, s);
    if (this.player) this.player.draw(ctx);
    if (this.blade && this.player) this.blade.draw(ctx, this.player);
    try { FX.draw(ctx); } catch { /* Attract mode remains optional if FX is unavailable. */ }
    Backdrop.post(ctx, stage);
  },
  _drawFoe(ctx, f) {
    const lowG = GFX.low;
    if (f.spawnT > 0) ctx.globalAlpha = 1 - f.spawnT / 0.4;
    if (f.flyer) {
      // airborne foes read as the game's actual flyer silhouette: a diamond, not a
      // floating grunt rectangle (wraiths keep their ghostly translucency)
      const r = f.hw + 4, bob = Math.sin(this.t * 3 + f.x * 0.01) * 2;
      const y = f.y + bob;
      if (f.kind === "wraith") ctx.globalAlpha *= 0.8;
      ctx.beginPath(); ctx.moveTo(f.x, y - r); ctx.lineTo(f.x + r, y); ctx.lineTo(f.x, y + r); ctx.lineTo(f.x - r, y); ctx.closePath();
      ctx.fillStyle = f.flash > 0 ? "#fff" : f.color;
      if (!lowG) { ctx.shadowColor = THEME.rim; ctx.shadowBlur = 6; }
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(f.x, y, 3.5, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    const x = f.x - f.hw, y = f.y - f.hh, w = f.hw * 2, h = f.hh * 2;
    ctx.fillStyle = f.flash > 0 ? "#fff" : f.color;
    if (!lowG) { ctx.shadowColor = THEME.rim; ctx.shadowBlur = 6; }
    ctx.fillRect(x, y, w, h); ctx.shadowBlur = 0;
    ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2.5; ctx.strokeRect(x, y, w, h);
    const playerX = this.player?.x ?? this.W / 2;
    ctx.fillStyle = "#fff"; ctx.fillRect(f.x + (f.x < playerX ? 4 : -10), y + 11, 6, 6);
    ctx.globalAlpha = 1;
  },
  _drawShot(ctx, s) {
    const dark = THEME.dark, lowG = GFX.low;
    if (!lowG && s.hist.length > 1) {
      ctx.save(); if (dark) ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = s.tint; ctx.lineCap = "round";
      for (let i = 1; i < s.hist.length; i++) {
        const previous = s.hist[i - 1], current = s.hist[i];
        if (!previous || !current) continue;
        const k = i / s.hist.length; ctx.globalAlpha = k * 0.5; ctx.lineWidth = s.r * 1.6 * k;
        ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(current.x, current.y); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.restore();
    }
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.vy, s.vx));
    if (!lowG) { ctx.shadowColor = s.tint; ctx.shadowBlur = dark ? 12 : 7; }
    ctx.fillStyle = s.tint; ctx.strokeStyle = THEME.ink; ctx.lineWidth = 1.5;
    const r = s.r; ctx.beginPath(); ctx.moveTo(r * 1.5, 0); ctx.quadraticCurveTo(0, -r * 0.9, -r, -r * 0.5); ctx.quadraticCurveTo(-r * 0.9, 0, -r, r * 0.5); ctx.quadraticCurveTo(0, r * 0.9, r * 1.5, 0); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.restore();
  },
};

  return Attract;
}

export { createAttract };
