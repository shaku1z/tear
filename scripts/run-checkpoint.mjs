#!/usr/bin/env node
// Runs a historical milestone checkpoint gate from config/checkpoints.json.
//
//   pnpm checkpoint --list
//   pnpm checkpoint <name> [args...]
//
// Each entry's steps run in order and the first failing step's exit code ends the run, exactly
// like the `a && b && c` package script the entry replaced. Extra arguments are appended to the
// final step, as pnpm appends them to a script. Steps are spawned without a shell: a `node` step
// uses the current Node binary and a `pnpm` step re-enters the pnpm that launched this runner.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CHECKPOINTS_PATH = join(ROOT, "config", "checkpoints.json");
/** Characters a step token may contain; steps are data, never shell text. */
export const STEP_TOKEN = /^[\w./:=@*-]+$/u;
const STEP_EXECUTABLES = new Set(["node", "pnpm"]);

export function loadCheckpoints(path = CHECKPOINTS_PATH) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (data?.schemaVersion !== 1 || data.checkpoints === null || typeof data.checkpoints !== "object") {
    throw new Error(`${path}: expected { schemaVersion: 1, checkpoints: {...} }`);
  }
  return data.checkpoints;
}

/** Throws unless every entry is well formed and every nested checkpoint exists (no cycles). */
export function validateCheckpoints(checkpoints) {
  for (const [name, entry] of Object.entries(checkpoints)) {
    if (typeof entry?.description !== "string" || entry.description.trim() === "") throw new Error(`${name}: missing description`);
    if (!Array.isArray(entry.steps) || entry.steps.length === 0) throw new Error(`${name}: steps must be a non-empty array`);
    for (const step of entry.steps) validateStep(name, step, checkpoints);
  }
  for (const name of Object.keys(checkpoints)) flattenCheckpoint(checkpoints, name);
}

function validateStep(name, step, checkpoints) {
  if (typeof step === "object" && step !== null && typeof step.checkpoint === "string") {
    if (!Object.hasOwn(checkpoints, step.checkpoint)) throw new Error(`${name}: unknown nested checkpoint ${step.checkpoint}`);
    return;
  }
  if (typeof step !== "string") throw new Error(`${name}: a step is a command string or { "checkpoint": "<name>" }`);
  const tokens = step.split(" ");
  if (!STEP_EXECUTABLES.has(tokens[0]) || tokens.some((token) => !STEP_TOKEN.test(token))) {
    throw new Error(`${name}: unsupported step "${step}" (node or pnpm, plain tokens separated by single spaces)`);
  }
}

/** The leaf command strings a checkpoint runs, in order, with nested checkpoints expanded. */
export function flattenCheckpoint(checkpoints, name, stack = []) {
  if (stack.includes(name)) throw new Error(`checkpoint cycle: ${[...stack, name].join(" -> ")}`);
  const entry = checkpoints[name];
  if (entry === undefined) throw new Error(`unknown checkpoint ${name}`);
  return entry.steps.flatMap((step) => typeof step === "string" ? [step] : flattenCheckpoint(checkpoints, step.checkpoint, [...stack, name]));
}

/** Resolves a step to the executable and argv to spawn without a shell. */
export function stepCommand(step, extraArgs = [], env = process.env) {
  const [executable, ...args] = [...step.split(" "), ...extraArgs];
  if (executable === "node") return { file: process.execPath, args };
  const pnpm = env.npm_execpath;
  if (pnpm === undefined || pnpm === "") throw new Error(`"${step}" needs pnpm: run this through \`pnpm checkpoint\``);
  if (/\.[cm]?js$/u.test(pnpm)) return { file: process.execPath, args: [pnpm, ...args] };
  return { file: pnpm, args };
}

function runStep(step, extraArgs, env) {
  console.error(`$ ${[step, ...extraArgs].join(" ")}`);
  const { file, args } = stepCommand(step, extraArgs, env);
  const result = spawnSync(file, args, { cwd: ROOT, env, stdio: "inherit" });
  if (result.error !== undefined) throw result.error;
  if (result.status !== null) return result.status;
  console.error(`step terminated by ${result.signal ?? "an unknown signal"}`);
  return 1;
}

/** Runs one checkpoint; returns the exit code of the first failing step, or 0. */
export function runCheckpoint(checkpoints, name, extraArgs = [], env = process.env) {
  const entry = checkpoints[name];
  if (entry === undefined) throw new Error(`unknown checkpoint ${name}`);
  const stepEnv = { ...env, npm_lifecycle_event: name };
  for (const [index, step] of entry.steps.entries()) {
    const stepArgs = index === entry.steps.length - 1 ? extraArgs : [];
    const status = typeof step === "string" ? runStep(step, stepArgs, stepEnv) : runCheckpoint(checkpoints, step.checkpoint, stepArgs, env);
    if (status !== 0) return status;
  }
  return 0;
}

function list(checkpoints) {
  const names = Object.keys(checkpoints);
  const width = Math.max(...names.map((name) => name.length));
  for (const name of names) console.log(`${name.padEnd(width)}  ${checkpoints[name].description}`);
}

export function main(argv = process.argv.slice(2)) {
  const checkpoints = loadCheckpoints();
  validateCheckpoints(checkpoints);
  const [name, ...extraArgs] = argv;
  if (name === "--list" || name === "-l") return (list(checkpoints), 0);
  if (name === undefined || name === "--help" || name === "-h") {
    console.log("Usage: pnpm checkpoint <name> [args...] | pnpm checkpoint --list");
    return name === undefined ? 2 : 0;
  }
  if (!Object.hasOwn(checkpoints, name)) {
    console.error(`Unknown checkpoint "${name}". Run \`pnpm checkpoint --list\` to see the available checkpoints.`);
    return 2;
  }
  return runCheckpoint(checkpoints, name, extraArgs);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
