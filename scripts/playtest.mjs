// Plays the real game headless and prints what happened. `pnpm playtest bosses` fights each named boss
// with scripted players on fixed seeds and prints one table per fight, phase by phase.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = `Usage: pnpm playtest bosses [options]
  --boss <ids>         comma list, default rootbound,aldric,white-hart
  --difficulty <id>    easy, normal, hard or extreme; default normal
  --weapon <ids>       comma list, default sword
  --seed <seeds>       comma list, default 1
  --player <ids>       comma list of scripted, avoids-tells; default both
  --seconds <n>        game seconds before a fight is stopped; default 180
  --json <file>        also write the measured fights as JSON
`;

function options(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name.startsWith("--") || value === undefined) throw new Error(`unreadable option ${name}\n${USAGE}`);
    values.set(name.slice(2), value);
    index += 1;
  }
  return values;
}

const list = (value, fallback) => (value === undefined ? fallback : value.split(",").filter((entry) => entry !== ""));

const [command, ...rest] = process.argv.slice(2);
if (command !== "bosses") {
  process.stdout.write(USAGE);
  process.exit(command === undefined || command === "help" ? 0 : 1);
}
const given = options(rest);
const seconds = Number(given.get("seconds") ?? "180");
if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("--seconds must be a positive number");

const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const report = await server.ssrLoadModule("/src/playtest/boss-report.ts");
  const started = performance.now();
  let fights;
  try {
    fights = report.playBossReport({
      bosses: list(given.get("boss"), report.DEFAULT_REPORT_BOSSES),
      difficulty: given.get("difficulty") ?? "normal",
      weapons: list(given.get("weapon"), ["sword"]),
      seeds: list(given.get("seed"), ["1"]),
      players: list(given.get("player"), ["scripted", "avoids-tells"]),
      maxTicks: Math.round(seconds * 120),
    });
  } catch (error) {
    // A mistyped boss, weapon or difficulty is refused before any fight; print the reason, not a stack.
    if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
    process.stderr.write(`playtest: ${error.message}\n`);
    process.exitCode = 1;
  }
  if (fights !== undefined) {
    process.stdout.write(report.formatBossReport(fights));
    process.stdout.write(
      `\n${String(fights.length)} fights in ${((performance.now() - started) / 1000).toFixed(1)} s of real time.\n`,
    );
    const json = given.get("json");
    if (json !== undefined) writeFileSync(path.resolve(json), `${JSON.stringify(fights, null, 2)}\n`);
    if (fights.some((fight) => fight.end === "broken")) process.exitCode = 1;
  }
} finally {
  await server.close();
}
