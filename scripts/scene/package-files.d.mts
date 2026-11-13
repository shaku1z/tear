// Types for package-files.mjs, so TypeScript tests can use the CLI's checks.
import type { ScenePackage } from "../../src/presentation/scenes/scene-contract";

export declare const REPOSITORY_ROOT: string;
export declare const SCENES_ROOT: string;
export declare const SCENE_REGISTRY: string;
export declare const REQUIRED_VIEWPORTS: readonly (readonly [string, number, number])[];
export declare const BEST_EFFORT_VIEWPORTS: readonly (readonly [string, number, number])[];
export declare function sceneDirectories(recipes?: boolean): string[];
export declare function inspectPackage(directory: string): Promise<{
  scene: ScenePackage | undefined;
  problems: string[];
  files: { file: string; bytes: number; width: number; height: number }[];
}>;
export declare function coverageReport(scene: ScenePackage): Promise<
  {
    label: string;
    width: number;
    height: number;
    required: boolean;
    layer: string;
    covered: boolean;
    shortfall: Record<string, number>;
  }[]
>;
