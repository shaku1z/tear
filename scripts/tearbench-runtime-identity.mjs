import { arch, platform } from "node:os";
import process from "node:process";

function declaredPnpmVersion(packageSource) {
  const match = /^pnpm@([^\s]+)$/u.exec(packageSource?.packageManager ?? "");
  return match?.[1];
}

function invokedPnpmVersion(userAgent) {
  const match = /(?:^|\s)pnpm\/([^\s]+)/u.exec(userAgent ?? "");
  return match?.[1];
}

export function executionToolchainBinding(packageSource, userAgent = process.env.npm_config_user_agent) {
  const declared = declaredPnpmVersion(packageSource);
  const invoked = invokedPnpmVersion(userAgent);
  if (declared !== undefined && invoked !== undefined && declared !== invoked) {
    throw new Error(`pnpm toolchain mismatch: package declares ${declared}, invocation uses ${invoked}`);
  }
  const pnpm = invoked ?? declared;
  return Object.freeze({
    node: process.version,
    pnpm: pnpm === undefined ? "unknown" : `pnpm@${pnpm}`,
    playwright: packageSource?.devDependencies?.["@playwright/test"]
      ?? packageSource?.dependencies?.["@playwright/test"]
      ?? packageSource?.devDependencies?.playwright
      ?? packageSource?.dependencies?.playwright
      ?? "unknown",
  });
}

export function executionEnvironmentBinding(task, environment = process.env) {
  const binding = {
    platform: platform(),
    arch: arch(),
    runnerClass: environment.RUNNER_ENVIRONMENT ?? "local",
    runnerImage: environment.ImageOS ?? "local",
  };
  const pinnedBrowserDeclared = environment.TEAR_PERF_BROWSER === "pinned"
    || environment.TEAR_PERF_BROWSER_VERSION !== undefined
    || environment.TEAR_PERF_BROWSER_ARCHIVE_SHA256 !== undefined;
  if (pinnedBrowserDeclared) {
    if (environment.TEAR_PERF_BROWSER !== "pinned"
      || !/^\d+\.\d+\.\d+\.\d+$/u.test(environment.TEAR_PERF_BROWSER_VERSION ?? "")
      || !/^[a-f0-9]{64}$/u.test(environment.TEAR_PERF_BROWSER_ARCHIVE_SHA256 ?? "")) {
      throw new Error("pinned performance browser identity requires an exact version and lowercase SHA-256");
    }
    binding.performanceBrowser = {
      preference: "pinned",
      version: environment.TEAR_PERF_BROWSER_VERSION,
      archiveSha256: environment.TEAR_PERF_BROWSER_ARCHIVE_SHA256,
    };
  }
  if (task !== undefined) {
    binding.resourceClass = task.resourceClass;
    binding.resourceKeys = [...task.resourceKeys].sort();
  }
  return Object.freeze(binding);
}
