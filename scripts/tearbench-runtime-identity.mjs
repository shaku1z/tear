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
  if (task !== undefined) {
    binding.resourceClass = task.resourceClass;
    binding.resourceKeys = [...task.resourceKeys].sort();
  }
  return Object.freeze(binding);
}
