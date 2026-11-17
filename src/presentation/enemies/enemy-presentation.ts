import type { EnemyTypes } from "../../gameplay/entities/enemies";
import { STAGE_IDS } from "../../gameplay/stages";
import { stagePresentationDefinition } from "../stage-presentation-definitions";
import { installAldricEchoRenderers } from "./renderers/aldric-echo-renderers";
import { installBaseEnemyRenderers } from "./renderers/base-renderers";
import { setBossTellSkin } from "./renderers/boss-tell-renderer";
import { createBossTellSkin } from "./renderers/boss-tell-skin";
import { createEnemyRendererRuntime } from "./renderers/enemy-renderer-runtime";
import type { EnemyPresentationDependencies } from "./renderers/enemy-renderer-types";
import { installSourceRenderer } from "./renderers/source-renderer";
import { installRootboundRenderer } from "./renderers/rootbound-renderer";
import { installRimehoundRenderer } from "./renderers/rimehound-renderer";
import { installWhiteHartRenderer } from "./renderers/white-hart-renderer";
import { installStandardEnemyRenderers } from "./renderers/standard-renderers";
import { installWardenColossusRenderers } from "./renderers/warden-colossus-renderers";

export type { EnemyPresentationDependencies } from "./renderers/enemy-renderer-types";

export function createEnemyPresentation(dependencies: EnemyPresentationDependencies) {
  const runtime = createEnemyRendererRuntime(dependencies);
  function install(types: EnemyTypes): void {
    // Each stage's own look for boss tells, from its presentation definition.
    for (const stageId of STAGE_IDS) {
      const table = stagePresentationDefinition(stageId)?.bossTellSkin;
      setBossTellSkin(stageId, table === undefined ? null : createBossTellSkin(table));
    }
    installBaseEnemyRenderers(types, runtime);
    installStandardEnemyRenderers(types, runtime);
    installWardenColossusRenderers(types, runtime);
    installAldricEchoRenderers(types, runtime);
    installSourceRenderer(types, runtime);
    installRootboundRenderer(types, runtime);
    installRimehoundRenderer(types, runtime);
    installWhiteHartRenderer(types, runtime);
  }
  return Object.freeze({ install, drawBossTransformationWorld: runtime.drawBossTransformationWorld });
}
