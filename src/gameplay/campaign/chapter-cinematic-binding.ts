import type {
  CinematicDirectorBinding,
  CinematicDirectorPort,
  CinematicScript,
} from "../runtime/cinematic-director";
import {
  CampaignChapterController,
  type CampaignChapterFlow,
  type CampaignChapterState,
  type CampaignChapterTiming,
  type CampaignStage,
  type ChapterIntent,
  type ChapterPage,
} from "./chapter-controller";
import { stableVerificationHash } from "../../replay/hash";

export interface CampaignChapterBindingSpecV1 {
  readonly format: "tear.campaign-chapter-binding";
  readonly schemaVersion: 1;
  readonly stageIndex: number;
  readonly priorOutro: ChapterPage | null;
  readonly brief: boolean;
  readonly prologueShownBefore: boolean;
  readonly prologueShownAfter: boolean;
  readonly timing: CampaignChapterTiming;
  readonly flowState: CampaignChapterState;
  readonly page: number;
}

export interface CampaignChapterBindingPort {
  readonly dispatch: (intents: readonly ChapterIntent[]) => void;
  readonly preparedWave: () => boolean;
  readonly activationDeferred: () => boolean;
  readonly clear: () => void;
}

export interface CampaignChapterBindingContext extends Readonly<Record<string, unknown>> {
  readonly controller: CampaignChapterController;
  readonly flow: CampaignChapterFlow;
  readonly port: CampaignChapterBindingPort;
}

export interface StagedCampaignChapterBinding {
  readonly spec: CampaignChapterBindingSpecV1;
  readonly controller: CampaignChapterController;
  readonly flow: CampaignChapterFlow;
  readonly binding: CinematicDirectorBinding;
  readonly initialIntents: readonly ChapterIntent[];
  readonly prologueShownAfter: boolean;
}

const REVISION = "tear.campaign-chapter-binding.v1";

function definedData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(definedData);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value)
    .filter((entry) => entry[1] !== undefined)
    .map(([key, entry]) => [key, definedData(entry)]));
}

export function createCampaignChapterBindingSpec(input: Readonly<{
  stageIndex: number;
  priorOutro: ChapterPage | null;
  brief: boolean;
  prologueShownBefore: boolean;
  timing: CampaignChapterTiming;
}>): CampaignChapterBindingSpecV1 {
  return Object.freeze({
    format: "tear.campaign-chapter-binding",
    schemaVersion: 1,
    ...input,
    prologueShownAfter: input.prologueShownBefore || input.stageIndex === 0,
    flowState: "LORE_ENTER",
    page: 0,
  });
}

export function parseCampaignChapterBindingSpec(value: unknown): CampaignChapterBindingSpecV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("campaign chapter binding must be an object");
  }
  const spec = value as Partial<CampaignChapterBindingSpecV1>;
  if (spec.format !== "tear.campaign-chapter-binding" || spec.schemaVersion !== 1) {
    throw new TypeError("unsupported campaign chapter binding version");
  }
  if (!Number.isSafeInteger(spec.stageIndex) || Number(spec.stageIndex) < 0) {
    throw new RangeError("campaign chapter binding stageIndex is invalid");
  }
  if (spec.priorOutro !== null && (typeof spec.priorOutro !== "object" ||
    typeof spec.priorOutro.label !== "string" || typeof spec.priorOutro.text !== "string")) {
    throw new TypeError("campaign chapter binding priorOutro is invalid");
  }
  if (typeof spec.brief !== "boolean" || typeof spec.prologueShownBefore !== "boolean") {
    throw new TypeError("campaign chapter binding flags are invalid");
  }
  if (typeof spec.prologueShownAfter !== "boolean" || typeof spec.timing !== "object") {
    throw new TypeError("campaign chapter binding reconstruction fields are invalid");
  }
  const timingKeys: readonly (keyof CampaignChapterTiming)[] = ["loreReveal", "chapterIn", "loreExit",
    "biomeRevealBrief", "biomeRevealFull", "readyBrief", "readyFull", "dialogueDuck", "biomeRevealDuck"];
  const timing = Object.fromEntries(timingKeys.map((key) => {
    const entry = spec.timing?.[key];
    if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0) {
      throw new TypeError(`campaign chapter binding timing ${key} is invalid`);
    }
    return [key, entry];
  })) as unknown as CampaignChapterTiming;
  const states: readonly CampaignChapterState[] = ["LORE_ENTER", "LORE_READ", "LORE_EXIT", "BIOME_REVEAL", "READY"];
  const flowState = spec.flowState;
  if (flowState === undefined || !states.includes(flowState)) {
    throw new TypeError("campaign chapter binding flowState is invalid");
  }
  if (!Number.isSafeInteger(spec.page) || Number(spec.page) < 0) {
    throw new RangeError("campaign chapter binding page is invalid");
  }
  return Object.freeze({
    format: "tear.campaign-chapter-binding",
    schemaVersion: 1,
    stageIndex: Number(spec.stageIndex),
    priorOutro: spec.priorOutro === null ? null : Object.freeze({ label: spec.priorOutro.label, text: spec.priorOutro.text }),
    brief: spec.brief,
    prologueShownBefore: spec.prologueShownBefore,
    prologueShownAfter: spec.prologueShownAfter,
    timing: Object.freeze(timing),
    flowState,
    page: Number(spec.page),
  });
}

function context(value: Record<string, unknown>): CampaignChapterBindingContext {
  return value as unknown as CampaignChapterBindingContext;
}

export function stageCampaignChapterBinding(
  rawSpec: unknown,
  stage: CampaignStage,
  port: CampaignChapterBindingPort,
): StagedCampaignChapterBinding {
  const spec = parseCampaignChapterBindingSpec(rawSpec);
  const controller = new CampaignChapterController(spec.timing);
  controller.prologueShown = spec.prologueShownBefore;
  const result = controller.begin(spec.stageIndex, stage, spec.priorOutro, spec.brief);
  if (controller.prologueShown !== spec.prologueShownAfter) {
    throw new TypeError("campaign chapter binding prologue transition is inconsistent");
  }
  if (spec.page >= result.flow.pages.length) {
    throw new RangeError("campaign chapter binding page is outside the reconstructed flow");
  }
  result.flow.state = spec.flowState;
  result.flow.page = spec.page;
  const bindingContext: CampaignChapterBindingContext = Object.freeze({ controller, flow: result.flow, port });
  const revision = `${REVISION}:${stableVerificationHash(definedData(result.sequence))}`;
  const beats = result.sequence.beats.map((beat) => Object.freeze({
    ...beat,
    onEnter: (value: Record<string, unknown>) => {
      const bound = context(value);
      bound.port.dispatch(bound.controller.enterBeat(beat.id));
    },
  }));
  const script: CinematicScript = Object.freeze({
    ...result.sequence,
    revision,
    beats: Object.freeze(beats),
    onStart: (value: Record<string, unknown>) => {
      const bound = context(value);
      bound.port.dispatch(bound.controller.onStart());
    },
    onSkip: (_value: Record<string, unknown>, director: CinematicDirectorPort) => { director.skipTo("reveal"); },
    onComplete: (value: Record<string, unknown>) => {
      const bound = context(value);
      bound.port.dispatch(bound.controller.complete(bound.port.preparedWave(), bound.port.activationDeferred()));
      bound.port.clear();
    },
    onCancel: (value: Record<string, unknown>) => {
      const bound = context(value);
      bound.port.dispatch(bound.controller.cancel(bound.port.preparedWave()));
      bound.port.clear();
    },
  });
  return Object.freeze({
    spec,
    controller,
    flow: result.flow,
    binding: Object.freeze({ script, context: bindingContext }),
    initialIntents: result.intents,
    prologueShownAfter: controller.prologueShown,
  });
}

export function captureCampaignChapterBindingSpec(
  spec: CampaignChapterBindingSpecV1,
  flow: CampaignChapterFlow,
): CampaignChapterBindingSpecV1 {
  return Object.freeze({ ...spec, flowState: flow.state, page: flow.page });
}
