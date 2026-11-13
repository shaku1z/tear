/** Passive native measurement. Bindings are deliberately outside snapshot/gameplay state. */
export const RUN_DNA_CAPTURE_POLICY = "native-combat-episodes-v1" as const;
export const RUN_DNA_MANEUVERS = [
  "jump",
  "dash",
  "swing",
  "throw",
  "catch",
  "launch",
  "slam",
  "superslam",
  "updraft",
  "spike",
  "air-hit",
  "parry",
  "deflect",
  "primary-discharge",
  "air-dash",
  "phase-step",
  "reversal",
  "threadcut",
  "break",
  "meteor",
  "cleave",
  "wheelCut",
  "lash",
  "hook",
  "sling",
  "recoilCut",
  "capture",
  "loose-cannon",
  "backblast",
] as const;
export type RunDnaManeuver = (typeof RUN_DNA_MANEUVERS)[number];
export interface RunDnaBody {
  x: number;
  y: number;
  maxHp: number;
  maxDashCharges?: number;
}
export interface RunDnaLoadout {
  weaponId: string;
  mode: string;
  mods?: Readonly<{ phaseStep?: boolean }>;
}
export interface NativeRunDnaCapture {
  readonly kind: "run-dna-metrics-v1";
  readonly metrics: Readonly<{
    attacks: number;
    combatTicks: number;
    misses: number;
    movingTicks: number;
    damageTaken: number;
    maxHp: number;
    distinctManeuvers: number;
    availableManeuvers: number;
  }>;
  readonly capture: Readonly<{
    version: 1;
    policy: typeof RUN_DNA_CAPTURE_POLICY;
    runId: string;
    sessionId: string;
    originTick: 0;
    endTick: number;
    scheduledThrough: number;
    skippedTicks: number;
    observedTicks: number;
    terminalTick: number;
    complete: boolean;
    invalid: readonly string[];
    resolved: number;
    censored: number;
    successful: number;
    available: readonly RunDnaManeuver[];
    used: readonly RunDnaManeuver[];
  }>;
}
interface Episode {
  hit: boolean;
  pending: number;
  ended: boolean;
}
const bindings = new WeakMap<object, RunDnaObserver>();
const shots = new WeakMap<object, { observer: RunDnaObserver; episode: string; done: boolean }>();
export function runDnaObserver(entity: object): RunDnaObserver | undefined {
  return bindings.get(entity);
}
/** Legal baseline capabilities, not tutorial lessons or unlocked profile achievements.
 * HP/upgrades change parameters; these baseline moves remain executable with every
 * production chassis. Riftlock additionally has an accepted chamber discharge. */
export function runDnaCapabilities(loadout: RunDnaLoadout, body: RunDnaBody): readonly RunDnaManeuver[] {
  if (
    !["sword", "hammer", "greatsword", "chainblade", "riftlock"].includes(loadout.weaponId) ||
    !["campaign", "endless", "bossonly", "gauntlet"].includes(loadout.mode)
  )
    return [];
  const weapon: Readonly<Record<string, readonly RunDnaManeuver[]>> = {
    sword: ["reversal", "threadcut"],
    hammer: ["break", "meteor"],
    greatsword: ["cleave", "wheelCut"],
    chainblade: ["lash", "hook", "sling"],
    riftlock: ["recoilCut", "capture", "loose-cannon", "backblast"],
  };
  return [
    "jump",
    "dash",
    "swing",
    "throw",
    "catch",
    "launch",
    "slam",
    "superslam",
    "updraft",
    "spike",
    "air-hit",
    "parry",
    "deflect",
    ...(weapon[loadout.weaponId] ?? []),
    ...(body.maxDashCharges !== undefined && body.maxDashCharges > 1 ? ["air-dash" as const] : []),
    ...(loadout.mods?.phaseStep === true ? ["phase-step" as const] : []),
    ...(loadout.weaponId === "riftlock" ? ["primary-discharge" as const] : []),
  ];
}
export class RunDnaObserver {
  readonly #entities = new Set<object>();
  readonly #episodes = new Map<string, Episode>();
  readonly #available = new Set<RunDnaManeuver>();
  readonly #used = new Set<RunDnaManeuver>();
  readonly #invalid = new Set<string>();
  #tick: number | undefined;
  #lastTick = 0;
  #scheduledThrough = 0;
  #skippedTicks = 0;
  #observedTicks = 0;
  #eligible = false;
  #moved = false;
  #ended = false;
  #scope: string | undefined;
  #caught: string | undefined;
  caught(throwId: number): void {
    this.#caught = `throw:${String(throwId)}`;
  }
  heldHit(swingId: number, damage: number): void {
    const swing = `swing:${String(swingId)}`;
    this.hit(this.#episodes.has(swing) ? swing : (this.#caught ?? swing), damage);
  }
  withAttack<T>(key: string, action: () => T): T {
    const previous = this.#scope;
    this.#scope = this.#episodes.has(key) ? key : key.startsWith("swing:") ? this.#caught : undefined;
    try {
      return action();
    } finally {
      this.#scope = previous;
    }
  }
  derivativeDamage(damage: number): void {
    if (this.#scope !== undefined) this.hit(this.#scope, damage);
  }
  #attacks = 0;
  #resolved = 0;
  #successful = 0;
  #misses = 0;
  #censored = 0;
  #combatTicks = 0;
  #movingTicks = 0;
  #damage = 0;
  #maxHp = 0;
  constructor(
    readonly runId: string,
    readonly sessionId: string,
  ) {}
  bind(...entities: readonly object[]): void {
    for (const entity of entities) {
      const old = bindings.get(entity);
      if (old && old !== this) old.invalidate("world ownership changed");
      bindings.set(entity, this);
      this.#entities.add(entity);
    }
  }
  dispose(): void {
    for (const entity of this.#entities) if (bindings.get(entity) === this) bindings.delete(entity);
    this.#entities.clear();
    this.#ended = true;
  }
  invalidate(reason: string): void {
    this.#invalid.add(reason);
  }
  beginTick(tick: number, body: RunDnaBody, loadout: RunDnaLoadout): void {
    if (this.#ended) return;
    if (this.#tick !== undefined || tick !== this.#scheduledThrough + 1)
      this.invalidate("missing or overlapping canonical tick");
    this.#tick = tick;
    this.#eligible = false;
    this.#moved = false;
    this.observeLoadout(body, loadout);
  }
  observeLoadout(body: RunDnaBody, loadout: RunDnaLoadout): void {
    this.peakHp(body.maxHp);
    const available = runDnaCapabilities(loadout, body);
    if (available.length === 0) this.invalidate("unsupported run capability catalog");
    for (const id of available) this.#available.add(id);
  }
  eligible(): void {
    if (this.#tick !== undefined && !this.#ended) this.#eligible = true;
  }
  moved(x: number, y: number, body: Pick<RunDnaBody, "x" | "y">): void {
    if (this.#eligible && (Math.abs(body.x - x) > 1e-7 || Math.abs(body.y - y) > 1e-7)) this.#moved = true;
  }
  peakHp(hp: number): void {
    if (Number.isFinite(hp) && hp > 0) this.#maxHp = Math.max(this.#maxHp, hp);
    else this.invalidate("invalid effective max HP");
  }
  damage(lost: number, maxHp: number): void {
    if (this.#ended) return;
    this.peakHp(maxHp);
    if (lost > 0) {
      if (this.#tick === undefined) this.invalidate("damage outside observed canonical tick");
      this.#damage += lost;
    }
  }
  maneuver(id: RunDnaManeuver): void {
    if (!this.#ended && this.#eligible && this.#available.has(id)) this.#used.add(id);
  }
  heldSwing(id: number, active: boolean): void {
    const key = `swing:${String(id)}`;
    if (active && !this.#episodes.has(key)) this.start(key, "swing");
    else if (!active) this.end(key);
  }
  start(key: string, maneuver: RunDnaManeuver): void {
    if (this.#ended || !this.#eligible) return;
    if (this.#episodes.has(key)) {
      this.invalidate("duplicate attack episode");
      return;
    }
    if (this.#episodes.size >= 128) {
      this.invalidate("attack observation capacity exceeded");
      return;
    }
    this.#episodes.set(key, { hit: false, pending: 0, ended: false });
    this.#attacks++;
    this.maneuver(maneuver);
  }
  hit(key: string, damage: number): void {
    if (damage > 0) {
      const episode = this.#episodes.get(key);
      if (episode) episode.hit = true;
      else if (this.#eligible) this.invalidate("damaging contact without attack origin");
    }
  }
  end(key: string): void {
    const episode = this.#episodes.get(key);
    if (!episode) return;
    episode.ended = true;
    this.#resolve(key, episode);
  }
  interrupt(key: string): void {
    if (this.#episodes.delete(key)) this.#censored++;
  }
  #resolve(key: string, episode: Episode): void {
    if (!episode.ended || episode.pending !== 0) return;
    this.#episodes.delete(key);
    this.#resolved++;
    if (episode.hit) this.#successful++;
    else this.#misses++;
  }
  attachShot(shot: object, key: string): void {
    const episode = this.#episodes.get(key);
    if (!episode) {
      this.invalidate("projectile without attack origin");
      return;
    }
    episode.pending++;
    shots.set(shot, { observer: this, episode: key, done: false });
  }
  finishShot(key: string): void {
    const episode = this.#episodes.get(key);
    if (episode) {
      episode.pending--;
      this.#resolve(key, episode);
    }
  }
  endCombat(success: boolean): void {
    if (!success) this.invalidate("failed or partial combat step");
    else if (this.#caught !== undefined) this.end(this.#caught);
    this.#caught = undefined;
  }
  completeTick(tick: number, body: RunDnaBody): void {
    if (this.#tick !== tick) this.invalidate("canonical commit without matching observation");
    this.peakHp(body.maxHp);
    if (this.#eligible) {
      this.#combatTicks++;
      if (this.#moved) this.#movingTicks++;
    }
    this.#observedTicks++;
    this.#lastTick = tick;
    this.#scheduledThrough = tick;
    this.#tick = undefined;
  }
  get committedTick(): number {
    return this.#lastTick;
  }
  frameEnded(scheduledThrough: number): void {
    if (this.#tick !== undefined || scheduledThrough < this.#scheduledThrough) {
      this.invalidate("uncommitted application frame");
      return;
    }
    this.#skippedTicks += scheduledThrough - this.#scheduledThrough;
    this.#scheduledThrough = scheduledThrough;
  }
  capture(endTick: number, terminalTick = endTick): NativeRunDnaCapture {
    if (this.#tick !== undefined || endTick !== this.#lastTick) this.invalidate("missing final canonical tick");
    for (const key of this.#episodes.keys()) this.interrupt(key);
    this.#ended = true;
    return {
      kind: "run-dna-metrics-v1",
      metrics: {
        attacks: this.#attacks,
        combatTicks: this.#combatTicks,
        misses: this.#misses,
        movingTicks: this.#movingTicks,
        damageTaken: this.#damage,
        maxHp: this.#maxHp,
        distinctManeuvers: this.#used.size,
        availableManeuvers: this.#available.size,
      },
      capture: {
        version: 1,
        policy: RUN_DNA_CAPTURE_POLICY,
        runId: this.runId,
        sessionId: this.sessionId,
        originTick: 0,
        endTick,
        scheduledThrough: this.#scheduledThrough,
        skippedTicks: this.#skippedTicks,
        observedTicks: this.#observedTicks,
        terminalTick,
        complete: this.#invalid.size === 0,
        invalid: [...this.#invalid],
        resolved: this.#resolved,
        censored: this.#censored,
        successful: this.#successful,
        available: [...this.#available].sort(),
        used: [...this.#used].sort(),
      },
    };
  }
}
export function bindRunDnaShot(
  shot: object,
  blade: object,
  attackId: number,
  secondary: boolean,
  throwId: number,
): void {
  const observer = runDnaObserver(blade);
  if (!observer) return;
  observer.attachShot(shot, secondary ? `throw:${String(throwId)}` : `shot:${String(attackId)}`);
}
export function runDnaShotHit(shot: object, damage: number): void {
  const binding = shots.get(shot);
  if (binding && !binding.done) binding.observer.hit(binding.episode, damage);
}
export function runDnaShotEnded(shot: object): void {
  const binding = shots.get(shot);
  if (binding && !binding.done) {
    binding.done = true;
    binding.observer.finishShot(binding.episode);
    shots.delete(shot);
  }
}

export function withRunDnaAttack<T>(entity: object, key: string, action: () => T): T {
  const observer = runDnaObserver(entity);
  return observer ? observer.withAttack(key, action) : action();
}

export function withRunDnaShot<T>(shot: object, action: () => T): T {
  const binding = shots.get(shot);
  return binding ? binding.observer.withAttack(binding.episode, action) : action();
}
