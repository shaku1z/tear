export interface OverrunState {
  overrun: number;
  overrunStacks: number;
  overrunHoldT: number;
  overrunDecayT: number;
  redlineT: number;
}

export interface OverrunConfig {
  readonly maxStacks: readonly number[];
  readonly hold: number;
  readonly decayStep: number;
  readonly redline: number;
  readonly damagePerStack: number;
  readonly movePerStack: number;
}

export interface OverrunStackResult {
  readonly stacks: number;
  readonly redline: boolean;
  readonly label: string;
}

export function addOverrunStack(state: OverrunState, config: OverrunConfig): OverrunStackResult {
  const tier = Math.max(1, Math.min(3, Math.round(state.overrun || 1)));
  const maximum = config.maxStacks[tier - 1];
  if (maximum === undefined || maximum < 1) {
    throw new RangeError("overrun tier requires a positive stack cap");
  }
  state.overrunStacks = Math.min(maximum, state.overrunStacks + 1);
  state.overrunHoldT = config.hold;
  state.overrunDecayT = config.decayStep;
  if (tier >= 3 && state.overrunStacks >= maximum) state.redlineT = config.redline;
  const redline = state.redlineT > 0;
  return Object.freeze({
    stacks: state.overrunStacks,
    redline,
    label: redline ? "REDLINE" : `OVERRUN ×${String(state.overrunStacks)}`,
  });
}

export function advanceOverrun(state: OverrunState, config: OverrunConfig, seconds: number): void {
  if (state.redlineT > 0) state.redlineT = Math.max(0, state.redlineT - seconds);
  if (state.overrunStacks <= 0 || state.redlineT > 0) return;
  if (state.overrunHoldT > 0) {
    state.overrunHoldT = Math.max(0, state.overrunHoldT - seconds);
    return;
  }
  state.overrunDecayT -= seconds;
  while (state.overrunDecayT <= 0 && state.overrunStacks > 0) {
    state.overrunStacks -= 1;
    state.overrunDecayT += config.decayStep;
  }
}

export function overrunDamageMultiplier(
  state: Pick<OverrunState, "overrunStacks">,
  config: OverrunConfig,
): number {
  return 1 + Math.max(0, state.overrunStacks) * config.damagePerStack;
}

export function overrunMovementMultiplier(
  state: Pick<OverrunState, "overrun" | "overrunStacks">,
  config: OverrunConfig,
): number {
  return state.overrun >= 2 ? 1 + Math.max(0, state.overrunStacks) * config.movePerStack : 1;
}
