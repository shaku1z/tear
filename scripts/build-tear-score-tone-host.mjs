import { resolve } from "node:path";
import { build } from "vite";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, ".tmp-tone-host-esm");
await build({
  configFile: false,
  logLevel: "warn",
  publicDir: false,
  build: {
    emptyOutDir: true,
    minify: "esbuild",
    sourcemap: true,
    outDir,
    lib: {
      entry: resolve(root, "src/audio/tone-host-surface.ts"),
      formats: ["es"],
      fileName: "tone-host.esm",
    },
  },
});
console.log(resolve(outDir, "tone-host.esm.mjs"));
