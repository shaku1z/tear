import { BOSS_ROSTER, ENEMY_KIND_IDS, type BossId, type EnemyKind } from "../gameplay/run/content-director";
import { MODE_IDS, type ModeClassification, type ModeDefinition } from "../gameplay/run/mode-catalog";
import { STAGE_IDS, type StageDefinition, type StageId } from "../gameplay/stages";

export interface GameReferenceStagePoolEntryV1 {
  readonly kind: EnemyKind;
  readonly weight: number;
  readonly unlockWave: number;
}

export interface GameReferenceStageLayoutV1 {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly oneway: boolean;
}

export interface GameReferenceStageNarrativePageV1 {
  readonly label: string;
  readonly text: string;
}

export interface GameReferenceStageNarrativeV1 {
  readonly chapter: Readonly<{
    number: string;
    title: string;
    symbol: string;
    intro: string;
    transition: string;
    pages: readonly GameReferenceStageNarrativePageV1[];
    bossOutro: Readonly<GameReferenceStageNarrativePageV1>;
  }>;
  readonly art: Readonly<{ composition: string; wash: string }>;
}

export interface GameReferenceStageV1 {
  readonly id: StageId;
  readonly name: string;
  readonly blurb: string;
  readonly musicId: string;
  readonly boss: BossId;
  readonly pool: readonly GameReferenceStagePoolEntryV1[];
  readonly layout: readonly GameReferenceStageLayoutV1[];
  readonly narrative: GameReferenceStageNarrativeV1;
  readonly theme: Readonly<{ background: string; platform: string; accent: string; dark: boolean }>;
}

export interface GameReferenceModeV1 {
  readonly id: ModeDefinition["id"];
  readonly order: number;
  readonly label: string;
  readonly blurb: string;
  readonly enabled: boolean;
  readonly classification: ModeClassification;
  readonly training: boolean;
  readonly bossOnly: boolean;
  readonly sandbox: boolean;
}

const BOSS_IDS = Object.freeze(BOSS_ROSTER.map((boss) => boss.id));
const MODE_CLASSIFICATIONS = Object.freeze(["campaign", "endless", "gauntlet", "training", "boss-only", "sandbox"] as const);

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${path} must be a non-empty string`);
  return value;
}

function exactKeys(value: Record<string, unknown>, path: string, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) throw new TypeError(`${path} has unexpected or missing fields`);
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${path} must be a finite number`);
  return value;
}

function positive(value: unknown, path: string): number {
  const result = finite(value, path);
  if (!(result > 0)) throw new RangeError(`${path} must be positive`);
  return result;
}

function nonNegative(value: unknown, path: string): number {
  const result = finite(value, path);
  if (result < 0) throw new RangeError(`${path} must be non-negative`);
  return result;
}

function safePositiveInteger(value: unknown, path: string): number {
  const result = positive(value, path);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${path} must be a safe positive integer`);
  return result;
}

function safeNonNegativeInteger(value: unknown, path: string): number {
  const result = nonNegative(value, path);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${path} must be a safe non-negative integer`);
  return result;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
  return value;
}

function validateProjectedStage(value: unknown, path: string): GameReferenceStageV1 {
  const source = record(value, path);
  exactKeys(source, path, ["id", "name", "blurb", "musicId", "boss", "pool", "layout", "narrative", "theme"]);
  const id = text(source.id, `${path}.id`) as StageId;
  if (!STAGE_IDS.includes(id)) throw new TypeError(`${path}.id is not a canonical stage ID`);
  const boss = text(source.boss, `${path}.boss`) as BossId;
  if (!BOSS_IDS.some((id) => id === boss)) throw new TypeError(`${path}.boss is not a canonical boss ID`);
  const poolValue = source.pool;
  if (!Array.isArray(poolValue) || poolValue.length === 0) throw new TypeError(`${path}.pool must contain at least one enemy kind`);
  const pool = Object.freeze(poolValue.map((entry, index) => {
    const item = record(entry, `${path}.pool[${String(index)}]`);
    exactKeys(item, `${path}.pool[${String(index)}]`, ["kind", "weight", "unlockWave"]);
    const kind = text(item.kind, `${path}.pool[${String(index)}].kind`) as EnemyKind;
    if (!ENEMY_KIND_IDS.some((id) => id === kind)) throw new TypeError(`${path}.pool[${String(index)}].kind is not a canonical enemy kind`);
    return Object.freeze({ kind, weight: positive(item.weight, `${path}.pool[${String(index)}].weight`), unlockWave: safePositiveInteger(item.unlockWave, `${path}.pool[${String(index)}].unlockWave`) });
  }));
  if (new Set(pool.map((entry) => entry.kind)).size !== pool.length) throw new TypeError(`${path}.pool must not contain duplicate enemy kinds`);
  const layoutValue = source.layout;
  if (!Array.isArray(layoutValue) || layoutValue.length === 0) throw new TypeError(`${path}.layout must contain at least one platform`);
  const layout = Object.freeze(layoutValue.map((entry, index) => {
    const item = record(entry, `${path}.layout[${String(index)}]`);
    exactKeys(item, `${path}.layout[${String(index)}]`, ["x", "y", "w", "h", "oneway"]);
    return Object.freeze({ x: nonNegative(item.x, `${path}.layout[${String(index)}].x`), y: nonNegative(item.y, `${path}.layout[${String(index)}].y`), w: positive(item.w, `${path}.layout[${String(index)}].w`), h: positive(item.h, `${path}.layout[${String(index)}].h`), oneway: boolean(item.oneway, `${path}.layout[${String(index)}].oneway`) });
  }));
  const narrativeSource = record(source.narrative, `${path}.narrative`);
  exactKeys(narrativeSource, `${path}.narrative`, ["chapter", "art"]);
  const chapterSource = record(narrativeSource.chapter, `${path}.narrative.chapter`);
  exactKeys(chapterSource, `${path}.narrative.chapter`, ["number", "title", "symbol", "intro", "transition", "pages", "bossOutro"]);
  const pagesValue = chapterSource.pages;
  if (!Array.isArray(pagesValue) || pagesValue.length === 0) throw new TypeError(`${path}.narrative.chapter.pages must contain at least one page`);
  const pages = Object.freeze(pagesValue.map((entry, index) => {
    const page = record(entry, `${path}.narrative.chapter.pages[${String(index)}]`);
    exactKeys(page, `${path}.narrative.chapter.pages[${String(index)}]`, ["label", "text"]);
    return Object.freeze({ label: text(page.label, `${path}.narrative.chapter.pages[${String(index)}].label`), text: text(page.text, `${path}.narrative.chapter.pages[${String(index)}].text`) });
  }));
  const outro = record(chapterSource.bossOutro, `${path}.narrative.chapter.bossOutro`);
  exactKeys(outro, `${path}.narrative.chapter.bossOutro`, ["label", "text"]);
  const artSource = record(narrativeSource.art, `${path}.narrative.art`);
  exactKeys(artSource, `${path}.narrative.art`, ["composition", "wash"]);
  const narrative = Object.freeze({
    chapter: Object.freeze({
      number: text(chapterSource.number, `${path}.narrative.chapter.number`), title: text(chapterSource.title, `${path}.narrative.chapter.title`), symbol: text(chapterSource.symbol, `${path}.narrative.chapter.symbol`), intro: text(chapterSource.intro, `${path}.narrative.chapter.intro`), transition: text(chapterSource.transition, `${path}.narrative.chapter.transition`), pages,
      bossOutro: Object.freeze({ label: text(outro.label, `${path}.narrative.chapter.bossOutro.label`), text: text(outro.text, `${path}.narrative.chapter.bossOutro.text`) }),
    }),
    art: Object.freeze({ composition: text(artSource.composition, `${path}.narrative.art.composition`), wash: text(artSource.wash, `${path}.narrative.art.wash`) }),
  });
  const themeSource = record(source.theme, `${path}.theme`);
  exactKeys(themeSource, `${path}.theme`, ["background", "platform", "accent", "dark"]);
  const theme = Object.freeze({ background: text(themeSource.background, `${path}.theme.background`), platform: text(themeSource.platform, `${path}.theme.platform`), accent: text(themeSource.accent, `${path}.theme.accent`), dark: boolean(themeSource.dark, `${path}.theme.dark`) });
  return Object.freeze({ id, name: text(source.name, `${path}.name`), blurb: text(source.blurb, `${path}.blurb`), musicId: text(source.musicId, `${path}.musicId`), boss, pool, layout, narrative, theme });
}

export function projectStage(source: StageDefinition, path: string): GameReferenceStageV1 {
  const pool = Object.freeze(source.pool.map((entry) => Object.freeze({ kind: entry[0], weight: entry[1], unlockWave: entry[2] ?? 1 })));
  const layout = Object.freeze(source.layout.map((entry) => Object.freeze({ x: entry.x, y: entry.y, w: entry.w, h: entry.h, oneway: entry.oneway })));
  const narrative = Object.freeze({
    chapter: Object.freeze({ number: source.chapter.number, title: source.chapter.title, symbol: source.chapter.symbol, intro: source.chapter.intro, transition: source.chapter.transition, pages: Object.freeze(source.chapter.pages.map((page) => Object.freeze({ label: page.label, text: page.text }))), bossOutro: Object.freeze({ label: source.chapter.bossOutro.label, text: source.chapter.bossOutro.text }) }),
    art: Object.freeze({ composition: source.chapterArt.composition, wash: source.chapterArt.wash }),
  });
  return validateProjectedStage({ id: source.id, name: source.name, blurb: source.blurb, musicId: source.musicId, boss: source.boss, pool, layout, narrative, theme: Object.freeze({ background: source.bg, platform: source.plat, accent: source.accent, dark: source.dark ?? false }) }, path);
}

export function projectMode(source: ModeDefinition, path: string): GameReferenceModeV1 {
  return validateProjectedMode({ id: source.id, order: source.order, label: source.label, blurb: source.blurb, enabled: source.enabled, classification: source.classification, training: source.training, bossOnly: source.bossOnly, sandbox: source.sandbox }, path);
}

export function validateProjectedMode(value: unknown, path: string): GameReferenceModeV1 {
  const source = record(value, path);
  exactKeys(source, path, ["id", "order", "label", "blurb", "enabled", "classification", "training", "bossOnly", "sandbox"]);
  const id = text(source.id, `${path}.id`) as ModeDefinition["id"];
  if (!MODE_IDS.includes(id)) throw new TypeError(`${path}.id is not a canonical RunMode`);
  const order = safeNonNegativeInteger(source.order, `${path}.order`);
  const classification = text(source.classification, `${path}.classification`) as ModeClassification;
  if (!MODE_CLASSIFICATIONS.includes(classification)) throw new TypeError(`${path}.classification is not supported`);
  return Object.freeze({ id, order, label: text(source.label, `${path}.label`), blurb: text(source.blurb, `${path}.blurb`), enabled: boolean(source.enabled, `${path}.enabled`), classification, training: boolean(source.training, `${path}.training`), bossOnly: boolean(source.bossOnly, `${path}.bossOnly`), sandbox: boolean(source.sandbox, `${path}.sandbox`) });
}

export { validateProjectedStage };
