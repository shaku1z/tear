/**
 * The field readers every part of the scene package contract validates with.
 * Each takes an untrusted value and the path it was read from, and returns the
 * value typed or throws `ScenePackageError` naming that path.
 *
 * Like the contract, this module has no runtime imports, so the `pnpm scene`
 * CLI can load it with Node's type stripping.
 */

export type Rect = readonly [x: number, y: number, w: number, h: number];
export type Point = readonly [x: number, y: number];

export type Raw = Record<string, unknown>;

export class ScenePackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenePackageError";
  }
}

export function fail(path: string, message: string): never {
  throw new ScenePackageError(`${path}: ${message}`);
}

export function record(value: unknown, path: string): Raw {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "expected an object");
  return value as Raw;
}

export function list(value: unknown, path: string, max = 64): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, "expected an array");
  if (value.length > max) fail(path, `more than ${String(max)} entries`);
  return value as readonly unknown[];
}

export function text(value: unknown, path: string, max = 4000): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) fail(path, "expected a non-empty string");
  return value;
}

export function id(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(result)) fail(path, "ids are lower-case kebab-case");
  return result;
}

export function finite(value: unknown, path: string, min = -1e6, max = 1e6): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    fail(path, `expected a number in [${String(min)}, ${String(max)}]`);
  }
  return value;
}

export function integer(value: unknown, path: string, min: number, max: number): number {
  const result = finite(value, path, min, max);
  if (!Number.isInteger(result)) fail(path, "expected an integer");
  return result;
}

export function color(value: unknown, path: string): string {
  const result = text(value, path, 9);
  if (!/^#[0-9a-f]{6}$/u.test(result)) fail(path, "colours are #rrggbb lower-case");
  return result;
}

export function digest(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!/^[a-f0-9]{64}$/u.test(result)) fail(path, "expected a sha256 hex digest");
  return result;
}

export function rect(value: unknown, path: string): Rect {
  const items = list(value, path, 4);
  if (items.length !== 4) fail(path, "expected [x, y, w, h]");
  const [x, y, w, h] = items.map((item, index) => finite(item, `${path}[${String(index)}]`));
  if (x === undefined || y === undefined || w === undefined || h === undefined || w <= 0 || h <= 0) {
    fail(path, "width and height must be positive");
  }
  return Object.freeze([x, y, w, h] as const);
}

/** True when `inner` lies inside `outer`, allowing for rounding in generated rects. */
export function rectInside(inner: Rect, outer: Rect): boolean {
  const slack = 0.01;
  return (
    inner[0] >= outer[0] - slack &&
    inner[1] >= outer[1] - slack &&
    inner[0] + inner[2] <= outer[0] + outer[2] + slack &&
    inner[1] + inner[3] <= outer[1] + outer[3] + slack
  );
}

export function unique<T extends { readonly id: string }>(items: readonly T[], path: string): readonly T[] {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) fail(path, `duplicate id "${item.id}"`);
    seen.add(item.id);
  }
  return Object.freeze(items);
}
