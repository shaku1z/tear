import { readSeedRaceRun } from "./seed-race-contract";
import { stableVerificationHash } from "../replay/hash";
import { readGhostReplayRunContext } from "./replay-admission";
import { projectGhostRunDnaTheater } from "./run-dna-theater";
import type { GhostReadCapsule } from "./capsule-reader";
import type { TearGhostManifest } from "./capsule-vault";

export const CAREER_VERSION = "career-native-v1";
export const CAREER_FILTERS = [
  "date",
  "mode",
  "difficulty",
  "weapon",
  "wave",
  "result",
  "archetype",
  "ability",
  "boss",
  "score",
  "damage",
  "verified",
  "actor",
  "tags",
  "pinned",
  "shared",
  "resumed",
  "version",
] as const;
export const CAREER_VIEWS = [
  "history",
  "personal-best",
  "first-clear",
  "best-weapon",
  "boss-change",
  "favorite-builds",
  "near-miss",
  "style-milestones",
  "longest-survival",
  "dna-evolution",
] as const;
export type CareerView = (typeof CAREER_VIEWS)[number];
export type CareerRetention = "recent" | "temporary" | "pinned" | "milestone" | "diagnostic" | "imported";
export interface CareerNotes {
  readonly revision: number;
  readonly tags: readonly string[];
  readonly retention: CareerRetention;
}
export interface CareerWitness {
  readonly format: "tearghost-career-witness";
  readonly version: 1;
  readonly kind: "coverage" | "style" | "terminal" | "boss";
  readonly sessionId: string;
  readonly runId: string;
  readonly tick: number;
  readonly data: Readonly<Record<string, unknown>>;
}
export interface CareerEntry {
  readonly beatAttempt?: boolean;
  readonly assisted?: boolean;
  readonly seedRaceRole?: "reference" | "challenger";
  readonly kind: "capsule" | "legacy-visual";
  readonly version: typeof CAREER_VERSION;
  readonly id: string;
  readonly root: string;
  readonly manifestHash: string;
  readonly date: string;
  readonly epoch: number | null;
  readonly mode: string | null;
  readonly difficulty: string | null;
  readonly weapon: string | null;
  readonly wave: number | null;
  readonly result: string | null;
  readonly score: number | null;
  readonly seconds: number | null;
  readonly categories: readonly string[] | null;
  readonly composition: Readonly<Record<string, number>> | null;
  readonly loadout: readonly Readonly<{ id: string; count: number; tier: number }>[] | null;
  readonly catalogHash: string;
  readonly abilities: readonly string[] | null;
  readonly bosses: readonly string[] | null;
  readonly damage: number | null;
  readonly verified: "integrity" | "receipts" | "unavailable";
  readonly actor: "human" | "bot" | "unknown";
  readonly shared: boolean | null;
  readonly sharing: "public" | "unlisted" | "private" | "queued" | "unknown";
  readonly resumed: boolean | null;
  readonly gameVersion: string | null;
  readonly build: string | null;
  readonly dna: Readonly<Record<string, number>>;
  readonly nearMiss:
    readonly Readonly<{ id: string; boss: string; hp: number; maxHp: number; phase: number; tick: number }>[] | null;
  readonly style: Readonly<{
    techniques: readonly string[];
    combo: number;
    multiplier: number;
    rank: string;
    rankOrdinal: number;
    tuningHash: string;
  }> | null;
  readonly bossClears: readonly Readonly<{ key: string; boss: string; ticks: number; spawn: string; defeat: string }>[];
  readonly witnesses: readonly string[];
  readonly unavailable: readonly string[];
  readonly enriched: boolean;
  readonly present: boolean;
}
export interface CareerUsage {
  readonly recordedChunkBytes: number;
  readonly protectedChunkBytes: number;
  readonly browserQuota: number | null;
  readonly browserUsage: number | null;
  readonly pendingBytes: null;
  readonly profileBytes: null;
  readonly assetCacheBytes: null;
  readonly analysisCacheBytes: null;
}
export interface CareerRow {
  readonly entry: CareerEntry;
  readonly notes: CareerNotes;
  readonly detail?: string;
  readonly group?: string;
}
export const careerRowKey = (row: CareerRow): string =>
  `career:v1:${encodeURIComponent(row.entry.id)}:${row.entry.root}${row.group ? `#${encodeURIComponent(row.group)}` : ""}`;
export interface CareerQuery {
  readonly text: string;
  readonly filters: Partial<Record<(typeof CAREER_FILTERS)[number], string>>;
  readonly view: CareerView;
  readonly sort: "newest" | "oldest" | "score";
  readonly page: number;
}
export const emptyCareerQuery = (): CareerQuery => ({
  text: "",
  filters: {},
  view: "history",
  sort: "newest",
  page: 0,
});
export const defaultCareerNotes = (): CareerNotes => ({ revision: 0, tags: [], retention: "recent" });
export const careerObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function provisionalCareerEntry(manifest: TearGhostManifest): CareerEntry {
  let context;
  try {
    context = readGhostReplayRunContext(manifest.provenance);
  } catch {
    /* Preserve the metadata row. */
  }
  const actor = manifest.provenance?.actor;
  let race;
  try {
    race = readSeedRaceRun(manifest.provenance?.seedRace);
  } catch {
    /* Invalid declarations remain unavailable, never ordinary bests. */
  }
  return Object.freeze({
    ...(manifest.provenance?.beatThisRun === undefined ? {} : { beatAttempt: true }),
    kind: "capsule",
    version: CAREER_VERSION,
    ...(race === undefined ? {} : { seedRaceRole: race.role }),
    assisted:
      manifest.provenance?.bossMemory !== undefined ||
      manifest.provenance?.beatThisRun !== undefined ||
      manifest.provenance?.ghostAssistance !== undefined ||
      manifest.provenance?.seedRace !== undefined,
    id: manifest.id,
    root: manifest.rootIntegrity,
    manifestHash: stableVerificationHash(manifest),
    date: manifest.completedAt ?? manifest.createdAt,
    epoch: Number.isFinite(Date.parse(manifest.completedAt ?? manifest.createdAt))
      ? Date.parse(manifest.completedAt ?? manifest.createdAt)
      : null,
    mode: context?.run.mode ?? null,
    difficulty: context?.run.difficulty ?? null,
    weapon: context?.run.weaponId ?? null,
    wave: null,
    result: null,
    score: null,
    seconds: null,
    categories: null,
    composition: null,
    loadout: null,
    catalogHash: "unknown",
    abilities: null,
    bosses: null,
    damage: null,
    verified: "unavailable",
    actor: actor === "human" ? "human" : actor === "bot" || actor === "tearbot" ? "bot" : "unknown",
    shared: null,
    sharing: "unknown",
    resumed: manifest.provenance?.forkOrigin !== undefined ? true : null,
    gameVersion: context?.build.version ?? null,
    build: context ? stableVerificationHash(context.build) : null,
    dna: {},
    nearMiss: null,
    style: null,
    bossClears: [],
    witnesses: [],
    unavailable: ["Not yet indexed from recorded evidence"],
    enriched: false,
    present: true,
  });
}

/** Retained Ghost2 metadata is visual-only; no canonical root or native measurements are invented. */
export function legacyCareerRow(
  value: Readonly<{
    id: string;
    ts: number;
    pin: boolean;
    shareId: string | null;
    sum: Readonly<Record<string, unknown>>;
  }>,
): CareerRow {
  const s = value.sum,
    epoch = Number.isFinite(value.ts) && Number.isFinite(new Date(value.ts).getTime()) ? value.ts : null,
    date = epoch === null ? "unknown" : new Date(epoch).toISOString();
  const entry: CareerEntry = {
    kind: "legacy-visual",
    version: CAREER_VERSION,
    id: value.id,
    root: "",
    manifestHash: stableVerificationHash(value),
    date,
    epoch,
    mode: typeof s.mode === "string" ? s.mode : null,
    difficulty: typeof s.diff === "string" ? s.diff : null,
    weapon: typeof s.weaponId === "string" ? s.weaponId : null,
    wave: null,
    result: null,
    score: null,
    seconds: null,
    categories: null,
    composition: null,
    loadout: null,
    catalogHash: "unknown",
    abilities: null,
    bosses: null,
    damage: null,
    verified: "unavailable",
    actor: "unknown",
    shared: value.shareId ? true : null,
    sharing: value.shareId ? "unlisted" : "unknown",
    resumed: null,
    gameVersion: null,
    build: null,
    dna: {},
    nearMiss: null,
    style: null,
    bossClears: [],
    witnesses: [],
    unavailable: [
      "Retained Ghost2 visual-only recording; native measurements, source root and integrity verification unavailable. Original legacy pin limits apply.",
    ],
    enriched: false,
    present: true,
  };
  return { entry, notes: { revision: 0, tags: [], retention: value.pin ? "pinned" : "recent" } };
}

/** Independent facts only. Historical absence is unknown, never a zero measurement. */
export function projectCareerEntry(capsule: GhostReadCapsule, verified: boolean): CareerEntry {
  const base = provisionalCareerEntry(capsule.manifest),
    context = readGhostReplayRunContext(capsule.manifest.provenance),
    unavailable: string[] = [];
  const events: (Record<string, unknown> & { tick: number })[] = capsule.tracks.events
    .map((entry): Record<string, unknown> & { tick: number } => ({ ...careerObject(entry.value), tick: entry.tick }))
    .filter((event) => event.source === "engine");
  const terminal = events
      .filter((event) => ["run.completed", "run.defeated", "run.abandoned"].includes(String(event.type)))
      .at(-1),
    terminalData = careerObject(terminal?.payload);
  const records = capsule.tracks.results.flatMap((entry) => {
    const value = careerObject(entry.value);
    return value.format === "tearghost-career-witness" &&
      value.version === 1 &&
      value.sessionId === base.id &&
      value.runId === context?.run.id &&
      value.tick === entry.tick &&
      ["coverage", "style", "terminal", "boss"].includes(String(value.kind))
      ? [value as unknown as CareerWitness]
      : [];
  });
  const coverage = records.filter((record) => record.kind === "coverage"),
    endings = records.filter((record) => record.kind === "terminal"),
    end = endings[0];
  const expectedOutcome =
    terminal?.type === "run.defeated"
      ? "defeat"
      : terminal?.type === "run.completed"
        ? "victory"
        : terminal?.type === "run.abandoned"
          ? "abandoned"
          : undefined;
  const whole =
    verified &&
    end !== undefined &&
    terminal !== undefined &&
    coverage.length === 1 &&
    coverage[0]?.tick === 0 &&
    capsule.manifest.provenance?.forkOrigin === undefined &&
    endings.length === 1 &&
    end.tick === terminal.tick &&
    end.data.outcome === expectedOutcome &&
    coverage[0].data.policy === "native-career-v1" &&
    coverage[0].data.buildHash === base.build &&
    end.data.truncated === false &&
    end.data.styles === records.filter((record) => record.kind === "style").length;
  const state = careerObject(end?.data),
    rawLoadout = Array.isArray(state.loadout) ? state.loadout : undefined;
  const loadout =
    rawLoadout
      ?.flatMap((raw) => {
        const row = careerObject(raw);
        return typeof row.id === "string" &&
          Number.isSafeInteger(row.count) &&
          Number(row.count) > 0 &&
          Number.isSafeInteger(row.tier) &&
          Number(row.tier) > 0
          ? [{ id: row.id, count: Number(row.count), tier: Number(row.tier) }]
          : [];
      })
      .sort((a, b) => a.id.localeCompare(b.id)) ?? null;
  const sourceCatalog = coverage[0]?.data.catalog,
    sourceCatalogHash = coverage[0]?.data.catalogHash;
  const catalogValid =
    Array.isArray(sourceCatalog) &&
    typeof sourceCatalogHash === "string" &&
    stableVerificationHash(sourceCatalog) === sourceCatalogHash &&
    sourceCatalog.every((raw) => {
      const item = careerObject(raw);
      return typeof item.id === "string" && typeof item.cat === "string" && Object.keys(item).length === 2;
    }) &&
    new Set(sourceCatalog.map((raw) => careerObject(raw).id)).size === sourceCatalog.length;
  const sourceCategories = catalogValid
    ? new Map(
        (sourceCatalog as unknown[]).flatMap((raw) => {
          const item = careerObject(raw);
          return typeof item.id === "string" && typeof item.cat === "string" ? [[item.id, item.cat] as const] : [];
        }),
      )
    : new Map<string, string>();
  const completeLoadout =
    whole &&
    catalogValid &&
    loadout !== null &&
    loadout.length === rawLoadout?.length &&
    new Set(loadout.map(({ id }) => id)).size === loadout.length;
  const composition = Object.create(null) as Record<string, number>;
  let unknownUpgrade = false;
  for (const item of loadout ?? []) {
    const cat = sourceCategories.get(item.id);
    if (!cat) unknownUpgrade = true;
    else if (item.count > 0) composition[cat] = (composition[cat] ?? 0) + 1;
  }
  if (!whole) unavailable.push("Whole-run native Career witness coverage unavailable");
  if (unknownUpgrade) unavailable.push("Unknown upgrade catalogue IDs: composition is partial");
  const styles = whole ? records.filter((record) => record.kind === "style" && record.tick <= terminal.tick) : [];
  const named = styles.filter((record) => record.data.accepted === true && typeof record.data.technique === "string");
  const peaks = styles.filter(
    (record) =>
      number(record.data.combo) !== null &&
      number(record.data.multiplier) !== null &&
      typeof record.data.rank === "string",
  );
  const rankOrdinal = (record: CareerWitness) =>
    Array.isArray(record.data.ranks)
      ? record.data.ranks.findIndex((rank) => careerObject(rank).name === record.data.rank)
      : -1;
  const peak = [...peaks].sort(
    (a, b) => rankOrdinal(b) - rankOrdinal(a) || Number(b.data.combo) - Number(a.data.combo),
  )[0];
  const tuningHashes = new Set(styles.map((record) => record.data.tuningHash));
  const style =
    whole && tuningHashes.size <= 1
      ? {
          techniques: [...new Set(named.map((record) => String(record.data.technique)))].sort(),
          combo: Math.max(0, ...peaks.map((record) => Number(record.data.combo))),
          multiplier: Math.max(1, ...peaks.map((record) => Number(record.data.multiplier))),
          rank: typeof peak?.data.rank === "string" ? peak.data.rank : "",
          rankOrdinal: peak ? rankOrdinal(peak) : -1,
          tuningHash: typeof peak?.data.tuningHash === "string" ? peak.data.tuningHash : "unknown",
        }
      : null;
  const bosses = Array.isArray(state.bosses) ? state.bosses.map(careerObject) : [];
  const nearMiss =
    whole && terminal.type === "run.defeated"
      ? bosses.flatMap((boss) =>
          typeof boss.id === "string" &&
          typeof boss.boss === "string" &&
          boss.phase === 3 &&
          boss.dead === false &&
          boss.dying === false &&
          typeof boss.hp === "number" &&
          typeof boss.maxHp === "number" &&
          Number.isFinite(boss.hp) &&
          Number.isFinite(boss.maxHp) &&
          boss.maxHp > 0 &&
          boss.hp > 0 &&
          boss.hp <= boss.maxHp * 0.1
            ? [{ id: boss.id, boss: boss.boss, hp: boss.hp, maxHp: boss.maxHp, phase: 3, tick: terminal.tick }]
            : [],
        )
      : whole
        ? []
        : null;
  const dna = projectGhostRunDnaTheater(capsule);
  const nativeUses =
    dna.nativePolicy === undefined
      ? null
      : capsule.tracks.results.flatMap((entry) => {
          const value = careerObject(entry.value),
            used = careerObject(value.capture).used;
          return value.kind === "run-dna-metrics-v1" && Array.isArray(used)
            ? used.filter((id): id is string => typeof id === "string")
            : [];
        });
  const damage = dna.nativePolicy !== undefined ? (dna.sourceMetrics.damageTaken ?? null) : null;
  const bossClears: CareerEntry["bossClears"][number][] = [];
  if (whole && context && capsule.manifest.provenance?.forkOrigin === undefined)
    for (const spawn of events.filter((event) => event.type === "enemy.spawned")) {
      const p = careerObject(spawn.payload);
      if (typeof p.bossId !== "string" || !p.bossId || typeof spawn.actorId !== "string") continue;
      const death = events.find(
        (event) => event.type === "enemy.defeated" && event.actorId === spawn.actorId && event.tick > spawn.tick,
      );
      const changes = events.some(
        (event) =>
          ["draft.selected", "tier.selected"].includes(String(event.type)) &&
          event.tick >= spawn.tick &&
          event.tick <= (death?.tick ?? -1),
      );
      const witness = records.find(
        (record) => record.kind === "boss" && record.tick === spawn.tick && record.data.actorId === spawn.actorId,
      );
      if (
        !death ||
        changes ||
        !witness ||
        !Array.isArray(witness.data.loadout) ||
        witness.data.boss !== p.bossId ||
        witness.data.variant !== (p.variantId ?? null) ||
        witness.data.encounter !== p.actorKind
      )
        continue;
      const key = stableVerificationHash({
        boss: p.bossId,
        variant: p.variantId ?? null,
        encounter: p.actorKind ?? null,
        mode: base.mode,
        difficulty: base.difficulty,
        weapon: base.weapon,
        build: base.build,
        loadout: witness.data.loadout,
        catalogHash: sourceCatalogHash ?? null,
      });
      bossClears.push({
        key,
        boss: p.bossId,
        ticks: death.tick - spawn.tick,
        spawn: String(spawn.id),
        defeat: String(death.id),
      });
    }
  return Object.freeze({
    ...base,
    wave: number(terminalData.wave),
    result:
      terminal?.type === "run.completed"
        ? "victory"
        : terminal?.type === "run.defeated"
          ? "defeat"
          : terminal?.type === "run.abandoned"
            ? "abandoned"
            : null,
    score: number(terminalData.score),
    seconds: number(terminalData.runTimeSeconds),
    loadout,
    composition: completeLoadout ? composition : null,
    catalogHash: typeof sourceCatalogHash === "string" ? sourceCatalogHash : "unknown",
    resumed: whole ? false : base.resumed,
    categories:
      completeLoadout && !unknownUpgrade
        ? Object.keys(composition).length
          ? Object.keys(composition).sort()
          : ["unupgraded"]
        : null,
    abilities:
      whole || nativeUses !== null
        ? [...new Set([...named.map((record) => String(record.data.technique)), ...(nativeUses ?? [])])].sort()
        : null,
    bosses: [
      ...new Set(
        events
          .filter((event) => event.type === "enemy.spawned")
          .flatMap((event) =>
            typeof careerObject(event.payload).bossId === "string" && careerObject(event.payload).bossId
              ? [String(careerObject(event.payload).bossId)]
              : [],
          ),
      ),
    ],
    verified: verified ? "receipts" : "integrity",
    damage,
    dna: dna.nativePolicy ? (dna.dimensions ?? {}) : {},
    style,
    nearMiss,
    bossClears,
    witnesses: records.map((record) => `${record.kind}@${String(record.tick)}:${stableVerificationHash(record)}`),
    unavailable,
    enriched: true,
  });
}

function range(value: number | null, filter: string): boolean {
  const [min, max] = filter.split("..");
  return (
    value !== null &&
    (min === "" || min === undefined || value >= Number(min)) &&
    (max === "" || max === undefined || value <= Number(max))
  );
}
export function queryCareer(rows: readonly CareerRow[], query: CareerQuery, pageSize = 12) {
  let selected = rows.filter(({ entry: e, notes: n }) => {
    if (
      query.text &&
      ![e.id, e.mode, e.weapon, ...n.tags, ...(e.abilities ?? []), ...(e.bosses ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(query.text.toLowerCase())
    )
      return false;
    return Object.entries(query.filters).every(([key, value]) => {
      if (!value) return true;
      const actual = (
        {
          date: e.epoch,
          mode: e.mode,
          difficulty: e.difficulty,
          weapon: e.weapon,
          wave: e.wave,
          result: e.result,
          archetype: e.categories,
          ability: e.abilities,
          boss: e.bosses,
          score: e.score,
          damage: e.damage,
          verified: e.verified,
          actor: e.actor,
          tags: n.tags,
          pinned: n.retention === "pinned",
          shared: e.shared,
          resumed: e.resumed,
          version: e.gameVersion,
        } as Record<string, unknown>
      )[key];
      if (key === "tags")
        return value
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .every((tag) => n.tags.includes(tag));
      if (key === "shared" && ["private", "queued", "public", "unlisted"].includes(value)) return e.sharing === value;
      if (value === "unknown") return actual === null || actual === "unknown";
      if (["wave", "score", "damage"].includes(key)) return range(actual as number | null, value);
      if (key === "date") {
        const [a, b] = value.split("..");
        return (
          e.epoch !== null &&
          (!a || e.epoch >= Date.parse(a)) &&
          (!b || e.epoch <= Date.parse(b) + (/^\d{4}-\d{2}-\d{2}$/u.test(b) ? 86399999 : 0))
        );
      }
      return Array.isArray(actual) ? actual.includes(value) : String(actual) === value;
    });
  });
  const details = new Map<string, string>(),
    improvement = new Map<CareerRow, number>();
  if (query.view === "near-miss") selected = selected.filter(({ entry }) => (entry.nearMiss?.length ?? 0) > 0);
  if (query.view === "dna-evolution") {
    selected = selected.filter(({ entry }) => entry.kind === "capsule" && entry.enriched && entry.epoch !== null);
    selected.forEach(({ entry }) =>
      details.set(
        entry.id,
        `Run DNA v1: ${["aggression", "precision", "mobility", "defense", "experimentation"].map((key) => `${key}=${String(entry.dna[key] ?? "unavailable")}`).join(" · ")} · ${entry.mode ?? "?"}/${entry.difficulty ?? "?"}/${entry.weapon ?? "?"}, game ${entry.gameVersion ?? "?"}; compare only matching full build and coverage`,
      ),
    );
  }
  if (query.view === "style-milestones") {
    const groups = new Map<string, { seen: Set<string>; combo: number; mult: number; rank: number }>();
    selected = [...selected]
      .sort((a, b) => (a.entry.epoch ?? Infinity) - (b.entry.epoch ?? Infinity))
      .filter(({ entry }) => {
        if (!entry.style || entry.epoch === null) return false;
        const key = `${entry.build ?? "unknown"}:${entry.style.tuningHash}`,
          group = groups.get(key) ?? { seen: new Set<string>(), combo: 0, mult: 1, rank: -1 };
        groups.set(key, group);
        const { seen } = group;
        const fresh = entry.style.techniques.filter((id) => !seen.has(id));
        entry.style.techniques.forEach((id) => seen.add(id));
        const isPeak =
          entry.style.combo > group.combo ||
          entry.style.multiplier > group.mult ||
          entry.style.rankOrdinal > group.rank;
        group.combo = Math.max(group.combo, entry.style.combo);
        group.mult = Math.max(group.mult, entry.style.multiplier);
        group.rank = Math.max(group.rank, entry.style.rankOrdinal);
        if (fresh.length || isPeak)
          details.set(
            entry.id,
            `First recorded: ${fresh.join(", ") || "new peak"} · combo ${String(entry.style.combo)} · ×${String(entry.style.multiplier)} ${entry.style.rank}`,
          );
        return fresh.length > 0 || isPeak;
      });
  }
  if (["personal-best", "best-weapon", "first-clear"].includes(query.view)) {
    const best = new Map<string, CareerRow>();
    for (const row of [...selected].sort((a, b) => (a.entry.epoch ?? Infinity) - (b.entry.epoch ?? Infinity))) {
      const e = row.entry;
      if (
        e.beatAttempt ||
        e.assisted ||
        e.resumed !== false ||
        e.epoch === null ||
        e.score === null ||
        e.wave === null ||
        (query.view === "first-clear" && e.result !== "victory")
      )
        continue;
      const key = [e.mode, e.difficulty, query.view === "best-weapon" ? e.weapon : "", e.build].join(":");
      const old = best.get(key);
      if (
        !old ||
        (query.view !== "first-clear" &&
          (e.wave > (old.entry.wave ?? -1) || (e.wave === old.entry.wave && e.score > (old.entry.score ?? -1))))
      ) {
        best.set(key, row);
        details.set(e.id, "Recorded category best · wave then score; no cross-build ranking");
      }
    }
    selected =
      query.view === "personal-best" ? selected.filter(({ entry }) => details.has(entry.id)) : [...best.values()];
  }
  if (query.view === "favorite-builds") {
    const buildKey = (entry: CareerEntry) =>
      stableVerificationHash({
        loadout: entry.loadout ? [...entry.loadout].sort((a, b) => a.id.localeCompare(b.id)) : null,
        build: entry.build,
        catalog: entry.catalogHash,
      });
    const counts = new Map<string, number>();
    for (const { entry } of selected)
      if (entry.loadout) {
        const key = buildKey(entry);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    selected = selected
      .filter(({ entry }) => entry.loadout !== null)
      .sort((a, b) => (counts.get(buildKey(b.entry)) ?? 0) - (counts.get(buildKey(a.entry)) ?? 0));
    selected.forEach(({ entry }) =>
      details.set(
        entry.id,
        `${String(counts.get(buildKey(entry)))} recorded runs with this exact loadout/catalog/build`,
      ),
    );
  }
  if (query.view === "boss-change") {
    const groups = new Map<string, { row: CareerRow; ticks: number; boss: string }[]>();
    for (const row of selected)
      if (row.entry.epoch !== null)
        for (const clear of row.entry.bossClears) {
          const group = groups.get(clear.key) ?? [];
          group.push({ row, ticks: clear.ticks, boss: clear.boss });
          groups.set(clear.key, group);
        }
    selected = [];
    for (const [groupKey, group] of groups) {
      group.sort((a, b) => Number(a.row.entry.epoch) - Number(b.row.entry.epoch));
      const first = group[0];
      if (!first) continue;
      const later = group
        .filter((item) => Number(item.row.entry.epoch) > Number(first.row.entry.epoch))
        .sort((a, b) => a.ticks - b.ticks)[0];
      if (!later) continue;
      const decrease = first.ticks - later.ticks,
        report = {
          ...later.row,
          group: groupKey,
          detail: `${later.boss}: ${String(first.ticks)} → ${String(later.ticks)} ticks; ${decrease > 0 ? `elapsed reduction ${String(decrease)}` : "no recorded elapsed reduction"}; n=${String(group.length)}; includes intro; no causal skill claim`,
        };
      improvement.set(report, decrease);
      selected.push(report);
    }
  }
  if (query.view === "longest-survival")
    selected = selected
      .filter(({ entry }) => entry.seconds !== null)
      .sort((a, b) => Number(b.entry.seconds) - Number(a.entry.seconds));
  else if (query.view === "boss-change") selected.sort((a, b) => (improvement.get(b) ?? 0) - (improvement.get(a) ?? 0));
  else if (query.view === "dna-evolution")
    selected.sort((a, b) => Number(a.entry.epoch) - Number(b.entry.epoch) || a.entry.id.localeCompare(b.entry.id));
  else if (query.view !== "favorite-builds")
    selected.sort((a, b) =>
      query.sort === "score"
        ? (b.entry.score ?? -1) - (a.entry.score ?? -1)
        : (query.sort === "oldest" ? 1 : -1) * ((a.entry.epoch ?? -1) - (b.entry.epoch ?? -1)) ||
          a.entry.id.localeCompare(b.entry.id),
    );
  const page = Math.max(0, Math.min(query.page, Math.max(0, Math.ceil(selected.length / pageSize) - 1)));
  return {
    total: selected.length,
    page,
    pages: Math.max(1, Math.ceil(selected.length / pageSize)),
    rows: selected
      .slice(page * pageSize, (page + 1) * pageSize)
      .map((row) => ({ ...row, ...(details.has(row.entry.id) ? { detail: details.get(row.entry.id) ?? "" } : {}) })),
  };
}
