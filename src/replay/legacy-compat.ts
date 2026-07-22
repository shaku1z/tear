import type { ReplayActionEnvelope, ReplayBuildMetadata, TearScoreReplayMetadata } from "./envelope";
import { acceptedRecording, arrayValue, isRecord, numberValue, stringValue, tearScoreMetadata } from "./legacy-compat-validation";
import {
  buildVisualReplayPacket,
  migrateVisualRecording,
  type VisualDeathEvent,
  type VisualEffectEvent,
  type VisualLoadoutEvent,
  type VisualRecordingV2,
  type VisualReplayPacket,
  type VisualReplayProvenance,
  type VisualSpawnEvent,
  type VisualStageEvent,
  type VisualWaveEvent,
} from "./visual-replay";

export interface ReplayStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface SemanticReplayInput {
  startRecording(): void;
  stopRecording(): void;
  drain(tick: number): readonly ReplayActionEnvelope[];
  /** Highest tick the buffer's sequencer has sealed an envelope at (0 when none). */
  readonly lastSealedTick: number;
}

export interface LegacyReplayDependencies {
  readonly store: ReplayStore;
  readonly document: Document;
  readonly now: () => number;
  readonly random: () => number;
  readonly semanticInput?: SemanticReplayInput;
  readonly defaults: Readonly<{
    rulesetVersion: string;
    build: ReplayBuildMetadata;
    ticksPerSecond: number;
    tearScore: () => TearScoreReplayMetadata;
  }>;
}

export interface RunReplayContext {
  readonly runId?: string;
  readonly seed?: string;
  readonly rulesetVersion?: string;
  readonly build?: ReplayBuildMetadata;
  readonly tearScore?: TearScoreReplayMetadata;
}

interface MutableRecording {
  t: number;
  elapsed: number;
  acc: number;
  eacc: number;
  gid: number;
  px: number[];
  py: number[];
  tx: number[];
  ty: number[];
  fc: number[];
  stages: VisualStageEvent[];
  waves: VisualWaveEvent[];
  spawns: VisualSpawnEvent[];
  esamp: number[][];
  deaths: VisualDeathEvent[];
  events: VisualEffectEvent[];
  loadout: VisualLoadoutEvent[];
  thumb: string | null;
  thumbPri: number;
  thumbAt: number;
  actions: ReplayActionEnvelope[];
  provenance: VisualReplayProvenance;
}

interface PlayerSample { readonly x: number; readonly y: number; readonly facing: number }
interface BladeSample { readonly tipX: number; readonly tipY: number }
interface EnemySample { x: number; y: number; dead?: boolean; _gid?: number }

export interface ReplayPlayback {
  readonly d: VisualRecordingV2;
  t: number;
  playing: boolean;
  speed: number;
  evPtr: number;
  dePtr: number;
  _skipFx?: boolean;
}

export class LegacyGhostEngine {
  readonly RATE = 0.1;
  readonly ERATE = 0.25;
  rec: MutableRecording | null = null;
  play: ReplayPlayback | null = null;
  readonly #dependencies: LegacyReplayDependencies;

  constructor(dependencies: LegacyReplayDependencies) {
    this.#dependencies = dependencies;
  }

  startRec(context: RunReplayContext = {}): void {
    const fallbackId = `run-${String(this.#dependencies.now())}`;
    this.rec = {
      t: 0, elapsed: 0, acc: 0, eacc: 0, gid: 0,
      px: [], py: [], tx: [], ty: [], fc: [],
      stages: [], waves: [], spawns: [], esamp: [], deaths: [], events: [], loadout: [],
      thumb: null, thumbPri: -1, thumbAt: -1e9, actions: [],
      provenance: {
        rulesetVersion: context.rulesetVersion ?? this.#dependencies.defaults.rulesetVersion,
        build: context.build ?? this.#dependencies.defaults.build,
        runId: context.runId ?? fallbackId,
        seed: context.seed ?? fallbackId,
        ticksPerSecond: this.#dependencies.defaults.ticksPerSecond,
        tearScore: tearScoreMetadata(context.tearScore ?? this.#dependencies.defaults.tearScore()),
      },
    };
    this.#dependencies.semanticInput?.startRecording();
  }

  recording(): boolean { return this.rec !== null; }

  /** Seals device actions onto the authoritative simulation tick before rules execute. */
  drainActions(tick: number): readonly ReplayActionEnvelope[] {
    const actions = this.#dependencies.semanticInput?.drain(tick) ?? [];
    this.rec?.actions.push(...actions);
    return actions;
  }

  sample(dt: number, player: PlayerSample | null, blade: BladeSample | null, enemies: readonly EnemySample[] | null): void {
    const recording = this.rec;
    if (recording === null || player === null) return;
    recording.t += dt;
    recording.elapsed += dt;
    recording.acc += dt;
    recording.eacc += dt;
    if (recording.acc >= this.RATE) {
      recording.acc -= this.RATE;
      recording.px.push(Math.round(player.x)); recording.py.push(Math.round(player.y));
      recording.tx.push(Math.round(blade?.tipX ?? player.x)); recording.ty.push(Math.round(blade?.tipY ?? player.y));
      recording.fc.push(player.facing >= 0 ? 1 : 0);
      if (recording.px.length > 9_000) this.#trim(recording);
    }
    if (recording.eacc >= this.ERATE && enemies !== null) {
      recording.eacc -= this.ERATE;
      const enemyTick = [Math.round(recording.t * 10)];
      for (const enemy of enemies) {
        if (!enemy.dead && enemy._gid !== undefined) enemyTick.push(enemy._gid, Math.round(enemy.x), Math.round(enemy.y));
      }
      recording.esamp.push(enemyTick);
    }
  }

  #trim(recording: MutableRecording): void {
    const cut = Math.floor(recording.px.length / 4);
    const cutTime = cut * this.RATE;
    recording.px = recording.px.slice(cut); recording.py = recording.py.slice(cut);
    recording.tx = recording.tx.slice(cut); recording.ty = recording.ty.slice(cut); recording.fc = recording.fc.slice(cut);
    const shift = <T extends { readonly t: number }>(values: readonly T[]): T[] => values
      .filter((entry) => entry.t >= cutTime)
      .map((entry) => ({ ...entry, t: Number((entry.t - cutTime).toFixed(1)) }));
    recording.stages = shift(recording.stages); recording.waves = shift(recording.waves);
    recording.spawns = shift(recording.spawns); recording.deaths = shift(recording.deaths);
    recording.events = shift(recording.events); recording.loadout = shift(recording.loadout);
    recording.esamp = recording.esamp.filter((sample) => numberValue(sample[0]) / 10 >= cutTime).map((sample) => {
      const shifted = [...sample]; shifted[0] = Math.round(numberValue(shifted[0]) - cutTime * 10); return shifted;
    });
    recording.t -= cutTime;
  }

  #time(): number { return this.rec === null ? 0 : Number(this.rec.t.toFixed(1)); }
  stage(index: number): void { this.rec?.stages.push({ t: this.#time(), s: index }); }
  wave(wave: number, event: string): void { this.rec?.waves.push({ t: this.#time(), w: wave, e: event }); }

  spawn(enemy: EnemySample | null, kind: string, extra?: Readonly<{ vn?: string; b?: string }>): void {
    if (this.rec === null || enemy === null) return;
    enemy._gid = ++this.rec.gid;
    const base = { t: this.#time(), id: enemy._gid, k: kind, x: Math.round(enemy.x), y: Math.round(enemy.y) };
    this.rec.spawns.push(extra === undefined ? base : { ...base, ...extra });
  }

  death(enemy: EnemySample | null, cause = ""): void {
    if (this.rec !== null && enemy?._gid !== undefined) this.rec.deaths.push({ t: this.#time(), id: enemy._gid, c: cause });
  }

  event(kind: string, x = 0, y = 0): void {
    this.rec?.events.push({ t: this.#time(), k: kind, x: Math.round(x), y: Math.round(y) });
  }

  loadoutPick(id: string, tier = 1, wave = 0): void {
    this.rec?.loadout.push({ t: this.#time(), id, tier, w: wave });
  }

  snapshot(canvas: HTMLCanvasElement | null, priority: number): void {
    const recording = this.rec;
    if (recording === null || canvas === null || priority <= recording.thumbPri || recording.t - recording.thumbAt < 4) return;
    try {
      const thumbnail = this.#dependencies.document.createElement("canvas");
      thumbnail.width = 160; thumbnail.height = 90;
      thumbnail.getContext("2d")?.drawImage(canvas, 0, 0, 160, 90);
      recording.thumb = thumbnail.toDataURL("image/jpeg", 0.55);
      recording.thumbPri = priority; recording.thumbAt = recording.t;
    } catch {
      // Canvas export can be blocked by a tainted source; the replay remains valid without a thumbnail.
    }
  }

  stopRec(meta: Readonly<Record<string, unknown>> = {}): VisualReplayPacket | null {
    const recording = this.rec;
    this.rec = null;
    if (recording === null || recording.px.length < 20) {
      this.#dependencies.semanticInput?.stopRecording();
      return null;
    }
    // The recorder's elapsed clock is relative to the recording start while mid-run
    // drains seal at the absolute simulation tick; clamp so the closing drain can
    // never move the sequencer backwards (a throw here would kill the frame loop).
    const finalTick = Math.max(0, Math.round(recording.elapsed * recording.provenance.ticksPerSecond),
      this.#dependencies.semanticInput?.lastSealedTick ?? 0);
    recording.actions.push(...(this.#dependencies.semanticInput?.drain(finalTick) ?? []));
    this.#dependencies.semanticInput?.stopRecording();
    recording.provenance = {
      ...recording.provenance,
      tearScore: tearScoreMetadata(this.#dependencies.defaults.tearScore()),
    };
    const raw: VisualRecordingV2 = {
      ...meta,
      v: 2, dt: this.RATE, edt: this.ERATE,
      px: recording.px, py: recording.py, tx: recording.tx, ty: recording.ty, fc: recording.fc,
      stages: recording.stages, waves: recording.waves, spawns: recording.spawns, esamp: recording.esamp,
      deaths: recording.deaths, events: recording.events, loadout: recording.loadout, thumb: recording.thumb,
    };
    return buildVisualReplayPacket(raw, recording.provenance, recording.actions);
  }

  begin(value: unknown): ReplayPlayback | null {
    const recording = acceptedRecording(value);
    if (recording === null) return null;
    this.play = { d: recording, t: 0, playing: true, speed: 1, evPtr: 0, dePtr: 0 };
    return this.play;
  }

  _fromV1(value: unknown): VisualRecordingV2 | null {
    const migrated = migrateVisualRecording(value);
    return migrated.ok ? migrated.recording : null;
  }

  end(): void { this.play = null; }
  active(): boolean { return this.play !== null; }
  duration(): number { return this.play === null ? 0 : (this.play.d.px.length - 1) * this.play.d.dt; }
  update(dt: number): void {
    const playback = this.play; if (!playback?.playing) return;
    playback.t += dt * playback.speed;
    if (playback.t >= this.duration()) { playback.t = this.duration(); playback.playing = false; }
  }
  seek(time: number): void {
    const playback = this.play; if (playback === null) return;
    playback.t = Math.max(0, Math.min(time, this.duration())); playback.evPtr = 0; playback.dePtr = 0; playback._skipFx = true;
  }
  toggle(): void {
    const playback = this.play; if (playback === null) return;
    if (!playback.playing && playback.t >= this.duration()) playback.t = 0;
    playback.playing = !playback.playing;
  }
  cycleSpeed(): void {
    const playback = this.play; if (playback === null) return;
    const speeds = [0.5, 1, 2, 4]; playback.speed = arrayValue(speeds, (speeds.indexOf(playback.speed) + 1) % speeds.length);
  }
  progress(): number { const duration = this.duration(); return this.play !== null && duration > 0 ? this.play.t / duration : 0; }

  pose(): Readonly<{ x: number; y: number; bx: number; by: number; face: number }> | null {
    const playback = this.play; if (playback === null) return null;
    const data = playback.d; const count = data.px.length; const frame = playback.t / data.dt;
    let index = Math.floor(frame); if (index >= count - 1) index = count - 2; if (index < 0) index = 0;
    const alpha = Math.max(0, Math.min(1, frame - index));
    const interpolate = (track: readonly number[]): number => {
      const left = arrayValue(track, index); return left + (arrayValue(track, index + 1) - left) * alpha;
    };
    const face = data.fc !== null
      ? (arrayValue(data.fc, index) ? 1 : -1)
      : (arrayValue(data.px, index + 1) >= arrayValue(data.px, index) ? 1 : -1);
    return { x: interpolate(data.px), y: interpolate(data.py), bx: interpolate(data.tx), by: interpolate(data.ty), face };
  }

  enemiesAt(): readonly Readonly<{ id: number; x: number; y: number }>[] {
    const playback = this.play; if (playback === null || playback.d.esamp.length === 0) return [];
    const samples = playback.d.esamp; const targetTick = playback.t * 10;
    let low = 0; let high = samples.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (numberValue(arrayValue(samples, middle)[0]) <= targetTick) low = middle; else high = middle - 1;
    }
    const current = arrayValue(samples, low); const next = samples[low + 1];
    const alpha = next === undefined ? 0 : Math.max(0, Math.min(1,
      (targetTick - numberValue(current[0])) / Math.max(1, numberValue(next[0]) - numberValue(current[0])),
    ));
    const nextPositions = new Map<number, Readonly<{ x: number; y: number }>>();
    if (next !== undefined) for (let index = 1; index < next.length; index += 3) {
      nextPositions.set(numberValue(next[index]), { x: numberValue(next[index + 1]), y: numberValue(next[index + 2]) });
    }
    const output: Readonly<{ id: number; x: number; y: number }>[] = [];
    for (let index = 1; index < current.length; index += 3) {
      const id = numberValue(current[index]); let x = numberValue(current[index + 1]); let y = numberValue(current[index + 2]);
      const following = nextPositions.get(id);
      if (following !== undefined && Math.abs(following.x - x) < 400 && Math.abs(following.y - y) < 400) {
        x += (following.x - x) * alpha; y += (following.y - y) * alpha;
      }
      output.push({ id, x, y });
    }
    return output;
  }

  spawnInfo(id: number): VisualSpawnEvent | null {
    return this.play?.d.spawns.find((spawn) => spawn.id === id) ?? null;
  }
  stageAt(): number {
    const playback = this.play; if (playback === null) return 0;
    let stage = numberValue(playback.d.stage);
    for (const event of playback.d.stages) { if (event.t <= playback.t) stage = event.s; else break; }
    return stage;
  }
  waveAt(): number {
    const playback = this.play; if (playback === null) return 0;
    let wave = 0; for (const event of playback.d.waves) { if (event.t <= playback.t) wave = event.w; else break; } return wave;
  }
  chapters(): readonly Readonly<{ t: number; label: string; boss: boolean }>[] {
    if (this.play === null) return [];
    return this.play.d.waves.filter((event) => event.e === "start" || event.e === "boss")
      .map((event) => ({ t: event.t, label: event.e === "boss" ? "BOSS" : `W${String(event.w)}`, boss: event.e === "boss" }));
  }
  jumpChapter(direction: number): void {
    const playback = this.play; if (playback === null) return; const chapters = this.chapters(); if (chapters.length === 0) return;
    if (direction > 0) this.seek(chapters.find((chapter) => chapter.t > playback.t + 0.2)?.t ?? this.duration());
    else this.seek([...chapters].reverse().find((chapter) => chapter.t < playback.t - 0.5)?.t ?? 0);
  }
  crossed(): Readonly<{ events: readonly VisualEffectEvent[]; deaths: readonly VisualDeathEvent[] }> {
    const playback = this.play; if (playback === null) return { events: [], deaths: [] };
    if (playback._skipFx) {
      while (playback.evPtr < playback.d.events.length && arrayValue(playback.d.events, playback.evPtr).t <= playback.t) playback.evPtr += 1;
      while (playback.dePtr < playback.d.deaths.length && arrayValue(playback.d.deaths, playback.dePtr).t <= playback.t) playback.dePtr += 1;
      playback._skipFx = false; return { events: [], deaths: [] };
    }
    const events: VisualEffectEvent[] = []; const deaths: VisualDeathEvent[] = [];
    while (playback.evPtr < playback.d.events.length && arrayValue(playback.d.events, playback.evPtr).t <= playback.t) {
      events.push(arrayValue(playback.d.events, playback.evPtr)); playback.evPtr += 1;
    }
    while (playback.dePtr < playback.d.deaths.length && arrayValue(playback.d.deaths, playback.dePtr).t <= playback.t) {
      deaths.push(arrayValue(playback.d.deaths, playback.dePtr)); playback.dePtr += 1;
    }
    return { events, deaths };
  }

  #key(mode: string, difficulty: string): string { return `tear_ghost_${mode}_${difficulty}`; }
  saveLocal(value: unknown): void {
    const recording = acceptedRecording(value); if (recording === null) return;
    const mode = stringValue(recording.mode); const difficulty = stringValue(recording.diff);
    try {
      const previous = this.loadLocal(mode, difficulty);
      if (previous === null || numberValue(recording.score) >= numberValue(previous.score)) {
        this.#dependencies.store.set(this.#key(mode, difficulty), JSON.stringify(value));
      }
    } catch {
      // Legacy best storage is best-effort.
    }
  }
  loadLocal(mode: string, difficulty: string): VisualRecordingV2 | null {
    try { return acceptedRecording(JSON.parse(this.#dependencies.store.get(this.#key(mode, difficulty)) ?? "null") as unknown); }
    catch { return null; }
  }
}

export interface VaultEntry {
  readonly id: string;
  readonly ts: number;
  pin: boolean;
  shareId: string | null;
  readonly sum: Readonly<Record<string, unknown>>;
}

function vaultEntry(value: unknown): VaultEntry | null {
  if (!isRecord(value) || typeof value.id !== "string" || !Number.isFinite(value.ts)) return null;
  return {
    id: value.id,
    ts: value.ts as number,
    pin: value.pin === true,
    shareId: typeof value.shareId === "string" ? value.shareId : null,
    sum: isRecord(value.sum) ? value.sum : {},
  };
}

export class LegacyReplayVault {
  readonly MAX_UNPINNED = 12;
  readonly MAX_PINNED = 10;
  _index: VaultEntry[] | null = null;
  readonly #store: ReplayStore;
  readonly #now: () => number;
  readonly #random: () => number;

  constructor(store: ReplayStore, now: () => number, random: () => number) {
    this.#store = store; this.#now = now; this.#random = random;
  }

  index(): VaultEntry[] {
    if (this._index !== null) return this._index;
    try {
      const parsed = JSON.parse(this.#store.get("tear_vault_index") ?? "[]") as unknown;
      this._index = Array.isArray(parsed) ? parsed.map(vaultEntry).filter((entry): entry is VaultEntry => entry !== null) : [];
    } catch { this._index = []; }
    return this._index;
  }
  #saveIndex(): boolean {
    try { this.#store.set("tear_vault_index", JSON.stringify(this._index ?? [])); return true; }
    catch { return false; }
  }
  add(value: unknown, summary: Readonly<Record<string, unknown>> = {}): string | null {
    const recording = acceptedRecording(value); if (recording === null) return null;
    let id = `v${this.#now().toString(36)}${this.#random().toString(36).slice(2, 6)}`;
    while (this.index().some((entry) => entry.id === id)) id = `${id}x`;
    try { this.#store.set(`tear_vault_${id}`, JSON.stringify(recording)); }
    catch { return null; }
    const entry: VaultEntry = { id, ts: this.#now(), pin: false, shareId: null, sum: summary };
    this.index().unshift(entry);
    const unpinned = this.index().filter((candidate) => !candidate.pin);
    for (let index = unpinned.length - 1; index >= this.MAX_UNPINNED; index -= 1) this.#drop(unpinned[index]?.id ?? "");
    if (!this.#saveIndex()) { this.#drop(id); return null; }
    return id;
  }
  #drop(id: string): void {
    if (id.length === 0) return;
    this._index = this.index().filter((entry) => entry.id !== id);
    try { this.#store.set(`tear_vault_${id}`, ""); } catch { /* best effort cleanup */ }
  }
  get(id: string): VisualRecordingV2 | null {
    try { return acceptedRecording(JSON.parse(this.#store.get(`tear_vault_${id}`) ?? "null") as unknown); }
    catch { return null; }
  }
  remove(id: string): void { this.#drop(id); this.#saveIndex(); }
  pin(id: string, on: boolean): boolean {
    const entry = this.index().find((candidate) => candidate.id === id); if (entry === undefined) return false;
    if (on && !entry.pin && this.index().filter((candidate) => candidate.pin).length >= this.MAX_PINNED) return false;
    const previous = entry.pin; entry.pin = on;
    if (this.#saveIndex()) return true;
    entry.pin = previous; return false;
  }
  setShareId(id: string, shareId: string): void {
    const entry = this.index().find((candidate) => candidate.id === id);
    if (entry !== undefined) { entry.shareId = shareId; this.#saveIndex(); }
  }
}

export function createLegacyReplayCompatibility(dependencies: LegacyReplayDependencies): Readonly<{
  GHOST: LegacyGhostEngine;
  VAULT: LegacyReplayVault;
}> {
  return Object.freeze({
    GHOST: new LegacyGhostEngine(dependencies),
    VAULT: new LegacyReplayVault(dependencies.store, dependencies.now, dependencies.random),
  });
}
