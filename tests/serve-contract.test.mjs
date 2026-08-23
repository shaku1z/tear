/* global Buffer, URL, clearTimeout, process, setTimeout */

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverScript = path.join(repositoryRoot, "scripts", "serve.py");
const brandingRoot = path.join(repositoryRoot, "branding");
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const maxPngBytes = 8 * 1024 * 1024;
let nameCounter = 0;

function findPython() {
  const candidates = process.platform === "win32"
    ? [["py", ["-3"]], ["python", []], ["python3", []]]
    : [["python3", []], ["python", []]];
  for (const [command, prefix] of candidates) {
    const result = spawnSync(command, [...prefix, "--version"], { stdio: "ignore" });
    if (result.status === 0) return { command, prefix };
  }
  return null;
}

const python = findPython();

function fixtureName(label) {
  nameCounter += 1;
  return `serve-contract-${label}-${process.pid}-${nameCounter}.png`;
}

function request(server, { method = "GET", pathname = "/", body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const requestBody = body === undefined ? undefined : Buffer.from(body, "utf8");
    const requestHeaders = { ...headers };
    if (requestBody !== undefined) requestHeaders["Content-Length"] = String(requestBody.length);
    const client = http.request(new URL(pathname, server.origin), {
      method,
      headers: requestHeaders,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
        text: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    client.on("error", reject);
    if (requestBody !== undefined) client.write(requestBody);
    client.end();
  });
}

function postSave(server, name, data, { headers = {}, payload = {}, pathname = "/save" } = {}) {
  const dataURL = typeof data === "string"
    ? data
    : `data:image/png;base64,${Buffer.from(data).toString("base64")}`;
  return request(server, {
    method: "POST",
    pathname,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ name, dataURL, ...payload }),
  });
}

function parseJson(response) {
  return JSON.parse(response.text);
}

function startServer({ allowOverwrite = false } = {}) {
  assert.ok(python, "Python 3 is required for the serve.py contract test");
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "tear-g5-serve-cwd-"));
  const argumentsList = [...python.prefix, serverScript, "--port", "0"];
  if (allowOverwrite) argumentsList.push("--allow-overwrite");
  const child = spawn(python.command, argumentsList, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stdout = "";
  let stderr = "";
  let resolved = false;
  let resolveExit;
  const exit = new Promise((resolve) => { resolveExit = resolve; });
  child.once("exit", (code, signal) => resolveExit({ code, signal }));
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`serve.py did not bind in time\n${stdout}\n${stderr}`)), 10000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = stdout.match(/Serving Tear on http:\/\/(127\.0\.0\.1|localhost):(\d+)/u);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({ origin: `http://${match[1]}:${match[2]}`, cwd, child, exit });
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (!resolved) {
        clearTimeout(timer);
        reject(new Error(`serve.py exited before binding (code=${code}, signal=${signal})\n${stdout}\n${stderr}`));
      }
    });
  });
  return ready.catch(async (error) => {
    await stopProcess(child, exit);
    fs.rmSync(cwd, { recursive: true, force: true });
    throw error;
  });
}

async function stopProcess(child, exit) {
  if (child.exitCode === null && child.signalCode === null) child.kill();
  await Promise.race([
    exit,
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  if (child.exitCode === null && process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  }
}

async function stopServer(server) {
  if (!server) return;
  await stopProcess(server.child, server.exit);
  fs.rmSync(server.cwd, { recursive: true, force: true });
}

async function withServer(options, callback) {
  const server = await startServer(options);
  try {
    return await callback(server);
  } finally {
    await stopServer(server);
  }
}

function cleanBranding(name) {
  fs.rmSync(path.join(brandingRoot, name), { force: true });
}

test("serve.py serves the repository from an arbitrary CWD on loopback", async () => {
  await withServer({}, async (server) => {
    assert.match(server.origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/u);
    const response = await request(server, { pathname: "/experiments/coop-lab.html" });
    assert.equal(response.status, 200);
    assert.match(response.text, /Tear|Co-?op/u);
    assert.deepEqual(fs.readdirSync(server.cwd), []);
  });
});

test("default /save is bounded, create-only, and reports method/path errors", async () => {
  const name = fixtureName("create");
  const wrongPathName = fixtureName("wrong-path");
  const first = Buffer.concat([pngSignature, Buffer.from("first")]);
  const second = Buffer.concat([pngSignature, Buffer.from("second")]);
  try {
    await withServer({}, async (server) => {
      const created = await postSave(server, name, first);
      assert.equal(created.status, 201);
      assert.equal(parseJson(created).ok, true);
      assert.deepEqual(fs.readFileSync(path.join(brandingRoot, name)), first);

      const conflict = await postSave(server, name, second);
      assert.equal(conflict.status, 409);
      assert.match(parseJson(conflict).error, /preserved|--allow-overwrite/u);
      assert.deepEqual(fs.readFileSync(path.join(brandingRoot, name)), first);

      const method = await request(server, { pathname: "/save" });
      assert.equal(method.status, 405);
      const options = await request(server, { method: "OPTIONS", pathname: "/save" });
      assert.equal(options.status, 405);
      const wrongPath = await postSave(server, wrongPathName, first, { pathname: "/wrong" });
      assert.equal(wrongPath.status, 404);
    });
  } finally {
    cleanBranding(name);
  }
});

test("explicit overwrite mode replaces a validated PNG", async () => {
  const name = fixtureName("overwrite");
  const first = Buffer.concat([pngSignature, Buffer.from("first")]);
  const second = Buffer.concat([pngSignature, Buffer.from("second")]);
  try {
    await withServer({ allowOverwrite: true }, async (server) => {
      assert.equal((await postSave(server, name, first)).status, 201);
      const replaced = await postSave(server, name, second);
      assert.equal(replaced.status, 200);
      assert.deepEqual(fs.readFileSync(path.join(brandingRoot, name)), second);
    });
  } finally {
    cleanBranding(name);
  }
});

test("/save rejects malformed, non-PNG, traversal, and oversized input", async () => {
  const names = [fixtureName("malformed"), fixtureName("non-png"), fixtureName("traversal"), fixtureName("oversized")];
  try {
    await withServer({}, async (server) => {
      const invalidJson = await request(server, {
        method: "POST",
        pathname: "/save",
        headers: { "Content-Type": "application/json" },
        body: "{",
      });
      assert.equal(invalidJson.status, 400);
      const malformed = await postSave(server, names[0], "data:image/png;base64,not-valid-base64");
      assert.equal(malformed.status, 400);
      const nonPng = await postSave(server, names[1], Buffer.from("not a png"));
      assert.equal(nonPng.status, 400);
      const traversal = await postSave(server, "../escape.png", Buffer.concat([pngSignature, Buffer.from("x")]));
      assert.equal(traversal.status, 400);
      const oversized = await postSave(server, names[3], Buffer.alloc(maxPngBytes + 1, 0x41));
      assert.equal(oversized.status, 413);
      const wrongType = await postSave(server, names[0], Buffer.concat([pngSignature, Buffer.from("x")]), {
        headers: { "Content-Type": "text/plain" },
      });
      assert.equal(wrongType.status, 400);
      assert.deepEqual(fs.readdirSync(server.cwd), []);
    });
  } finally {
    for (const name of names) cleanBranding(name);
  }
});

test("/save refuses a symlink target when the platform permits symlink fixtures", async (t) => {
  const name = fixtureName("symlink");
  const outside = path.join(os.tmpdir(), `${name}.outside`);
  cleanBranding(name);
  fs.writeFileSync(outside, "outside\n", "utf8");
  try {
    try {
      fs.symlinkSync(outside, path.join(brandingRoot, name), "file");
    } catch (error) {
      t.skip(`symlink fixtures unavailable: ${error.message}`);
      return;
    }
    await withServer({}, async (server) => {
      const response = await postSave(server, name, Buffer.concat([pngSignature, Buffer.from("x")]));
      assert.equal(response.status, 400);
      assert.equal(fs.readFileSync(outside, "utf8"), "outside\n");
    });
  } finally {
    cleanBranding(name);
    fs.rmSync(outside, { force: true });
  }
});
