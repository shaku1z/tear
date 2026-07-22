declare global {
  interface Window {
    __TEAR_BUILD__?: Readonly<{
      target: "standalone" | "crazygames";
      mode: string;
    }>;
  }
}

import { installTearScoreMusicBackend } from "../audio/install-tear-score";
import { warmChapterFonts } from "../presentation/font-loader";

export function identifyBuild(target: "standalone" | "crazygames"): void {
  Object.defineProperty(window, "__TEAR_BUILD__", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({ target, mode: import.meta.env.MODE }),
  });
}

/** The async boundary lets a target install optional adapters (such as TearScore) first. */
export async function bootstrapTear(
  target: "standalone" | "crazygames",
  compose: () => void | Promise<void>,
): Promise<void> {
  identifyBuild(target);
  void warmChapterFonts(document);
  await installTearScoreMusicBackend();
  await compose();
}
