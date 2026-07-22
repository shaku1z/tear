export type VoidLane = "lower" | "upper";
export type VoidHazardType = "plain" | "fire" | "crumble" | "cage";
export type VoidHazardState = "cold" | "arming" | "hot" | "crumble";
export type VoidSeed = string | number | null | undefined;

export interface VoidPhysicsOptions {
  jumpSpeed: number;
  gravity: number;
  moveSpeed: number;
  dashSpeed: number;
  dashDuration: number;
}

export interface VoidOptions {
  startX: number;
  chunkWidthMin: number;
  chunkWidthMax: number;
  platformHeight: number;
  platformWidthMin: number;
  platformWidthMax: number;
  edgeInset: number;
  laneClearance: number;
  lowerBandMin: number;
  lowerBandMax: number;
  upperBandMin: number;
  upperBandMax: number;
  transferDeltaMin: number;
  transferDeltaMax: number;
  scrollSpeedMin: number;
  scrollSpeedMax: number;
  materializationState: string;
  firePeriod: number;
  fireArmTime: number;
  fireHotTime: number;
  cageHeight: number;
  cageHalfWidth: number;
  cageVerticalClearance: number;
  cageMinBlockHeight: number;
  playerHalfWidth: number;
  playerHalfHeight: number;
  viewportWidth?: number;
  physics: VoidPhysicsOptions;
}

export type VoidOptionsInput = Partial<Omit<VoidOptions, "physics">> & {
  physics?: Partial<VoidPhysicsOptions>;
};

export interface VoidCageSpec {
  offsetX: number;
  halfWidth: number;
  height: number;
}

export interface VoidRect {
  centerX: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VoidPlatform {
  id: string;
  platformId: string;
  voidId: string;
  chunkId: number;
  x: number;
  y: number;
  w: number;
  h: number;
  oneway: boolean;
  void: boolean;
  voidLane: VoidLane;
  voidType: VoidHazardType;
  voidRole: string;
  hazardSeed: number;
  hazardPhaseOffset: number;
  hazardPhase: number;
  materializationState: string;
  material: string;
  arenaMaterial: string;
  touchT: number;
  fireOn: boolean;
  fireState: string;
  transferNode: boolean;
  connectionIds: string[];
  collidable?: boolean;
  cage?: VoidCageSpec;
  cageX?: number;
  cageHeight?: number;
  cageHalfWidth?: number;
  cageRect?: VoidRect | null;
  cageAdjustedFor?: string[];
  cinematicIngress?: boolean;
}

export interface VoidConnector {
  id: string;
  from: string;
  to: string;
  kind: string;
}

export interface VoidChunk {
  id: string;
  chunkId: number;
  seed: number;
  x: number;
  width: number;
  motif: string;
  pressureLane: VoidLane;
  wispLane: VoidLane | null;
  majorAttackWindow: boolean;
  hasTransfer: boolean;
  transferWindow: { x0: number; x1: number } | null;
  transferWindowLocal: { x0: number; x1: number } | null;
  connectors: VoidConnector[];
  connections: VoidConnector[];
  platforms: VoidPlatform[];
  lanes: Record<VoidLane, VoidPlatform[]>;
  threat: Record<VoidLane, number>;
  rescuePlatformId: string | null;
  options?: VoidOptions;
  cinematicIngress?: boolean;
}

export interface VoidGeneratorState {
  version: 2;
  seed: number;
  rngState: number;
  nextChunkId: number;
  nextX: number;
  nextConnectorAt: number;
  lastExitY: Record<VoidLane, number>;
  laneThreat: Record<VoidLane, number>;
  densityOffset: number;
  lastMotif: string;
  recentChunks: VoidChunk[];
  options: VoidOptions;
}

export interface VoidGraphEdge {
  id?: string;
  from: string;
  to: string;
  kind: string;
  ok: boolean;
  reason: string;
  rise: number;
  gap?: number;
  airTime?: number;
  relativeSpeed?: number;
  jumpReach?: number;
  dashReach?: number;
  mode?: "dash" | "jump";
  requiresDash?: boolean;
}

export interface VoidGraph {
  platforms: VoidPlatform[];
  byId: Map<string, VoidPlatform>;
  edges: VoidGraphEdge[];
}

export type VoidInspectOptions = VoidOptionsInput & {
  visibleRect?: { left: number; right: number };
  liveMin?: number;
  liveMax?: number;
};

export interface VoidInspection {
  ok: boolean;
  errors: string[];
  rescue: VoidPlatform | null;
  graphs: VoidGraph[];
  stats: {
    chunks: number;
    platforms: number;
    lower: number;
    upper: number;
    connectors: number;
    live: Record<VoidLane, number> | null;
  };
}

export interface VoidGenerator {
  readonly defaults: Readonly<VoidOptions>;
  readonly motifs: readonly string[];
  create(seed: VoidSeed, overrides?: VoidOptionsInput): VoidGeneratorState;
  next(state: VoidGeneratorState, appendX?: number): { state: VoidGeneratorState; chunk: VoidChunk };
  generate(seed: VoidSeed, count: number, overrides?: VoidOptionsInput): { state: VoidGeneratorState; chunks: VoidChunk[]; platforms: VoidPlatform[] };
  inspect(chunks?: readonly VoidChunk[], overrides?: VoidInspectOptions): VoidInspection;
  hazardState(platform: VoidPlatform | null | undefined, runTime: number, overrides?: VoidOptionsInput): VoidHazardState;
  selectRescue(platforms: readonly VoidPlatform[], centerX: number, runTime: number, overrides?: VoidOptionsInput): VoidPlatform | null;
  cageGeometry(platform: VoidPlatform | null | undefined, overrides?: VoidOptionsInput): VoidRect | null;
  materialize(chunk: VoidChunk, offsetX: number, materializationState?: string): VoidChunk;
  ingress(seed: VoidSeed, anchorX: number, anchorY: number, overrides?: VoidOptionsInput): VoidChunk;
}
