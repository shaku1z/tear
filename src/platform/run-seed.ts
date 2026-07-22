/** Creates host entropy at the application boundary; the chosen seed is then recorded. */
export function createRunSeed(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  const seed = values[0];
  return seed === undefined || seed === 0 ? 1 : seed;
}
