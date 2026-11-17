export type RoutingScene = "gameplay" | "boss" | "menu" | "victory" | "defeat" | "replay";

export interface MusicRouteMatch {
  readonly biome?: string;
  readonly bossId?: string;
  readonly scene?: RoutingScene;
  readonly bossRequired?: boolean;
  /** Only on the player's first run that reaches this place (from saved progress at run start). */
  readonly firstRun?: boolean;
}

export interface MusicPoolEntry {
  readonly workId: string;
  readonly weight: number;
  /** Left out of the pool until the player has unlocked this work. */
  readonly requiresUnlock?: boolean;
}

export type MusicRouteSelection =
  | { readonly type: "primary"; readonly workId: string }
  | {
      readonly type: "weighted-pool";
      readonly entries: readonly MusicPoolEntry[];
    };

export interface MusicRoutingRule {
  readonly id: string;
  readonly priority?: number;
  readonly match: MusicRouteMatch;
  readonly selection: MusicRouteSelection;
}

export interface MusicRoutingManifest {
  readonly format: "tear-music-routing";
  readonly version: 1;
  readonly defaultWorkId: string;
  readonly rules: readonly MusicRoutingRule[];
}

export interface MusicRoutingContext {
  readonly biomeId: string;
  readonly scene: RoutingScene;
  readonly bossId: string | null;
  /** True on the player's first run that reaches this biome; routes with `firstRun` need it. */
  readonly firstRun?: boolean;
  /** Unlock-gated pool entries are left out unless this says the work is unlocked. */
  readonly isUnlocked?: (workId: string) => boolean;
}
