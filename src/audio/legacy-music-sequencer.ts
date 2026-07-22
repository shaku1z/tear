import type { LegacyMusicSynthHost } from "./legacy-synth-contracts";

interface LegacyMusicTheme {
  readonly bpm: number;
  readonly root: number;
  readonly kick: readonly number[];
  readonly hat: readonly number[];
  readonly hatFreq: number;
  readonly bass: readonly number[];
  readonly bassType: OscillatorType;
  readonly bassVol: number;
  readonly lead: readonly number[];
  readonly leadType: OscillatorType;
  readonly leadVol: number;
}

function pattern(...indices: number[]): readonly number[] {
  const values = new Array<number>(16).fill(0);
  for (const index of indices) values[index] = 1;
  return values;
}

export const LEGACY_MUSIC_THEMES: Readonly<Record<string, LegacyMusicTheme>> = Object.freeze({
  menu: { bpm: 118, root: 110, kick: pattern(0, 4, 8, 12), hat: pattern(1, 3, 5, 7, 9, 11, 13, 15), hatFreq: 8000,
    bass: [0, 0, 7, 0, 5, 5, 3, 5, 0, 0, 7, 0, 8, 8, 7, 5], bassType: "triangle", bassVol: 0.16,
    lead: [12, -1, -1, -1, 15, -1, -1, 12, -1, -1, 19, -1, 17, -1, 15, -1], leadType: "sine", leadVol: 0.06 },
  "The Grounds": { bpm: 112, root: 130.81, kick: pattern(0, 4, 8, 12), hat: pattern(3, 7, 11, 15), hatFreq: 9000,
    bass: [0, 0, 4, 0, 5, 5, 7, 5, 0, 0, 4, 0, 2, 2, 5, 7], bassType: "triangle", bassVol: 0.15,
    lead: [12, -1, -1, 16, -1, -1, 19, -1, -1, -1, 16, -1, 12, -1, -1, -1], leadType: "sine", leadVol: 0.055 },
  "The Undercroft": { bpm: 100, root: 98, kick: pattern(0, 6, 8, 14), hat: pattern(2, 5, 10, 13), hatFreq: 10500,
    bass: [0, -1, 1, 0, -1, 3, -1, 0, 0, -1, 1, 0, 7, -1, 5, 3], bassType: "sawtooth", bassVol: 0.12,
    lead: [-1, -1, 12, -1, -1, -1, -1, -1, -1, 13, -1, -1, -1, -1, 12, -1], leadType: "square", leadVol: 0.035 },
  "The Crimson Fields": { bpm: 126, root: 110, kick: pattern(0, 4, 8, 10, 12), hat: pattern(2, 6, 10, 14), hatFreq: 7500,
    bass: [0, 0, 7, 7, 0, 0, 8, 8, 0, 0, 7, 7, 10, 10, 8, 7], bassType: "triangle", bassVol: 0.17,
    lead: [12, -1, 15, -1, 12, -1, 10, -1, 12, -1, 15, 17, 15, -1, 12, -1], leadType: "sawtooth", leadVol: 0.04 },
  "The Voidspire": { bpm: 108, root: 146.83, kick: pattern(0, 8), hat: pattern(1, 5, 9, 13), hatFreq: 8600,
    bass: [0, -1, -1, 0, -1, -1, 5, -1, 3, -1, -1, 3, -1, -1, 7, -1], bassType: "triangle", bassVol: 0.14,
    lead: [12, 16, 19, 22, 24, 22, 19, 16, 12, 15, 19, 21, 24, 21, 19, 15], leadType: "sine", leadVol: 0.045 },
  "The Tear": { bpm: 88, root: 82.41, kick: pattern(0, 8), hat: pattern(7, 15), hatFreq: 11000,
    bass: [0, -1, -1, 0, -1, -1, 0, -1, -2, -1, -1, -2, -1, -1, 0, -1], bassType: "triangle", bassVol: 0.18,
    lead: [-1, -1, -1, -1, 12, -1, -1, -1, -1, -1, -1, -1, 19, -1, -1, -1], leadType: "sine", leadVol: 0.05 },
});

export class LegacyMusicSequencer {
  readonly #host: LegacyMusicSynthHost;
  #timer: ReturnType<typeof setInterval> | null = null;
  #step = 0;
  #next = 0;
  #themeName = "menu";
  #boss = false;
  #pending: { readonly key: string; readonly boss: boolean } | null = null;

  constructor(host: LegacyMusicSynthHost) { this.#host = host; }

  debugSnapshot(): Readonly<{ running: boolean; theme: string; boss: boolean; pending: boolean }> {
    return Object.freeze({
      running: this.#timer !== null,
      theme: this.#themeName,
      boss: this.#boss,
      pending: this.#pending !== null,
    });
  }

  setTheme(name: string, boss: boolean): void {
    const key = LEGACY_MUSIC_THEMES[name] === undefined ? "menu" : name;
    if (key === this.#themeName && boss === this.#boss && this.#pending === null) return;
    if (this.#pending?.key === key && this.#pending.boss === boss) return;
    if (key === this.#themeName && boss === this.#boss) { this.#pending = null; return; }
    this.#pending = { key, boss };
  }

  start(): void {
    if (this.#timer !== null) return;
    const context = this.#host.context();
    if (context === null) return;
    this.#step = 0;
    this.#next = context.currentTime + 0.15;
    this.#timer = setInterval(() => { this.#schedule(); }, 25);
  }

  stop(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
  }

  #activeTheme(): LegacyMusicTheme {
    const theme = LEGACY_MUSIC_THEMES[this.#themeName] ?? LEGACY_MUSIC_THEMES.menu;
    if (theme === undefined) throw new Error("Legacy menu music theme is unavailable");
    return theme;
  }

  #schedule(): void {
    const context = this.#host.context();
    if (context === null) return;
    while (this.#next < context.currentTime + 0.13) {
      const step = this.#step % 16;
      if (step === 0 && this.#pending !== null) {
        this.#themeName = this.#pending.key; this.#boss = this.#pending.boss; this.#pending = null;
      }
      this.#beat(step, this.#next);
      const theme = this.#activeTheme();
      this.#step++;
      this.#next += 30 / (theme.bpm + (this.#boss ? 10 : 0));
    }
  }

  #beat(index: number, time: number): void {
    const theme = this.#activeTheme(), output = this.#host.output(), boss = this.#boss;
    if (output === null) return;
    const voidMix = this.#host.voidMix() || 0;
    const semitones = (note: number) => theme.root * Math.pow(2, note / 12);
    if (theme.kick[index]) this.#kick(time, 0.22 * (1 - voidMix * 0.9), output);
    else if (boss && index % 4 === 2) this.#kick(time, 0.13 * (1 - voidMix * 0.9), output);
    if ((theme.hat[index] || (boss && index % 2 === 1)) && voidMix < 0.92) {
      this.#host.noise(0.04, time, { type: "highpass", freq: theme.hatFreq || 8000, q: 0.6,
        vol: (index % 4 === 3 ? 0.05 : 0.03) * (boss ? 1.3 : 1) * (1 - voidMix), dest: output });
    }
    let bass = theme.bass[index] ?? -1;
    if (bass === -1 && boss) { const alternate = theme.bass[(index + 8) % 16] ?? -1; bass = alternate === -1 ? 0 : alternate; }
    if (bass !== -1) {
      this.#host.oscillator(semitones(bass) / 2, 0.26, time, { type: theme.bassType, vol: theme.bassVol * (boss ? 1.25 : 1), dest: output });
      if (boss && index % 4 === 2) this.#host.oscillator(semitones(bass + 12) / 2, 0.13, time,
        { type: theme.bassType, vol: theme.bassVol * 0.5, dest: output });
    }
    let lead = theme.lead[index] ?? -1;
    if (lead < 0 && boss && index % 2 === 0) { const previous = theme.lead[(index + 14) % 16] ?? -1; if (previous >= 0) lead = previous; }
    if (lead >= 0) this.#host.oscillator(semitones(lead), 0.42, time,
      { type: theme.leadType, vol: theme.leadVol * (boss ? 1.35 : 1), attack: 0.02, dest: output });
  }

  #kick(time: number, volume: number, output: AudioNode): void {
    const context = this.#host.context();
    if (context === null) return;
    const oscillator = context.createOscillator(), gain = context.createGain();
    if (!this.#host.trackSource(oscillator, [gain])) {
      oscillator.disconnect();
      gain.disconnect();
      return;
    }
    oscillator.type = "sine"; oscillator.frequency.setValueAtTime(130, time);
    oscillator.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    gain.gain.setValueAtTime(volume, time); gain.gain.exponentialRampToValueAtTime(0.0006, time + 0.16);
    oscillator.connect(gain).connect(output); oscillator.start(time); oscillator.stop(time + 0.18);
  }
}
