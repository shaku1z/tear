import { unwrapBrowserAudioContext, unwrapBrowserAudioNode } from "../browser-audio";
import type { TemporaryMuteReason } from "../mixer";
import type {
  MusicBackend,
  MusicBackendHost,
  MusicContextSnapshot,
  MusicEvent,
  MusicReplayMetadata,
  MusicRunSessionMetadata,
} from "../music-contracts";
import { applyMusicMode, onMusicModeChange } from "../music-mode";
import { onLoadoutChange, resolveMenuCueId } from "../signal/loadout";
import { getActiveStation, onStationChange } from "../signal/active-station";
import { setNowPlaying } from "../signal/now-playing";
import { createStationState, pickNext, remember, type StationState } from "../signal/station";
import type { SignalCatalog } from "../signal/catalog";
import { StingerPlayer } from "../signal/stingers";
import { nextBoundaryTime, secondsPerBar } from "../signal/quantize";
import { StemCuePlayer } from "./StemCuePlayer";
import { loopSeconds } from "./tier";
import { tierFromSnapshot } from "./tier-from-snapshot";
import { WebAudioStemBackend } from "./web-audio-backend";
import type { StemCueManifest, Tier } from "./types";

export interface LoadedCueRef {
  readonly id: string;
  readonly manifest: StemCueManifest & {
    readonly bossIntro?: { readonly asset: string; readonly lengthSeconds: number };
  };
  readonly baseUrl: string;
}

interface ActiveCue {
  readonly cueId: string;
  readonly player: StemCuePlayer;
  readonly cueGain: GainNode;
}

const CROSSFADE_SECONDS = 0.9;
/** Menu entries/exits are UI transitions, so they swap much faster than biome changes. */
const MENU_CROSSFADE_SECONDS = 0.28;
/** Switch cues on a musical boundary this many bars wide (a phrase). */
const QUANTIZE_BARS = 2;

/**
 * One music backend for the whole game: it maps the current biome (stage name)
 * to a recorded stem cue, crossfades between cues on biome change, and drives the
 * active cue's tier from game state. A cue may declare a `bossIntro` one-shot
 * (e.g. Berserker's latin groove) that only fires when a boss fight begins.
 */
export class BiomeStemBackend implements MusicBackend {
  readonly id = "stem-cue:biome-routed";
  readonly #cues = new Map<string, LoadedCueRef>();
  readonly #biomeMap: Readonly<Record<string, string>>;
  readonly #defaultCueId: string;
  readonly #muteReasons = new Set<TemporaryMuteReason>();

  #context: AudioContext | null = null;
  #output: AudioNode | null = null;
  #active: ActiveCue | null = null;
  #switchToken = 0;
  /** Cue currently being loaded; `#active` still holds the old one until it lands. */
  #pendingCueId: string | null = null;
  // Before any gameplay snapshot arrives we are on the menu, which plays the
  // complete arrangement rather than a lull.
  #tier: Tier = 4;
  #requestedTier: Tier = 4;
  #bossActive = false;
  #introBuffer: AudioBuffer | null = null;
  #stopModeWatch: (() => void) | null = null;
  #stopLoadoutWatch: (() => void) | null = null;
  /** While paused, ignore the user's music mode and use the adaptive tier. */
  #modeExempt = false;
  #catalog: SignalCatalog | null = null;
  #bossMap: Readonly<Record<string, string>> = {};
  #lastBossId: string | null = null;
  #stationState: StationState = createStationState();
  #stopStationWatch: (() => void) | null = null;
  /** Cue the station had queued before a boss/story takeover, for resume. */
  #interrupted: string | null = null;
  #stationSeed = 1;
  /** Context time the active cue began, and its bar length — for quantizing. */
  #activeStartedAt = 0;
  #activeSecondsPerBar = 2;
  #activeLoopSeconds = 0;
  /** False when the cue's loop is not a whole number of bars (see cue `grid`). */
  #activeBarQuantized = true;
  #stingers: StingerPlayer | null = null;
  /** Menu screens push no snapshots, so the shell context is the starting state. */
  #onShell = true;
  #lastBiomeId = "menu";
  #lastScene = "main-menu";

  constructor(cues: readonly LoadedCueRef[], biomeMap: Record<string, string>, defaultCueId: string, catalog: SignalCatalog | null = null, bossMap: Record<string, string> = {}) {
    this.#catalog = catalog;
    this.#bossMap = bossMap;
    for (const cue of cues) this.#cues.set(cue.id, cue);
    this.#biomeMap = biomeMap;
    this.#defaultCueId = defaultCueId;
  }

  async initialize(host: MusicBackendHost): Promise<void> {
    this.#context = unwrapBrowserAudioContext(host.context);
    this.#output = unwrapBrowserAudioNode(host.output);
    // React immediately when the player changes the music mode in settings.
    this.#stopModeWatch = onMusicModeChange(() => {
      this.#applyTier(0.5);
    });
    // Re-pick the shell track when the player changes their menu-music loadout.
    this.#stopLoadoutWatch = onLoadoutChange(() => {
      if (!this.#onShell) return;
      const next = this.#shellCueId();
      if (next !== this.#active?.cueId) void this.#activate(next, MENU_CROSSFADE_SECONDS);
    });
    this.#stopStationWatch = onStationChange(() => {
      // Switching station re-programmes the next pick immediately.
      this.#interrupted = null;
      const next = this.#routeCueId(this.#lastBiomeId, this.#lastScene);
      if (next !== this.#active?.cueId) void this.#activate(next, CROSSFADE_SECONDS, QUANTIZE_BARS);
    });
    this.#stingers = new StingerPlayer(this.#context, this.#output);
    void this.#stingers.load();
    await this.#activate(this.#shellCueId());
  }

  beginRun(_metadata: MusicRunSessionMetadata): Promise<void> {
    void _metadata;
    return Promise.resolve();
  }

  updateContext(snapshot: MusicContextSnapshot): void {
    // Menu/shell screens use the player's loadout; gameplay uses biome routing.
    // "settings"/"shop"/etc. all resolve to the main-menu scene, so scene alone
    // would hand the menu track over mid-run. A live run always reports a biome.
    this.#onShell = snapshot.scene === "main-menu" && snapshot.biomeId === "menu";
    this.#lastBiomeId = snapshot.biomeId;
    this.#lastScene = snapshot.scene;
    this.#lastBossId = snapshot.bossId;
    const cueId = this.#routeCueId(snapshot.biomeId, snapshot.scene);
    if (cueId !== this.#active?.cueId) {
      // Entering or leaving the menu is a UI swap; keep it snappy.
      const menuSwap =
        snapshot.scene === "main-menu" || this.#active?.cueId === this.#defaultCueId;
      void this.#activate(
        cueId,
        menuSwap ? MENU_CROSSFADE_SECONDS : CROSSFADE_SECONDS,
        menuSwap ? 0 : QUANTIZE_BARS,
      );
    }

    // Pause always uses the plain adaptive reading, whatever the music mode is,
    // so pausing reliably drops the arrangement back.
    this.#modeExempt = snapshot.scene === "paused";
    this.#requestedTier = tierFromSnapshot(snapshot);
    this.#applyTier();

    // Boss-fight edge: fire a cue's one-shot intro (Berserker's latin groove).
    if (snapshot.bossActive && !this.#bossActive) this.#onBossStart();
    this.#bossActive = snapshot.bossActive;
  }

  /** Game events become rate-limited musical accents. */
  emitEvent(event: MusicEvent): void {
    const stingers = this.#stingers;
    if (!stingers) return;
    if (event.type === "boss-entered" || event.type === "boss-phase-changed") {
      stingers.play("boss-arrival");
    } else if (event.type === "victory") {
      stingers.play("victory");
    } else if (event.type === "combo-rank-changed") {
      const rank = event.rankId.toUpperCase();
      if (rank === "TEARING!" || rank === "TEARING") stingers.play("tearing");
    }
  }

  endRun(): Promise<void> {
    return Promise.resolve();
  }

  setMuteReason(reason: TemporaryMuteReason, muted: boolean): void {
    if (muted) this.#muteReasons.add(reason);
    else this.#muteReasons.delete(reason);
    if (this.#active && this.#context) {
      const g = this.#active.cueGain.gain;
      g.cancelScheduledValues(this.#context.currentTime);
      g.value = this.#openGain();
    }
  }

  replayMetadata(): MusicReplayMetadata {
    return { enabled: false, reason: "not-recorded" };
  }

  resume(): Promise<void> {
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): Promise<void> {
    this.#switchToken += 1;
    this.#stopModeWatch?.();
    this.#stopModeWatch = null;
    this.#stopLoadoutWatch?.();
    this.#stopLoadoutWatch = null;
    this.#stopStationWatch?.();
    this.#stopStationWatch = null;
    this.#stingers?.dispose();
    this.#stingers = null;
    if (this.#active) {
      this.#active.player.unload();
      this.#active.cueGain.disconnect();
      this.#active = null;
    }
    return Promise.resolve();
  }

  /** Cue for the shell/menu slot, honouring the player's Music Loadout. */
  #shellCueId(): string {
    return resolveMenuCueId(this.#defaultCueId, (cueId) => this.#cues.has(cueId));
  }

  #openGain(): number {
    return this.#muteReasons.size > 0 ? 0 : 1;
  }

  /** Resolve the director's tier through the user's music mode, then ramp. */
  #applyTier(transitionBars = 1): void {
    const tier = this.#modeExempt ? this.#requestedTier : applyMusicMode(this.#requestedTier);
    if (!this.#active || tier === this.#tier) return;
    this.#tier = tier;
    this.#active.player.setTier(tier, { transitionBars });
    this.#publishNowPlaying(this.#active.cueId);
  }

  /**
   * Absolute context time of the next phrase boundary of the playing cue, so a
   * cue swap lands in the pocket instead of cutting mid-bar. Falls back to "now"
   * when nothing is playing yet, or when the cue's loop is not bar-aligned —
   * waiting for a "boundary" we cannot actually locate would be worse than
   * swapping immediately.
   */
  #nextBoundary(quantizeBars: number): number {
    const context = this.#context;
    if (!context || !this.#active || quantizeBars <= 0) return context?.currentTime ?? 0;
    if (!this.#activeBarQuantized) return context.currentTime;
    return nextBoundaryTime(
      context.currentTime,
      this.#activeStartedAt,
      this.#activeSecondsPerBar,
      quantizeBars,
      undefined,
      this.#activeLoopSeconds,
    );
  }

  /** Canonical (biome/menu) routing, ignoring any station. */
  #canonicalCueId(biomeId: string, scene: string): string {
    if (scene === "main-menu") return this.#shellCueId();
    // A boss with its own track overrides the biome cue for that fight.
    if (scene === "boss" && this.#lastBossId) {
      const bossCue = this.#bossMap[this.#lastBossId];
      if (bossCue && this.#cues.has(bossCue)) return bossCue;
    }
    return this.#biomeMap[biomeId] ?? this.#defaultCueId;
  }

  /**
   * Resolve which cue should play.
   *
   * Hybrid policy: a boss takes the canonical cue (story wins), and the station's
   * pick is remembered so it can resume afterwards. Outside a boss, an active
   * station programmes the track; `canonical` falls back to biome routing.
   */
  #routeCueId(biomeId: string, scene: string): string {
    const canonical = this.#canonicalCueId(biomeId, scene);
    const station = getActiveStation();
    if (station === "canonical" || !this.#catalog) return canonical;
    if (scene === "main-menu") return canonical; // shell slot owns the menu

    // Boss/story takeover — remember what the station wanted, play canonical.
    if (scene === "boss" || scene === "victory" || scene === "defeat") {
      this.#interrupted ??= this.#active?.cueId ?? null;
      return canonical;
    }

    // Resuming after a takeover: go back to what the station had queued.
    if (this.#interrupted) {
      const resume = this.#interrupted;
      this.#interrupted = null;
      if (this.#cues.has(resume)) return resume;
    }

    // Keep the current station pick until it is no longer eligible.
    const current = this.#active?.cueId;
    if (current && current !== canonical && this.#cues.has(current)) return current;

    const entry = pickNext(this.#catalog, station, "gameplay", this.#stationState, this.#stationSeed++);
    if (!entry || !this.#cues.has(entry.workId)) return canonical;
    this.#stationState = remember(this.#stationState, entry.workId);
    return entry.workId;
  }

  /** Publish what is sounding so THE SIGNAL's UI can show it. */
  #publishNowPlaying(cueId: string): void {
    const station = getActiveStation();
    const work = this.#catalog?.works.find((w) => w.id === cueId);
    const stationMeta = station === "canonical" ? null : this.#catalog?.stations.find((s) => s.id === station);
    setNowPlaying({
      workId: cueId,
      title: work?.title ?? cueId,
      stationId: stationMeta?.id ?? null,
      stationName: stationMeta?.name ?? null,
      tier: this.#tier,
    });
  }

  async #activate(cueId: string, fadeSeconds: number = CROSSFADE_SECONDS, quantizeBars = 0): Promise<void> {
    const context = this.#context;
    const output = this.#output;
    const loaded = this.#cues.get(cueId);
    if (!context || !output || !loaded) return;
    // `#active` still points at the outgoing cue while this loads, so without
    // this guard every snapshot would spawn another activation that cancels the
    // in-flight one — the music would never land.
    if (cueId === this.#pendingCueId) return;
    this.#pendingCueId = cueId;
    const token = ++this.#switchToken;

    const cueGain = context.createGain();
    cueGain.gain.value = 0;
    cueGain.connect(output);
    const backend = new WebAudioStemBackend(context, cueGain, loaded.baseUrl);
    const player = new StemCuePlayer();
    await player.load(loaded.manifest, backend);
    if (token !== this.#switchToken) {
      player.unload();
      cueGain.disconnect();
      return; // superseded by a newer biome change
    }
    this.#pendingCueId = null;

    // Land the swap on a musical boundary when asked; otherwise go immediately.
    const at = quantizeBars > 0 ? this.#nextBoundary(quantizeBars) : context.currentTime + 0.15;
    const lead = Math.max(0.05, at - context.currentTime);
    player.start({ leadSeconds: lead });
    this.#tier = this.#modeExempt ? this.#requestedTier : applyMusicMode(this.#requestedTier);
    player.setTier(this.#tier);

    const now = at;
    cueGain.gain.setValueAtTime(0, now);
    cueGain.gain.linearRampToValueAtTime(this.#openGain(), now + fadeSeconds);

    const previous = this.#active;
    if (previous) {
      previous.cueGain.gain.cancelScheduledValues(now);
      previous.cueGain.gain.setValueAtTime(previous.cueGain.gain.value, now);
      previous.cueGain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      const delayMs = Math.max(0, (now - context.currentTime + fadeSeconds + 0.2) * 1000);
      window.setTimeout(() => {
        previous.player.unload();
        previous.cueGain.disconnect();
      }, delayMs);
    }
    const grid = loaded.manifest.grid;
    this.#activeLoopSeconds = loopSeconds(loaded.manifest).lengthSeconds;
    // Divide the loop by its bar count rather than trusting a tempo: frames are
    // canonical, so this bar length matches the audio exactly instead of to
    // however many decimals the manifest happened to round to.
    this.#activeSecondsPerBar =
      grid.barsPerLoop > 0 && this.#activeLoopSeconds > 0
        ? this.#activeLoopSeconds / grid.barsPerLoop
        : secondsPerBar(loaded.manifest.tempo, grid.beatsPerBar);
    this.#activeBarQuantized = grid.barQuantizedCompatible !== false;
    this.#activeStartedAt = now;
    this.#active = { cueId, player, cueGain };
    this.#publishNowPlaying(cueId);

    this.#introBuffer = null;
    if (loaded.manifest.bossIntro) void this.#preloadIntro(loaded);
  }

  async #preloadIntro(loaded: LoadedCueRef): Promise<void> {
    const context = this.#context;
    const intro = loaded.manifest.bossIntro;
    if (!context || !intro) return;
    try {
      const url = new URL(`${loaded.baseUrl.replace(/\/?$/u, "/")}${intro.asset}`, document.baseURI).href;
      const bytes = await fetch(url).then((r) => r.arrayBuffer());
      this.#introBuffer = await context.decodeAudioData(bytes);
    } catch {
      this.#introBuffer = null;
    }
  }

  /** Duck the loop, play the one-shot intro once, then bring the loop back. */
  #onBossStart(): void {
    const context = this.#context;
    const active = this.#active;
    const buffer = this.#introBuffer;
    if (!context || !active || !buffer || !this.#output) return;

    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const introGain = context.createGain();
    introGain.gain.value = this.#openGain();
    source.connect(introGain);
    introGain.connect(this.#output);

    const loop = active.cueGain.gain;
    loop.cancelScheduledValues(now);
    loop.setValueAtTime(loop.value, now);
    loop.linearRampToValueAtTime(0, now + 0.3); // duck the normal loop under the latin intro

    source.start(now + 0.05);
    const duration = buffer.duration;
    // Bring the loop back as the intro tails out.
    loop.setValueAtTime(0, now + duration - 0.6);
    loop.linearRampToValueAtTime(this.#openGain(), now + duration);
    source.stop(now + duration + 0.1);
    source.onended = () => {
      source.disconnect();
      introGain.disconnect();
    };
  }
}
