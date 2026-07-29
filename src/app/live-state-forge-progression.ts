import { planRunStart, type DifficultyStartDefinition } from "../gameplay/run/run-start-plan";
import type { RunDifficulty } from "../gameplay/run/session";
import {
  replayProgressionConfiguration,
  type TearProgressionReplayResult,
} from "../tearbench/progression-replay";
import type { TearProgressionLedger } from "../tearbench/progression-ledger";
import { PRODUCTION_CONFIGURATION_REVISION } from "../tearbench/progression-synthesis-policy";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { LiveGameHostState } from "./live-game-host-state";

export interface LiveStateForgeProgressionOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly state: LiveGameHostState;
  readonly restoreConfiguration: () => void;
}

/** Applies a canonical ledger through the same production mutation functions used by live rewards. */
export function replayLiveStateForgeProgression(
  options: LiveStateForgeProgressionOptions,
  ledger: TearProgressionLedger,
): TearProgressionReplayResult {
  const d = options.dependencies;
  const run = options.state.run();
  const player = options.state.player();
  const blade = options.state.blade();
  if (run === null || player === undefined || blade === undefined) {
    throw new Error("live progression replay requires an active run");
  }
  return replayProgressionConfiguration(ledger, {
    resetConfiguration(revision) {
      if (revision !== PRODUCTION_CONFIGURATION_REVISION) {
        throw new TypeError("progression ledger configuration revision is not current");
      }
      options.restoreConfiguration();
    },
    setupRun(mode, difficulty) {
      if (run.mode !== mode) throw new TypeError(`active mode ${run.mode} does not match ledger mode ${mode}`);
      const definitions = d.CONFIG.difficulties.map((entry): DifficultyStartDefinition => ({
        id: entry.id as RunDifficulty, ...(entry.oneHit === undefined ? {} : { oneHit: entry.oneHit }),
        mods: entry.mods,
      }));
      const plan = planRunStart(difficulty, definitions, d.REMOTE);
      run.diff = plan.difficulty;
      run.diffDmg = plan.playerDamageMultiplier;
      run.coinMod = plan.scaling.coin;
      run.scoreMod = plan.scaling.score;
      run.diffHp = plan.scaling.enemyHp;
      run.diffCount = plan.scaling.enemyCount;
      player.oneHit = plan.oneHit;
      d.CONFIG.player.dmgTakenMult *= plan.playerDamageMultiplier;
    },
    selectWeapon(weaponId) {
      const weapon = d.applyWeapon(weaponId);
        run.weaponId = weapon.id;
        blade.weapon = weapon;
        blade.model = weapon.model;
        weapon.onReset?.({ blade });
      },
    applyMeta(id, value) {
      if (value !== 0) throw new TypeError(`live State Forge does not invent unsupported meta mutation ${id}`);
    },
    applyDraft(id, occurrence) {
      const upgrade = d.UPGRADES.find((entry) => entry.id === id);
      if (upgrade === undefined) throw new TypeError(`unknown live upgrade ${id}`);
      if ((run.mods.owned[id] ?? 0) + 1 !== occurrence) {
        throw new TypeError(`live occurrence for ${id} does not match canonical ledger`);
      }
      d.applyUpgrade(upgrade, { player, blade, mods: run.mods });
    },
    applyTier(id, tier) {
      const before = run.mods.tier[id] ?? 1;
      d.tierUp(id, { player, blade, mods: run.mods });
      if (run.mods.tier[id] !== tier || tier !== before + 1) {
        throw new TypeError(`live tier transition for ${id} did not reach tier ${String(tier)}`);
      }
    },
  });
}
