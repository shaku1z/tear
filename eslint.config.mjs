import eslint from "@eslint/js";
import globals from "globals";
import path from "node:path";
import tseslint from "typescript-eslint";

const inwardLayers = Object.freeze({
  domain: new Set(["app", "audio", "entrypoints", "gameplay", "input", "persistence", "platform", "presentation", "simulation"]),
  simulation: new Set(["app", "audio", "entrypoints", "gameplay", "input", "persistence", "platform", "presentation"]),
  gameplay: new Set(["app", "audio", "entrypoints", "persistence", "platform", "presentation"]),
});

const tearArchitecture = {
  rules: {
    "inward-imports": {
      meta: { type: "problem", schema: [], messages: {
        outward: "{{from}} cannot import the outer {{to}} layer.",
        browserType: "{{from}} must expose renderer-neutral state instead of depending on {{name}}.",
      } },
      create(context) {
        const normalizedFile = context.filename.replaceAll("\\", "/");
        const sourceMarker = "/src/";
        const sourceIndex = normalizedFile.lastIndexOf(sourceMarker);
        const from = sourceIndex < 0 ? undefined : normalizedFile.slice(sourceIndex + sourceMarker.length).split("/")[0];
        const forbidden = from === undefined ? undefined : inwardLayers[from];
        return {
          ImportDeclaration(node) {
            if (forbidden === undefined || typeof node.source.value !== "string" || !node.source.value.startsWith(".")) return;
            const resolved = path.resolve(path.dirname(context.filename), node.source.value).replaceAll("\\", "/");
            const resolvedIndex = resolved.lastIndexOf(sourceMarker);
            if (resolvedIndex < 0) return;
            const to = resolved.slice(resolvedIndex + sourceMarker.length).split("/")[0];
            if (forbidden.has(to)) context.report({ node: node.source, messageId: "outward", data: { from, to } });
          },
          Identifier(node) {
            if (forbidden === undefined || node.parent.type !== "TSTypeReference") return;
            if (["CanvasRenderingContext2D", "CanvasGradient", "HTMLCanvasElement", "OffscreenCanvas", "Path2D"].includes(node.name)) {
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
    ignores: ["dist/**", "node_modules*/**", "vendor/**", "tear-crazygames/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "vite.config.ts", "vitest.config.ts"],
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
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off",
      "no-unreachable": "off"
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
      "no-restricted-globals": [
        "error",
        "window",
        "document",
        "localStorage",
        "AudioContext",
        "performance",
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "../app/**",
            "../audio/**",
            "../persistence/**",
            "../platform/**",
            "../presentation/**",
          ],
        },
      ],
    },
  },
);
