export type RoutingScene = "gameplay" | "boss" | "menu" | "victory" | "defeat" | "replay";

export interface MusicRouteMatch {
  readonly biome?: string;
  readonly bossId?: string;
  readonly scene?: RoutingScene;
  readonly bossRequired?: boolean;
}

export type MusicRouteSelection =
  | { readonly type: "primary"; readonly workId: string }
  | {
      readonly type: "weighted-pool";
      readonly entries: readonly { readonly workId: string; readonly weight: number }[];
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
}
