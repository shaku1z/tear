import { canonicalStringify, stableVerificationHash } from "../replay/hash";
import { projectCareerEntry, type CareerEntry } from "./career-archive";
import { mapGhostCapsuleToReplayEnvelope } from "./capsule-replay-envelope";
import { readGhostReplayRunContext } from "./replay-admission";
import { verifyGhostCapsuleProductionReplay } from "./production-replay-verification";
import { seedRaceInitialBuildHash } from "./seed-race-contract";
import { readBeatRunBinding, type BeatRunBinding } from "../gameplay/run/beat-run";
import type { GhostReadCapsule } from "./capsule-reader";

export const BEAT_RULES = ["score", "completion-time", "survival", "damage", "same-build", "structural-subset-build", "style", "no-throw"] as const;
export type BeatRule = typeof BEAT_RULES[number];
export interface BeatPublishedSource {
  readonly capsule: string; readonly root: string; readonly manifest: string; readonly contentSha256: string;
}
export interface BeatThisRunCode {
  readonly format: "tear-beat-code"; readonly version: 1; readonly source: BeatPublishedSource;
  readonly rule: BeatRule; readonly target: number | string; readonly coverage: "native-whole-run.v1";
  readonly setup: Readonly<{ mode: string; difficulty: string; weapon: string; seed: string; boss: string; course: string; scaling: string;
    runtime: string; configuration: string; initialBuild: string; variants: string }>;
  readonly hash: string;
}
function object(v: unknown): v is Record<string, unknown> { return v !== null && typeof v === "object" && !Array.isArray(v); }
function exact(v: Record<string, unknown>, keys: string) { return Object.keys(v).sort().join() === keys.split(",").sort().join(); }
function assertCodeData(value: unknown, depth = 0): void {
  if (depth > 5) throw new TypeError("Beat code data is too deep");
  if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.length <= 32768) return;
  if (!object(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)) throw new TypeError("Beat code requires plain data");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length > 16 || Reflect.ownKeys(descriptors).some(key => typeof key !== "string")) throw new TypeError("Beat code has too many fields");
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!["__proto__", "constructor", "prototype"].includes(key) && "value" in descriptor && descriptor.enumerable) assertCodeData(descriptor.value, depth + 1);
    else throw new TypeError("Beat code requires own data fields");
  }
}
export function readBeatThisRunCode(value: unknown): BeatThisRunCode {
  assertCodeData(value);
  if (!object(value) || !exact(value, "format,version,source,rule,target,coverage,setup,hash") || value.format !== "tear-beat-code" || value.version !== 1
    || !BEAT_RULES.includes(value.rule as BeatRule) || value.coverage !== "native-whole-run.v1" || !object(value.source) || !object(value.setup)
    || !exact(value.source, "capsule,root,manifest,contentSha256") || !exact(value.setup, "mode,difficulty,weapon,seed,boss,course,scaling,runtime,configuration,initialBuild,variants")
    || typeof value.source.capsule !== "string" || !value.source.capsule || value.source.capsule.length > 256
    || [value.source.root,value.source.manifest,...["runtime","configuration","initialBuild","variants","course","scaling"].map(k => (value.setup as Record<string,unknown>)[k])].some(h => typeof h !== "string" || !/^[a-f0-9]{16}$/u.test(h))
    || typeof value.source.contentSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.source.contentSha256)
    || ["mode","difficulty","weapon","seed","boss"].some(k => typeof (value.setup as Record<string,unknown>)[k] !== "string" || !String((value.setup as Record<string,unknown>)[k]) || String((value.setup as Record<string,unknown>)[k]).length > 128)
    || !(typeof value.target === "number" && Number.isFinite(value.target) && value.target >= 0 || typeof value.target === "string" && value.target.length <= 16384)) throw new TypeError("Unsupported Beat This Run code");
  const { hash, ...data } = value;
  if (hash !== stableVerificationHash(data)) throw new TypeError("Beat This Run code integrity differs");
  const copy = structuredClone(value);
  return Object.freeze({ ...copy, source: Object.freeze({ ...(copy.source as Record<string, unknown>) }), setup: Object.freeze({ ...(copy.setup as Record<string, unknown>) }) }) as unknown as BeatThisRunCode;
}
export function encodeBeatThisRunCode(code: BeatThisRunCode): string {
  const text = canonicalStringify(readBeatThisRunCode(code));
  return "BTR1." + btoa(String.fromCharCode(...new TextEncoder().encode(text))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
export function decodeBeatThisRunCode(text: string): BeatThisRunCode {
  if (!/^BTR1\.[A-Za-z0-9_-]+$/u.test(text) || text.length > 32768) throw new TypeError("Invalid Beat This Run code");
  const raw = atob(text.slice(5).replaceAll("-", "+").replaceAll("_", "/"));
  return readBeatThisRunCode(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(raw, c => c.charCodeAt(0)))) as unknown);
}
function authority(capsule: GhostReadCapsule) {
  if (capsule.manifest.status !== "complete" || capsule.manifest.provenance?.forkOrigin !== undefined || capsule.manifest.provenance?.seedRace !== undefined
    || capsule.manifest.provenance?.finaleCompanion !== undefined) throw new TypeError("Beat requires a complete ordinary whole-run source");
  const context = readGhostReplayRunContext(capsule.manifest.provenance), mapped = mapGhostCapsuleToReplayEnvelope(capsule);
  if (!context || mapped.issues.length || verifyGhostCapsuleProductionReplay(capsule).status !== "verified") throw new TypeError("Native replay verification unavailable");
  const terminal = mapped.ghost.events.filter(event => event.source === "engine" && ["run.completed", "run.defeated", "run.abandoned"].includes(event.type));
  if (terminal.length !== 1 || terminal[0]?.payload.runId !== context.run.id) throw new TypeError("Unique source-bound native terminal unavailable");
  const entry = projectCareerEntry(capsule, true), anchor = mapped.ghost.snapshots.find(s => s.tick === 0);
  if (!anchor || entry.resumed !== false || !entry.result || entry.score === null || entry.seconds === null) throw new TypeError("Whole-run native terminal coverage unavailable");
  const boss = (anchor.state["tear.run.v1"] as Record<string, unknown>).curBoss;
  if (boss !== null && boss !== undefined && typeof boss !== "string") throw new TypeError("Native boss identity unavailable");
  return { entry, mapped, context, setup: { mode: context.run.mode, difficulty: context.run.difficulty, weapon: context.run.weaponId,
    seed: context.run.seed, boss: boss ?? "shuffle",
    scaling: stableVerificationHash(Object.fromEntries(["coinMod", "scoreMod", "diffHp", "diffCount"].map(key => [key, (anchor.state["tear.run.v1"] as Record<string,unknown>)[key]]))),
    course: stableVerificationHash({ bossOrder: (anchor.state["tear.run.v1"] as Record<string,unknown>).bossOrder, curBoss: (anchor.state["tear.run.v1"] as Record<string,unknown>).curBoss }), runtime: stableVerificationHash(context.build), configuration: stableVerificationHash(anchor.state["tear.configuration.v1"]),
    initialBuild: seedRaceInitialBuildHash(anchor.state), variants: stableVerificationHash((anchor.state["tear.run.v1"] as Record<string,unknown>).variantDiscovery ?? []) } };
}
function target(rule: BeatRule, entry: CareerEntry): number | string {
  if (rule === "score") return entry.score ?? unavailable("Native score unavailable");
  if (rule === "survival") return entry.seconds ?? unavailable("Native survival time unavailable");
  if (entry.result !== "victory") return unavailable("This goal requires a source victory");
  if (rule === "completion-time") return entry.seconds ?? unavailable("Native completion time unavailable");
  if (rule === "damage") return entry.damage ?? unavailable("Complete accepted HP-loss coverage unavailable");
  if (rule === "style") return entry.style && entry.style.rankOrdinal >= 0 ? `${entry.style.tuningHash}:${String(entry.style.rankOrdinal)}` : unavailable("Native rank catalogue/tuning unavailable");
  if (rule === "same-build" || rule === "structural-subset-build") return entry.loadout === null ? unavailable("Canonical loadout unavailable") : canonicalStringify([...entry.loadout].sort((a,b) => a.id.localeCompare(b.id)));
  return 0;
}
function unavailable(message: string): never { throw new TypeError(message); }
export function createBeatThisRunCode(capsule: GhostReadCapsule, published: BeatPublishedSource, rule: BeatRule): BeatThisRunCode {
  const a = authority(capsule);
  if (published.capsule !== capsule.manifest.id || published.root !== capsule.manifest.rootIntegrity || published.manifest !== stableVerificationHash(capsule.manifest)
    || a.entry.assisted) throw new TypeError("Published source custody or category differs");
  const data = { format: "tear-beat-code" as const, version: 1 as const, source: published, rule, target: target(rule, a.entry), coverage: "native-whole-run.v1" as const, setup: a.setup };
  return readBeatThisRunCode({ ...data, hash: stableVerificationHash(data) });
}
export function beatRunBinding(code: BeatThisRunCode): BeatRunBinding {
  return readBeatRunBinding({ format: "tear-beat-attempt", version: 1, codeHash: code.hash, source: { capsule: code.source.capsule, root: code.source.root, manifest: code.source.manifest } }) ?? unavailable("Binding unavailable");
}
export function validateBeatSource(code: BeatThisRunCode, capsule: GhostReadCapsule): void {
  if (canonicalStringify(createBeatThisRunCode(capsule, code.source, code.rule)) !== canonicalStringify(code)) throw new TypeError("Code target/setup differs from its native published source");
}
export function evaluateBeatThisRun(code: BeatThisRunCode, source: GhostReadCapsule, attempt: GhostReadCapsule) {
  validateBeatSource(code, source);
  const a = authority(attempt), binding = readBeatRunBinding(attempt.manifest.provenance?.beatThisRun);
  if (canonicalStringify(binding ?? null) !== canonicalStringify(beatRunBinding(code)) || attempt.manifest.id === source.manifest.id
    || canonicalStringify(a.setup) !== canonicalStringify(code.setup)) throw new TypeError("Attempt declaration or initial setup differs");
  const e = a.entry;
  let status: "success" | "not-met" | "abandoned" | "unavailable" = e.result === "abandoned" ? "abandoned" : "not-met", reason = e.result === "abandoned" ? "Native attempt abandoned; goal not earned" : "Native target not met";
  let actual: number | string | null = null;
  try {
    if (code.rule === "no-throw") { if (e.damage === null) throw new TypeError("Whole-run native input/event coverage unavailable"); actual = a.mapped.ghost.events.filter(event => event.source === "engine" && event.type === "blade.thrown").length; }
    else actual = target(code.rule, e);
    let met = code.rule === "score" || code.rule === "survival" ? Number(actual) > Number(code.target)
      : code.rule === "damage" || code.rule === "completion-time" ? Number(actual) < Number(code.target)
      : code.rule === "same-build" ? actual === code.target
      : code.rule === "style" ? String(actual).split(":")[0] === String(code.target).split(":")[0] && Number(String(actual).split(":")[1]) >= Number(String(code.target).split(":")[1])
      : code.rule === "no-throw" ? actual === 0 && e.result === "victory" : false;
    if (code.rule === "structural-subset-build") {
      const base = JSON.parse(String(code.target)) as NonNullable<CareerEntry["loadout"]>, owned = e.loadout;
      met = owned !== null && owned.every(item => base.some(b => b.id === item.id && b.count >= item.count && b.tier >= item.tier)) && canonicalStringify(owned) !== canonicalStringify(base);
    }
    if (status !== "abandoned" && met) { status = "success"; reason = "Native target met"; }
  } catch (error) { if (status !== "abandoned") { status = "unavailable"; reason = error instanceof Error ? error.message : "Native metric unavailable"; } }
  return Object.freeze({ format: "tear-beat-result", version: 1, codeHash: code.hash, source: code.source, attempt: Object.freeze({ capsule: attempt.manifest.id, root: attempt.manifest.rootIntegrity, manifest: stableVerificationHash(attempt.manifest) }), status, reason, actual, target: code.target, rule: code.rule });
}
