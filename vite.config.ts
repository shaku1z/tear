import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const LEGACY_FILES = [
  "config", "stages", "utils", "voidgen", "ui", "cinematics", "audio",
  "input", "gamepad", "particles", "backdrop", "attract", "crazy",
  "firebase-config", "profile", "achievements", "challenges", "upgrades",
  "meta", "weapons", "affixes", "variants", "blade", "player", "projectile",
  "enemy", "ghost", "cloud", "mirror", "game",
] as const;

function legacyBundle(): Plugin {
  const publicId = "virtual:tear-legacy";
  const resolvedId = `\0${publicId}`;
  return {
    name: "tear-legacy-bundle",
    resolveId(id) {
      return id === publicId ? resolvedId : undefined;
    },
    async load(id) {
      if (id !== resolvedId) return undefined;
      const sources = await Promise.all(LEGACY_FILES.map(async (name) => {
        const file = resolve(import.meta.dirname, "js", `${name}.js`);
        this.addWatchFile(file);
        return `\n// ---- js/${name}.js ----\n${await readFile(file, "utf8")}`;
      }));
      return `${sources.join("\n")}
if (new URLSearchParams(window.location.search).get("test") === "1") {
  window.__TEAR_CATALOG_DEBUG__ = Object.freeze({
    weapons: WEAPONS.map((weapon) => ({ id: weapon.id, throwIdentity: weapon.throwIdentity, ratings: weapon.ratings })),
    abilities: UPGRADES.filter((upgrade) => ["stormbank", "overrun", "sever"].includes(upgrade.id)).map((upgrade) => upgrade.name),
  });
}`;
    },
  };
}

function targetHtml(target: "standalone" | "crazygames"): Plugin {
  return {
    name: "tear-target-html",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const entry = target === "standalone" ? "standalone" : "crazygames";
        const sdk = target === "crazygames"
          ? '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>'
          : "";
        return html
          .replace("<!-- TEAR_PLATFORM_SDK -->", sdk)
          .replace("<!-- TEAR_ENTRYPOINT -->", `<script type="module" src="/src/entrypoints/${entry}.ts"></script>`);
      },
    },
  };
}

function cloudflareHeaders(target: "standalone" | "crazygames"): Plugin {
  return {
    name: "tear-cloudflare-headers",
    generateBundle() {
      if (target !== "standalone") return;
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: [
          "/assets/*",
          "  Cache-Control: public, max-age=31536000, immutable",
          "  X-Content-Type-Options: nosniff",
          "",
          "/index.html",
          "  Cache-Control: public, max-age=0, must-revalidate",
          "  X-Content-Type-Options: nosniff",
          "  Referrer-Policy: strict-origin-when-cross-origin",
          "",
        ].join("\n"),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const target = mode === "crazygames" ? "crazygames" : "standalone";
  return {
    plugins: [
      legacyBundle(),
      targetHtml(target),
      cloudflareHeaders(target),
      ...(target === "standalone" ? [VitePWA({
        registerType: "prompt",
        injectRegister: null,
        manifest: false,
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          navigateFallback: "/index.html",
          globPatterns: ["**/*.{html,js,css,woff2,png,webmanifest}"],
        },
      })] : []),
    ],
    define: {
      __TEAR_TARGET__: JSON.stringify(target),
    },
    build: {
      outDir: `dist/${target}`,
      emptyOutDir: true,
      sourcemap: false,
      target: "baseline-widely-available",
      reportCompressedSize: true,
    },
  };
});
