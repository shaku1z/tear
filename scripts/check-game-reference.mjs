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
try {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "export-game-reference.mjs"), "--output", output, "--expected-sha", sha], {
    cwd: root, encoding: "utf8", stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`game reference exporter failed with status ${String(result.status)}`);
  const reference = JSON.parse(fs.readFileSync(output, "utf8"));
  if (reference.format !== "game-reference.v1" || reference.schemaVersion !== 2 || reference.source?.repository !== "shaku1z/tear" || reference.source?.sha !== sha) throw new Error("game reference check produced invalid schema/provenance");
  if (JSON.stringify(reference.roster?.activeWeaponIds) !== JSON.stringify(["sword", "hammer", "greatsword", "chainblade", "riftlock"])) throw new Error("game reference check produced an invalid Final Five roster");
  if (JSON.stringify(Object.keys(reference.collections ?? {}).sort()) !== JSON.stringify(["achievements", "bosses", "enemies", "modes", "public-tuning", "stages", "upgrades", "weapons"])) throw new Error("game reference check produced an invalid fixed collection authority");
  if (reference.collections.upgrades?.status !== "complete" || reference.collections.upgrades.items?.length !== 60) throw new Error("game reference check produced an incomplete upgrade catalog");
  if (reference.collections.achievements?.status !== "complete" || reference.collections.achievements.items?.length !== 98) throw new Error("game reference check produced an incomplete achievement catalog");
  if (JSON.stringify(reference.collections.stages?.items?.map((stage) => stage.id)) !== JSON.stringify(["grounds", "undercroft", "crimson-fields", "voidspire", "tear"])) throw new Error("game reference check produced an invalid stage catalog");
  if (reference.collections.stages?.status !== "complete" || reference.collections.stages.items?.length !== 5) throw new Error("game reference check produced an incomplete stage catalog");
  if (JSON.stringify(reference.collections.modes?.items?.map((mode) => mode.id)) !== JSON.stringify(["campaign", "endless", "gauntlet", "playground", "tutorial", "bossonly", "sandbox"])) throw new Error("game reference check produced an invalid mode catalog");
  if (reference.collections.modes?.status !== "complete" || reference.collections.modes.items?.length !== 7) throw new Error("game reference check produced an incomplete mode catalog");
  console.log(`PASS game reference check: ${reference.source.repository}@${reference.source.sha}`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
