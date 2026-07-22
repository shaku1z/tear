import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GamePlayer, GameRun } from "./game-runtime-state";
import type { LiveRewardRuntime } from "./live-reward-runtime";
import type { createLiveScreenRenderers } from "../presentation/screens/live-screen-renderers";
import { buildAbilityCards, buildDraftCard, buildGameoverSnapshot, buildPausedSnapshot,
  buildResultLog, buildRunProgressSnapshot, buildTierCards, buildWinSnapshot,
  type AchievementProgressSource, type UpgradePresentationSource } from "../presentation/run-screen-snapshots";
import type { RunResultInfo } from "../gameplay/run/outcome-planner";

type Dependencies = Pick<GameRuntimeDependencies, "ACH" | "CG" | "CONFIG" | "DAILY" | "FX" | "PROFILE" |
  "SFX" | "UPGRADES" | "nextTierDesc">;
type ActionRun = GameRun & { adRevived?: boolean };
type Upgrade = GameRuntimeDependencies["UPGRADES"][number];
type RewardRuntime = LiveRewardRuntime<Upgrade>;
type ScreenRenderers = ReturnType<typeof createLiveScreenRenderers>;
type AbilityCategories = Parameters<typeof buildDraftCard>[2];
type AbilityCategory = Parameters<typeof buildDraftCard>[3];
type RewardChoice = Upgrade;
type Achievement = NonNullable<ReturnType<Dependencies["ACH"]["byId"]>>;

export interface RunScreenState {
  readonly screen: () => string;
  readonly run: () => ActionRun;
  readonly player: () => GamePlayer;
  readonly scroll: () => number;
  readonly setScroll: (value: number) => void;
  readonly continueSeconds: () => number;
  readonly replayAvailable: () => boolean;
  readonly setContinueSeconds: (value: number) => void;
  readonly setScreen: (screen: "menu" | "playing") => void;
  readonly outcome: () => RunResultInfo;
}

export interface RunScreenServices {
  readonly dependencies: Dependencies;
  readonly reward: RewardRuntime;
  readonly renderers: ScreenRenderers;
  readonly categories: () => AbilityCategories;
  readonly fallbackCategory: () => AbilityCategory;
  readonly categoryOrder: readonly string[];
  readonly specialColor: string;
  readonly abilityBadge: (choice: RewardChoice) => Readonly<{ label: string }>;
  readonly formatTime: (seconds: number) => string;
  readonly clamp: (value: number, minimum: number, maximum: number) => number;
  readonly saveBest: (mode: string, difficulty: string, wave: number, score: number, seconds: number) => void;
  readonly awardCoins: (score: number) => void;
  readonly cinema: Readonly<{ active: boolean; cancel(reason: string): void }>;
  readonly clearFinale: () => void;
  readonly terminateRun: (reason: "quit") => void;
  readonly addFloater: (x: number, y: number, text: string, big: boolean, color: string) => void;
  readonly addShake: (amount: number) => void;
  readonly addFlash: (amount: number) => void;
  readonly requestPointer: () => void;
}

export interface LiveRunScreenAdapters {
  readonly renderDraft: () => void;
  readonly renderReserve: () => void;
  readonly renderTierUp: () => void;
  readonly renderPaused: () => void;
  readonly renderConfirmQuit: () => void;
  readonly renderContinue: () => void;
  readonly renderGameover: () => void;
  readonly renderWin: () => void;
  readonly rerollDraft: () => void;
  readonly chooseUpgrade: (index: number) => void;
  readonly chooseReserve: (index: number) => void;
  readonly chooseTierUp: (index: number) => void;
  readonly quitRun: () => void;
  readonly reviveByAd: () => void;
}

export function createLiveRunScreenAdapters(state: RunScreenState, services: RunScreenServices): LiveRunScreenAdapters {
  const { dependencies: d, reward, renderers } = services;
  const presentUpgrade = (upgrade: RewardChoice): UpgradePresentationSource => ({
    id: upgrade.id, name: upgrade.name, desc: upgrade.desc, cat: upgrade.cat,
    unique: upgrade.unique,
    ...(upgrade.tiers === undefined ? {} : { tiers: upgrade.tiers.map((tier) => ({ desc: tier.desc })) }),
  });
  const draftCard = (choice: RewardChoice) => buildDraftCard(presentUpgrade(choice), state.run().mods, services.categories(),
    services.fallbackCategory(), services.abilityBadge(choice).label, services.specialColor);
  const abilityCards = () => buildAbilityCards(d.UPGRADES.map(presentUpgrade), state.run().mods, services.categories(),
    services.fallbackCategory(), services.categoryOrder, services.specialColor);
  const progressRows = () => {
    const run = state.run();
    const dailies = d.DAILY.today().map((challenge) => {
      const done = d.DAILY.isDone(challenge), current = d.DAILY.progress(challenge);
      return { label: challenge.txt(challenge.goal), current, goal: challenge.goal, done,
        detail: done ? "✓ +" + String(challenge.shards) : String(current) + " / " + String(challenge.goal) };
    });
    return buildRunProgressSnapshot({ dailies, achievementIds: Object.keys(d.PROFILE.data.ach),
      runAchievementIds: run._achSnap, achievements: d.ACH.list, byId: (id) => d.ACH.byId(id),
      unlocked: (id) => d.PROFILE.unlocked(id), progress: (achievement) => withAchievement(achievement, 0,
        (source) => d.ACH.progress(source)),
      progressText: (achievement) => withAchievement(achievement, "", (source) => d.ACH.progressText(source)),
      shardsFor: (achievement) => withAchievement(achievement, 0, (source) => d.ACH.shardsFor(source)),
      coinsFor: (achievement) => withAchievement(achievement, 0, (source) => d.ACH.coinsFor(source)) });
  };
  const resultLog = () => buildResultLog(state.outcome().log);

  return Object.freeze({
    renderDraft(): void {
      const snapshot = reward.snapshot();
      if (snapshot) renderers.draft({ id: "draft", wave: snapshot.wave, rerolls: snapshot.rerolls,
        cards: snapshot.choices.map(draftCard) });
    },
    renderReserve(): void {
      const snapshot = reward.snapshot();
      if (snapshot) renderers.reserve({ id: "reserve", cards: snapshot.reserveChoices.map(draftCard) });
    },
    renderTierUp(): void {
      const snapshot = reward.snapshot();
      if (!snapshot) return;
      const maximum = Math.max(0, Math.ceil(snapshot.choices.length / 4) * 288 - 576);
      const scroll = services.clamp(state.scroll(), 0, maximum);
      state.setScroll(scroll);
      renderers.tierup({ id: "tierup", canScrollUp: scroll > 0, canScrollDown: scroll < maximum,
        cards: buildTierCards(snapshot.choices.map(presentUpgrade), state.run().mods, services.categories(), services.fallbackCategory(),
          (upgrade) => { const source = d.UPGRADES.find((entry) => entry.id === upgrade.id);
            return source ? d.nextTierDesc(source, state.run().mods) : upgrade.desc; }) });
    },
    renderPaused(): void {
      const run = state.run();
      renderers.paused(buildPausedSnapshot({ summary: (run.isBossWave ? "BOSS" : "WAVE " + String(run.wave)) +
        "   ·   " + String(run.score) + " pts   ·   " + services.formatTime(run.runTime),
        abilities: abilityCards(), progress: progressRows() }));
    },
    renderConfirmQuit(): void { renderers.confirmquit({ id: "confirmquit" }); },
    renderContinue(): void {
      const seconds = state.continueSeconds();
      renderers.continue({ id: "continue", seconds: seconds > 1e8 ? 0 : seconds, requesting: false });
    },
    renderGameover(): void {
      const outcome = state.outcome();
      renderers.gameover(buildGameoverSnapshot({ wave: outcome.wave, score: outcome.score, time: outcome.time,
        isNew: outcome.isNew, best: outcome.best, earned: outcome.earned,
        coins: outcome.coins, replayAvailable: state.replayAvailable(), abilities: abilityCards(),
        progress: progressRows(), log: resultLog(), formatTime: services.formatTime }));
    },
    renderWin(): void {
      const outcome = state.outcome();
      renderers.win(buildWinSnapshot({ campaign: outcome.campaign === true, score: outcome.score, time: outcome.time,
        isNew: outcome.isNew, earned: outcome.earned, coins: outcome.coins,
        difficulty: outcome.diff ?? "",
        log: resultLog(), formatTime: services.formatTime }));
    },
    rerollDraft(): void { if (state.screen() === "draft") reward.reroll(); },
    chooseUpgrade(index: number): void { reward.selectDraft(index); },
    chooseReserve(index: number): void { reward.selectReserve(index); },
    chooseTierUp(index: number): void { reward.selectTier(index); },
    quitRun(): void {
      const run = state.run();
      const completed = run.waveLog.length;
      if (completed > 0) {
        services.saveBest(run.mode, run.diff, completed, run.score, run.runTime);
        services.awardCoins(run.score);
      }
      if (services.cinema.active) services.cinema.cancel("quit-run");
      services.clearFinale();
      services.terminateRun("quit");
      state.setScreen("menu");
    },
    reviveByAd(): void {
      state.setContinueSeconds(1e9);
      d.CG.rewarded(() => {
        const player = state.player(), run = state.run();
        player.hp = Math.round(player.maxHp * 0.35); player.iframe = 1.6; run.adRevived = true;
        d.FX.ring(player.x, player.y, 16, d.CONFIG.colors.perfect);
        d.FX.burst(player.x, player.y, 0, -1, 16, d.CONFIG.colors.perfect);
        services.addFloater(player.x, player.y - 44, "REVIVED", true, d.CONFIG.colors.perfect);
        services.addShake(d.CONFIG.juice.shakeBig); services.addFlash(d.CONFIG.juice.flashParry); d.SFX.parry();
        state.setScreen("playing"); services.requestPointer();
      }, (accepted) => { if (!accepted && state.screen() === "continue") state.setContinueSeconds(5); });
    },
  });

  function withAchievement<T>(achievement: AchievementProgressSource, fallback: T,
    project: (source: Achievement) => T): T {
    const source = d.ACH.byId(achievement.id);
    return source === undefined ? fallback : project(source);
  }
}
