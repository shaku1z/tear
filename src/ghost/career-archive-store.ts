import { parseGhostColdRestoreJob, parseGhostColdRestoreResult, ghostColdRestoreResultKey } from "./cold-restore-job";
import { ghostArchiveSha256 } from "./capsule-archive";
import { parseGhostLocalPublicationJob, parseGhostPublicationCustody } from "./local-publication-job";
import { parseGhostPublicationTransportState } from "./publication-transport";
import { canonicalStringify, stableVerificationHash } from "../domain/hash";
import {
  GhostLocalVault,
  parseGhostCapsuleManifest,
  type GhostVaultBackend,
  type GhostVaultWrite,
} from "./capsule-vault";
import {
  prepareGhostCapsuleProtection,
  prepareGhostCapsuleSourceGuards,
  ghostCapsuleProtectionKey,
  parseGhostCapsuleProtection,
} from "./capsule-protection";
import {
  CAREER_VERSION,
  careerObject,
  defaultCareerNotes,
  provisionalCareerEntry,
  queryCareer,
  emptyCareerQuery,
  type CareerEntry,
  type CareerNotes,
  type CareerRow,
} from "./career-archive";

export const careerKey = (id: string, root: string) => `career:v1:${encodeURIComponent(id)}:${root}`;
const notesKey = (entry: CareerEntry) => `career-notes:${careerKey(entry.id, entry.root)}`;
const owner = (id: string) => `career:${id}`;
const protectedTier = (tier: CareerNotes["retention"]) =>
  ["pinned", "milestone", "diagnostic", "imported"].includes(tier);

function parseEntry(raw: string): CareerEntry {
  const entry = careerObject(JSON.parse(raw));
  if (
    entry.kind !== "capsule" ||
    entry.version !== CAREER_VERSION ||
    typeof entry.id !== "string" ||
    typeof entry.root !== "string" ||
    typeof entry.manifestHash !== "string" ||
    !Array.isArray(entry.unavailable) ||
    !Array.isArray(entry.witnesses) ||
    typeof entry.enriched !== "boolean" ||
    typeof entry.date !== "string"
  )
    throw new TypeError("Unsupported Career index");
  const nullableText = (value: unknown) => value === null || typeof value === "string";
  const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
  const strings = (value: unknown) => Array.isArray(value) && value.every((v: unknown) => typeof v === "string");
  const list = (value: unknown, check: (value: Record<string, unknown>) => boolean) =>
    Array.isArray(value) && value.every((v: unknown) => check(careerObject(v)));
  if (
    ![entry.score, entry.wave, entry.seconds, entry.damage, entry.epoch].every((v) => v === null || finite(v)) ||
    ![entry.mode, entry.difficulty, entry.weapon, entry.result, entry.gameVersion, entry.build].every(nullableText) ||
    (entry.beatAttempt !== undefined && typeof entry.beatAttempt !== "boolean") ||
    (entry.assisted !== undefined && typeof entry.assisted !== "boolean") ||
    ![entry.resumed, entry.shared].every((v) => v === null || typeof v === "boolean") ||
    typeof entry.present !== "boolean" ||
    ![entry.categories, entry.abilities, entry.bosses].every((v) => v === null || strings(v)) ||
    !strings(entry.unavailable) ||
    !strings(entry.witnesses) ||
    !["integrity", "receipts", "unavailable"].includes(String(entry.verified)) ||
    !["human", "bot", "unknown"].includes(String(entry.actor)) ||
    !["public", "unlisted", "private", "queued", "unknown"].includes(String(entry.sharing)) ||
    typeof entry.catalogHash !== "string" ||
    entry.dna === null ||
    typeof entry.dna !== "object" ||
    Array.isArray(entry.dna) ||
    !Object.values(entry.dna).every(finite) ||
    (entry.loadout !== null &&
      !list(
        entry.loadout,
        (x) =>
          typeof x.id === "string" &&
          Number.isSafeInteger(x.count) &&
          Number(x.count) > 0 &&
          Number.isSafeInteger(x.tier) &&
          Number(x.tier) > 0,
      )) ||
    (entry.nearMiss !== null &&
      !list(
        entry.nearMiss,
        (x) => typeof x.boss === "string" && typeof x.id === "string" && [x.hp, x.maxHp, x.phase, x.tick].every(finite),
      )) ||
    !list(
      entry.bossClears,
      (x) =>
        [x.key, x.boss, x.spawn, x.defeat].every((v) => typeof v === "string") &&
        Number.isSafeInteger(x.ticks) &&
        Number(x.ticks) > 0,
    )
  )
    throw new TypeError("Malformed Career facts");
  if (
    entry.composition !== null &&
    (typeof entry.composition !== "object" ||
      Array.isArray(entry.composition) ||
      !Object.values(entry.composition).every(finite))
  )
    throw new TypeError("Malformed Career composition");
  if (entry.style !== null) {
    const style = careerObject(entry.style);
    if (
      !strings(style.techniques) ||
      typeof style.rank !== "string" ||
      typeof style.tuningHash !== "string" ||
      ![style.combo, style.multiplier, style.rankOrdinal].every(finite)
    )
      throw new TypeError("Malformed Career style");
  }
  return Object.freeze(entry) as unknown as CareerEntry;
}
function parseNotes(raw: string | undefined): CareerNotes {
  if (raw === undefined) return defaultCareerNotes();
  const n = careerObject(JSON.parse(raw));
  if (
    !Number.isSafeInteger(n.revision) ||
    Number(n.revision) < 1 ||
    !Array.isArray(n.tags) ||
    n.tags.length > 32 ||
    n.tags.some((tag) => typeof tag !== "string" || tag.length < 1 || tag.length > 48) ||
    !["recent", "temporary", "pinned", "milestone", "diagnostic", "imported"].includes(String(n.retention))
  )
    throw new TypeError("Invalid Career annotations");
  return Object.freeze({
    revision: Number(n.revision),
    tags: Object.freeze(n.tags as string[]),
    retention: n.retention as CareerNotes["retention"],
  });
}

export class GhostCareerStore {
  constructor(readonly backend: GhostVaultBackend) {}
  async list(signal?: AbortSignal): Promise<readonly CareerRow[]> {
    const rows = new Map<string, CareerEntry>(),
      current = new Map<string, string>(),
      hashes = new Map<string, string>();
    for (const id of await this.backend.keys("manifests")) {
      signal?.throwIfAborted();
      try {
        const raw = await this.backend.get("manifests", id);
        if (!raw) continue;
        const manifest = parseGhostCapsuleManifest(JSON.parse(raw));
        if (manifest.id !== id) continue;
        const entry = provisionalCareerEntry(manifest);
        current.set(id, manifest.rootIntegrity);
        hashes.set(id, entry.manifestHash);
        rows.set(careerKey(id, entry.root), entry);
      } catch {
        /* One malformed source cannot poison the catalog. */
      }
    }
    for (const key of await this.backend.keys("indexes")) {
      if (!key.startsWith("career:v1:")) continue;
      signal?.throwIfAborted();
      try {
        const raw = await this.backend.get("indexes", key);
        if (!raw) continue;
        const entry = parseEntry(raw);
        if (key !== careerKey(entry.id, entry.root)) continue;
        if (current.get(entry.id) === entry.root && hashes.get(entry.id) !== entry.manifestHash) continue;
        rows.set(key, { ...entry, present: current.get(entry.id) === entry.root });
      } catch {
        /* A rejected derived index can be rebuilt from its source. */
      }
    }
    const sharing = new Map<string, CareerEntry["sharing"]>();
    for (const key of await this.backend.keys("uploadJobs")) {
      signal?.throwIfAborted();
      if (!key.startsWith("ghost-publication-job:v1:")) continue;
      try {
        const raw = await this.backend.get("uploadJobs", key);
        if (!raw) continue;
        const job = parseGhostLocalPublicationJob(raw),
          entry = rows.get(careerKey(job.source.capsuleId, job.source.rootIntegrity));
        if (entry?.manifestHash !== job.source.manifestHash || job.status !== "queued") continue;
        const custodyRaw = await this.backend.get("analysis", `ghost-publication-custody:v1:${entry.id}`),
          stateRaw = await this.backend.get("analysis", `ghost-publication-transport:v1:${job.id}`);
        if (!custodyRaw) continue;
        const custody = parseGhostPublicationCustody(custodyRaw);
        if (
          custody.custodyHash !== job.custodyHash ||
          custody.sourceConsent.rootIntegrity !== entry.root ||
          custody.capsuleId !== entry.id
        )
          continue;
        const state = stateRaw ? parseGhostPublicationTransportState(stateRaw) : undefined;
        const finalized =
          state?.jobId === job.id &&
          state.jobHash === job.jobHash &&
          state.terminal === "finalized" &&
          state.terminalMetadata?.status === "finalized";
        sharing.set(
          careerKey(entry.id, entry.root),
          finalized
            ? custody.visibility === "private"
              ? "private"
              : custody.visibility === "public"
                ? "public"
                : "unlisted"
            : "queued",
        );
      } catch {
        /* Invalid or stale sharing declarations remain unknown. */
      }
    }
    const result: CareerRow[] = [];
    for (const entry of rows.values()) {
      signal?.throwIfAborted();
      let notes = defaultCareerNotes();
      try {
        notes = parseNotes(await this.backend.get("settings", notesKey(entry)));
      } catch {
        /* Keep source visible with annotation refusal on edit. */
      }
      const state = sharing.get(careerKey(entry.id, entry.root)) ?? "unknown";
      result.push(
        Object.freeze({
          entry: {
            ...entry,
            sharing: state,
            shared: state === "public" || state === "unlisted" ? true : state === "private" ? false : null,
          },
          notes,
        }),
      );
    }
    return Object.freeze(result);
  }
  async retain(entry: CareerEntry, signal?: AbortSignal): Promise<void> {
    const raw = await this.backend.get("manifests", entry.id);
    if (!raw || stableVerificationHash(JSON.parse(raw)) !== entry.manifestHash)
      throw new Error("Career source changed");
    const guards = await prepareGhostCapsuleSourceGuards(this.backend, entry.id, entry.root),
      key = careerKey(entry.id, entry.root),
      old = await this.backend.get("indexes", key);
    signal?.throwIfAborted();
    await this.backend.commitIfMatches(
      [
        ...guards,
        { store: "manifests", key: entry.id, expected: raw },
        { store: "indexes", key, ...(old === undefined ? {} : { expected: old }) },
      ],
      [{ store: "indexes", key, value: JSON.stringify(entry) }],
    );
  }
  async annotate(
    entry: CareerEntry,
    expected: CareerNotes,
    tags: readonly string[],
    retention: CareerNotes["retention"],
  ): Promise<CareerNotes> {
    const key = notesKey(entry),
      raw = await this.backend.get("settings", key),
      previous = parseNotes(raw);
    if (stableVerificationHash(previous) !== stableVerificationHash(expected))
      throw new Error("Career annotations changed; refresh first");
    const next = parseNotes(
      JSON.stringify({
        revision: previous.revision + 1,
        tags: [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))],
        retention,
      }),
    );
    const initial = await this.backend.get("manifests", entry.id);
    if (!initial || stableVerificationHash(JSON.parse(initial)) !== entry.manifestHash)
      throw new Error("Career source changed");
    const source = await prepareGhostCapsuleSourceGuards(this.backend, entry.id, entry.root),
      protectionKey = ghostCapsuleProtectionKey(entry.id);
    const protectionRaw = await this.backend.get("analysis", protectionKey),
      writes: GhostVaultWrite[] = [];
    let guards = [
      ...source,
      { store: "manifests" as const, key: entry.id, expected: initial },
      { store: "settings" as const, key, ...(raw === undefined ? {} : { expected: raw }) },
    ];
    if (protectedTier(retention)) {
      const protection = await prepareGhostCapsuleProtection(this.backend, entry.id, entry.root, owner(entry.id));
      guards = [...guards, ...protection.guards];
      writes.push(...protection.writes);
    } else if (protectionRaw !== undefined) {
      const protection = parseGhostCapsuleProtection(protectionRaw, entry.id);
      if (protection.rootIntegrity !== entry.root) throw new Error("Retention source changed");
      guards.push({ store: "analysis", key: protectionKey, expected: protectionRaw });
      const owners = protection.owners.filter((id) => id !== owner(entry.id));
      writes.push({
        store: "analysis",
        key: protectionKey,
        ...(owners.length ? { value: JSON.stringify({ ...protection, owners }) } : {}),
      });
    } else guards.push({ store: "analysis", key: protectionKey });
    await this.backend.commitIfMatches(guards, [...writes, { store: "settings", key, value: JSON.stringify(next) }]);
    return next;
  }
  async remove(entry: CareerEntry, expected: CareerNotes): Promise<void> {
    const key = notesKey(entry),
      noteRaw = await this.backend.get("settings", key);
    if (stableVerificationHash(parseNotes(noteRaw)) !== stableVerificationHash(expected))
      throw new Error("Career annotations changed");
    const indexKey = careerKey(entry.id, entry.root),
      indexRaw = await this.backend.get("indexes", indexKey);
    const raw = await this.backend.get("manifests", entry.id);
    if (
      raw !== undefined &&
      (parseGhostCapsuleManifest(JSON.parse(raw)).rootIntegrity !== entry.root ||
        stableVerificationHash(JSON.parse(raw)) !== entry.manifestHash)
    )
      throw new Error("Source identity changed; deletion refused");
    const plan =
      raw === undefined
        ? { guards: [{ store: "manifests" as const, key: entry.id }], writes: [] }
        : await new GhostLocalVault(this.backend).prepareCapsuleRemoval(entry.id, owner(entry.id));
    await this.backend.commitIfMatches(
      [
        ...plan.guards,
        { store: "manifests", key: entry.id, ...(raw === undefined ? {} : { expected: raw }) },
        { store: "settings", key, ...(noteRaw === undefined ? {} : { expected: noteRaw }) },
        { store: "indexes", key: indexKey, ...(indexRaw === undefined ? {} : { expected: indexRaw }) },
      ],
      [
        ...plan.writes,
        { store: "indexes", key: indexKey },
        { store: "settings", key },
        {
          store: "settings",
          key: `career-deleted:${indexKey}`,
          value: JSON.stringify({ root: entry.root, version: CAREER_VERSION }),
        },
      ],
    );
  }
  /** Called only by explicit background enrichment, never by metadata navigation or quota reads. */
  async applyRetentionPolicy(signal?: AbortSignal): Promise<void> {
    const rows = await this.list(signal),
      milestones = new Set<string>();
    for (const view of ["personal-best", "first-clear", "style-milestones"] as const)
      for (const { entry } of queryCareer(rows, { ...emptyCareerQuery(), view }, Number.MAX_SAFE_INTEGER).rows)
        milestones.add(careerKey(entry.id, entry.root));
    const imported = new Set<string>();
    for (const key of await this.backend.keys("analysis")) {
      signal?.throwIfAborted();
      if (!key.startsWith("ghost-cold-restore:job:v1:")) continue;
      try {
        const raw = await this.backend.get("analysis", key);
        if (!raw) continue;
        const job = parseGhostColdRestoreJob(raw);
        if (job.state !== "complete") continue;
        const resultRaw = await this.backend.get("analysis", ghostColdRestoreResultKey(job.id));
        if (!resultRaw) continue;
        const result = parseGhostColdRestoreResult(resultRaw);
        if ((await ghostArchiveSha256(new TextEncoder().encode(canonicalStringify(result)))) !== job.resultHash)
          continue;
        if (
          result.kind === "imported" &&
          result.jobId === job.id &&
          result.revision === job.revision &&
          result.lease === job.lease &&
          stableVerificationHash(result.binding) === stableVerificationHash(job.binding)
        )
          imported.add(careerKey(job.binding.capsuleId, job.binding.rootIntegrity));
      } catch {
        /* Historical completion is never current custody on its own. */
      }
    }
    for (const row of rows) {
      signal?.throwIfAborted();
      if (!row.entry.present || row.notes.revision !== 0) continue;
      const key = careerKey(row.entry.id, row.entry.root),
        tier = imported.has(key) ? "imported" : milestones.has(key) ? "milestone" : undefined;
      if (tier)
        try {
          await this.annotate(row.entry, row.notes, row.notes.tags, tier);
        } catch {
          /* Concurrent player/source authority wins. */
        }
    }
  }
  async retention(): Promise<Readonly<Record<string, "pinned" | "standard" | "temporary">>> {
    const rows = await this.list();
    return Object.fromEntries(
      rows
        .filter(({ entry }) => entry.present)
        .map(({ entry, notes }) => [
          entry.id,
          protectedTier(notes.retention) ? "pinned" : notes.retention === "temporary" ? "temporary" : "standard",
        ]),
    );
  }
}
