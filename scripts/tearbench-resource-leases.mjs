import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { resolve } from "node:path";

const owner = createHash("sha256").update(userInfo().username).digest("hex").slice(0, 24);
const defaultDirectory = resolve(tmpdir(), `tearbench-resource-leases-v1-${owner}`);

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
  if (keys.length === 0) return await callback();
  const root = resolve(directory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const metadata = await lstat(root), canonical = await realpath(root);
  const normalize = (path) => process.platform === "win32" ? path.toLowerCase() : path;
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || normalize(canonical) !== normalize(root)
    || (typeof process.getuid === "function" && metadata.uid !== process.getuid())) {
    throw new Error("resource lease directory is not an owned canonical directory");
  }
  const held = [];
  let result, failure, failed = false, cleanupErrors;
  try {
    for (const key of keys) {
      const path = resolve(root, `${createHash("sha256").update(key).digest("hex")}.lock`);
      let handle;
      try { handle = await open(path, "wx", 0o600); }
      catch (error) {
        if (error.code === "EEXIST") throw new Error(`resource lease occupied: ${key}; stop and inspect the holder, do not steal or retry automatically`, { cause: error });
        throw error;
      }
      const entry = { path, handle, bytes: JSON.stringify({ key, pid: process.pid, token: randomUUID() }) };
      held.push(entry);
      await handle.writeFile(entry.bytes);
    }
    result = await callback();
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
