import type { ScenePackageLoaders } from "./scene-library";

/**
 * Stage id -> lazy import of its scene package module. Each module lives in
 * `src/presentation/assets/scenes/<stage>/scene.ts` and is a separate chunk,
 * so no package manifest or image URL reaches the startup scripts.
 */
export const SCENE_PACKAGES: ScenePackageLoaders = Object.freeze({
  "verdant-sanctum": () => import("../assets/scenes/verdant-sanctum/scene"),
});
