export type EnvironmentTelemetryIntent =
  | Readonly<{ type: "profile-add"; stat: string; amount: number }>
  | Readonly<{ type: "profile-max"; stat: string; value: number }>;

/** Biome-neutral dispatch point; each sibling telemetry adapter owns its vocabulary. */
export function executeEnvironmentTelemetryIntents(
  intents: readonly EnvironmentTelemetryIntent[],
  port: Readonly<{ add(stat: string, amount: number): void; max(stat: string, value: number): void }>,
): void {
  for (const intent of intents) {
    if (intent.type === "profile-add") port.add(intent.stat, intent.amount);
    else port.max(intent.stat, intent.value);
  }
}
