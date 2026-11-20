// Plays the real game headless and prints what happened. `pnpm playtest bosses` fights each named boss
// with scripted players on fixed seeds and prints one table per fight, phase by phase, and a summary.
// `pnpm playtest sweep` is the same over every weapon, two seeds and two difficulties, summary only.
// `pnpm playtest waves --stage <id>` plays the waves of an Adventure stage, each opened directly, and prints a
// row per wave.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), "..");
const MAX_JOBS = 6;
/** Fights a worker process must have to be worth starting: each one loads the game first. */
const FIGHTS_PER_JOB = 10;
/** More fights than this and the fight tables are left out unless asked for. */
const TABLES_UP_TO = 30;
const USAGE = `Usage: pnpm playtest bosses [options]
       pnpm playtest sweep [options]
       pnpm playtest waves --stage <ids> [options]

Plays boss fights on the real game, headless, and prints a table per fight and a summary.
"sweep" plays every weapon, seeds 1 and 2 and Easy and Normal, and prints the summary.
  --boss <ids>         comma list; default every boss the game defines
                       (with --phase: every boss the game's boss practice accepts)
  --difficulty <ids>   comma list of easy, normal, hard, extreme; default normal
  --weapon <ids>       comma list, default sword
  --seed <seeds>       comma list, default 1
  --player <ids>       comma list of scripted, avoids-tells, cuts-objects, no-dodge, still,
                       walker; default all
  --phase <phases>     comma list of phase numbers: start there through the game's boss practice
                       (Sword on Normal only); default: start at Phase I in boss-only mode
  --seconds <n>        game seconds before a fight is stopped; default 180
  --jobs <n>           worker processes, 1 to ${String(MAX_JOBS)}; default: one for every ${String(FIGHTS_PER_JOB)} fights, at most
                       the machine's cores less two
  --show <what>        fights, summary or both; default both up to ${String(TABLES_UP_TO)} fights, summary above
  --json <file>        also write the measured fights as JSON

"waves" plays the waves of an Adventure stage, each opened directly on its stage, and prints a row per wave:
clear time, the wave as it arrived, damage by source, snares, roots and Rootbinders.
  --stage <ids>        comma list of Adventure stages (required), for example verdant-sanctum
  --wave <waves>       comma list of wave numbers; default the stage's nine waves before its boss
  --build <ids>        comma list of drafted, none; default drafted: one upgrade for each wave before,
                       picked from the game's draft
  --difficulty, --weapon, --seconds, --jobs, --json as above; --seed defaults to 1,2,3;
  --player defaults to scripted,cuts-objects; --show runs adds a line for every run
`;
/**
 * The plan asks a sweep for four seeds in under 5 minutes on 6 jobs. Four took 498 s (1,680 fights, 2026-11-19), so
 * seeds are cut, before bosses, and every sweep that uses the default says so.
 */
const SWEEP_CUT =
  "Seeds 3 and 4 are left out to keep the sweep under 5 minutes: all four took 498 s on 6 jobs. " +
  "--seed 1,2,3,4 plays them.\n";
const SWEEP = new Map([
  ["weapon", "sword,hammer,greatsword,chainblade,riftlock"],
  ["seed", "1,2"],
  ["difficulty", "easy,normal"],
  ["show", "summary"],
]);

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

function wholeNumber(name, text, least, most) {
  const value = Number(text);
  if (!Number.isInteger(value) || value < least || value > most)
    throw new Error(`--${name} takes a whole number from ${String(least)} to ${String(most)}`);
  return value;
}

/** One worker: this command again with one share of the fights, writing its fights to a file. */
function playShare(command, given, index, of, file) {
  const args = [script, command];
  for (const [name, value] of given)
    if (!["jobs", "json", "show", "share"].includes(name)) args.push(`--${name}`, value);
  args.push("--share", `${String(index)}/${String(of)}`, "--json", file, "--show", "none");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "ignore", "inherit"] });
    child.on("error", reject);
    // A worker exits with 1 when one of its fights is broken; its file is still whole.
    child.on("exit", (code) => {
      if (code === 0 || code === 1) resolve(JSON.parse(readFileSync(file, "utf8")));
      else reject(new Error(`playtest worker ${String(index)} of ${String(of)} stopped with code ${String(code)}`));
    });
  });
}

const [command, ...rest] = process.argv.slice(2);
if (!["bosses", "sweep", "waves"].includes(command)) {
  process.stdout.write(USAGE);
  process.exit(command === undefined || command === "help" ? 0 : 1);
}
const given = options(rest);
const seedsCut = command === "sweep" && !given.has("seed");
if (command === "sweep") for (const [name, value] of SWEEP) if (!given.has(name)) given.set(name, value);
const seconds = Number(given.get("seconds") ?? "180");
if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("--seconds must be a positive number");
const phases = given.has("phase") ? list(given.get("phase"), []).map(Number) : undefined;
if (phases !== undefined && (phases.length === 0 || !phases.every(Number.isInteger)))
  throw new Error("--phase takes whole phase numbers");
const share = given.get("share")?.split("/").map(Number);
const show = given.get("show");
const waves = command === "waves";
if (show !== undefined && !(waves ? ["runs", "summary", "none"] : ["fights", "summary", "both", "none"]).includes(show))
  throw new Error(waves ? "--show takes runs or summary" : "--show takes fights, summary or both");
const wholeNumbers = (name) => {
  const values = list(given.get(name), []).map(Number);
  if (values.length === 0 || !values.every(Number.isInteger)) throw new Error(`--${name} takes whole numbers`);
  return values;
};

const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  // No hot reload: nothing here edits a file, and every worker would ask for the same port.
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: "custom",
});
try {
  const report = await server.ssrLoadModule("/src/playtest/boss-report.ts");
  const summary = await server.ssrLoadModule("/src/playtest/boss-summary.ts");
  const waveReport = await server.ssrLoadModule("/src/playtest/wave-report.ts");
  const started = performance.now();
  const waveRequest = {
    stages: list(given.get("stage"), []),
    ...(given.has("wave") ? { waves: wholeNumbers("wave") } : {}),
    difficulties: list(given.get("difficulty"), ["normal"]),
    weapons: list(given.get("weapon"), ["sword"]),
    seeds: list(given.get("seed"), ["1", "2", "3"]),
    players: list(given.get("player"), waveReport.WAVE_REPORT_PLAYERS),
    builds: list(given.get("build"), ["drafted"]),
    maxTicks: Math.round(seconds * 120),
  };
  const bossRequest = {
    bosses: list(given.get("boss"), phases === undefined ? report.REPORT_BOSSES : report.PRACTICE_REPORT_BOSSES),
    difficulties: list(given.get("difficulty"), ["normal"]),
    weapons: list(given.get("weapon"), ["sword"]),
    seeds: list(given.get("seed"), ["1"]),
    players: list(given.get("player"), report.REPORT_PLAYERS),
    ...(phases === undefined ? {} : { phases }),
    maxTicks: Math.round(seconds * 120),
  };
  let fights;
  let jobs = 1;
  try {
    if (waves && waveRequest.stages.length === 0)
      throw new RangeError("waves needs --stage, for example --stage verdant-sanctum");
    const request = waves ? waveRequest : bossRequest;
    const play = waves ? waveReport.playWaveReport : report.playBossReport;
    // Every fight is admitted here, before any worker starts, so a mistyped id costs no playing time.
    const asked = waves ? waveReport.admitWaveReport(request) : report.admitBossReport(request);
    const cores = Math.max(1, os.availableParallelism() - 2);
    jobs = given.has("jobs")
      ? wholeNumber("jobs", given.get("jobs"), 1, MAX_JOBS)
      : Math.max(1, Math.min(MAX_JOBS, cores, Math.floor(asked.length / FIGHTS_PER_JOB)));
    if (share !== undefined) fights = play(request, { index: share[0], of: share[1] });
    else if (jobs === 1) fights = play(request);
    else {
      const folder = mkdtempSync(path.join(os.tmpdir(), "tear-playtest-"));
      try {
        const shares = Array.from({ length: jobs }, (_, index) =>
          playShare(waves ? command : "bosses", given, index, jobs, path.join(folder, `${String(index)}.json`)),
        );
        fights = report.mergeSlices(await Promise.all(shares));
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    }
  } catch (error) {
    // A mistyped boss, weapon, difficulty or option is refused before any fight; print the reason, not a stack.
    if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
    process.stderr.write(`playtest: ${error.message}\n`);
    process.exitCode = 1;
  }
  if (fights !== undefined) {
    const shown = show ?? (waves || fights.length > TABLES_UP_TO ? "summary" : "both");
    if (waves && shown !== "none") process.stdout.write(waveReport.formatWaveReport(fights, shown === "runs"));
    else if (shown === "fights" || shown === "both") process.stdout.write(report.formatBossReport(fights));
    if (shown === "both") process.stdout.write("\n");
    if (seedsCut && shown !== "none") process.stdout.write(SWEEP_CUT);
    if (!waves && (shown === "summary" || shown === "both")) process.stdout.write(summary.formatBossSummary(fights));
    if (shown !== "none")
      process.stdout.write(
        `\n${String(fights.length)} ${waves ? "waves" : "fights"} in ${((performance.now() - started) / 1000).toFixed(1)} s of real time` +
          ` on ${String(jobs)} ${jobs === 1 ? "job" : "jobs"}.\n`,
      );
    const json = given.get("json");
    if (json !== undefined) writeFileSync(path.resolve(json), `${JSON.stringify(fights, null, 2)}\n`);
    if (fights.some((fight) => fight.end === "broken")) process.exitCode = 1;
  }
} finally {
  await server.close();
}
