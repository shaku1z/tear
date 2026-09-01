import { relative, resolve } from "node:path";

function portableRelative(root, path) { return relative(root, path).replaceAll("\\", "/"); }

export function expectedReproducibilitySide({ root, generated, side }) {
  if (["standalone-a", "standalone-b", "crazygames-a", "crazygames-b"].includes(side)) {
    const target = side.startsWith("standalone") ? "standalone" : "crazygames";
    return Object.freeze({ kind: "build", target, mode: target,
      payloadPath: portableRelative(root, resolve(generated, "payloads", side)) });
  }
  if (["crazygames-package-a", "crazygames-package-b"].includes(side)) {
    const suffix = side.endsWith("-a") ? "a" : "b";
    return Object.freeze({ kind: "package", target: "crazygames", mode: "crazygames",
      inputPath: portableRelative(root, resolve(generated, "payloads", `crazygames-${suffix}`)),
      outputPath: portableRelative(root, resolve(generated, "packages", `${side}.zip`)) });
  }
  throw new RangeError(`unknown reproducibility side ${side}`);
}

export function assertReproducibilitySideIdentity({ root, generated, side, record }) {
  const expected = expectedReproducibilitySide({ root, generated, side });
  for (const [key, value] of Object.entries(expected)) {
    if (record?.[key] !== value) throw new TypeError(`mislinked reproducibility ${expected.kind} ${side}: ${key}`);
  }
  return expected;
}
