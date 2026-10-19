/** Narrow IN2 contract: registered Verdant color images, static ordered layers.
 * Camera coverage and motion are deliberately not certified by this package. */
const exteriorRects = {
  "exterior-top-left": [-384, -1408, 1220, 1408],
  "exterior-top-right": [836, -1408, 1220, 1408],
  "exterior-bottom-left": [-384, 941, 1220, 1408],
  "exterior-bottom-right": [836, 941, 1220, 1408],
  "exterior-left": [-384, 0, 384, 941],
  "exterior-right": [1672, 0, 384, 941],
} as const;
type ExteriorKey = keyof typeof exteriorRects;
export type VerdantAssetKey = "control-top" | "control-bottom" | "support-top" | "support-bottom" | "structure-top" | "structure-bottom" | "foliage" | "tail" | "tail-motion" | ExteriorKey;
function exteriorRect(key: string): readonly [number, number, number, number] | undefined {
  return Object.hasOwn(exteriorRects, key) ? exteriorRects[key as ExteriorKey] : undefined;
}
export interface VerdantSceneAsset {
  readonly id: string;
  readonly key: VerdantAssetKey;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly alpha: "opaque" | "straight";
}
export interface VerdantSceneLayer {
  readonly id: string;
  readonly assetId: string;
  readonly rect: readonly [number, number, number, number];
  readonly order: number;
  readonly purpose: "support" | "tail" | "foliage";
  readonly motion: "static" | "anchored-sequence" | "anchored-foliage";
}
const waterReceiver = [[720, 800], [965, 800], [990, 835], [700, 835]] as const;
export interface VerdantWaterReceiver {
  readonly receiver: readonly (readonly [number, number])[];
  readonly maxDisplacement: number;
  readonly maxOpacity: number;
}
export interface VerdantScenePackage {
  readonly id: "verdant-IN1-control" | "verdant-IN2-lower-tail" | "verdant-IN3-overscan" | "verdant-living-stage-prototype";
  readonly approvedSourceSHA256: string;
  readonly assets: readonly VerdantSceneAsset[];
  readonly layers: readonly VerdantSceneLayer[];
  readonly water?: VerdantWaterReceiver;
  readonly poolRefraction?: true;
}
// Generated exterior is delivered at quarter resolution; original core unchanged.
export const VERDANT_SCENE_MAX_DECODED_BYTES = 8 * 1024 * 1024;
// User-authorized experiment only; this does not relax the comparison packages.
export const VERDANT_PROTOTYPE_MAX_DECODED_BYTES = 16 * 1024 * 1024;
const keys: readonly string[] = ["control-top", "control-bottom", "support-top", "support-bottom", "structure-top", "structure-bottom", "foliage", "tail", "tail-motion", ...Object.keys(exteriorRects)];
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected scene record");
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/u.test(value)) throw new Error("Invalid scene identifier");
  return value;
}
function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error("Invalid scene digest");
  return value;
}
function dimension(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 2048) throw new Error("Invalid scene dimension");
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 9) throw new Error("Invalid scene collection size");
  return value as unknown[];
}

/** Parses into a fresh immutable snapshot; caller mutations cannot affect draw. */
export function validateVerdantScenePackage(input: unknown): VerdantScenePackage {
  const raw = object(input);
  const prototype = raw.id === "verdant-living-stage-prototype";
  if (raw.format !== "tear-verdant-image-package" || raw.version !== 1
    || raw.stageId !== "verdant-sanctum"
    || (raw.id !== "verdant-IN1-control" && raw.id !== "verdant-IN2-lower-tail" && raw.id !== "verdant-IN3-overscan" && raw.id !== "verdant-living-stage-prototype")) {
    throw new Error("Unsupported Verdant package");
  }
  const size: unknown = raw.authoredSize;
  if (!Array.isArray(size) || size.length !== 2 || size[0] !== 1672 || size[1] !== 941) throw new Error("Unregistered source frame");
  if (raw.approvedSourceSHA256 !== "0c332d1b114af9ad88435896fa52af6a75fe2cfbf2cb0256d953a1bc96fbffcd") {
    throw new Error("Unregistered approved source");
  }
  const ids = new Set<string>(), assetKeys = new Set<string>();
  const assets = list(raw.assets).map((entry): VerdantSceneAsset => {
    const asset = object(entry), id = identifier(asset.id), key = asset.key;
    if (typeof key !== "string" || !keys.includes(key) || ids.has(id) || assetKeys.has(key)) {
      throw new Error("Duplicate or unregistered scene asset");
    }
    ids.add(id); assetKeys.add(key);
    const width = dimension(asset.width), height = dimension(asset.height), alpha = asset.alpha;
    if (alpha !== "opaque" && alpha !== "straight") throw new Error("Unsupported alpha convention");
    const exterior = exteriorRect(key);
    if (exterior ? width !== exterior[2] / 4 || height !== Math.ceil(exterior[3] / 4) || alpha !== "opaque"
      : key === "foliage" ? width !== 1672 || height !== 623 || alpha !== "straight"
      : key === "tail-motion" ? width !== 486 || height !== 54 || alpha !== "straight"
      : key === "tail" ? width !== 50 || height !== 50 || alpha !== "straight"
      : width !== 1672 || height !== (key.endsWith("top") ? 471 : 470) || alpha !== "opaque") {
      throw new Error("Asset registration mismatch");
    }
    return Object.freeze({ id, key: key as VerdantAssetKey, sha256: digest(asset.sha256), width, height, alpha });
  });
  if (assets.reduce((sum, asset) => sum + asset.width * asset.height * 4, 0)
    > (prototype ? VERDANT_PROTOTYPE_MAX_DECODED_BYTES : VERDANT_SCENE_MAX_DECODED_BYTES)) {
    throw new Error("Scene decoded resource budget exceeded");
  }
  const expected = prototype ? [...Object.keys(exteriorRects), "structure-top", "structure-bottom", "foliage"]
    : raw.id === "verdant-IN1-control" ? ["control-top", "control-bottom"]
    : [...(raw.id === "verdant-IN3-overscan" ? Object.keys(exteriorRects) : []), "support-top", "support-bottom",
      raw.id === "verdant-IN3-overscan" ? "tail-motion" : "tail"];
  if (assets.length !== expected.length || expected.some((key) => !assetKeys.has(key))) throw new Error("Incomplete scene asset set");
  const layerIds = new Set<string>(), used = new Set<string>();
  let lastOrder = -1;
  const layers = list(raw.layers).map((entry): VerdantSceneLayer => {
    const layer = object(entry), id = identifier(layer.id), assetId = identifier(layer.assetId);
    const asset = assets.find((candidate) => candidate.id === assetId);
    const rect: unknown = layer.rect, order = layer.order, purpose = layer.purpose;
    const motion = object(layer.motion), displacement: unknown = motion.maxDisplacement;
    const animated = asset?.key === "tail-motion";
    const foliageMotion = prototype && asset?.key === "foliage" && motion.kind === "anchored-foliage";
    if (!Array.isArray(displacement) || displacement.length !== 2 || displacement[1] !== 0
      || (animated ? motion.kind !== "anchored-sequence" || displacement[0] !== 2 || motion.collarRows !== 9
        || motion.frames !== 9 || motion.cellSize !== 54
        : foliageMotion ? displacement[0] !== 12 || motion.collarRows !== 80 || motion.groups !== 2
        : motion.kind !== "static" || displacement[0] !== 0)) {
      throw new Error("Unsupported scene motion");
    }
    if (!asset || layerIds.has(id) || used.has(assetId) || typeof order !== "number" || !Number.isInteger(order)
      || order !== lastOrder + 1 || order >= expected.length || asset.key !== expected[order]) throw new Error("Invalid layer reference or ordering");
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every((value: unknown) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error("Invalid layer rectangle");
    }
    const [x, y, width, height] = rect as [number, number, number, number];
    const exterior = exteriorRect(asset.key);
    if (exterior ? rect.some((value: unknown, index: number) => value !== exterior[index])
      : x < 0 || y < 0 || width !== (animated ? 50 : asset.width) || height !== (animated ? 50 : asset.height) || x + width > 1672 || y + height > 941) {
      throw new Error("Layer exceeds registered source coverage");
    }
    const tail = asset.key === "tail" || animated;
    const foliage = asset.key === "foliage";
    if ((purpose !== "support" && purpose !== "tail" && purpose !== "foliage") || purpose !== (foliage ? "foliage" : tail ? "tail" : "support")
      || (tail && (x !== 1475 || y !== 330))
      || (foliage && (x !== 0 || y !== 0))
      || (!exterior && !tail && !foliage && (x !== 0 || y !== (asset.key.endsWith("top") ? 0 : 471)))) {
      throw new Error("Invalid support coverage or layer purpose");
    }
    if (tail && order !== expected.length - 1) throw new Error("Tail must follow support");
    layerIds.add(id); used.add(assetId); lastOrder = order;
    return Object.freeze({ id, assetId, rect: Object.freeze([x, y, width, height] as const), order, purpose,
      motion: animated ? "anchored-sequence" : foliageMotion ? "anchored-foliage" : "static" });
  });
  if (used.size !== assets.length) throw new Error("Unreferenced scene asset");
  let water: VerdantWaterReceiver | undefined;
  if (raw.id === "verdant-IN3-overscan") {
    const entry = object(raw.water), receiver: unknown = entry.receiver;
    if (entry.kind !== "local-ripples" || entry.maxDisplacement !== 12 || entry.maxOpacity !== .035
      || !Array.isArray(receiver) || receiver.length !== 4 || !receiver.every((point: unknown, index: number) =>
        Array.isArray(point) && point.length === 2 && point[0] === waterReceiver[index]?.[0] && point[1] === waterReceiver[index]?.[1])) {
      throw new Error("Unregistered water receiver");
    }
    water = Object.freeze({ receiver: Object.freeze(waterReceiver.map(([x, y]) => Object.freeze([x, y] as const))),
      maxDisplacement: 12, maxOpacity: .035 });
  } else if (raw.water !== undefined) throw new Error("Water is only admitted in IN3");
  const poolRefraction = raw.poolRefraction !== undefined;
  if (poolRefraction) {
    const receiver = object(raw.poolRefraction);
    if (!prototype || receiver.kind !== "inlet-fed-pool" || receiver.minimumRow !== 640
      || receiver.maxDisplacement !== 5 || receiver.maxVerticalDisplacement !== 1.4 || receiver.packetPeriod !== .9
      || receiver.component !== "central-connected-pool"
      || receiver.maskSHA256 !== "6dabcf3c237f92563bb72f92b3005aa1a45e184aea9a10bdf5c4b94eb5eb74d9") {
      throw new Error("Unregistered pool refraction");
    }
  }
  return Object.freeze({ id: raw.id, approvedSourceSHA256: digest(raw.approvedSourceSHA256),
    assets: Object.freeze(assets), layers: Object.freeze(layers), ...(water ? { water } : {}),
    ...(poolRefraction ? { poolRefraction: true as const } : {}) });
}
