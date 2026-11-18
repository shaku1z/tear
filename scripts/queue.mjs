#!/usr/bin/env node
// One queue for heavy local commands, shared by every worktree of this repository.
//
//   pnpm queue -- pnpm test:unit:without-preservation-corpus
//   pnpm queue -- node tests/browser-playground-journeys.js
//
// Waiters are served in the order they joined, TEAR_QUEUE_SLOTS at a time (default 2). Light
// commands (formatting, a lint of changed files, one test file, the fast check group) run at once
// without a ticket; LIGHT below is the whole rule. A command started by a ticket holder inherits the
// ticket, so `pnpm queue -- pnpm check:functional` and the run-checks inside it hold one place, not
// two. scripts/run-checks.mjs joins the same queue itself, so a bare `pnpm check:functional` waits
// its turn too.
//
// Each waiter is a file in <git common dir>/tear-queue named by its arrival time. A small heartbeat
// process touches the ticket every 30 s for as long as its owner lives (it exits when the owner's IPC
// channel closes, however the owner died), so the ticket stays fresh even while the owner is blocked
// in spawnSync. The next waiter that looks drops a ticket that has not been touched for two minutes,
// whatever its process id says (Windows reuses ids quickly), one whose process has died, and, as the
// backstop for a hung command, a holder served more than three hours ago. Waiters wake when the
// directory changes, and look again every two seconds.
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  watch,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TICKET_ENV = "TEAR_QUEUE_TICKET";
const STALE_MS = 3 * 60 * 60_000;
const REFRESH_MS = 30_000;
const SILENT_MS = 2 * 60_000;

const startsWith = (args, prefix) => prefix.every((part, index) => args[index] === part);
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const VALUE_FLAGS = new Set(["-t", "--testNamePattern", "--reporter", "--project", "--config", "--pool"]);

/** Positional arguments after a vitest launcher, skipping flag values. */
function vitestTargets(args) {
  const launcher = [
    ["pnpm", "exec", "vitest"],
    ["pnpm", "vitest"],
    ["npx", "vitest"],
  ].find((prefix) => startsWith(args, prefix));
  if (launcher === undefined) return undefined;
  const targets = [];
  for (let index = launcher.length; index < args.length; index += 1) {
    const arg = args[index];
    if (VALUE_FLAGS.has(arg)) index += 1;
    else if (!arg.startsWith("-") && arg !== "run") targets.push(arg);
  }
  return targets;
}

/** The light-command rule: each entry names a kind of command that runs without a ticket. */
export const LIGHT = [
  {
    kind: "formatting",
    matches: (args) =>
      ["format", "format:check"].includes(args[1] ?? "") || startsWith(args, ["pnpm", "exec", "prettier"]),
  },
  {
    kind: "a lint of changed files",
    matches: (args) => startsWith(args, ["pnpm", "lint"]) && args.includes("--changed"),
  },
  {
    kind: "one test file",
    matches: (args) => {
      const targets = vitestTargets(args);
      return targets?.length === 1 && TEST_FILE.test(targets[0]);
    },
  },
  {
    // The pre-push hook runs this group; a push must not wait behind another session's suite.
    kind: "the fast check group",
    matches: (args) =>
      startsWith(args, ["pnpm", "check:quick"]) || startsWith(args, ["node", "scripts/run-checks.mjs", "fast"]),
  },
];

/** Why a command needs no ticket, or undefined when it has to queue. */
export function lightKind(command) {
  const args = command[0] === "pnpm" || command[0] === "node" || command[0] === "npx" ? command : [];
  return LIGHT.find((rule) => rule.matches(args))?.kind;
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};

/** Marks the ticket as refreshed at `at` (ms). False when it is gone. */
function touch(path, at) {
  try {
    utimesSync(path, at / 1000, at / 1000);
    return true;
  } catch {
    return false;
  }
}

/**
 * True when the ticket has not been refreshed for silentMs, its owner has died, or it was served
 * longer than staleMs ago. A ticket being written right now reads as empty and is judged by its age.
 */
function expired(path, { staleMs, silentMs }, now) {
  let refreshed;
  try {
    refreshed = statSync(path).mtimeMs;
  } catch {
    return true;
  }
  if (now - refreshed > silentMs) return true;
  let owner;
  try {
    owner = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return false;
  }
  return !alive(owner.pid) || (owner.served !== undefined && now - owner.served > staleMs);
}

/** The live tickets in arrival order. Expired ones are removed on the way. */
function liveTickets(directory, limits, now) {
  const live = [];
  for (const name of readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .sort()) {
    const path = join(directory, name);
    if (expired(path, limits, now)) rmSync(path, { force: true });
    else live.push(name);
  }
  return live;
}

/** Resolves when a ticket is added or removed, or after `wait` ms, whichever is first. */
function nextChange(directory, wait) {
  return new Promise((done) => {
    let watcher;
    const finish = () => {
      clearTimeout(timer);
      watcher?.close();
      done();
    };
    const timer = setTimeout(finish, wait);
    try {
      // Only a ticket added or removed ("rename"). A touch is a "change" on Linux, and waking on
      // it made waiters that touch every pass wake each other in a tight loop (#228 unit OOM).
      watcher = watch(directory, (event) => {
        if (event === "rename") finish();
      });
    } catch {
      // No change notifications here: the timer alone wakes the waiter.
    }
  });
}

let joined = 0;

/** Starts the process that keeps a ticket fresh; it exits when this process does. */
function startHeartbeat(path, refreshMs) {
  const script = fileURLToPath(import.meta.url);
  const child = spawn(process.execPath, [script, "--heartbeat", path, String(refreshMs)], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    windowsHide: true,
  });
  child.unref();
  child.channel?.unref();
  return child;
}

/** The heartbeat process: touch the ticket every refreshMs until it is gone or the owner exits. */
function heartbeat(path, refreshMs) {
  process.on("disconnect", () => process.exit(0));
  touch(path, Date.now());
  setInterval(() => {
    if (!touch(path, Date.now())) process.exit(0);
  }, refreshMs);
}

/**
 * Joins the queue and resolves, once this caller is among the first `slots` live tickets, with a
 * function that leaves it. A caller whose environment already names a held ticket is inside a
 * holder's command and goes straight through.
 */
export async function joinQueue({
  directory,
  slots,
  label = "",
  env = process.env,
  staleMs = STALE_MS,
  silentMs = SILENT_MS,
  refreshMs = REFRESH_MS,
  wait = 2000,
  log = console.error,
  now = Date.now,
}) {
  const inherited = env[TICKET_ENV];
  if (inherited !== undefined && existsSync(inherited)) return () => undefined;
  mkdirSync(directory, { recursive: true });
  joined += 1;
  const name = `${String(now()).padStart(15, "0")}-${String(process.pid)}-${String(joined).padStart(6, "0")}.json`;
  const path = join(directory, name);
  const owner = { pid: process.pid, joined: now(), cwd: process.cwd(), command: label };
  writeFileSync(path, JSON.stringify(owner), { flag: "wx" });
  touch(path, now());
  const beat = startHeartbeat(path, refreshMs);
  const started = now();
  let ahead;
  for (;;) {
    if (!touch(path, now())) {
      writeFileSync(path, JSON.stringify(owner), { flag: "wx" });
      touch(path, now());
    }
    const live = liveTickets(directory, { staleMs, silentMs }, now());
    const place = live.indexOf(name);
    if (place !== -1 && place < slots) break;
    const waiting = (place === -1 ? live.length : place) - slots + 1;
    if (waiting !== ahead) log(`queue: ${String(waiting)} ahead of this command (${String(slots)} run at once)`);
    ahead = waiting;
    await nextChange(directory, wait);
  }
  if (ahead !== undefined) log(`queue: started after ${String(Math.round((now() - started) / 1000))} s`);
  writeFileSync(path, JSON.stringify({ ...owner, served: now() }));
  touch(path, now());
  env[TICKET_ENV] = path;
  return () => {
    beat.kill();
    rmSync(path, { force: true });
    if (env[TICKET_ENV] === path) Reflect.deleteProperty(env, TICKET_ENV);
  };
}

/** The queue directory every worktree of this repository shares, or undefined outside Git. */
export function queueDirectory(cwd = root) {
  const result = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd, encoding: "utf8" });
  if (result.status !== 0) return undefined;
  const common = result.stdout.trim();
  return join(isAbsolute(common) ? common : resolve(cwd, common), "tear-queue");
}

export function queueSlots(env = process.env) {
  const slots = Number(env.TEAR_QUEUE_SLOTS ?? 2);
  return Number.isFinite(slots) ? Math.max(1, Math.floor(slots)) : 2;
}

/** The command after an optional `--` (pnpm forwards it). */
export function commandFrom(argv) {
  return argv[0] === "--" ? argv.slice(1) : argv;
}

/**
 * One argument as the shell will pass it on. POSIX sh gets single quotes. Windows cmd gets double
 * quotes around anything outside the safe set; cmd has no escape for a double quote inside them and
 * still expands %NAME% there, so an argument holding either is refused.
 */
export function quoteArgument(part, platform = process.platform) {
  if (/^[\w@+=:,./\\-]+$/u.test(part)) return part;
  if (platform !== "win32") return `'${part.replaceAll("'", "'\\''")}'`;
  if (/["%]/u.test(part)) throw new RangeError(`queue: cmd cannot pass this argument intact: ${part}`);
  return `"${part}"`;
}

async function main(argv) {
  if (argv[0] === "--heartbeat") {
    heartbeat(argv[1], Number(argv[2]));
    return undefined;
  }
  const command = commandFrom(argv);
  if (command.length === 0) {
    console.error("usage: pnpm queue -- <command> [args...]");
    return 2;
  }
  let line;
  try {
    line = command.map((part) => quoteArgument(part)).join(" ");
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const kind = lightKind(command);
  const directory = queueDirectory();
  const release =
    kind === undefined && directory !== undefined
      ? await joinQueue({ directory, slots: queueSlots(), label: command.join(" ") })
      : () => undefined;
  process.on("exit", release);
  for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(signal, () => process.exit(130));
  // A shell starts .cmd launchers such as pnpm on Windows (see quoteArgument).
  const child = spawn(line, { stdio: "inherit", shell: true });
  return new Promise((done) => {
    child.on("error", (error) => {
      console.error(`queue: could not start the command: ${error.message}`);
      done(127);
    });
    child.on("exit", (code, signal) => done(code ?? (signal ? 1 : 0)));
  });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = await main(process.argv.slice(2));
  if (code !== undefined) process.exitCode = code;
}
