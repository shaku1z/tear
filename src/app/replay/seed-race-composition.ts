import { createSeedRaceDecision } from "../../ghost/seed-race-decisions";
import type { RewardDecision } from "../../gameplay/run/reward-runtime";
import type { RewardChoice, RewardSelectionSnapshot } from "../../gameplay/run/reward-selection";
import type { TearCausalEventV1 } from "../../tearbench/contracts";
import { SeededRandom } from "../../domain/random";
import { stableVerificationHash } from "../../domain/hash";
import { META_RANK_LIMITS } from "../../gameplay/progression/meta";
import { seedRaceCatalogHash, type SeedRaceRun, type SeedRaceShared } from "../../gameplay/run/seed-locked-draft";
import { declareSeedRace, readSeedRaceRun, seedRaceInitialBuildHash } from "../../gameplay/run/seed-race-contract";
import type { GhostLiveReference } from "../../ghost/live-ghost-reference-data";
import { injectedBuildIdentity } from "../../tearbench/live-runtime-snapshots";
import { ENTITY_KIND_REGISTRY } from "../../tearbench/registries";
import { CURRENT_RULESET_VERSION } from "../../gameplay/run/ruleset-version";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameRun, GamePlayer, GameBlade } from "../../gameplay/runtime/game-runtime-state";

/** A scoped native-start input. It never owns profile persistence or a second simulation. */
export function createLiveSeedRace(
  options: Readonly<{
    dependencies: GameRuntimeDependencies;
    run(): GameRun | null;
    player(): GamePlayer;
    blade(): GameBlade;
    baseline(): unknown;
    capture(): ReadonlyMap<string, unknown>;
    resetRewards(): void;
    recording: Readonly<{
      runId(): string | undefined;
      active(): boolean;
      nextSequence(): number;
      tick(): number;
      record(event: TearCausalEventV1): void;
    }>;
    setup(): Pick<SeedRaceShared, "mode" | "difficulty" | "weapon" | "boss">;
  }>,
) {
  const d = options.dependencies;
  const activeRun = () => {
    const run = options.run();
    if (!run) throw new Error("Race requires a live run");
    return run;
  };
  let prepared: { ranks: Readonly<Record<string, number>>; headstartId: string | null } | undefined;
  let pending:
    | {
        seed: number;
        ranks?: Readonly<Record<string, number>>;
        shared?: SeedRaceShared;
        source?: NonNullable<SeedRaceRun["source"]>;
      }
    | undefined;
  const baselineHash = () =>
    stableVerificationHash({
      configuration: options.baseline(),
      scaling: {
        coin: d.REMOTE.coinMult,
        score: d.REMOTE.scoreMult,
        hp: d.REMOTE.enemyHpMult,
        count: d.REMOTE.enemyDensityMult,
      },
    });
  const scoped = (value: NonNullable<typeof pending>, start: () => void) => {
    if (pending) throw new Error("A race start is already in progress");
    pending = value;
    try {
      start();
    } finally {
      pending = undefined;
      prepared = undefined;
    }
  };
  return Object.freeze({
    recordDecision(decision: RewardDecision, before: RewardSelectionSnapshot<RewardChoice>): number {
      const runId = options.recording.runId(),
        race = activeRun().seedRace;
      if (!runId || !race || !options.recording.active()) throw new Error("Race decision recorder unavailable");
      const sequence = options.recording.nextSequence();
      options.recording.record(
        createSeedRaceDecision(sequence, options.recording.tick(), runId, race.sharedHash, before, decision),
      );
      return sequence;
    },
    active: () => pending !== undefined || options.run()?.seedRace !== undefined,
    seed: () => pending?.seed,
    reference(start: () => void): void {
      const setup = options.setup();
      if (!["endless", "campaign", "gauntlet", "bossonly"].includes(setup.mode))
        throw new Error("This mode does not support Seed-Locked Race");
      const ranks = Object.fromEntries(
        Object.entries(META_RANK_LIMITS)
          .filter(([id]) => id !== "greed")
          .map(([id, max]) => {
            const rank = d.META.level(id);
            if (!Number.isSafeInteger(rank) || rank < 0 || rank > max)
              throw new Error("Race META entitlement is invalid");
            return [id, rank];
          }),
      );
      if (!injectedBuildIdentity("standalone", stableVerificationHash(ENTITY_KIND_REGISTRY.ids)))
        throw new Error("Race requires an identified game build");
      scoped({ seed: d.createRunSeed(), ranks }, start);
    },
    challenge(reference: GhostLiveReference, start: () => void): void {
      const race = readSeedRaceRun(reference.seedRace);
      if (race?.role !== "reference" || race.shared.baselineHash !== baselineHash())
        throw new Error("Race reference configuration is incompatible");
      scoped(
        {
          seed: race.shared.seed,
          shared: race.shared,
          source: {
            id: reference.assistance.sourceId,
            root: reference.assistance.sourceRoot,
            manifestHash: reference.assistance.sourceManifestHash,
          },
        },
        start,
      );
    },
    discovery(ordinary: readonly string[]): readonly string[] {
      return pending?.shared?.variantDiscovery ?? ordinary;
    },
    apply(): boolean {
      if (!pending) return false;
      const run = activeRun(),
        context = { player: options.player(), blade: options.blade(), mods: run.mods };
      const ranks = pending.shared?.metaRanks ?? pending.ranks ?? {};
      for (const item of d.SHOP)
        if (item.id !== "headstart" && (ranks[item.id] ?? 0) > 0) item.apply(ranks[item.id] ?? 0, context);
      let headstartId = pending.shared?.headstartId ?? null;
      if ((ranks.headstart ?? 0) > 0) {
        const pool = d.UPGRADES.filter((upgrade) => !upgrade.unique);
        headstartId ??=
          pool[Math.floor(new SeededRandom(`seed-race-headstart.v1:${String(pending.seed)}`).next() * pool.length)]
            ?.id ?? null;
        const upgrade = d.UPGRADES.find((u) => u.id === headstartId);
        if (!upgrade) throw new Error("Race headstart unavailable");
        d.applyUpgrade(upgrade, { ...context, config: d.CONFIG });
      }
      // The shared data is finalized at the settled opening, after native content initialization.
      prepared = { ranks, headstartId };
      return true;
    },
    finalize(): void {
      if (!pending || !prepared) return;
      const state = Object.fromEntries(options.capture()),
        configHash = stableVerificationHash(state["tear.configuration.v1"]);
      const initialBuildHash = seedRaceInitialBuildHash(state);
      const build = injectedBuildIdentity("standalone", stableVerificationHash(ENTITY_KIND_REGISTRY.ids));
      if (!build) throw new Error("Race requires an identified game build");
      const shared =
        pending.shared ??
        ({
          format: "tear-seed-race",
          version: 1,
          ...options.setup(),
          seed: pending.seed,
          metaRanks: prepared.ranks,
          variantDiscovery: [...(activeRun().variantDiscovery ?? [])],
          headstartId: prepared.headstartId,
          initialBuildHash,
          baselineHash: baselineHash(),
          build: {
            ...build,
            rulesetVersion: CURRENT_RULESET_VERSION,
            contentHash: stableVerificationHash(ENTITY_KIND_REGISTRY.ids),
            configHash,
          },
          draft: { policy: "seed-locked-common-offers.v1", seed: pending.seed, catalogHash: seedRaceCatalogHash() },
        } satisfies SeedRaceShared);
      if (shared.initialBuildHash !== initialBuildHash || shared.build.configHash !== configHash)
        throw new Error("Race initial build differs from declared source");
      const reference = declareSeedRace(shared);
      const installed = pending.source
        ? readSeedRaceRun({ ...reference, role: "challenger", source: pending.source })
        : reference;
      if (!installed) throw new Error("Race declaration unavailable");
      activeRun().seedRace = installed;
      prepared = undefined;
      options.resetRewards();
    },
  });
}
