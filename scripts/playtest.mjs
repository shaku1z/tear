// Plays the real game headless and prints what happened. `pnpm playtest bosses` fights each named boss
// with scripted players on fixed seeds and prints one table per fight, phase by phase, and a summary.
// `pnpm playtest sweep` is the same over every weapon, two seeds and two difficulties, summary only.
// `pnpm playtest waves --stage <id>` plays the waves of an Adventure stage, each opened directly, and prints a
// row per wave.
// `pnpm playtest runs` plays whole runs from wave 1 in each mode and prints where they end and what each wave costs.
// `pnpm playtest enemies` puts each enemy kind alone against the player and prints a row per kind.
// `pnpm playtest coverage` plays every report's set and lists what the game defines that never appeared.
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
/** Game seconds a run may take before it is stopped: 30 minutes, longer than the scripted player lasts. */
const RUN_SECONDS = 1800;
/** Game seconds a meeting with one kind of enemy may take before it is stopped. */
const ENEMY_SECONDS = 60;
const USAGE = `Usage: pnpm playtest bosses [options]
       pnpm playtest sweep [options]
       pnpm playtest waves --stage <ids> [options]
       pnpm playtest runs [options]
       pnpm playtest enemies [options]
       pnpm playtest coverage [options]

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
  --compare <commit>   on any report: play the same set on that commit's game with this checkout's tool
                       and print only the measures that differ (the tables with --show)

"waves" plays the waves of an Adventure stage, each opened directly on its stage, and prints a row per wave:
clear time, the wave as it arrived, damage by source, snares, roots and Rootbinders.
  --stage <ids>        comma list of Adventure stages (required), for example verdant-sanctum
  --wave <waves>       comma list of wave numbers; default the stage's nine waves before its boss
  --build <ids>        comma list of drafted, none; default drafted: one upgrade for each wave before,
                       picked from the game's draft
  --difficulty, --weapon, --seconds, --jobs, --json as above; --seed defaults to 1,2,3;
  --player defaults to scripted,cuts-objects; --show runs adds a line for every run

"runs" plays whole runs from wave 1, drafting as a player does, and prints where they end and the time and
health each wave costs.
  --mode <ids>         comma list of campaign, endless, gauntlet; default all three
  --difficulty defaults to easy,normal,hard; --weapon to all five; --seed to 1,2,3; --player to scripted;
  --seconds to ${String(RUN_SECONDS)} (queue the default set: pnpm queue -- pnpm playtest runs)

"enemies" puts enemies of one kind in the game's empty arena against the player, at wave 1 strength with no
upgrades, and prints a row per kind: how the meetings end, time to clear, health lost and what it is lost to.
  --enemy <ids>        comma list of enemy kinds; default every enemy the published game has
  --count <n>          comma list of how many of the kind at once; default 1,3
  --difficulty, --weapon, --jobs, --json as above; --seed defaults to 1,2,3; --player to scripted;
  --seconds to ${String(ENEMY_SECONDS)}

"coverage" plays the reports above, each on its default set (waves: every Adventure stage, seed 1, scripted),
and lists the enemies, enemy affixes, bosses, boss phases and upgrades the game defines that never appeared.
  --report <names>     comma list of bosses, waves, runs, enemies; default all four
  --jobs as above; --json writes the list (queue it: pnpm queue -- pnpm playtest coverage)
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

/** This command again as its own process, printing nothing and writing what it played to a file; gives the file's content. */
function playApart(command, args, file, name) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, command, ...args, "--json", file, "--show", "none"], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    child.on("error", reject);
    // It exits with 1 when something it played is broken; its file is still whole.
    child.on("exit", (code) => {
      if (code === 0 || code === 1) resolve(JSON.parse(readFileSync(file, "utf8")));
      else reject(new Error(`playtest ${name} stopped with code ${String(code)}`));
    });
  });
}

/** One worker: this command again with one share of the fights. */
function playShare(command, given, index, of, file) {
  const args = [...given].flatMap(([name, value]) =>
    ["jobs", "json", "show", "share", "compare"].includes(name) ? [] : [`--${name}`, value],
  );
  args.push("--share", `${String(index)}/${String(of)}`);
  return playApart(command, args, file, `worker ${String(index)} of ${String(of)}`);
}

/**
 * Another commit's game, ready to be played by this checkout's tool: its `src`, `config` and the JSON under
 * `public` extracted once into `artifacts/playtest/base-<sha>/` (git ignores it), with this checkout's
 * `src/playtest` laid over its own. Dependencies resolve from this checkout, so every package that commit lists
 * must be listed here at the same version; packages added since do not matter.
 */
function baseBuild(commit) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  let sha;
  try {
    sha = git("rev-parse", "--verify", "--quiet", `${commit}^{commit}`).trim();
  } catch {
    throw new RangeError(`--compare: no commit "${commit}"`);
  }
  const name = sha.slice(0, 12);
  const listed = (source) => {
    const { dependencies = {}, devDependencies = {} } = JSON.parse(source);
    return { ...devDependencies, ...dependencies };
  };
  const theirs = listed(git("show", `${sha}:package.json`));
  const ours = listed(readFileSync(path.join(root, "package.json"), "utf8"));
  const differing = Object.keys(theirs).filter((dependency) => theirs[dependency] !== ours[dependency]);
  if (differing.length > 0)
    throw new RangeError(
      `--compare: ${name} lists ${differing.join(", ")} at another version than this checkout (or not at all here), ` +
        "so its game cannot run on these dependencies",
    );
  const folder = path.join(root, "artifacts", "playtest", `base-${name}`);
  if (!existsSync(path.join(folder, "src"))) {
    mkdirSync(folder, { recursive: true });
    const data = git("ls-tree", "-r", "--name-only", sha, "--", "public")
      .split("\n")
      .filter((file) => file.endsWith(".json"));
    // The archive is written and read by name inside the folder: a drive letter in a path reads as a host to some tars.
    execFileSync(
      "git",
      ["archive", "--format=tar", "-o", path.join(folder, "base.tar"), sha, "src", "config", ...data],
      {
        cwd: root,
      },
    );
    execFileSync("tar", ["-xf", "base.tar"], { cwd: folder });
    rmSync(path.join(folder, "base.tar"));
  }
  rmSync(path.join(folder, "src", "playtest"), { recursive: true, force: true });
  cpSync(path.join(root, "src", "playtest"), path.join(folder, "src", "playtest"), { recursive: true });
  return { name, url: `/artifacts/playtest/base-${name}` };
}

/** The coverage list: each report played apart on its coverage set, then what never appeared in any of them. */
async function coverage(load, given) {
  const cover = await load("coverage");
  const reports = list(given.get("report"), cover.COVERAGE_REPORTS);
  const unknown = reports.find((report) => !cover.COVERAGE_REPORTS.includes(report));
  if (unknown !== undefined)
    throw new RangeError(`no report "${unknown}"; coverage plays ${cover.COVERAGE_REPORTS.join(", ")}`);
  const started = performance.now();
  const folder = mkdtempSync(path.join(os.tmpdir(), "tear-playtest-"));
  const played = {};
  try {
    // One report at a time: each starts its own workers.
    for (const report of reports) {
      played[report] = [];
      for (const [index, set] of cover.COVERAGE_SETS[report].entries()) {
        const args = Object.entries(set).flatMap(([name, value]) => [`--${name}`, value]);
        if (given.has("jobs")) args.push("--jobs", given.get("jobs"));
        const file = path.join(folder, `${report}-${String(index)}.json`);
        played[report].push(...(await playApart(report, args, file, report)));
      }
      process.stderr.write(`coverage: played ${String(played[report].length)} ${report}\n`);
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
  const rows = cover.coverageRows(cover.appearedIn(played));
  process.stdout.write(
    `Played: ${reports.map((report) => `${report} (${String(played[report].length)})`).join(", ")}.\n` +
      reports
        .map((report) => [report, played[report].filter((result) => result.end === "broken").length])
        .filter(([, broken]) => broken > 0)
        .map(([report, broken]) => `BROKEN: ${String(broken)} of the ${report}; play that report for the reasons.\n`)
        .join("") +
      cover.formatCoverage(rows) +
      `\n${((performance.now() - started) / 1000).toFixed(1)} s of real time.\n`,
  );
  const json = given.get("json");
  if (json !== undefined) writeFileSync(path.resolve(json), `${JSON.stringify(rows, null, 2)}\n`);
  if (Object.values(played).some((results) => results.some((result) => result.end === "broken"))) process.exitCode = 1;
}

const [command, ...rest] = process.argv.slice(2);
if (!["bosses", "sweep", "waves", "runs", "enemies", "coverage"].includes(command)) {
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
const wholeNumbers = (name) => {
  const values = list(given.get(name), []).map(Number);
  if (values.length === 0 || !values.every(Number.isInteger)) throw new Error(`--${name} takes whole numbers`);
  return values;
};
const maxTicks = Math.round(seconds * 120);

const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  // No hot reload: nothing here edits a file, and every worker would ask for the same port.
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: "custom",
});
try {
  // --base is how --compare starts this command on another commit's game (see baseBuild).
  const load = (name) => server.ssrLoadModule(`${given.get("base") ?? ""}/src/playtest/${name}.ts`);
  const shares = await load("boss-report");
  /**
   * What each command plays and prints. `request` is built from the options, `admit` refuses a mistyped id before
   * anything is played, `play` plays everything or one worker's share, and `print` writes what `--show` chose.
   */
  const kinds = {
    bosses: async () => {
      const summary = await load("boss-summary");
      return {
        noun: "fights",
        shows: ["fights", "summary", "both"],
        shown: (count) => (count > TABLES_UP_TO ? "summary" : "both"),
        request: {
          bosses: list(given.get("boss"), phases === undefined ? shares.REPORT_BOSSES : shares.PRACTICE_REPORT_BOSSES),
          difficulties: list(given.get("difficulty"), ["normal"]),
          weapons: list(given.get("weapon"), ["sword"]),
          seeds: list(given.get("seed"), ["1"]),
          players: list(given.get("player"), shares.REPORT_PLAYERS),
          ...(phases === undefined ? {} : { phases }),
          maxTicks,
        },
        admit: shares.admitBossReport,
        play: shares.playBossReport,
        print: (fights, shown) => {
          if (shown === "fights" || shown === "both") process.stdout.write(shares.formatBossReport(fights));
          if (shown === "both") process.stdout.write("\n");
          if (seedsCut) process.stdout.write(SWEEP_CUT);
          if (shown === "summary" || shown === "both") process.stdout.write(summary.formatBossSummary(fights));
        },
      };
    },
    waves: async () => {
      const report = await load("wave-report");
      const stages = list(given.get("stage"), []);
      return {
        noun: "waves",
        shows: ["runs", "summary"],
        shown: () => "summary",
        request: {
          stages,
          ...(given.has("wave") ? { waves: wholeNumbers("wave") } : {}),
          difficulties: list(given.get("difficulty"), ["normal"]),
          weapons: list(given.get("weapon"), ["sword"]),
          seeds: list(given.get("seed"), ["1", "2", "3"]),
          players: list(given.get("player"), report.WAVE_REPORT_PLAYERS),
          builds: list(given.get("build"), ["drafted"]),
          maxTicks,
        },
        admit: (request) => {
          if (stages.length === 0) throw new RangeError("waves needs --stage, for example --stage verdant-sanctum");
          return report.admitWaveReport(request);
        },
        play: report.playWaveReport,
        print: (results, shown) => process.stdout.write(report.formatWaveReport(results, shown === "runs")),
      };
    },
    runs: async () => {
      const report = await load("run-report");
      const play = await load("run-play");
      return {
        noun: "runs",
        shows: ["summary"],
        shown: () => "summary",
        request: {
          modes: list(given.get("mode"), play.RUN_MODES),
          difficulties: list(given.get("difficulty"), ["easy", "normal", "hard"]),
          weapons: list(given.get("weapon"), SWEEP.get("weapon").split(",")),
          seeds: list(given.get("seed"), ["1", "2", "3"]),
          players: list(given.get("player"), ["scripted"]),
          maxTicks: given.has("seconds") ? maxTicks : RUN_SECONDS * 120,
        },
        admit: report.admitRunReport,
        play: report.playRunReport,
        print: (results) => process.stdout.write(report.formatRunReport(results)),
      };
    },
    enemies: async () => {
      const report = await load("enemy-report");
      const play = await load("enemy-play");
      return {
        noun: "meetings",
        shows: ["summary"],
        shown: () => "summary",
        request: {
          enemies: list(given.get("enemy"), play.REPORT_ENEMIES),
          counts: given.has("count") ? wholeNumbers("count") : [1, 3],
          difficulties: list(given.get("difficulty"), ["normal"]),
          weapons: list(given.get("weapon"), ["sword"]),
          seeds: list(given.get("seed"), ["1", "2", "3"]),
          players: list(given.get("player"), ["scripted"]),
          maxTicks: given.has("seconds") ? maxTicks : ENEMY_SECONDS * 120,
        },
        admit: report.admitEnemyReport,
        play: report.playEnemyReport,
        print: (results) => process.stdout.write(report.formatEnemyReport(results)),
      };
    },
  };
  if (command === "coverage") {
    try {
      await coverage(load, given);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      process.stderr.write(`playtest: ${error.message}\n`);
      process.exitCode = 1;
    }
  } else {
    const played = command === "sweep" ? "bosses" : command;
    const kind = await kinds[played]();
    if (show !== undefined && ![...kind.shows, "none"].includes(show))
      throw new Error(`--show takes ${kind.shows.join(", ")}`);
    const started = performance.now();
    let results;
    let comparison;
    let jobs = 1;
    try {
      // Everything is admitted here, before any worker starts, so a mistyped id costs no playing time.
      const asked = kind.admit(kind.request);
      // The other commit is made ready before anything is played, so a wrong commit costs no playing time either.
      const build = given.has("compare") && share === undefined ? baseBuild(given.get("compare")) : undefined;
      const cores = Math.max(1, os.availableParallelism() - 2);
      jobs = given.has("jobs")
        ? wholeNumber("jobs", given.get("jobs"), 1, MAX_JOBS)
        : Math.max(1, Math.min(MAX_JOBS, cores, Math.floor(asked.length / FIGHTS_PER_JOB)));
      if (share !== undefined) results = kind.play(kind.request, { index: share[0], of: share[1] });
      else if (jobs === 1) results = kind.play(kind.request);
      else {
        const folder = mkdtempSync(path.join(os.tmpdir(), "tear-playtest-"));
        try {
          const workers = Array.from({ length: jobs }, (_, index) =>
            playShare(played, given, index, jobs, path.join(folder, `${String(index)}.json`)),
          );
          results = shares.mergeSlices(await Promise.all(workers));
        } finally {
          rmSync(folder, { recursive: true, force: true });
        }
      }
      if (build !== undefined) {
        const args = [...given].flatMap(([name, value]) =>
          ["json", "show", "share", "compare", "base"].includes(name) ? [] : [`--${name}`, value],
        );
        const folder = mkdtempSync(path.join(os.tmpdir(), "tear-playtest-"));
        try {
          const file = path.join(folder, "base.json");
          const base = await playApart(played, [...args, "--base", build.url], file, `on ${build.name}`);
          const compare = await load("compare");
          comparison = compare.formatComparison(compare.compareResults(base, results), results.length, build.name);
        } finally {
          rmSync(folder, { recursive: true, force: true });
        }
      }
    } catch (error) {
      // A mistyped boss, weapon, difficulty or option is refused before anything is played; print the reason, not a stack.
      if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
      process.stderr.write(`playtest: ${error.message}\n`);
      process.exitCode = 1;
    }
    if (results !== undefined) {
      // A comparison prints only what changed, unless the tables are asked for.
      const shown = show ?? (comparison === undefined ? kind.shown(results.length) : "none");
      if (comparison !== undefined && show !== "none") process.stdout.write(comparison);
      if (shown !== "none") {
        kind.print(results, shown);
        process.stdout.write(
          `\n${String(results.length)} ${kind.noun} in ${((performance.now() - started) / 1000).toFixed(1)} s of real time` +
            ` on ${String(jobs)} ${jobs === 1 ? "job" : "jobs"}.\n`,
        );
      }
      const json = given.get("json");
      if (json !== undefined) writeFileSync(path.resolve(json), `${JSON.stringify(results, null, 2)}\n`);
      if (results.some((result) => result.end === "broken")) process.exitCode = 1;
    }
  }
} finally {
  await server.close();
}
