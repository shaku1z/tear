import type { GameAction } from "../input/game-action";

interface Choice {
  readonly id: string;
}

interface RewardSnapshot {
  readonly choices: readonly Choice[];
  readonly reserveChoices: readonly Choice[];
}

interface RuntimeControl {
  readonly enabled?: boolean;
  readonly label: string;
  readonly action: () => void;
}

/** DOM-free semantic routing contract for the live runtime's screen actions. */
export interface TearBenchActionRouting {
  readonly screen: () => string;
  readonly setScreen: (screen: "playing" | "paused") => void;
  readonly runMode: () => string;
  readonly reward: () => RewardSnapshot | null;
  readonly chooseUpgrade: (index: number) => void;
  readonly chooseReserve: (index: number) => void;
  readonly chooseTier: (index: number) => void;
  readonly dispatchPlayground: (abilityId: string) => void;
  readonly renderControls: () => void;
  readonly controls: () => readonly RuntimeControl[];
  readonly focus: () => number;
}

export function liveRewardChoiceIds(context: TearBenchActionRouting): readonly string[] {
  const reward = context.reward();
  const screen = context.screen();
  if (screen === "reserve") return reward?.reserveChoices.map((choice) => choice.id) ?? [];
  if (screen === "draft" || screen === "tierup") return reward?.choices.map((choice) => choice.id) ?? [];
  return [];
}

/** Routes a semantic action without reading or producing browser events. */
export function routeLiveTearBenchAction(context: TearBenchActionRouting, action: GameAction): boolean {
  const screen = context.screen();
  if (action.type === "pause") {
    if (screen === "playing") context.setScreen("paused");
    else if (screen === "paused") context.setScreen("playing");
    else return false;
    return true;
  }
  if (action.type === "ability") {
    if (context.runMode() !== "playground") return false;
    if (action.phase === "pressed") context.dispatchPlayground(action.abilityId);
    return true;
  }
  const reward = context.reward();
  const choices = action.type === "reserve-choice" ? reward?.reserveChoices : reward?.choices;
  const choiceId = "choiceId" in action ? action.choiceId : undefined;
  const index = choiceId === undefined ? -1 : choices?.findIndex((choice) => choice.id === choiceId) ?? -1;
  if (action.type === "draft-choice" && screen === "draft" && index >= 0) {
    context.chooseUpgrade(index);
    return true;
  }
  if (action.type === "reserve-choice" && screen === "reserve" && index >= 0) {
    context.chooseReserve(index);
    return true;
  }
  if (action.type === "tier-up-choice" && screen === "tierup" && index >= 0) {
    context.chooseTier(index);
    return true;
  }
  if (action.type === "confirm" || action.type === "interact") {
    context.renderControls();
    const controls = context.controls();
    const focused = context.focus();
    const control = controls[focused >= 0 ? focused : controls.findIndex((entry) => entry.enabled !== false)];
    if (control === undefined || control.enabled === false) return false;
    control.action();
    return true;
  }
  if (action.type !== "cancel") return false;
  context.renderControls();
  const control = context.controls().find((entry) => entry.enabled !== false
    && /back|cancel|resume|give up|main menu/u.test(entry.label.toLowerCase()));
  if (control === undefined) return false;
  control.action();
  return true;
}
