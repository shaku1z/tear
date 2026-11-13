import type { GameAction } from "../../input/game-action";
import type { TutorialGoldFrame } from "./tutorial-gold-reference";

/** Facts are emitted by the real contact/transport owners, never reconstructed geometry. */
export type TutorialAttemptFact = Readonly<{ kind: "contact"; result: "slow" | "accepted"; grounded: boolean; strike?: string; targetId: string; targetKind: string }>
  | Readonly<{ kind: "recall"; result: "too-far" }>
  | Readonly<{ kind: "projectile"; event: "expired" | "deflected"; projectileId: string }>;
type Cause = "slow" | "grounded" | "recall-range" | "no-contact" | "wrong-strike" | "shot-missed" | "transfer" | "unknown";
interface FailureVariant { key: string; failures: number; cause: Cause; demoShown: boolean }
type FailureVariantData = { readonly [Key in keyof FailureVariant]: FailureVariant[Key] };
export type TutorialFailureCheckpoint = Readonly<{ version: 1; variants: readonly FailureVariantData[] }>;
export interface TutorialFailureView { readonly failures: number; readonly nudge: string | undefined; readonly assistOffered: boolean }
const causes: readonly Cause[] = ["slow", "grounded", "recall-range", "no-contact", "wrong-strike", "shot-missed", "transfer", "unknown"];
const messages: Readonly<Record<Cause, string>> = {
  slow: "Contact rejected below hit speed. Move the blade faster through the target.",
  grounded: "Grounded contact recorded. Try the strike while airborne; timing cause unknown.",
  "recall-range": "Recall refused outside tether range. Move closer before recalling.",
  "no-contact": "Action ended without accepted contact. Position or timing cause unknown.",
  "wrong-strike": "Contact accepted as a different strike. Required strike absent; direction or timing cause unknown.",
  "shot-missed": "Shot ended without a return. Early or late timing and position remain unknown.",
  transfer: "Contact repeated without new transfer progress. Follow the current launch, air-hit or return instruction.",
  unknown: "Action ended without objective progress. Cause unknown. Open help for a real example.",
};
export function parseTutorialFailures(value: unknown): TutorialFailureCheckpoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid tutorial failures");
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || Object.keys(data).some((key) => !["version", "variants"].includes(key)) || !Array.isArray(data.variants) || data.variants.length > 28) throw new TypeError("Invalid tutorial failure ledger");
  const keys = new Set<string>();
  for (const raw of data.variants as readonly unknown[]) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("Invalid tutorial failure variant");
    const entry = raw as Record<string, unknown>;
    if (Object.keys(entry).some((key) => !["key", "failures", "cause", "demoShown"].includes(key)) || typeof entry.key !== "string" || !/^(move|jump|dash|cut|launch|juggle|slam|power-slam|updraft|throw|parry|read-the-charge|field-test):(charger|mixed)$/.test(entry.key)
      || keys.has(entry.key) || typeof entry.failures !== "number" || !Number.isSafeInteger(entry.failures) || entry.failures < 0 || entry.failures > 100 || !causes.includes(entry.cause as Cause) || typeof entry.demoShown !== "boolean") throw new TypeError("Invalid tutorial failure variant");
    keys.add(entry.key);
  }
  return structuredClone(value) as TutorialFailureCheckpoint;
}

/** Bounded presentation assistance. Only a resolved relevant action can add a failure. */
export class TutorialFailureCoach {
  constructor(private readonly minimumHitSpeed: number) {}
  private variants: FailureVariant[] = [];
  private key = ""; private previous: TutorialGoldFrame | undefined; private progress: number | undefined;
  private episode: { kind: "swing" | "jump" | "dash" | "throw" | "contact"; progress: number; cause: Cause; contact: boolean; targets: string[]; shots: string[] } | undefined;
  private contacts = false; private aimRequested = false;
  private facts: TutorialAttemptFact[] = [];
  select(key: string): void { if (key !== this.key) { this.abort(); this.key = key; } }
  abort(): void { this.previous = undefined; this.episode = undefined; this.facts = []; this.progress = undefined; this.contacts = false; this.aimRequested = false; }
  fact(fact: TutorialAttemptFact): void { if (this.facts.length < 32) this.facts.push(fact); }
  private entry(): FailureVariant {
    let entry = this.variants.find((item) => item.key === this.key);
    if (!entry) { entry = { key: this.key, failures: 0, cause: "unknown", demoShown: false }; this.variants.push(entry); }
    return entry;
  }
  observe(frame: TutorialGoldFrame, commands: readonly GameAction[], progress: number, eligible: boolean, valid = false): boolean {
    if (!eligible || !this.key || frame.encounter === "breath") { this.abort(); return false; }
    const before = this.previous, lesson = this.key.split(":")[0], facts = this.facts; this.facts = [];
    const progressed = this.progress !== undefined && progress > this.progress;
    if (progressed) { const entry = this.entry(); entry.failures = Math.max(0, entry.failures - 1); if (entry.failures < 4) entry.demoShown = false; }
    if (valid) { this.episode = undefined; this.aimRequested = false; this.contacts = false; this.previous = frame; this.progress = progress; return false; }
    const contact = facts.some((fact) => fact.kind === "contact");
    const aim = commands.some((action) => action.type === "aim");
    const aimEpisode = aim || this.aimRequested;
    if (aim) this.aimRequested = true;
    const swing = before?.blade.state === "held" && frame.blade.state === "held" && frame.blade.swingId !== before.blade.swingId && this.aimRequested;
    if (swing || before && !aim && frame.blade.tipSpeed < before.blade.tipSpeed && frame.blade.tipSpeed < this.minimumHitSpeed * .45) this.aimRequested = false;
    const jump = before?.body.grounded === true && commands.some((action) => action.type === "jump" && action.phase === "pressed") && !frame.body.grounded && frame.body.vy < 0;
    const dash = before?.body.dashing === false && commands.some((action) => action.type === "dash") && frame.body.dashing;
    const thrown = before?.blade.state === "held" && frame.blade.state !== "held";
    const kind = lesson === "dash" && dash ? "dash" : lesson === "jump" && jump ? "jump"
      : lesson === "throw" && thrown ? "throw" : !["move", "jump", "dash", "throw"].includes(lesson ?? "") && swing ? "swing" : contact && aimEpisode && !this.contacts ? "contact" : undefined;
    const continuing = this.episode !== undefined;
    if (!this.episode && kind) this.episode = { kind, progress: this.progress ?? progress, cause: "unknown", contact: false, targets: [], shots: frame.projectiles.filter((shot) => !shot.dead && !shot.deflected).map((shot) => shot.id) };
    const episode = this.episode;
    if (episode) for (const fact of facts) {
      if (fact.kind === "contact") {
        episode.contact = true; if (!episode.targets.includes(fact.targetId) && episode.targets.length < 32) episode.targets.push(fact.targetId);
        const required = lesson === "slam" ? ["slam", "superslam"] : lesson === "power-slam" ? ["superslam"] : lesson === "updraft" ? ["updraft"] : lesson === "launch" ? ["launch", "updraft"] : undefined;
        episode.cause = fact.result === "slow" ? "slow" : required && fact.strike && !required.includes(fact.strike)
          ? fact.grounded && ["slam", "power-slam", "updraft"].includes(lesson ?? "") ? "grounded" : "wrong-strike"
          : lesson === "field-test" && frame.encounter === "mixed" ? "transfer" : "unknown";
      }
      if (fact.kind === "projectile" && fact.event === "expired" && episode.shots.includes(fact.projectileId) && !episode.contact) episode.cause = "shot-missed";
    }
    const recall = lesson === "throw" && facts.some((fact) => fact.kind === "recall");
    const resolved = continuing && episode && before && (episode.kind === "jump" ? !before.body.grounded && frame.body.grounded
      : episode.kind === "dash" ? before.body.dashing && !frame.body.dashing
      : episode.kind === "throw" ? frame.blade.state === "held"
      : episode.kind === "contact" ? !contact : frame.blade.tipSpeed < this.minimumHitSpeed * .45 || frame.blade.swingId !== before.blade.swingId);
    let demonstrate = false;
    if ((resolved && progress <= episode.progress && !progressed) || recall) {
      const missedShot = lesson === "parry" && before?.projectiles.some((shot) => !shot.deflected && !shot.dead && !frame.projectiles.some((next) => next.id === shot.id && !next.dead));
      const observedCause = episode?.cause ?? "unknown";
      const cause: Cause = recall ? "recall-range" : observedCause !== "unknown" ? observedCause : episode?.contact ? "unknown" : missedShot ? "shot-missed" : "no-contact";
      const entry = this.entry(); entry.failures = entry.cause === cause ? Math.min(100, entry.failures + 1) : 1; entry.cause = cause;
      if (entry.failures >= 4 && !entry.demoShown) { entry.demoShown = true; demonstrate = true; }
    }
    if (resolved || recall || progressed) this.episode = undefined;
    if (resolved && kind === "swing" && swing) this.episode = { kind, progress, cause: "unknown", contact: false, targets: [], shots: frame.projectiles.filter((shot) => !shot.dead && !shot.deflected).map((shot) => shot.id) };
    this.previous = frame; this.progress = progress; this.contacts = contact;
    return demonstrate;
  }
  view(): TutorialFailureView {
    const entry = this.variants.find((item) => item.key === this.key);
    return { failures: entry?.failures ?? 0, nudge: entry && entry.failures >= 2 ? messages[entry.cause] : undefined, assistOffered: (entry?.failures ?? 0) >= 6 };
  }
  capture(): TutorialFailureCheckpoint { return { version: 1, variants: structuredClone(this.variants) }; }
  restore(value?: TutorialFailureCheckpoint): void { this.abort(); this.variants = value ? [...parseTutorialFailures(value).variants].map((entry) => ({ ...entry })) : []; }
}
