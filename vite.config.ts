import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

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

export default defineConfig(({ mode }) => {
  const testBuild = mode === "test-standalone" || mode === "test-crazygames";
  const target = mode === "crazygames" || mode === "test-crazygames" ? "crazygames" : "standalone";
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
        },
      })] : []),
    ],
    define: {
      __TEAR_TEST_BUILD__: JSON.stringify(testBuild),
    },
    build: {
      outDir: testBuild ? `dist/test-${target}` : `dist/${target}`,
      emptyOutDir: true,
      sourcemap: false,
      target: "baseline-widely-available",
      reportCompressedSize: true,
    },
  };
});
