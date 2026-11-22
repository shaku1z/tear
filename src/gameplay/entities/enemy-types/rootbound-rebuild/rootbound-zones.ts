import { BOSS_TELL_MIN_LEAD_SECONDS, type BossTell } from "../../boss-tells";
import type { ArenaZone } from "../../enemy-contracts";
import { ROOTBOUND_MOVES } from "./rootbound-moves";

/**
 * The zones the new Rootbound owns (plans/active/VERDANT_PALE_REBUILD.md, 2.1, "Arena control"): the Root Seam
 * its planted vine drives along the floor, the Bramble Rows it lights while it kneels, and the lingering bramble
 * patches both leave behind. Like Aldric's seams
 * and the Colossus's panels they are boss zones, which the world damages through and the shared zone renderer
 * draws; nothing is placed in the stage. The boss steps them once per update and clears them when its move
 * ends (on the phase change and when its death starts).
 *
 * Lengths are ticks; a zone's `life` and `maxLife` are seconds, the unit the zone readers share.
 */
const SEAM = ROOTBOUND_MOVES.rootSeam;
const ROWS = ROOTBOUND_MOVES.brambleRows;
const PATCH = ROOTBOUND_MOVES.lingeringBramble;
const TICKS_PER_SECOND = 120;
/** A floor zone hurts a player whose feet are within this of the floor (the shared boss-zone rule). */
const FLOOR_BAND = 8;

/** A patch's growth, its tell: its own, and never under the shared tell minimum. */
export const PATCH_WARN_TICKS = Math.max(PATCH.warn, Math.ceil(BOSS_TELL_MIN_LEAD_SECONDS.normal * TICKS_PER_SECOND));

/** A bramble row and its own clock: ticks since it started warning, negative before. */
interface BrambleRow {
  readonly zone: ArenaZone;
  t: number;
}

/** The ticks from the first row's warning to the last row's burning out. */
export const BRAMBLE_ROWS_TICKS = (ROWS.rows - 1) * (ROWS.warn + ROWS.gap) + ROWS.warn + ROWS.burn;

export class RootboundZones {
  /** The live zones, the same objects while they live, in the order the world and the renderer read them. */
  list: ArenaZone[] = [];
  private seam: ArenaZone | null = null;
  private seamT = 0;
  private rows: BrambleRow[] = [];
  /** The lingering patches, oldest first, each with ticks since it started growing. */
  private patches: BrambleRow[] = [];
  /** How far the seam has run since it last seeded a patch, px. */
  private seamRun = 0;
  /** How many patches may grow or stand at once: the boss sets it for the phase it has entered. */
  patchCap = 0;

  constructor(
    private readonly arenaWidth: number,
    private readonly groundY: number,
  ) {}

  /** How many patches grow or stand now. */
  get patchCount(): number {
    return this.patches.length;
  }

  get seamLive(): boolean {
    return this.seam !== null;
  }

  /** Drives a seam from `x` along the floor in `dir`. */
  startSeam(x: number, dir: number): void {
    const seconds = SEAM.life / TICKS_PER_SECOND;
    this.seam = {
      kind: "seam",
      x,
      w: SEAM.width,
      life: seconds,
      maxLife: seconds,
      dir,
      on: true,
      dmg: SEAM.damage,
      tickCd: SEAM.tickEvery / TICKS_PER_SECOND,
    };
    this.seamT = SEAM.life;
    this.seamRun = 0;
    this.sync();
  }

  /**
   * A patch starts growing at `x`, inside the arena; one past the cap withers the oldest first. One that would
   * overlap a patch renews it instead: a new patch at the same place, the newest, already grown if the old one
   * was (so the floor there never stops or restarts its tell), with a whole `live` ahead of it.
   */
  growPatch(x: number): void {
    if (this.patchCap <= 0) return;
    const near = this.patches.find((patch) => Math.abs(patch.zone.x - x) < PATCH.width);
    const at = near?.zone.x ?? Math.max(PATCH.width / 2, Math.min(this.arenaWidth - PATCH.width / 2, x));
    const grown = near === undefined ? 0 : Math.min(near.t, PATCH_WARN_TICKS);
    if (near !== undefined) this.patches = this.patches.filter((patch) => patch !== near);
    while (this.patches.length >= this.patchCap) this.patches.shift();
    const seconds = (PATCH_WARN_TICKS + PATCH.live - grown) / TICKS_PER_SECOND;
    this.patches.push({
      zone: {
        kind: "bramble",
        x: at,
        w: PATCH.width,
        life: seconds,
        maxLife: seconds,
        on: grown >= PATCH_WARN_TICKS,
        warn: grown < PATCH_WARN_TICKS,
        warnK: grown / PATCH_WARN_TICKS,
        dmg: PATCH.damage,
        tickCd: PATCH.tickEvery / TICKS_PER_SECOND,
      },
      t: grown,
    });
    this.sync();
  }

  /** The planted vine was cut, or pulled out: the seam ends this tick. */
  endSeam(): void {
    this.seam = null;
    this.sync();
  }

  /**
   * Lights the floor's thirds in turn: the player's first, then the other two, farthest from the keeper first.
   */
  startRows(playerX: number, keeperX: number): void {
    const third = this.arenaWidth / ROWS.rows;
    const centre = (index: number) => third * (index + 0.5);
    const own = Math.min(ROWS.rows - 1, Math.max(0, Math.floor(playerX / third)));
    const rest = Array.from({ length: ROWS.rows }, (_, index) => index)
      .filter((index) => index !== own)
      .sort((a, b) => Math.abs(centre(b) - keeperX) - Math.abs(centre(a) - keeperX));
    this.rows = [own, ...rest].map((index, order) => ({
      zone: {
        kind: "bramble",
        x: centre(index),
        w: third,
        life: (ROWS.warn + ROWS.burn) / TICKS_PER_SECOND,
        maxLife: (ROWS.warn + ROWS.burn) / TICKS_PER_SECOND,
        on: false,
        warn: true,
        warnK: 0,
        dmg: ROWS.damage,
        tickCd: ROWS.tickEvery / TICKS_PER_SECOND,
      },
      t: -order * (ROWS.warn + ROWS.gap),
    }));
    this.sync();
  }

  /**
   * One tick: the seam runs on until its length is spent or it reaches a wall, seeding a patch every
   * `seamEvery` px; each row warns, burns and ends, leaving a patch at its centre; each patch grows, stands and
   * withers.
   */
  step(dt: number): void {
    if (this.seam !== null) {
      this.seamT -= 1;
      const run = SEAM.speed * dt;
      this.seam.x += (this.seam.dir ?? 1) * run;
      this.seam.life = this.seamT / TICKS_PER_SECOND;
      this.seamRun += run;
      if (this.seamRun >= PATCH.seamEvery) {
        this.seamRun -= PATCH.seamEvery;
        this.growPatch(this.seam.x);
      }
      if (this.seamT <= 0 || this.seam.x < 0 || this.seam.x > this.arenaWidth) this.seam = null;
    }
    for (const row of this.rows) {
      row.t += 1;
      const { zone } = row;
      zone.warn = row.t < ROWS.warn;
      zone.on = !zone.warn;
      zone.warnK = Math.min(1, Math.max(0, row.t / ROWS.warn));
      zone.life = (ROWS.warn + ROWS.burn - Math.max(0, row.t)) / TICKS_PER_SECOND;
      if (row.t === ROWS.warn + ROWS.burn) this.growPatch(zone.x);
    }
    this.rows = this.rows.filter((row) => row.t < ROWS.warn + ROWS.burn);
    for (const patch of this.patches) {
      patch.t += 1;
      const { zone } = patch;
      zone.warn = patch.t < PATCH_WARN_TICKS;
      zone.on = !zone.warn;
      zone.warnK = Math.min(1, patch.t / PATCH_WARN_TICKS);
      zone.life = (PATCH_WARN_TICKS + PATCH.live - patch.t) / TICKS_PER_SECOND;
    }
    this.patches = this.patches.filter((patch) => patch.t < PATCH_WARN_TICKS + PATCH.live);
    this.sync();
  }

  /**
   * Every zone as the shared tell data, from the same objects the world damages through: the floor band it hurts
   * (`FLOOR_BAND` above the floor, so a jump clears it), warning while it grows or warns, active while it burns.
   */
  tells(): readonly BossTell[] {
    const tell = (id: string, zone: ArenaZone, warnTicks: number, t: number): BossTell => ({
      id,
      attackId: zone.kind,
      mark: "band",
      stage: zone.on ? "active" : "warning",
      x: zone.x,
      y: this.groundY - FLOOR_BAND / 2,
      hw: zone.w / 2,
      hh: FLOOR_BAND / 2,
      leadSeconds: warnTicks / TICKS_PER_SECOND,
      remainingSeconds: zone.on ? 0 : Math.max(0, warnTicks - t) / TICKS_PER_SECOND,
      damaging: true,
    });
    return [
      ...(this.seam === null ? [] : [tell("root-seam", this.seam, 0, 0)]),
      ...this.rows
        .filter((row) => row.t >= 0)
        .map((row, i) => tell(`bramble-row:${String(i)}`, row.zone, ROWS.warn, row.t)),
      ...this.patches.map((patch, i) => tell(`bramble-patch:${String(i)}`, patch.zone, PATCH_WARN_TICKS, patch.t)),
    ];
  }

  /** Every zone ends: on the phase change and when death starts. */
  clear(): void {
    this.seam = null;
    this.rows = [];
    this.patches = [];
    this.sync();
  }

  private sync(): void {
    this.list = [
      ...(this.seam === null ? [] : [this.seam]),
      ...this.rows.filter((row) => row.t >= 0).map((row) => row.zone),
      ...this.patches.map((patch) => patch.zone),
    ];
  }
}
