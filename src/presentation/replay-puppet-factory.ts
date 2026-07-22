import type { ReplayPuppet } from "./replay-world-frame";

export interface ReplaySpawnSource {
  readonly k: string; readonly b?: string; readonly vn?: string;
}

export interface ReplayPuppetSource extends ReplayPuppet {
  readonly kind: string; hp: number; hpDisplay: number; spawnT: number;
}

export interface ReplayPuppetFactories<Puppet extends ReplayPuppetSource = ReplayPuppetSource> {
  readonly boss: (id: string) => Puppet;
  readonly charger: () => Puppet;
  readonly ranged: () => Puppet;
  readonly flyer: () => Puppet;
  readonly bomber: () => Puppet;
  readonly armored: () => Puppet;
  readonly support: (kind: string) => Puppet;
  readonly wraith: () => Puppet;
  readonly chimera: () => Puppet;
}

export function createReplayPuppet<Puppet extends ReplayPuppetSource, Variant extends Readonly<{ name: string }>>(
  input: ReplaySpawnSource, factories: ReplayPuppetFactories<Puppet>, variants: Readonly<Record<string, readonly Variant[]>>,
  applyVariant: (puppet: Puppet, variant: Variant) => void): Puppet | null {
  try {
    const puppet = input.k === "boss" ? factories.boss(input.b ?? "warden") : createEnemy(input.k, factories);
    const variant = input.vn === undefined ? undefined : variants[puppet.kind]?.find((entry) => entry.name === input.vn);
    if (variant !== undefined) {
      try { applyVariant(puppet, variant); } catch { /* corrupt legacy variant data should not block playback */ }
    }
    puppet.spawnT = 0;
    puppet.hpDisplay = puppet.hp;
    return puppet;
  } catch {
    return null;
  }
}

function createEnemy<Puppet extends ReplayPuppetSource>(kind: string, factories: ReplayPuppetFactories<Puppet>): Puppet {
  switch (kind) {
    case "ranged": return factories.ranged();
    case "flyer": return factories.flyer();
    case "bomber": return factories.bomber();
    case "armored": return factories.armored();
    case "priest": case "herald": case "mender": case "anchor": return factories.support(kind);
    case "wraith": return factories.wraith();
    case "chimera": return factories.chimera();
    default: return factories.charger();
  }
}
