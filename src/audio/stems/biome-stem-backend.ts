import { progressFacts, type ProgressSource } from "../../domain/progress-facts";
import { unwrapBrowserAudioContext, unwrapBrowserAudioNode } from "../browser-audio";
import type { TemporaryMuteReason } from "../mixer";
import type {
  MusicBackend,
  MusicBackendHost,
  MusicContextSnapshot,
  MusicEvent,
  MusicReplayMetadata,
  MusicRunSessionMetadata,
  MusicScene,
} from "../music-contracts";
import { isMusicShell } from "../music-contracts";
import { applyMusicMode, onMusicModeChange } from "../music-mode";
import { setNowPlaying } from "../music/now-playing";
import { getMusicPreview, onMusicPreviewChange } from "../music/preview";
import {
  DEFAULT_MUSIC_SOURCE,
  getMusicSource,
  heardSource,
  musicUnlocked,
  onMusicSourceChange,
  onNextSongRequest,
  pickPlaysInRun,
  playerChannels,
  type MusicSource,
} from "../music/music-source";
import type { MusicLibrary } from "../music/library";
import { advance, currentSong, radioPlaySeconds, tuneIn, type RadioState } from "../music/radio";
import type { MusicCatalog } from "../music/catalog";
import { StingerPlayer } from "../music/stingers";
import { nextBoundaryTime, secondsPerBar } from "../music/quantize";
import { resolveMusicRoute } from "../music/music-routing-resolver";
import type { MusicRoutingManifest, RoutingScene } from "../music/music-routing-types";
import { StemCuePlayer } from "./StemCuePlayer";
import { loopSeconds, planTierGains } from "./tier";
import { tierFromSnapshot } from "./tier-from-snapshot";
import { WebAudioStemBackend, dropWarmedStems, warmStem } from "./web-audio-backend";
import type { StemCueManifest, Tier } from "./types";

export interface LoadedCueRef {
  readonly id: string;
  readonly manifest: StemCueManifest & {
    readonly bossIntro?: { readonly asset: string; readonly lengthSeconds: number };
    readonly openingIntro?: { readonly asset: string; readonly lengthSeconds: number };
  };
  readonly baseUrl: string;
}

interface ActiveCue {
  readonly cueId: string;
  readonly player: StemCuePlayer;
  readonly cueGain: GainNode;
  /** The opening intro, while it is still scheduled or sounding. */
  intro: AudioBufferSourceNode | null;
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
  readonly #routing: MusicRoutingManifest;
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
  #stopSourceWatch: (() => void) | null = null;
  #stopNextWatch: (() => void) | null = null;
  #stopPreviewWatch: (() => void) | null = null;
  /** While paused, ignore the user's music mode and use the adaptive tier. */
  #modeExempt = false;
  #catalog: MusicCatalog | null = null;
  #lastBossId: string | null = null;
  /** The channel being played while the pick is a Radio channel; null otherwise. */
  #radio: RadioState | null = null;
  /** When the Radio moves to its next song: one timer, never per-frame work. */
  #radioTimer: ReturnType<typeof setTimeout> | null = null;
  /** The player's pick as they can hear it, read again by `#retune`. */
  #pick: MusicSource = DEFAULT_MUSIC_SOURCE;
  /** Picks from a routing pool (the Verdant Sanctum's two songs) come from the run's seed. */
  #routeSeed = 1;
  /** Saved progress at run start; null outside a run and in runs that must sound the same for everyone. */
  #progress: ProgressSource | null = null;
  /** Cues whose opening intro has played this run: it plays once, not after every boss. */
  readonly #introduced = new Set<string>();
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
  #lastScene: MusicScene = "main-menu";

  /** The songs and Radio channels the pick is read against; null plays every pick as the default. */
  readonly #library: MusicLibrary | null;

  constructor(
    cues: readonly LoadedCueRef[],
    routing: MusicRoutingManifest,
    catalog: MusicCatalog | null = null,
    library: MusicLibrary | null = null,
  ) {
    this.#catalog = catalog;
    this.#library = library;
    for (const cue of cues) this.#cues.set(cue.id, cue);
    this.#routing = routing;
    this.#defaultCueId = routing.defaultWorkId;
  }

  async initialize(host: MusicBackendHost): Promise<void> {
    this.#context = unwrapBrowserAudioContext(host.context);
    this.#output = unwrapBrowserAudioNode(host.output);
    // React immediately when the player changes the music mode in settings.
    this.#stopModeWatch = onMusicModeChange(() => {
      this.#applyTier(0.5);
    });
    // A new pick (or newly found songs) re-tunes the Radio and re-routes both slots; a preview
    // only ever changes the menu slot.
    this.#stopSourceWatch = onMusicSourceChange(() => {
      this.#retune();
      this.#reroute();
    });
    this.#stopNextWatch = onNextSongRequest(() => this.#nextOnRadio());
    this.#stopPreviewWatch = onMusicPreviewChange(() => {
      if (this.#onShell) this.#reroute();
    });
    this.#retune();
    this.#stingers = new StingerPlayer(this.#context, this.#output);
    void this.#stingers.load();
    await this.#activate(this.#shellCueId(), CROSSFADE_SECONDS, 0, true);
    // The first cue has taken what it needs; warmed bytes for anything else are let go.
    void (this.#active?.player.allLoaded ?? Promise.resolve()).then(dropWarmedStems, dropWarmedStems);
  }

  /** The cue the menu would start with. */
  get menuCueId(): string {
    return this.#shellCueId();
  }

  /**
   * Fetch the bytes of a cue's first layer (the stems audible at its calmest tier) ahead of
   * playback: the menu cue, before the player's first input. Once music has started (the
   * first input came first), the cue fetches its own stems, and a warm-up would only fetch
   * them a second time alongside it, so it does nothing.
   */
  warmFirstLayer(cueId: string): void {
    if (this.#context !== null) return;
    const loaded = this.#cues.get(cueId);
    if (!loaded) return;
    const audible = new Set(
      Object.entries(planTierGains(loaded.manifest, 0))
        .filter(([, gain]) => gain > 0)
        .map(([id]) => id),
    );
    for (const asset of loaded.manifest.stems) if (audible.has(asset.id)) warmStem(loaded.baseUrl, asset);
  }

  beginRun(metadata: MusicRunSessionMetadata): Promise<void> {
    // Same run seed, same song: replays and seed-locked races hear what the run heard.
    this.#routeSeed = routeSeedFromRunSeed(metadata.runSeed);
    this.#progress = metadata.progress ?? null;
    this.#retune();
    this.#introduced.clear();
    return Promise.resolve();
  }

  updateContext(snapshot: MusicContextSnapshot): void {
    // "settings"/"shop"/etc. all resolve to the main-menu scene, so scene alone
    // would hand the menu track over mid-run. A live run always reports a biome.
    const wasShell = this.#onShell;
    this.#onShell = isMusicShell(snapshot.scene, snapshot.biomeId);
    this.#lastBiomeId = snapshot.biomeId;
    this.#lastScene = snapshot.scene;
    this.#lastBossId = snapshot.bossId;
    const cueId = this.#routeCueId(snapshot.biomeId, snapshot.scene);
    if (cueId !== this.#active?.cueId) {
      // Entering or leaving the menu is a UI swap; keep it snappy.
      const menuSwap = this.#onShell || wasShell;
      void this.#activate(cueId, menuSwap ? MENU_CROSSFADE_SECONDS : CROSSFADE_SECONDS, menuSwap ? 0 : QUANTIZE_BARS);
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
    this.#progress = null;
    // The run may have found songs: a pick that could not be heard before may be heard now.
    this.#retune();
    this.#introduced.clear();
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
    this.#stopSourceWatch?.();
    this.#stopSourceWatch = null;
    this.#stopNextWatch?.();
    this.#stopNextWatch = null;
    this.#stopPreviewWatch?.();
    this.#stopPreviewWatch = null;
    this.#clearRadioTimer();
    this.#radio = null;
    this.#stingers?.dispose();
    this.#stingers = null;
    if (this.#active) {
      stopIntro(this.#active);
      this.#active.player.unload();
      this.#active.cueGain.disconnect();
      this.#active = null;
    }
    return Promise.resolve();
  }

  /** Cue for the menu slot: a MUSIC-screen preview, else the player's pick, else the menu default. */
  #shellCueId(): string {
    const preview = getMusicPreview();
    if (preview !== null && this.#cues.has(preview)) return preview;
    return this.#pickCueId() ?? this.#defaultCueId;
  }

  /** The cue the player's pick plays now, or null when the pick is the default. Cheap: read every snapshot. */
  #pickCueId(): string | null {
    const source = this.#pick;
    const cueId =
      source.kind === "song"
        ? source.workId
        : source.kind === "channel" && this.#radio
          ? currentSong(this.#radio)
          : null;
    return cueId !== null && this.#cues.has(cueId) ? cueId : null;
  }

  /** The songs a channel plays for this player, among the cues this build has. */
  #channelSongIds(library: MusicLibrary, channelId: string): readonly string[] {
    const tuned = playerChannels(library).find(({ channel }) => channel.id === channelId);
    return (tuned?.songs ?? []).map((song) => song.id).filter((id) => this.#cues.has(id));
  }

  /**
   * Read the pick again and follow it: tune in to a newly picked channel, or stop the Radio when the
   * pick is not one. Runs when the pick changes and when a run begins or ends (when found songs can
   * change), never per snapshot.
   */
  #retune(): void {
    this.#pick = heardSource(getMusicSource(), this.#library);
    const source = this.#pick;
    const library = this.#library;
    if (source.kind !== "channel" || library === null) {
      this.#clearRadioTimer();
      this.#radio = null;
      return;
    }
    if (this.#radio?.channelId === source.channelId) return;
    const songs = this.#channelSongIds(library, source.channelId);
    this.#radio = songs.length > 0 ? tuneIn(source.channelId, songs, true, Date.now() >>> 0) : null;
    this.#scheduleRadio();
  }

  /** The Radio's next song: when its time is up, or when the player asks for the next one. */
  #nextOnRadio(): void {
    const library = this.#library;
    if (!this.#radio || library === null) return;
    this.#radio = advance(this.#radio, this.#channelSongIds(library, this.#radio.channelId));
    this.#scheduleRadio();
    this.#reroute();
  }

  /** One timer for the song playing on the Radio: its length rounded to whole loops. */
  #scheduleRadio(): void {
    this.#clearRadioTimer();
    const song = this.#radio ? currentSong(this.#radio) : null;
    const cue = song === null ? undefined : this.#cues.get(song);
    if (!cue || this.#library === null) return;
    const seconds = radioPlaySeconds(loopSeconds(cue.manifest).lengthSeconds, this.#library.radio.songSeconds);
    this.#radioTimer = setTimeout(() => this.#nextOnRadio(), seconds * 1000);
  }

  #clearRadioTimer(): void {
    if (this.#radioTimer !== null) clearTimeout(this.#radioTimer);
    this.#radioTimer = null;
  }

  /** Play what the current place and the pick call for, if it is not already playing. */
  #reroute(): void {
    const next = this.#routeCueId(this.#lastBiomeId, this.#lastScene);
    if (next === this.#active?.cueId) return;
    if (this.#onShell) void this.#activate(next, MENU_CROSSFADE_SECONDS);
    else void this.#activate(next, CROSSFADE_SECONDS, QUANTIZE_BARS);
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

  /** Canonical (biome/menu) routing: what plays with the default pick. */
  #canonicalCueId(biomeId: string, scene: MusicScene): string {
    if (isMusicShell(scene, biomeId)) return this.#shellCueId();
    const routeScene: RoutingScene =
      scene === "boss" ? "boss" : scene === "victory" || scene === "defeat" ? scene : "gameplay";
    const routed = resolveMusicRoute(
      this.#routing,
      {
        biomeId,
        scene: routeScene,
        bossId: this.#lastBossId,
        ...musicProgressRouting(this.#progress, this.#catalog, biomeId),
      },
      this.#routeSeed,
    );
    return this.#cues.has(routed) ? routed : this.#defaultCueId;
  }

  /**
   * Which cue plays. Menus play the menu slot. In a run the player's pick plays where
   * `pickPlaysInRun` allows it, and the canonical cue plays everywhere else; the pick comes back
   * after a boss. With the default pick, runs route exactly as they do without one.
   */
  #routeCueId(biomeId: string, scene: MusicScene): string {
    if (isMusicShell(scene, biomeId)) return this.#shellCueId();
    const canonical = this.#canonicalCueId(biomeId, scene);
    if (!pickPlaysInRun(scene)) return canonical;
    return this.#pickCueId() ?? canonical;
  }

  /** Publish what is sounding so the Music UI can show it. */
  #publishNowPlaying(cueId: string): void {
    const work = this.#catalog?.works.find((w) => w.id === cueId);
    const channelId = this.#radio && currentSong(this.#radio) === cueId ? this.#radio.channelId : null;
    const channel = this.#library?.radio.channels.find((entry) => entry.id === channelId) ?? null;
    setNowPlaying({
      workId: cueId,
      title: work?.title ?? cueId,
      channelId: channel?.id ?? null,
      channelName: channel?.name ?? null,
      tier: this.#tier,
    });
  }

  async #activate(
    cueId: string,
    fadeSeconds: number = CROSSFADE_SECONDS,
    quantizeBars = 0,
    fastStart = false,
  ): Promise<void> {
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
    // The first cue of the session starts as soon as its calmest layer (the
    // stems tier 0 plays) has arrived; the others fade in, in phase, as they
    // land. Later swaps load everything while the outgoing cue keeps playing.
    const first = fastStart
      ? Object.entries(planTierGains(loaded.manifest, 0))
          .filter(([, gain]) => gain > 0)
          .map(([id]) => id)
      : [];
    const opening = loaded.manifest.openingIntro;
    const playOpening = opening !== undefined && !this.#introduced.has(cueId);
    const [, openingBuffer] = await Promise.all([
      player.load(loaded.manifest, backend, first.length > 0 ? { first } : {}),
      playOpening ? this.#decode(loaded, opening.asset) : Promise.resolve(null),
    ]);
    if (token !== this.#switchToken) {
      player.unload();
      cueGain.disconnect();
      return; // superseded by a newer biome change
    }
    this.#pendingCueId = null;

    // Land the swap on a musical boundary when asked; otherwise go immediately.
    const at = quantizeBars > 0 ? this.#nextBoundary(quantizeBars) : context.currentTime + 0.15;
    const lead = Math.max(0.05, at - context.currentTime);
    // An opening intro plays first; the loop starts as it ends, on the phrase line it was cut to.
    let intro: AudioBufferSourceNode | null = null;
    let introSeconds = 0;
    if (openingBuffer) {
      intro = context.createBufferSource();
      intro.buffer = openingBuffer;
      intro.connect(cueGain);
      intro.start(context.currentTime + lead);
      introSeconds = openingBuffer.duration;
      this.#introduced.add(cueId);
      const source = intro;
      source.onended = () => {
        source.disconnect();
        if (this.#active?.intro === source) this.#active.intro = null;
      };
    }
    player.start({ leadSeconds: lead + introSeconds });
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
        stopIntro(previous);
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
    this.#activeStartedAt = now + introSeconds;
    this.#active = { cueId, player, cueGain, intro };
    this.#publishNowPlaying(cueId);

    this.#introBuffer = null;
    if (loaded.manifest.bossIntro) void this.#preloadIntro(loaded);
  }

  async #preloadIntro(loaded: LoadedCueRef): Promise<void> {
    const intro = loaded.manifest.bossIntro;
    if (intro) this.#introBuffer = await this.#decode(loaded, intro.asset);
  }

  /** Fetch and decode one of a cue's one-shot assets; null when it cannot be had. */
  async #decode(loaded: LoadedCueRef, asset: string): Promise<AudioBuffer | null> {
    const context = this.#context;
    if (!context) return null;
    try {
      const url = new URL(`${loaded.baseUrl.replace(/\/?$/u, "/")}${asset}`, document.baseURI).href;
      const bytes = await fetch(url).then((r) => r.arrayBuffer());
      return await context.decodeAudioData(bytes);
    } catch {
      return null;
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

function stopIntro(cue: ActiveCue): void {
  try {
    cue.intro?.stop();
  } catch {
    // Already stopped.
  }
  cue.intro = null;
}

/**
 * What saved progress means for routing in one biome: is this the player's first run that
 * reached it, and which works are unlocked. No progress: neither.
 */
export function musicProgressRouting(
  progress: ProgressSource | null,
  catalog: MusicCatalog | null,
  biomeId: string,
): { readonly firstRun: boolean; readonly isUnlocked: (workId: string) => boolean } {
  if (!progress) return { firstRun: false, isUnlocked: () => false };
  const facts = progressFacts(progress);
  return {
    firstRun: !facts.biomeEntered(biomeId),
    isUnlocked: (workId) => {
      const unlock = catalog?.works.find((work) => work.id === workId)?.unlock;
      return unlock !== undefined && musicUnlocked(unlock, facts);
    },
  };
}

/** FNV-1a over the run seed's text: a stable 32-bit number for the routing pool. */
export function routeSeedFromRunSeed(runSeed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < runSeed.length; index += 1) {
    hash ^= runSeed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
