import "virtual:tear-legacy";

declare global {
  interface Window {
    __TEAR_BUILD__?: Readonly<{
      target: "standalone" | "crazygames";
      mode: string;
    }>;
  }
}

export function identifyBuild(target: "standalone" | "crazygames"): void {
  window.__TEAR_BUILD__ = Object.freeze({ target, mode: import.meta.env.MODE });
}
