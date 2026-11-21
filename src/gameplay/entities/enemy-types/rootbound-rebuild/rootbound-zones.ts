import type { ArenaZone } from "../../enemy-contracts";
import { ROOTBOUND_MOVES } from "./rootbound-moves";

/**
 * The zones the new Rootbound owns (plans/active/VERDANT_PALE_REBUILD.md, 2.1, "Arena control"): the Root Seam
 * its planted vine drives along the floor, and the Bramble Rows it lights while it kneels. Like Aldric's seams
 * and the Colossus's panels they are boss zones, which the world damages through and the shared zone renderer
 * draws; nothing is placed in the stage. The boss steps them once per update and clears them when its move
 * ends (on the phase change and when its death starts).
 *
 * Lengths are ticks; a zone's `life` and `maxLife` are seconds, the unit the zone readers share.
 */
const SEAM = ROOTBOUND_MOVES.rootSeam;
const ROWS = ROOTBOUND_MOVES.brambleRows;
const TICKS_PER_SECOND = 120;

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

  constructor(private readonly arenaWidth: number) {}

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

  /** One tick: the seam runs on until its length is spent or it reaches a wall; each row warns, burns and ends. */
  step(dt: number): void {
    if (this.seam !== null) {
      this.seamT -= 1;
      this.seam.x += (this.seam.dir ?? 1) * SEAM.speed * dt;
      this.seam.life = this.seamT / TICKS_PER_SECOND;
      if (this.seamT <= 0 || this.seam.x < 0 || this.seam.x > this.arenaWidth) this.seam = null;
    }
    for (const row of this.rows) {
      row.t += 1;
      const { zone } = row;
      zone.warn = row.t < ROWS.warn;
      zone.on = !zone.warn;
      zone.warnK = Math.min(1, Math.max(0, row.t / ROWS.warn));
      zone.life = (ROWS.warn + ROWS.burn - Math.max(0, row.t)) / TICKS_PER_SECOND;
    }
    this.rows = this.rows.filter((row) => row.t < ROWS.warn + ROWS.burn);
    this.sync();
  }

  /** Every zone ends: on the phase change and when death starts. */
  clear(): void {
    this.seam = null;
    this.rows = [];
    this.sync();
  }

  private sync(): void {
    this.list = [
      ...(this.seam === null ? [] : [this.seam]),
      ...this.rows.filter((row) => row.t >= 0).map((row) => row.zone),
    ];
  }
}
