import type { EnemyTypes } from "../../gameplay/entities/enemies";
import { installAldricEchoRenderers } from "./renderers/aldric-echo-renderers";
import { installBaseEnemyRenderers } from "./renderers/base-renderers";
import { createEnemyRendererRuntime } from "./renderers/enemy-renderer-runtime";
import type { EnemyPresentationDependencies } from "./renderers/enemy-renderer-types";
import { installSourceRenderer } from "./renderers/source-renderer";
import { installStandardEnemyRenderers } from "./renderers/standard-renderers";
import { installWardenColossusRenderers } from "./renderers/warden-colossus-renderers";

export type { EnemyPresentationDependencies } from "./renderers/enemy-renderer-types";

export function createLegacyEnemyPresentation(dependencies: EnemyPresentationDependencies) {
  const runtime = createEnemyRendererRuntime(dependencies);
  function install(types: EnemyTypes): void {
    installBaseEnemyRenderers(types, runtime);
    installStandardEnemyRenderers(types, runtime);
    installWardenColossusRenderers(types, runtime);
    installAldricEchoRenderers(types, runtime);
    installSourceRenderer(types, runtime);
  }
  return Object.freeze({ install, drawBossTransformationWorld: runtime.drawBossTransformationWorld });
}
