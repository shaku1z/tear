import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: "pipe" });
if (head.status !== 0) throw new Error(`git rev-parse HEAD failed: ${head.stderr || head.stdout}`);
const sha = head.stdout.trim();
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tear-game-reference-"));
const output = path.join(temporaryRoot, "game-reference.v1.json");
const wikiOutput = path.join(temporaryRoot, "wiki-data.json");
try {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts", "export-game-reference.mjs"),
      "--output",
      output,
      "--wiki-output",
      wikiOutput,
      "--expected-sha",
      sha,
    ],
    {
      cwd: root,
      encoding: "utf8",
      stdio: "inherit",
    },
  );
  if (result.status !== 0) throw new Error(`game reference exporter failed with status ${String(result.status)}`);
  const reference = JSON.parse(fs.readFileSync(output, "utf8"));
  if (
    reference.format !== "game-reference.v1" ||
    reference.schemaVersion !== 2 ||
    reference.source?.repository !== "shaku1z/tear" ||
    reference.source?.sha !== sha
  )
    throw new Error("game reference check produced invalid schema/provenance");
  if (
    JSON.stringify(reference.roster?.activeWeaponIds) !==
    JSON.stringify(["sword", "hammer", "greatsword", "chainblade", "riftlock"])
  )
    throw new Error("game reference check produced an invalid Final Five roster");
  if (
    JSON.stringify(Object.keys(reference.collections ?? {}).sort()) !==
    JSON.stringify(["achievements", "bosses", "enemies", "modes", "public-tuning", "stages", "upgrades", "weapons"])
  )
    throw new Error("game reference check produced an invalid fixed collection authority");
  // The exporter checks the upgrades and achievements against their catalogs (every id, in its order),
  // so the counts come from the catalogs and are not repeated here.
  const upgradeIds = reference.collections.upgrades?.items?.map((upgrade) => upgrade.id) ?? [];
  if (
    reference.collections.upgrades?.status !== "complete" ||
    upgradeIds.length === 0 ||
    new Set(upgradeIds).size !== upgradeIds.length
  )
    throw new Error("game reference check produced an incomplete upgrade catalog");
  const achievementIds = reference.collections.achievements?.items?.map((achievement) => achievement.id) ?? [];
  if (
    reference.collections.achievements?.status !== "complete" ||
    achievementIds.length === 0 ||
    new Set(achievementIds).size !== achievementIds.length
  )
    throw new Error("game reference check produced an incomplete achievement catalog");
  if (reference.collections.enemies?.status !== "complete")
    throw new Error("game reference check produced an incomplete enemy catalog");
  if (
    JSON.stringify(reference.collections.enemies.items?.families?.map((family) => family.id)) !==
    JSON.stringify([
      "charger",
      "ranged",
      "flyer",
      "bomber",
      "armored",
      "priest",
      "mender",
      "herald",
      "anchor",
      "wraith",
      "chimera",
      "rootbinder",
    ])
  )
    throw new Error("game reference check produced an invalid public enemy-family catalog");
  if (
    JSON.stringify(reference.collections.enemies.items?.affixes?.map((affix) => affix.id)) !==
    JSON.stringify(["tank", "swift", "rapid", "volley", "armed", "warded"])
  )
    throw new Error("game reference check produced an invalid enemy-affix catalog");
  if (reference.collections.enemies.items?.presets?.length !== 3)
    throw new Error("game reference check produced an incomplete enemy-preset catalog");
  if (reference.collections.bosses?.status !== "complete")
    throw new Error("game reference check produced an incomplete boss catalog");
  if (
    JSON.stringify(reference.collections.bosses.items?.map((boss) => boss.id)) !==
    JSON.stringify(["warden", "colossus", "aldric", "rootbound", "echo", "source"])
  )
    throw new Error("game reference check produced an invalid public boss catalog order");
  if (
    JSON.stringify(reference.collections.bosses.items?.map((boss) => boss.name)) !==
    JSON.stringify(["The Warden", "Iron Colossus", "Berserker King", "The Rootbound", "The Echo", "The Source"])
  )
    throw new Error("game reference check produced invalid public boss names");
  if (
    JSON.stringify(reference.collections.bosses.items?.map((boss) => boss.stageId)) !==
    JSON.stringify(["grounds", "undercroft", "crimson-fields", "verdant-sanctum", "voidspire", "tear"])
  )
    throw new Error("game reference check produced an invalid public boss/stage mapping");
  if (
    JSON.stringify(reference.collections.bosses.items?.map((boss) => boss.phaseMarks)) !==
    JSON.stringify([
      [0.65, 0.3],
      [0.6, 0.25],
      [0.65, 0.2],
      [0.65, 0.28],
      [0.6, 0.25],
      [0.58, 0.28],
    ])
  )
    throw new Error("game reference check produced invalid boss phase marks");
  if (
    JSON.stringify(reference.collections.stages?.items?.map((stage) => stage.id)) !==
    JSON.stringify(["grounds", "undercroft", "crimson-fields", "verdant-sanctum", "voidspire", "tear"])
  )
    throw new Error("game reference check produced an invalid public-stage catalog");
  if (reference.collections.stages?.status !== "complete" || reference.collections.stages.items?.length !== 6)
    throw new Error("game reference check produced an incomplete six-stage public catalog");
  const publicManifest = JSON.stringify(reference.collections);
  for (const leakedId of [
    "pale-traverse",
    "white-hart",
    "rimehound",
    "rime-runner",
    "prism-seer",
    "snowfall-kite",
    "hailcaster",
    "glacier-guard",
  ]) {
    if (publicManifest.includes(leakedId))
      throw new Error(`game reference check leaked Playground-only identity ${leakedId}`);
  }
  if (
    JSON.stringify(reference.collections.modes?.items?.map((mode) => mode.id)) !==
    JSON.stringify(["campaign", "endless", "gauntlet", "playground", "tutorial", "bossonly", "sandbox"])
  )
    throw new Error("game reference check produced an invalid mode catalog");
  if (reference.collections.modes?.status !== "complete" || reference.collections.modes.items?.length !== 7)
    throw new Error("game reference check produced an incomplete mode catalog");
  const publicTuning = reference.collections["public-tuning"];
  if (publicTuning?.status !== "complete" || publicTuning.items?.schemaVersion !== 1)
    throw new Error("game reference check produced an incomplete public tuning catalog");
  if (
    JSON.stringify(publicTuning.items?.difficultyCatalog?.map((difficulty) => difficulty.id)) !==
    JSON.stringify(["easy", "normal", "hard", "extreme", "onehit"])
  )
    throw new Error("game reference check produced an invalid difficulty catalog order");
  if (
    publicTuning.items?.difficultyCatalog
      ?.filter((difficulty) => difficulty.oneHit)
      .map((difficulty) => difficulty.id)
      .join(",") !== "onehit"
  )
    throw new Error("game reference check produced an invalid one-hit difficulty invariant");
  console.log(`PASS game reference check: ${reference.source.repository}@${reference.source.sha}`);

  // The player wiki document, written by the same exporter run. The exporter itself
  // fails when game content is missing from it or preview content leaks into it.
  const wiki = JSON.parse(fs.readFileSync(wikiOutput, "utf8"));
  if (wiki.format !== "tear-wiki-data" || wiki.schemaVersion !== 1 || wiki.source?.sha !== sha)
    throw new Error("wiki data export produced invalid schema/provenance");
  for (const entity of [...wiki.enemies, ...wiki.bosses])
    if (!(entity.stats?.hp > 0) || typeof entity.desc !== "string" || entity.desc.length === 0)
      throw new Error(`wiki data export is missing stats or Codex copy for ${String(entity.id)}`);
  if (wiki.shop.items.length === 0 || wiki.controls.keyboard.length === 0 || wiki.modes.length === 0)
    throw new Error("wiki data export is missing shop, controls, or modes");
  console.log(`PASS wiki data export: ${String(wiki.enemies.length)} enemies, ${String(wiki.bosses.length)} bosses`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
