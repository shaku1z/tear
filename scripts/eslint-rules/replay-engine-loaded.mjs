/**
 * `tear/replay-engine-loaded`: only the modules that work on a capsule call `replayEngine.loaded()`.
 * Each takes a capsule that `GhostCapsuleReader.read` produced, and that read waits for the engine,
 * so the synchronous call cannot run before the engine has loaded (src/ghost/replay-engine.ts).
 * Anywhere else the call could run first and throw, so other code awaits the engine instead.
 *
 * Two TearBench modules are the exception: the tutorial gold generator and the live-detached parity
 * matrix. They run only under vitest (the build's tutorial gold check and unit tests), where the slot is
 * the eager engine (tests/support/replay-engine-eager.ts), and no release code may import them: both are
 * in the `release.developer-only` role (config/architecture-roles.json), so the architecture gate fails
 * on a static import from release code and a release build fails if either reaches a bundle.
 *
 * The rule catches `replayEngine.loaded`, `replayEngine["loaded"]` and `const { loaded } = replayEngine`.
 */
export const REPLAY_ENGINE_USERS = Object.freeze([
  "/src/ghost/live-ghost-reference.ts",
  "/src/ghost/production-replay-session.ts",
  "/src/ghost/production-replay-verification.ts",
  "/src/ghost/replay-engine.ts",
  "/src/tearbench/live-detached-parity-matrix.ts",
  "/src/tearbench/tutorial-gold-generation.ts",
]);

const isEngine = (node) => node?.type === "Identifier" && node.name === "replayEngine";
const isLoadedKey = (node, computed) =>
  computed
    ? node?.type === "Literal" && node.value === "loaded"
    : node?.type === "Identifier" && node.name === "loaded";

export const replayEngineLoaded = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      onlyCapsuleModules:
        "replayEngine.loaded() belongs to the modules that work on a read capsule; await replayEngine.ensure() here, or take a capsule from GhostCapsuleReader.read.",
    },
  },
  create(context) {
    const file = context.filename.replaceAll("\\", "/");
    if (REPLAY_ENGINE_USERS.some((owner) => file.endsWith(owner))) return {};
    return {
      MemberExpression(node) {
        if (isEngine(node.object) && isLoadedKey(node.property, node.computed))
          context.report({ node, messageId: "onlyCapsuleModules" });
      },
      VariableDeclarator(node) {
        if (!isEngine(node.init) || node.id.type !== "ObjectPattern") return;
        for (const property of node.id.properties)
          if (property.type === "Property" && isLoadedKey(property.key, property.computed))
            context.report({ node: property, messageId: "onlyCapsuleModules" });
      },
    };
  },
};
