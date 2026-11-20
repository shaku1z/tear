import { asRecord } from "../../domain/records";
import { stableVerificationHash } from "../../domain/hash";
import { parseFinaleBinding } from "../campaign/finale-binding";
import type { TearCodecWorld, TearCodecIssue } from "./state-codec";

/** Retired Source geometry remains run-owned data, never additional collision actors. */
export function sourceVoidHistoryReferences(
  world: TearCodecWorld,
): Readonly<{ local: ReadonlySet<string>; issues: readonly TearCodecIssue[] }> {
  const local = new Set<string>(),
    issues: TearCodecIssue[] = [];
  const run = asRecord(world.components.get("tear.run.v1")),
    runtime = asRecord(asRecord(world.components.get("tear.world.v1"))?.runtime);
  const stream = asRecord(run?.voidScroll),
    lifecycle = asRecord(runtime?.lifecycle);
  // Frozen descent/intro geometry is still installed. Only the actual finale
  // restoration owner has replaced it with stage-zero collision platforms.
  if (
    run?.mode !== "campaign" ||
    run.stage !== 0 ||
    stream?.active !== false ||
    stream.frozen !== true ||
    stream.forming !== false ||
    run.voidDescent !== null ||
    lifecycle?.phase !== "finale"
  )
    return { local, issues };
  let restored = false;
  try {
    const binding = parseFinaleBinding(runtime?.finaleBinding);
    restored =
      binding.state.restoring &&
      binding.state.severed === 3 &&
      ["restoration", "epilogue", "reward"].includes(binding.state.phase);
  } catch {
    /* Existing binding validation reports malformed behavior. */
  }
  if (!restored) return { local, issues };
  const root = "$.voidScroll";
  function fail(message: string): never {
    throw new TypeError(message);
  }
  const array = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : fail("Source history collection is missing");
  const generator = asRecord(stream.generator);
  try {
    if (
      generator?.version !== 2 ||
      !Number.isSafeInteger(generator.seed) ||
      Number(generator.seed) < 1 ||
      Number(generator.seed) > 0xffffffff
    )
      fail("Source history generator identity is invalid");
    const prefix = `void:${Number(generator.seed).toString(16).padStart(8, "0")}:`;
    const platform = (value: unknown): Record<string, unknown> => {
      const p = asRecord(value);
      if (
        p === undefined ||
        typeof p.id !== "string" ||
        p.platformId !== p.id ||
        !p.id.startsWith(prefix) ||
        p.void !== true ||
        !["lower", "upper"].includes(String(p.voidLane)) ||
        !Number.isSafeInteger(p.chunkId) ||
        ["x", "y", "w", "h"].some((key) => typeof p[key] !== "number" || !Number.isFinite(p[key])) ||
        Number(p.w) <= 0 ||
        Number(p.h) <= 0
      )
        fail("Source history platform alias is invalid");
      return p;
    };
    const register = (path: string) => {
      local.add(`tear.run.v1:${path}.platformId`);
    };
    const roster = new Map<string, Record<string, unknown>>();
    for (const [index, value] of array(stream.platforms).entries()) {
      const p = platform(value),
        id = String(p.id);
      if (roster.has(id)) fail("Source history platform identity is ambiguous");
      roster.set(id, p);
      register(`${root}.platforms[${String(index)}]`);
    }
    const alias = (value: unknown, path: string, records: ReadonlyMap<string, Record<string, unknown>>) => {
      const p = platform(value),
        expected = records.get(String(p.id));
      if (expected === undefined || stableVerificationHash(p) !== stableVerificationHash(expected))
        fail("Source history alias is unknown or conflicting");
      register(path);
    };
    const chunks = (values: unknown, path: string, live: boolean) => {
      const chunkIds = new Set<number>(),
        used = new Set<string>();
      for (const [index, value] of array(values).entries()) {
        const chunk = asRecord(value),
          chunkPath = `${path}[${String(index)}]`;
        if (chunk === undefined || !Number.isSafeInteger(chunk.chunkId) || chunkIds.has(Number(chunk.chunkId)))
          fail("Source history chunk identity is ambiguous");
        chunkIds.add(Number(chunk.chunkId));
        const records = new Map<string, Record<string, unknown>>();
        for (const [at, item] of array(chunk.platforms).entries()) {
          const p = platform(item),
            id = String(p.id),
            pPath = `${chunkPath}.platforms[${String(at)}]`;
          if (p.chunkId !== chunk.chunkId || records.has(id)) fail("Source history chunk platform identity conflicts");
          records.set(id, p);
          used.add(id);
          if (live) alias(p, pPath, roster);
          else register(pPath);
        }
        const lanes = asRecord(chunk.lanes);
        for (const lane of ["lower", "upper"])
          for (const [at, p] of array(lanes?.[lane]).entries()) {
            if (asRecord(p)?.voidLane !== lane) fail("Source history lane alias conflicts");
            alias(p, `${chunkPath}.lanes.${lane}[${String(at)}]`, records);
          }
        if (
          chunk.rescuePlatformId !== null &&
          (typeof chunk.rescuePlatformId !== "string" || !records.has(chunk.rescuePlatformId))
        )
          fail("Source history rescue alias is unknown");
      }
      return used;
    };
    const used = chunks(stream.chunks, `${root}.chunks`, true);
    const ingress = platform(stream.ingress);
    if (ingress.id !== `${prefix}ingress` || ingress.chunkId !== -1 || ingress.voidId !== "ingress")
      fail("Source history ingress alias conflicts");
    if (roster.has(ingress.id)) alias(ingress, `${root}.ingress`, roster);
    else register(`${root}.ingress`);
    if ([...roster.keys()].some((id) => !used.has(id))) fail("Source history platform has no retained chunk");
    // Recent generator chunks are authored metadata, before materialization and
    // conveyor shifts. Their lane aliases resolve inside their own full chunk.
    chunks(generator.recentChunks, `${root}.generator.recentChunks`, false);
    for (const [index, p] of array(stream.arrivalQueue).entries())
      alias(p, `${root}.arrivalQueue[${String(index)}]`, roster);
  } catch (error) {
    local.clear();
    issues.push({
      codecId: "tear.run.v1",
      path: root,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return { local, issues };
}
