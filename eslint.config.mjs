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
      // Hand-written types for the .mjs tools beside them (config/tool-catalogue.json lists each
      // under "declarations"); the TypeScript projects that import them check them.
      "scripts/**/*.d.mts",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: [
      "src/**/*.ts",
      "tests/**/*.ts",
      "scripts/asset-sheets/**/*.ts",
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
    // Browser tests name every wall-clock wait (tests/browser-waits.js): a state-wait ceiling, a
    // poll interval, a held input or a "must not happen within". A bare short number here is how
    // a correct game used to fail on a slow runner.
    files: ["tests/**/*browser*.js", "tests/pwa-offline.js"],
    ignores: ["tests/browser-waits.js"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Property[key.name=/^timeout(Ms)?$/] > Literal.value",
          message:
            "Name the wait: timeout: STATE_WAIT_MS (or SLOW_STATE_WAIT_MS) for a game state, pollEvery(ms) for a retry, from tests/browser-waits.js.",
        },
        {
          selector: "Property[key.name=/^timeout(Ms)?$/] > :matches(BinaryExpression, LogicalExpression) Literal",
          message: "Name the wait with a constant or helper from tests/browser-waits.js, not a number.",
        },
        {
          selector:
            "CallExpression[callee.property.name='waitForTimeout']:not([arguments.0.type='CallExpression'][arguments.0.callee.name=/^(pollEvery|holdFor|notWithin|settleFor)$/])",
          message:
            "A sleep must say what it is for: pollEvery(ms), holdFor(ms) or notWithin(ms) from tests/browser-waits.js. To wait for the game, wait for its state instead.",
        },
        {
          // Playwright's 30 s navigation default is an unnamed wall-clock limit like any other.
          selector:
            "CallExpression[callee.property.name=/^(goto|reload|goBack|goForward|waitForNavigation|waitForURL|waitForLoadState)$/]:not(:has(Property[key.name='timeout']))",
          message:
            "Give the navigation a named ceiling: { timeout: STATE_WAIT_MS }, or reloadPage(page) from tests/browser-waits.js, which also reports what the page was doing if it stalls.",
        },
        {
          // A setTimeout with a number is the same unnamed wait as waitForTimeout(number), in the
          // test or inside a function sent to the page. Pass a named value in as an argument.
          selector:
            "CallExpression[callee.name='setTimeout'][arguments.length>1]:matches([arguments.1.type='Literal'], [arguments.1.right.type='Literal'], [arguments.1.left.type='Literal'])",
          message:
            "Name the delay: a ceiling is STATE_WAIT_MS, an interval pollEvery(ms), from tests/browser-waits.js (pass it into page functions as an argument). To wait for the game, wait for its state.",
        },
        {
          selector: "BinaryExpression[operator='+'][left.callee.property.name='now'] > Literal.right",
          message:
            "A deadline is a named ceiling: Date.now() + STATE_WAIT_MS (pass it into page functions as an argument), not a number.",
        },
        {
          selector: "AssignmentPattern[left.name=/^(timeout|polling)(Ms)?$/] > Literal.right",
          message: "Name the default wait with a constant or helper from tests/browser-waits.js, not a number.",
        },
        {
          // A local sleep helper hides which kind of wait each call is.
          selector:
            ":matches(VariableDeclarator[id.name=/^(sleep|delay)$/], FunctionDeclaration[id.name=/^(sleep|delay)$/])",
          message:
            "Do not define a sleep helper: call page.waitForTimeout(pollEvery|holdFor|notWithin|settleFor(ms)) so each wait says what it is for.",
        },
        {
          // Waiting on pointer lock fails in headless and in a background window, where the browser
          // may refuse it; the nightly real-lock check owns that path (tests/browser-waits.js).
          selector:
            "CallExpression[callee.property.name='waitForFunction']:has(MemberExpression[property.name='pointerLockElement'])",
          message:
            "Do not wait for pointer lock: wait for the game state it leads to, or use waitForPointerLock(page) from tests/browser-waits.js on the real-lock path.",
        },
        {
          // A hook that acts on a live game object (a projectile in flight, an actor) must check for it in
          // the same page task: the game keeps running between two page calls, and a screenshot in
          // between is long enough for a projectile to land.
          selector:
            "CallExpression[callee.property.name='evaluate']:has(MemberExpression[object.property.name='__PANTHEON_TEST'][property.name=/^trigger/])",
          message:
            "Act in the same page task that checks the state the hook needs: page.waitForFunction(() => present() && (trigger(), true)), not a separate page.evaluate.",
        },
        {
          // The game streams music and assets during play, so the network may never go quiet: a wait
          // for it can hang until its ceiling (browser.pale-white-hart-foundation, main run 44012172969).
          selector:
            "CallExpression[callee.property.name='waitForLoadState'][arguments.0.value='networkidle'], Property[key.name='waitUntil'][value.value='networkidle']",
          message:
            "Do not wait for networkidle: wait for the state you need, or for a screen's lazy code with waitForScriptLoads(page) from tests/browser-waits.js.",
        },
        {
          // The same race when reading: a projectile found by one page call can be gone by the next.
          selector:
            "CallExpression[callee.property.name='evaluate']:has(MemberExpression[property.name='projectiles'])",
          message:
            "Read projectiles in the page task that waits for them: const handle = await page.waitForFunction(() => found() ?? null); await handle.jsonValue(), not a separate page.evaluate.",
        },
        {
          // A DOM element's inline style is the page's presentation, not the game's state.
          selector:
            "CallExpression[callee.property.name='waitForFunction']:has(MemberExpression[object.property.name='style'])",
          message:
            "Wait for a game state or a performance mark (for a run starting, tear:gameplay-start), not an element's inline style.",
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
