import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { resolve } from "node:path";

const owner = createHash("sha256").update(userInfo().username).digest("hex").slice(0, 24);
const defaultDirectory = resolve(tmpdir(), `tearbench-resource-leases-v1-${owner}`);
const inheritanceVariable = "TEARBENCH_PARENT_RESOURCE_LEASES";

async function inheritedLeases(root) {
  const raw = process.env[inheritanceVariable];
  if (raw === undefined) return [];
  let value;
  try { value = JSON.parse(raw); }
  catch (error) { throw new Error("malformed parent resource leases", { cause: error }); }
  if (value?.version !== 1 || value.issuerPid !== process.ppid || value.directory !== root
    || !Array.isArray(value.leases) || value.leases.length > 32) throw new Error("parent resource lease binding mismatch");
  const keys = new Set();
  for (const lease of value.leases) {
    if (typeof lease?.key !== "string" || !/^[a-z0-9][a-z0-9:/._-]{0,199}$/u.test(lease.key)
      || keys.has(lease.key) || !Number.isSafeInteger(lease.pid) || lease.pid < 1
      || typeof lease.token !== "string" || !/^[0-9a-f-]{36}$/u.test(lease.token)) throw new Error("malformed parent resource lease");
    keys.add(lease.key);
    const path = resolve(root, `${createHash("sha256").update(lease.key).digest("hex")}.lock`);
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("parent resource lease is not a regular lock");
    const recorded = JSON.parse(await readFile(path, "utf8"));
    if (recorded.key !== lease.key || recorded.pid !== lease.pid || recorded.token !== lease.token) {
      throw new Error("parent resource lease ownership mismatch");
    }
    try { process.kill(lease.pid, 0); }
    catch (error) { throw new Error("parent resource lease owner is not live", { cause: error }); }
  }
  return value.leases;
}

function synchronousChildRunner(root, leases) {
  // Never publish inheritance through global process.env or an asynchronous spawn.
  // The owner remains blocked until this child (and its synchronous descendants) exits.
  return (command, args, options = {}) => {
    const env = { ...(options.env ?? process.env) };
    delete env.TEARBENCH_PARENT_RESOURCE_LEASES;
    if (leases.length > 0) env[inheritanceVariable] = JSON.stringify({ version: 1, issuerPid: process.pid, directory: root, leases });
    return spawnSync(command, args, { ...options, env });
  };
}

async function releaseOwnedLeases(held) {
  const errors = [];
  for (const entry of held.reverse()) {
    try {
      const current = await lstat(entry.path), acquired = await entry.handle.stat();
      if (!current.isFile() || current.isSymbolicLink() || current.ino !== acquired.ino || current.dev !== acquired.dev
        || await readFile(entry.path, "utf8") !== entry.bytes) throw new Error("resource lease ownership changed; refusing cleanup");
      await unlink(entry.path);
    } catch (error) { errors.push(error); }
    try { await entry.handle.close(); }
    catch (error) { errors.push(error); }
  }
  return errors;
}

export function taskResourceKeys(task) {
  if (!Array.isArray(task.resourceKeys) || !Array.isArray(task.dependencies)) throw new TypeError("task resource contract is missing");
  return [...new Set([...task.resourceKeys,
    ...(task.dependencies.some((dependency) => dependency.outputId === "build-artifact") ? ["resources/build"] : []),
  ])].sort();
}

// Cooperative host/user-scoped exclusion, not evidence or release authority.
// A crashed holder is never silently stolen: its retained lock requires review.
export async function withResourceLeases(resourceKeys, callback, { directory = defaultDirectory } = {}) {
  if (!Array.isArray(resourceKeys) || resourceKeys.some((key) => typeof key !== "string"
    || !/^[a-z0-9][a-z0-9:/._-]{0,199}$/u.test(key))) throw new TypeError("invalid resource lease keys");
  if (typeof callback !== "function") throw new TypeError("resource lease callback is missing");
  const keys = [...new Set(resourceKeys)].sort();
  const root = resolve(directory);
  if (keys.length === 0 && process.env[inheritanceVariable] === undefined) return await callback(synchronousChildRunner(root, []));
  await mkdir(root, { recursive: true, mode: 0o700 });
  const metadata = await lstat(root), canonical = await realpath(root);
  const normalize = (path) => process.platform === "win32" ? path.toLowerCase() : path;
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || normalize(canonical) !== normalize(root)
    || (typeof process.getuid === "function" && metadata.uid !== process.getuid())) {
    throw new Error("resource lease directory is not an owned canonical directory");
  }
  const inherited = await inheritedLeases(root);
  const borrowedKeys = new Set(inherited.map((lease) => lease.key));
  const held = [];
  let result, failure, failed = false, cleanupErrors;
  try {
    for (const key of keys) {
      if (borrowedKeys.has(key)) continue;
      const path = resolve(root, `${createHash("sha256").update(key).digest("hex")}.lock`);
      let handle;
      try { handle = await open(path, "wx", 0o600); }
      catch (error) {
        if (error.code === "EEXIST") throw new Error(`resource lease occupied: ${key}; stop and inspect the holder, do not steal or retry automatically`, { cause: error });
        throw error;
      }
      const identity = { key, pid: process.pid, token: randomUUID() };
      const entry = { path, handle, identity, bytes: JSON.stringify(identity) };
      held.push(entry);
      await handle.writeFile(entry.bytes);
    }
    result = await callback(synchronousChildRunner(root, [...inherited, ...held.map((entry) => entry.identity)]));
  } catch (error) {
    failure = error;
    failed = true;
  } finally {
    cleanupErrors = await releaseOwnedLeases(held);
  }
  if (cleanupErrors.length > 0) throw new AggregateError([...(failed ? [failure] : []), ...cleanupErrors], "resource lease cleanup requires inspection");
  if (failed) throw failure;
  return result;
}
