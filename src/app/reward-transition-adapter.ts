import type {
  RewardChoice,
  RewardSelectionIntent,
  RewardSelectionTransition,
} from "../gameplay/run/reward-selection";

export interface LegacyRewardRun<TChoice extends RewardChoice> {
  wave: number;
  specialBlock: number;
  specialsOffered: number;
  reservedUpgrade: TChoice | null;
  mods: { draftRerolls: number; tier: Readonly<Record<string, number>> };
}

export interface RewardTransitionPorts<TChoice extends RewardChoice> {
  applyUpgrade(choice: TChoice): void;
  tierUp(choice: TChoice): void;
  ghostLoadout(choiceId: string, tier: number, wave: number): void;
  ghostEvent(event: "pickup" | "tierup"): void;
  consumeInput(): void;
  resetUi(intent: Extract<RewardSelectionIntent<TChoice>, { type: "reset-ui" }>): void;
  setScreen(screen: "draft" | "reserve" | "tierup" | "playing"): void;
  startNextWave(): void;
  requestPointer(): void;
}

export function executeRewardTransition<TChoice extends RewardChoice>(
  transition: RewardSelectionTransition<TChoice>,
  run: LegacyRewardRun<TChoice>,
  ports: RewardTransitionPorts<TChoice>,
): void {
  const snapshot = transition.snapshot;
  run.mods.draftRerolls = snapshot.rerolls;
  run.specialBlock = snapshot.specialBlock;
  run.specialsOffered = snapshot.specialsOffered;
  run.reservedUpgrade = snapshot.reservedChoice;
  for (const intent of transition.intents) {
    switch (intent.type) {
      case "apply-upgrade": ports.applyUpgrade(intent.choice); break;
      case "tier-up": ports.tierUp(intent.choice); break;
      case "ghost-loadout": ports.ghostLoadout(intent.choiceId, run.mods.tier[intent.choiceId] ?? 1, run.wave); break;
      case "ghost-event": ports.ghostEvent(intent.event); break;
      case "consume-input": ports.consumeInput(); break;
      case "reset-ui": ports.resetUi(intent); break;
      case "set-screen": ports.setScreen(intent.screen); break;
      case "start-next-wave": ports.startNextWave(); break;
      case "request-pointer": ports.requestPointer(); break;
    }
  }
}
