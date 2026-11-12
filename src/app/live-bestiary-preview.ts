import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { BestiaryEntry } from "../presentation/bestiary-catalog";

export type BestiaryPreviewDependencies = Pick<GameRuntimeDependencies, "AFFIXES" | "Aldric" | "Armored" | "Bomber" | "Charger" |
  "Chimera" | "Colossus" | "CONFIG" | "Echo" | "Flyer" | "PROFILE" | "Ranged" | "Rootbinder" | "Rootbound" | "Source" |
  "Support" | "UI" | "VARIANTS" | "Warden" | "Wraith" | "applyVariant">;

/** The parts of a live enemy the Codex bestiary reads and draws. */
export interface BestiaryInstance {
  hw: number; hh: number; maxHp: number; contactDmg: number; speed?: number; kind?: string; bossId?: string;
  x: number; y: number; facing: number; flash: number; stun: number; spawnT: number; _noBar?: boolean;
  draw(context: CanvasRenderingContext2D, player: unknown): void;
}

/**
 * Bestiary live instances (source bestiary(): one preview enemy per entry), built
 * on first use and keyed by the canonical enemy kind / boss id (bestiary-catalog.ts).
 */
export function createLiveBestiaryPreview(d: BestiaryPreviewDependencies) {
  let bestiaryInstances: Record<string, BestiaryInstance | null> | null = null;
  const safe = (make: () => unknown): BestiaryInstance | null => {
    try {
      return make() as BestiaryInstance;
    } catch {
      return null;
    }
  };
  const withVariant = (enemy: unknown, variant: unknown): unknown => {
    d.applyVariant(enemy as never, variant as never);
    return enemy;
  };
  const boss = (bossId: string, make: () => unknown): BestiaryInstance | null => {
    const instance = safe(make);
    if (instance !== null) instance.bossId = bossId;
    return instance;
  };
  const createInstances = (): Record<string, BestiaryInstance | null> => ({
    charger: safe(() => withVariant(new d.Charger(0, 0), d.VARIANTS.charger?.[0])),
    ranged: safe(() => withVariant(new d.Ranged(0, 0), d.VARIANTS.ranged?.[0])),
    flyer: safe(() => withVariant(new d.Flyer(0, 0), d.VARIANTS.flyer?.[0])),
    bomber: safe(() => withVariant(new d.Bomber(0, 0), d.VARIANTS.bomber?.[0])),
    armored: safe(() => new d.Armored(0, 0)),
    priest: safe(() => new d.Support(0, 0, "priest")),
    mender: safe(() => new d.Support(0, 0, "mender")),
    herald: safe(() => new d.Support(0, 0, "herald")),
    anchor: safe(() => new d.Support(0, 0, "anchor")),
    wraith: safe(() => new d.Wraith(0, 0)),
    chimera: safe(() => new d.Chimera(0, 0)),
    rootbinder: safe(() => new d.Rootbinder(0, 0)),
    warden: boss("warden", () => new d.Warden(0, 0)),
    colossus: boss("colossus", () => new d.Colossus(0, 0)),
    aldric: boss("aldric", () => new d.Aldric(0, 0)),
    rootbound: boss("rootbound", () => new d.Rootbound(0, 0)),
    echo: boss("echo", () => new d.Echo(0, 0)),
    source: boss("source", () => new d.Source(0, 0)),
  });
  const instance = (id: string): BestiaryInstance | null => {
    bestiaryInstances ??= createInstances();
    return bestiaryInstances[id] ?? null;
  };
  const detail = (entry: BestiaryEntry) => {
    const isBoss = entry.boss === true, inst = instance(entry.id);
    if (inst === null) return undefined;
    const colors = d.CONFIG.colors as Record<string, string | undefined>;
    // Supports share kind "support"; colour and kill tallies use the canonical identity.
    const identity = entry.enemyKind ?? inst.kind;
    const kindColor = inst.kind !== undefined ? colors[inst.kind] : undefined;
    const accent = (identity !== undefined ? colors[identity] ?? kindColor : undefined)
      ?? (isBoss ? d.UI.t.color.danger : d.UI.t.color.accent);
    const stats = [
      { label: "HP", value: Math.round(inst.maxHp).toLocaleString("en-US") },
      { label: isBoss ? "TOUCH" : "DMG", value: String(Math.round(inst.contactDmg)) },
      ...(isBoss ? [] : [{ label: "SPD", value: String(Math.round(inst.speed ?? 0)) }]),
    ];
    let felled;
    if (isBoss && entry.bossId !== undefined) {
      const stat = d.PROFILE.stat("kill" + entry.bossId.charAt(0).toUpperCase() + entry.bossId.slice(1));
      if (stat) felled = { label: "☠ FELLED", color: "#2f9e6b" };
    } else if (!isBoss && inst.kind !== undefined) {
      const stat = d.PROFILE.stat("kill_" + inst.kind);
      if (stat) felled = { label: "FELLED ×" + stat.toLocaleString("en-US"), color: accent };
    }
    const affixes = isBoss ? undefined
      : d.AFFIXES.filter((affix) => affix.appliesTo(inst as never)).map((affix) => ({ id: affix.id, color: affix.color }));
    return { accent, stats, ...(felled === undefined ? {} : { felled }), ...(affixes === undefined ? {} : { affixes }) };
  };
  // source PREVIEW_PLAYER: a still stand-in so enemy draw() has someone to face
  const previewPlayer = { x: 360, y: 0, hw: 16, hh: 25, facing: 1, invulnerable: false, dashTimer: 0, vx: 0, vy: 0, onGround: true };
  return Object.freeze({ instance, detail, previewPlayer });
}
