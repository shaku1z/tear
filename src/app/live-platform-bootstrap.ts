import { initializePlatformServices, shouldPromptForUsername } from "./runtime-initialization";
import type { SettingsController } from "./settings-controller";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";

type Dependencies = Pick<GameRuntimeDependencies,
  "ACH" | "CG" | "Cloud" | "FirebaseProvider" | "META" | "PROFILE" | "SFX" | "SHOP">;

export interface PlatformRenamePort {
  readonly screen: () => string;
  readonly prompted: () => boolean;
  readonly active: () => boolean;
  readonly markPrompted: () => void;
  readonly begin: (firstRun: boolean) => void;
}

export function initializeLivePlatformBootstrap(
  d: Dependencies,
  settings: SettingsController,
  rename: PlatformRenamePort,
): void {
  initializePlatformServices({ audio: d.SFX, meta: d.META, profile: d.PROFILE, settings,
    portal: d.CG, cloud: d.Cloud,
    backfillProgress() {
      d.PROFILE.maxStat("shopMaxed", d.SHOP.filter((item) => d.META.level(item.id) >= item.maxLevel).length);
      d.ACH.check(); d.PROFILE.save();
    },
    onCloudChange(user, state) {
      try { d.ACH.check(); } catch { /* optional achievement migration */ }
      if (!shouldPromptForUsername({ state, user, provider: d.Cloud.provider,
        expectedProvider: d.FirebaseProvider, username: d.PROFILE.username(),
        alreadyPrompted: rename.prompted(), screen: rename.screen(), renameActive: rename.active() })) return;
      rename.markPrompted(); rename.begin(true);
    },
  });
}
