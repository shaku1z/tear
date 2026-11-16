// Types for package-files.mjs, so TypeScript tests can use the CLI's checks.
import type { ScenePackage } from "../../src/presentation/scenes/scene-contract";

export declare const REPOSITORY_ROOT: string;
export declare const SCENES_ROOT: string;
export declare const SCENE_REGISTRY: string;
export declare const FIXTURE_SCENES_ROOT: string;
export declare const SCENE_ROOTS: readonly string[];
export declare function isShippedPackage(directory: string): boolean;
export declare const REQUIRED_VIEWPORTS: readonly (readonly [string, number, number])[];
export declare const BEST_EFFORT_VIEWPORTS: readonly (readonly [string, number, number])[];
export declare function sceneDirectories(recipes?: boolean, roots?: readonly string[]): string[];
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
export declare const SCENE_BUDGETS: string;
export interface StorefrontBudget {
  shareBytes: number;
}
export declare function storefrontBudget(target: string, file?: string): StorefrontBudget;
export declare function declaredStorefrontArt(
  target: string,
  budget?: StorefrontBudget,
  root?: string,
): {
  target: string;
  shareBytes: number;
  bytes: number;
  packages: { name: string; bytes: number }[];
  problems: string[];
};
export declare function builtStorefrontArt(
  target: string,
  directory: string,
  budget?: StorefrontBudget,
  roots?: readonly string[],
): { target: string; shareBytes: number; bytes: number; files: string[]; problems: string[] };
