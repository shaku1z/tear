/** Nondeterministic entropy reserved for render-only variation. Never use for rules. */
export function cosmeticRandom(): number {
  return Math.random();
}
