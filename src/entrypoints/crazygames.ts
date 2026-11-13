import { createCrazyGamesPlatformServices, type CrazyGamesSdkShape } from "../platform/crazygames";
import { bootstrapTear } from "./bootstrap";
import { createCrazyGamesCloud } from "../platform/crazygames-cloud";
import { unavailablePwaUpdate } from "../platform/pwa-update";

const crazyGamesWindow = window as Window & {
  readonly CrazyGames?: { readonly SDK?: CrazyGamesSdkShape };
};

void bootstrapTear("crazygames", async ({ surfaces, engineeringQuery }) => {
  const { composeTearApplication } = await import("../app/shell/composition");
  await composeTearApplication({
    target: "crazygames",
    surfaces,
    engineeringQuery,
    ...(crazyGamesWindow.CrazyGames?.SDK === undefined ? {} : { sdk: crazyGamesWindow.CrazyGames.SDK }),
    createCrazyGamesServices: createCrazyGamesPlatformServices,
    createCloud: createCrazyGamesCloud,
    pwaUpdate: unavailablePwaUpdate,
  });
});
