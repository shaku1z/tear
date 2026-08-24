import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";
import { readCleanSourceIdentity } from "./game-reference-export-preflight.mjs";

const root = path.resolve(import.meta.dirname, "..");

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function numericTuning(value) {
  return Object.fromEntries(Object.entries(value));
}

const requestedSha = option("--sha") ?? process.env.TEAR_GAME_REFERENCE_SHA;
const expectedSha = option("--expected-sha");
const terminologyVersion = option("--terminology") ?? JSON.parse(fs.readFileSync(path.join(root, "config", "terminology-registry.json"), "utf8")).registryId;
const output = option("--output");
const sourceSha = readCleanSourceIdentity(root, requestedSha);

const server = await createServer({ root, configFile: false, logLevel: "error", server: { middlewareMode: true }, appType: "custom" });
try {
  const referenceModule = await server.ssrLoadModule("/src/game-reference/game-reference.ts");
  const weaponModule = await server.ssrLoadModule("/src/gameplay/weapons.ts");
  const upgradeModule = await server.ssrLoadModule("/src/gameplay/upgrades.ts");
  const achievementModule = await server.ssrLoadModule("/src/gameplay/progression/achievements.ts");
  const configModule = await server.ssrLoadModule("/src/config/game-config.ts");
  const repository = option("--repository") ?? process.env.TEAR_BUILD_REPOSITORY ?? referenceModule.GAME_REFERENCE_REPOSITORY;
  const tuningByWeapon = Object.fromEntries(Object.entries(configModule.CONFIG.weapons).map(([id, tuning]) => [id, numericTuning(tuning)]));
  const achievements = achievementModule.createAchievements({
    meta: { level: () => 0 },
    profile: { unlocked: () => false, stat: () => 0, unlock: () => false },
    audio: { rankup: () => undefined },
    shop: [],
    clamp: (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value)),
  });
  const reference = referenceModule.buildGameReferenceV1({
    repository,
    sourceSha,
    terminologyVersion,
    weapons: weaponModule.WEAPONS,
    upgrades: upgradeModule.UPGRADES,
    achievements: achievements._all,
    tuningByWeapon,
  });
  if (expectedSha !== undefined) referenceModule.assertCurrentSourceSha(reference, expectedSha);
  const encoded = referenceModule.encodeGameReferenceV1(reference);
  if (output === undefined) {
    process.stdout.write(encoded);
  } else {
    const destination = path.resolve(root, output);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, encoded, "utf8");
    process.stdout.write(`Wrote ${path.relative(root, destination)} for ${reference.source.repository}@${reference.source.sha}\n`);
  }
} finally {
  await server.close();
}
