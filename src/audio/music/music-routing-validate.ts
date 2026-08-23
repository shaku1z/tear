import type {
  MusicRouteMatch,
  MusicRouteSelection,
  MusicRoutingManifest,
  MusicRoutingRule,
  RoutingScene,
} from "./music-routing-types";

const SCENES: ReadonlySet<RoutingScene> = new Set([
  "gameplay",
  "boss",
  "menu",
  "victory",
  "defeat",
  "replay",
]);

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function scene(value: unknown): RoutingScene {
  const parsed = text(value, "routing match scene");
  if (!(SCENES as ReadonlySet<string>).has(parsed))
    throw new Error(`routing rule has an unknown scene: ${parsed}`);
  return parsed as RoutingScene;
}

function match(value: unknown): MusicRouteMatch {
  const source = object(value, "routing rule match");
  const parsedScene = source.scene === undefined ? undefined : scene(source.scene);
  const biome = source.biome === undefined ? undefined : text(source.biome, "routing match biome");
  const bossId = source.bossId === undefined ? undefined : text(source.bossId, "routing match bossId");
  const bossRequired = source.bossRequired;
  if (bossRequired !== undefined && typeof bossRequired !== "boolean")
    throw new Error("routing match bossRequired must be boolean");
  return {
    ...(biome === undefined ? {} : { biome }),
    ...(bossId === undefined ? {} : { bossId }),
    ...(parsedScene === undefined ? {} : { scene: parsedScene }),
    ...(bossRequired === undefined ? {} : { bossRequired }),
  };
}

function selection(value: unknown): MusicRouteSelection {
  const source = object(value, "routing rule selection");
  if (source.type === "primary") return { type: "primary", workId: text(source.workId, "primary workId") };
  if (source.type !== "weighted-pool" || !Array.isArray(source.entries) || source.entries.length === 0)
    throw new Error("routing rule selection must be primary or a non-empty weighted-pool");
  const entries = source.entries.map((entry) => {
    const item = object(entry, "weighted pool entry");
    const weight = item.weight;
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0)
      throw new Error("weighted pool entry weight must be a positive finite number");
    return { workId: text(item.workId, "weighted pool workId"), weight };
  });
  return { type: "weighted-pool", entries };
}

function rule(value: unknown): MusicRoutingRule {
  const source = object(value, "routing rule");
  const priority = source.priority;
  if (priority !== undefined && (typeof priority !== "number" || !Number.isInteger(priority) || priority < 0))
    throw new Error("routing rule priority must be a non-negative integer");
  return {
    id: text(source.id, "routing rule id"),
    ...(priority === undefined ? {} : { priority }),
    match: match(source.match),
    selection: selection(source.selection),
  };
}

/** Validate untrusted runtime JSON before it reaches the audio backend. */
export function validateMusicRoutingManifest(value: unknown): MusicRoutingManifest {
  const source = object(value, "music routing manifest");
  if (source.format !== "tear-music-routing" || source.version !== 1)
    throw new Error("unsupported music routing manifest format/version");
  if (!Array.isArray(source.rules)) throw new Error("music routing rules must be an array");
  const rules = source.rules.map(rule);
  const ids = new Set<string>();
  for (const item of rules) {
    if (ids.has(item.id)) throw new Error(`duplicate routing rule id: ${item.id}`);
    ids.add(item.id);
  }
  return {
    format: "tear-music-routing",
    version: 1,
    defaultWorkId: text(source.defaultWorkId, "routing defaultWorkId"),
    rules,
  };
}
