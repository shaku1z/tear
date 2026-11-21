/**
 * The emulator project the rules tests run under, from the Firebase CLI's `emulators:exec`
 * (scripts/test-firestore-rules.mjs). Refuses anything but a `demo-` project, which the CLI never
 * connects to a real Firebase project, so a test can never touch production data.
 */
export function rulesTestProject(): string {
  const project = process.env.GCLOUD_PROJECT ?? "";
  if (!project.startsWith("demo-") || process.env.FIRESTORE_EMULATOR_HOST === undefined)
    throw new Error("Run the rules tests with `pnpm test:rules`: they need the emulators of a demo- project.");
  return project;
}
