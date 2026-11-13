import { assertTutorialGoldFresh, tutorialGoldSourceFingerprint } from "./scripts/tutorial-gold-compatibility.mjs";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { readSourceIdentitySync } from "./scripts/release-artifact.mjs";

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
        const targetHtml = target === "crazygames"
          ? html.replace(/\s*<!-- TEAR_STANDALONE_PWA_START -->[\s\S]*?<!-- TEAR_STANDALONE_PWA_END -->\s*/, "\n")
          // VitePWA owns the generated production manifest link. Removing the
          // template placeholder prevents duplicate links in production and a
          // dead manifest request while the PWA plugin is disabled in dev.
          : html.replace(/\s*<link rel="manifest" href="\/manifest\.webmanifest" \/>\s*/, "\n");
        return targetHtml
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
          "/build-info.json",
          "  Cache-Control: public, max-age=0, must-revalidate",
          "  X-Content-Type-Options: nosniff",
          "",
        ].join("\n"),
      });
    },
  };
}

function targetDependencyBoundary(target: "standalone" | "crazygames"): Plugin {
  return {
    name: "tear-target-dependency-boundary",
    generateBundle(_options, bundle) {
      const forbidden = target === "crazygames"
        ? ["/src/platform/firebase-cloud.ts", "/src/platform/firebase-config.ts", "/src/platform/standalone-cloud.ts"]
        : ["/src/platform/crazygames.ts", "/src/platform/crazygames-cloud.ts"];
      const moduleIds = Object.values(bundle).flatMap((item) => item.type === "chunk" ? Object.keys(item.modules) : [])
        .map((id) => id.replaceAll("\\", "/"));
      const violations = moduleIds.filter((id) => forbidden.some((part) => id.endsWith(part)));
      if (violations.length > 0) this.error(`${target} bundle crossed its platform boundary:\n${violations.join("\n")}`);
    },
  };
}

const TUTORIAL_GOLD_DATA = "gameplay/training/tutorial-gold-reference-data.json";

/**
 * `src/app/<folder>/` -> chunk; other folders and the app root go to runtime-app-core.
 * A group also takes the static dependencies of its modules that an earlier group
 * (in name order) has not taken, so catalog and combat hold their folders' closures
 * and core holds the rest of the application.
 */
const APPLICATION_FOLDER_CHUNKS: Readonly<Record<string, string>> = {
  library: "runtime-app-catalog",
  combat: "runtime-app-combat",
  world: "runtime-app-combat",
};

/** Keep the async application composition below the release transfer budget. */
function applicationChunk(id: string): string | undefined {
  const normalized = id.replaceAll("\\", "/");
  const source = normalized.indexOf("/src/");
  if (source < 0) return undefined;
  const relative = normalized.slice(source + "/src/".length);
  const topLevel = relative.split("/")[0] ?? "";
  if (topLevel === "app") return APPLICATION_FOLDER_CHUNKS[relative.split("/")[1] ?? ""] ?? "runtime-app-core";
  // The ~1.5 MB tutorial demonstration corpus is imported only by training
  // preflight; its own chunk keeps it out of the startup modulepreload set.
  if (relative === TUTORIAL_GOLD_DATA) return "tutorial-gold-reference";
  if (topLevel === "gameplay") {
    const area = relative.split("/").slice(1, 2)[0] ?? "core";
    return `gameplay-${area}`;
  }
  if (["presentation", "audio", "ghost", "tearbench", "agents", "input", "persistence", "platform", "replay", "simulation", "diagnostics", "domain", "config"].includes(topLevel)) return `runtime-${topLevel}`;
  return undefined;
}

export default defineConfig(({ mode, command }) => {
  const testBuild = mode === "test-standalone" || mode === "test-crazygames";
  const target = mode === "crazygames" || mode === "test-crazygames" ? "crazygames" : "standalone";
  const source = readSourceIdentitySync(process.cwd());
  const tutorialGoldHash = command === "build" ? assertTutorialGoldFresh() : tutorialGoldSourceFingerprint().sourceHash;
  return {
    // CrazyGames unpacks uploads below a portal-owned path, so bundle assets
    // must be relative instead of rooted at the host origin.
    base: target === "crazygames" ? "./" : "/",
    plugins: [
      targetHtml(target),
      cloudflareHeaders(target),
      targetDependencyBoundary(target),
      ...(target === "standalone" ? [VitePWA({
        registerType: "prompt",
        injectRegister: null,
        manifest: {
          name: "TEAR: BLADE",
          short_name: "TEAR",
          description: "A momentum-blade survival game — cut clean, keep moving, chase the multiplier.",
          id: "/",
          start_url: "/?source=pwa",
          scope: "/",
          display: "fullscreen",
          orientation: "landscape",
          background_color: "#0a0b10",
          theme_color: "#0a0b10",
          categories: ["games", "entertainment"],
          icons: [
            { src: "branding/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "branding/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "branding/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          navigateFallback: "/index.html",
          globPatterns: ["**/*.{html,js,css,woff2,png,webmanifest}"],
          // The tutorial corpus is fetched on demand (training preflight), not at
          // install: it is runtime-cached on first use so it then works offline.
          // Workers bundle a lazy copy they never request; it is not precached.
          globIgnores: ["**/node_modules/**/*", "assets/tutorial-gold-reference-*.js", "assets/worker-tutorial-gold-*.js"],
          runtimeCaching: [{
            urlPattern: /\/assets\/tutorial-gold-reference-[\w-]+\.js$/u,
            handler: "CacheFirst",
            options: { cacheName: "tear-tutorial-gold", expiration: { maxEntries: 1 } },
          }],
        },
      })] : []),
    ],
    define: {
      __TEAR_TUTORIAL_GOLD_COMPATIBILITY__: JSON.stringify(tutorialGoldHash),
      __TEAR_TEST_BUILD__: JSON.stringify(testBuild),
      // Engineering surfaces (research screens, Boss/Enemy Test, engineering
      // query routes and debug globals) exist only in test builds and `vite dev`.
      __TEAR_ENGINEERING_SURFACES__: JSON.stringify(testBuild || command === "serve"),
      __TEAR_BUILD_REVISION__: JSON.stringify(source.revision),
      __TEAR_BUILD_SOURCE_STATE__: JSON.stringify(source.state),
      __TEAR_BUILD_SOURCE_FINGERPRINT__: JSON.stringify(source.fingerprint),
      __TEAR_BUILD_MODE__: JSON.stringify(mode),
      __TEAR_BUILD_TARGET__: JSON.stringify(target),
    },
    // Build outputs must not reload the preview or hold Windows staging folders open.
    server: { watch: { ignored: ["**/artifacts/**", "**/dist/**"] } },
    // Both worker consumers use module workers. Keep the shipping gold data in
    // an imported ES chunk so every worker asset fits the ordinary PWA cache.
    // Workers never run a tutorial, so they never request that lazy chunk.
    worker: {
      format: "es",
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [{ name: "worker-tutorial-gold", test: (id) => id.replaceAll("\\", "/")
              .endsWith("/src/gameplay/training/tutorial-gold-reference-data.json") }],
          },
        },
      },
    },
    build: {
      outDir: testBuild ? `dist/test-${target}` : `dist/${target}`,
      emptyOutDir: true,
      sourcemap: false,
      target: "baseline-widely-available",
      reportCompressedSize: true,
      rollupOptions: {
        output: { manualChunks: applicationChunk },
      },
    },
  };
});
