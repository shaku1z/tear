import eslint from "@eslint/js";
import globals from "globals";
import path from "node:path";
import tseslint from "typescript-eslint";

const inwardLayers = Object.freeze({
  domain: new Set([
    "app",
    "audio",
    "entrypoints",
    "gameplay",
    "input",
    "persistence",
    "platform",
    "presentation",
    "simulation",
  ]),
  simulation: new Set(["app", "audio", "entrypoints", "gameplay", "input", "persistence", "platform", "presentation"]),
  gameplay: new Set(["app", "audio", "entrypoints", "persistence", "platform", "presentation"]),
});

const tearArchitecture = {
  rules: {
    "inward-imports": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          outward: "{{from}} cannot import the outer {{to}} layer.",
          browserType: "{{from}} must expose renderer-neutral state instead of depending on {{name}}.",
        },
      },
      create(context) {
        const normalizedFile = context.filename.replaceAll("\\", "/");
        const sourceMarker = "/src/";
        const sourceIndex = normalizedFile.lastIndexOf(sourceMarker);
        const from =
          sourceIndex < 0 ? undefined : normalizedFile.slice(sourceIndex + sourceMarker.length).split("/")[0];
        const forbidden = from === undefined ? undefined : inwardLayers[from];
        return {
          ImportDeclaration(node) {
            if (forbidden === undefined || typeof node.source.value !== "string" || !node.source.value.startsWith("."))
              return;
            const resolved = path.resolve(path.dirname(context.filename), node.source.value).replaceAll("\\", "/");
            const resolvedIndex = resolved.lastIndexOf(sourceMarker);
            if (resolvedIndex < 0) return;
            const to = resolved.slice(resolvedIndex + sourceMarker.length).split("/")[0];
            if (forbidden.has(to)) context.report({ node: node.source, messageId: "outward", data: { from, to } });
          },
          Identifier(node) {
            if (forbidden === undefined || node.parent.type !== "TSTypeReference") return;
            if (
              ["CanvasRenderingContext2D", "CanvasGradient", "HTMLCanvasElement", "OffscreenCanvas", "Path2D"].includes(
                node.name,
              )
            ) {
              context.report({ node, messageId: "browserType", data: { from, name: node.name } });
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules*/**",
      "vendor/**",
      "tear-crazygames/**",
      "workers/worker-configuration.d.ts",
      "scripts/release-artifact.d.mts",
      "scripts/campaign-publication-boundary.d.mts",
      "scripts/tutorial-gold-compatibility.d.mts",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: [
      "src/**/*.ts",
      "tests/**/*.ts",
      "workers/**/*.ts",
      "vite.config.ts",
      "vitest.config.ts",
      "vitest.endurance.config.ts",
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
    },
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Browser journeys and harnesses: CommonJS Node scripts driving Playwright. The callbacks they
    // pass to page.evaluate()/waitForFunction() run in the page, so browser globals are valid too.
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // CommonJS is how these scripts load Playwright and each other.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["tests/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["tests/**/*.js", "tests/**/*.mjs"],
    rules: {
      // Module-scope bindings such as `const crypto = require("node:crypto")` or an explicit
      // `import { setTimeout } from "node:timers"` shadow a global; they do not redeclare one.
      "no-redeclare": ["error", { builtinGlobals: false }],
      // `({ screenshot, ...entry }) => entry` is how these scripts drop a field from evidence.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
      // Bug patterns that type-aware rules would otherwise catch in TypeScript.
      "array-callback-return": "error",
      "no-self-compare": "error",
      "no-unreachable-loop": "error",
    },
  },
  {
    // Pointer lock is optional in browsers: iOS Safari and Android browsers before Chrome 144
    // have no exitPointerLock. A direct call throws there and aborts the caller, which once
    // kept the upgrade draft from opening on phones; releases go through releasePointerLock.
    files: ["src/**/*.ts"],
    ignores: ["src/platform/browser-pointer-lock.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          property: "exitPointerLock",
          message: "Use releasePointerLock from src/platform/browser-pointer-lock.ts; phones lack this method.",
        },
      ],
    },
  },
  {
    files: ["src/domain/**/*.ts", "src/simulation/**/*.ts", "src/gameplay/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: "Gameplay randomness must use an injected deterministic RandomSource.",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "Gameplay must not read wall-clock time.",
        },
      ],
    },
  },
  {
    files: ["src/domain/**/*.ts", "src/simulation/**/*.ts", "src/gameplay/**/*.ts"],
    plugins: { tear: tearArchitecture },
    rules: {
      "tear/inward-imports": "error",
      "no-restricted-globals": ["error", "window", "document", "localStorage", "AudioContext", "performance"],
      "no-restricted-imports": [
        "error",
        {
          patterns: ["../app/**", "../audio/**", "../persistence/**", "../platform/**", "../presentation/**"],
        },
      ],
    },
  },
);
