export interface TransportBlade {
  state: string; throwId: number; throwCooldownMult: number;
  x: number; y: number; vx: number; vy: number;
  throwBlade(): boolean; tryRecall(player: unknown): string;
  handPos(player: unknown): Readonly<{ x: number; y: number }>;
}

export interface WeaponTransportOptions {
  readonly requested: boolean; readonly player: unknown; readonly blade: TransportBlade;
  readonly cooldown: number;
  onThrow(throwId: number): void; onRecall(): void;
  onQueued(x: number, y: number): void; onTooFar(x: number, y: number): void;
}

export interface WeaponTransportResult { readonly cooldown: number; readonly threw: boolean }

export function handleWeaponTransport(options: WeaponTransportOptions): WeaponTransportResult {
  if (!options.requested) return { cooldown: options.cooldown, threw: false };
  const { blade } = options;
  if (blade.state === "held") {
    if (options.cooldown <= 0 && blade.throwBlade()) {
      options.onThrow(blade.throwId); return { cooldown: 0.5 * blade.throwCooldownMult, threw: true };
    }
    return { cooldown: options.cooldown, threw: false };
  }
  const result = blade.tryRecall(options.player), hand = blade.handPos(options.player);
  if (result === "recalled") options.onRecall();
  else if (result === "queued") options.onQueued(hand.x, hand.y);
  else if (result === "toofar") options.onTooFar(hand.x, hand.y);
  return { cooldown: options.cooldown, threw: false };
}
