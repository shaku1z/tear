import { MODE_IDS } from "../../gameplay/run/mode-catalog";
import { DIFFICULTY_IDS } from "../../gameplay/run/difficulty-catalog";
import type { LiveWorldSessionState } from "../world/world-session-state";
import type { RunMode, RunDifficulty } from "../../gameplay/run/session";
import type { LiveGhostRecordingSessionState } from "./ghost-recording-session-state";
import { createBrowserBeatThisRun } from "../../ghost/browser-beat-this-run";
import {
  assertBeatRuntimeCompatibility,
  BEAT_RULES,
  beatRunBinding,
  decodeBeatThisRunCode,
  encodeBeatThisRunCode,
  type BeatRule,
  type BeatThisRunCode,
} from "../../ghost/beat-this-run";
import { injectedBuildIdentity } from "../../tearbench/live-runtime-snapshots";
import { ENTITY_KIND_REGISTRY } from "../../tearbench/registries";
import { CURRENT_RULESET_VERSION } from "../../gameplay/run/ruleset-version";
import { seedRaceInitialBuildHash } from "../../ghost/seed-race-contract";
import { stableVerificationHash } from "../../replay/hash";
import { createCareerTextPort } from "./browser-ghost-career-search";
import { createSeedRaceDecision } from "../../ghost/seed-race-decisions";
import type { RewardDecision } from "../../gameplay/run/reward-runtime";
import type { RewardChoice, RewardSelectionSnapshot } from "../../gameplay/run/reward-selection";
import type { GhostPublicationRuntime } from "../../platform/ghost-publication-runtime";
import type { GameRun } from "../shell/game-runtime-state";

export function createLiveBeatThisRunController(
  options: Readonly<{
    factory: IDBFactory | undefined;
    publication: GhostPublicationRuntime;
    document: Document;
    run(): GameRun | null;
    screen(): string;
    nativeStart: Readonly<{
      session(): Pick<
        LiveWorldSessionState,
        "setSelectedWeapon" | "setSelectedMode" | "setSelectedDifficulty" | "setSelectedBoss" | "setRunSeed"
      >;
      prepare(): void;
      start(mode: RunMode, difficulty: RunDifficulty): void;
      refuse(): void;
    }>;
    capture(): ReadonlyMap<string, unknown>;
    tick(): number;
    recording: LiveGhostRecordingSessionState;
  }>,
) {
  const service = createBrowserBeatThisRun(options.factory, options.publication),
    text = createCareerTextPort(
      options.document,
      "Choose a listed rule or paste a shared code. Copy the prepared code to share; use START and Apply to begin.",
    );
  let generation = 0,
    owner: AbortController | undefined,
    message = "",
    pending: BeatThisRunCode | undefined;
  let code: BeatThisRunCode | undefined, installed: GameRun | undefined;
  const cancel = () => {
    message = "";
    generation++;
    owner?.abort();
    owner = undefined;
    text.close();
  };
  const perform = async (operation: (signal: AbortSignal) => Promise<void>) => {
    cancel();
    const ticket = generation,
      control = new AbortController();
    owner = control;
    message = "BEAT THIS RUN · preparing original published source…";
    try {
      await operation(control.signal);
    } catch (error) {
      if (ticket === generation)
        message = `BEAT THIS RUN unavailable: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      if (ticket === generation) owner = undefined;
    }
  };
  const preview = (value: BeatThisRunCode) => {
    code = value;
    message = `BEAT THIS RUN · ${value.rule} target ${String(value.target)} · ${value.setup.mode}/${value.setup.difficulty}/${value.setup.weapon} · unranked / no progression`;
    const ticket = generation;
    text.edit(
      `${message} · independent input and legal private drafts; same source seed and initial build required`,
      { code: encodeBeatThisRunCode(value), action: "START" },
      (fields) => {
        if (ticket !== generation || fields.action !== "START") return;
        void perform(async (signal) => {
          const parsed = decodeBeatThisRunCode(fields.code ?? "");
          if (parsed.hash !== value.hash) throw new Error("Prepared challenge changed");
          await service.resolve(parsed, signal);
          if (!(await service.current(parsed))) throw new Error("Prepared source custody changed");
          signal.throwIfAborted();
          if (options.screen() !== "profile") throw new Error("Return to Career before starting a Beat attempt");
          const contentHash = stableVerificationHash(ENTITY_KIND_REGISTRY.ids),
            build = injectedBuildIdentity("standalone", contentHash);
          if (!build) throw new Error("Beat requires an identified game build");
          assertBeatRuntimeCompatibility(parsed, {
            version: build.version,
            revision: build.revision,
            target: build.target,
            rulesetVersion: CURRENT_RULESET_VERSION,
            contentHash,
            configHash: parsed.setup.configuration,
          });
          pending = parsed;
          let preparing = false;
          try {
            const mode = MODE_IDS.find((id) => id === parsed.setup.mode),
              difficulty = DIFFICULTY_IDS.find((id) => id === parsed.setup.difficulty),
              seed = Number(parsed.setup.seed);
            if (!mode || !difficulty || !Number.isSafeInteger(seed) || seed < 1 || seed > 0xffff_ffff)
              throw new Error("Unsupported Beat setup");
            preparing = true;
            options.nativeStart.prepare();
            const session = options.nativeStart.session();
            session.setSelectedWeapon(parsed.setup.weapon);
            session.setSelectedMode(mode);
            session.setSelectedDifficulty(difficulty);
            session.setSelectedBoss(parsed.setup.boss);
            session.setRunSeed(seed);
            options.nativeStart.start(mode, difficulty);
            message = `BEAT THIS RUN · ${parsed.rule} · noncompetitive / no progression`;
          } catch (error) {
            if (!preparing) throw error;
            pending = undefined;
            try {
              options.nativeStart.refuse();
            } finally {
              message = `BEAT THIS RUN unavailable: ${error instanceof Error ? error.message : String(error)}`;
            }
          } finally {
            pending = undefined;
          }
        });
      },
    );
  };
  return Object.freeze({
    snapshot: () => ({ message, active: pending !== undefined || options.run()?.beatThisRun !== undefined }),
    active: () => pending !== undefined || options.run()?.beatThisRun !== undefined,
    cancel,
    screenChanged(screen: string) {
      if (screen !== "profile" && pending === undefined) cancel();
    },
    seed: () => (pending ? Number(pending.setup.seed) : undefined),
    installed(run: GameRun) {
      if (pending) {
        run.beatThisRun = beatRunBinding(pending);
        installed = run;
        code = pending;
      }
    },
    finalize() {
      if (!pending) return;
      const state = Object.fromEntries(options.capture());
      if (
        installed !== options.run() ||
        stableVerificationHash(state["tear.configuration.v1"]) !== pending.setup.configuration ||
        seedRaceInitialBuildHash(state) !== pending.setup.initialBuild ||
        stableVerificationHash(installed.variantDiscovery ?? []) !== pending.setup.variants ||
        stableVerificationHash({
          coinMod: installed.coinMod,
          scoreMod: installed.scoreMod,
          diffHp: installed.diffHp,
          diffCount: installed.diffCount,
        }) !== pending.setup.scaling ||
        stableVerificationHash({ bossOrder: installed.bossOrder, curBoss: installed.curBoss }) !== pending.setup.course
      )
        throw new Error("Current permanent build/config/content differs from source; Beat start refused");
    },
    declaration: () => (code && options.run()?.beatThisRun?.codeHash === code.hash ? code : undefined),
    recordDecision(decision: RewardDecision, before: RewardSelectionSnapshot<RewardChoice>): number {
      const runId = options.recording.replayContext()?.run.id,
        binding = options.run()?.beatThisRun;
      if (!runId || !binding) throw new Error("Beat decision recorder unavailable");
      const sequence = options.recording.nextEventSequence(),
        event = createSeedRaceDecision(sequence, options.tick(), runId, binding.codeHash, before, decision);
      options.recording.recorder()?.record("events", event.tick, {
        ...event,
        id: `beat-decision-${String(sequence)}`,
        payload: { ...event.payload, format: "tear-beat-run-decision" },
      });
      return sequence;
    },
    finalized(id: string) {
      message = `BEAT THIS RUN · sealed ${id}. In Career choose BEAT RESULT, then SAVE RESULT. Retry keeps this attempt.`;
    },
    action(command: string, id?: string, expectedManifestHash?: string): void {
      if (command === "beat-receive") {
        cancel();
        const ticket = generation;
        text.edit("RECEIVE BEAT THIS RUN CODE · explicit public-source download", { code: "" }, (fields) => {
          if (ticket !== generation) return;
          void perform(async (signal) => {
            const parsed = decodeBeatThisRunCode(fields.code ?? "");
            await service.resolve(parsed, signal);
            signal.throwIfAborted();
            preview(parsed);
          });
        });
        return;
      }
      if (!id) {
        message = "Select a canonical source/attempt";
        return;
      }
      if (command === "beat") {
        cancel();
        const ticket = generation;
        text.edit(
          `BEAT THIS RUN · choose native rule: ${BEAT_RULES.join(", ")} · parry-only needs unavailable damage-origin proof; boss checkpoint uses Theater CHALLENGE`,
          { rule: "score" },
          (fields) => {
            if (ticket !== generation) return;
            void perform(async (signal) => {
              if (!BEAT_RULES.includes(fields.rule as BeatRule)) throw new Error("Unsupported native goal");
              const value = await service.create(id, fields.rule as BeatRule, signal, expectedManifestHash);
              signal.throwIfAborted();
              preview(value);
            });
          },
        );
        return;
      }
      void perform(async (signal) => {
        const reviewed = await service.review(id, command === "beat-save", expectedManifestHash);
        signal.throwIfAborted();
        if (command === "beat-retry") {
          preview(reviewed.code);
          return;
        }
        message = `BEAT RESULT · ${reviewed.result.status.toUpperCase()} · ${reviewed.result.reason} · actual ${String(reviewed.result.actual)} / target ${String(reviewed.result.target)} · ${reviewed.saved ? "saved locally" : "not saved; choose SAVE RESULT"}`;
      });
    },
  });
}
