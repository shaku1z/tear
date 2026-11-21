# Firebase refresh

## Authority metadata

- **Owner:** Firebase owner (firebase-refresh session)
- **Status:** Active
- **Closure condition:** Every "done when" line below holds and `pnpm check:functional` passes from the final commit of each pull request.

## Why

The 2026-11-20 audit of Firebase project `tear-682cf` found several problems:

- the 10.12.2 compat SDK loaded from gstatic as four scripts;
- leaderboard rules that checked only `score is number`;
- no rules tests and no App Check;
- the preview domain missing from Google sign-in's authorized domains, and a stale tear-psi.vercel.app entry still there;
- a Remote Config from July.

The owner approved this refresh on 2026-11-20. It stays on the free tier. Console changes, rules deploys, keys and App Check registration are the owner's steps.

## Failure modes (write these first)

1. A rule refuses a write the game really makes, so scores or saves are silently lost. Caught by
   `tests/rules/firebase-adapter.test.ts`, which runs the game's own adapter against the rules under the emulator.
2. A rule looks strict but lets a bad write through. Caught by the refused-write cases in
   `tests/rules/firestore-rules.test.ts`. They fail against the rules on main before this work (10 of 21).
3. A mode or difficulty is added and its board is refused. Caught by the board-list tests, which compare
   the rules' lists with the game's mode and difficulty catalogues.
4. The modular SDK ships in the CrazyGames build, or grows the startup payload. Caught by
   `pnpm check:bundles` and the production isolation check; sizes are measured before and after.
5. App Check blocks players when reCAPTCHA is unavailable. Caught by an adapter test with App Check failing, which must still sign in and submit.

## Done when

- [ ] `pnpm test:rules` passes and runs in the CI unit job; every collection the game uses has allowed and refused cases (PR 1).
- [ ] The standalone build bundles the modular SDK in a lazy chunk. Nothing loads from gstatic, the CrazyGames build has no Firebase code, and the sizes before and after are in the pull request (PR 2).
- [ ] App Check with reCAPTCHA v3 is wired in monitor mode and fails open; the owner registers the site key (PR 3).
- [ ] Remote Config v1 is removed, or kept with its readers named. `/ghosts` is listed as removed once the replay overhaul's PR 8 lands. The authorized-domain fixes are listed for the owner (PR 4).
- [ ] The owner has deployed the rules from PR 1.

## Scope

- **Changes:** `firestore.rules`, `firebase.json`, `tests/rules/`, `scripts/test-firestore-rules.mjs`,
  `src/platform/firebase-*.ts`, `src/platform/standalone-cloud.ts`, `remoteconfig.template.json` and the game-config readers of `REMOTE`.
- **Does not change:**
  - the replay record format (the replay overhaul owns it, and its PR 8 removes `loadGhost` and `/ghosts`);
  - the CrazyGames adapter;
  - the Firebase console, deployed rules, keys or App Check enforcement.

## Checks

- **While iterating:** `pnpm test:rules`; `pnpm exec vitest run tests/contract/platform-firebase-cloud.test.ts`.
- **Before each pull request:** `pnpm format`, `pnpm typecheck`, `pnpm check:quick`; for PR 2, also `pnpm build`
  and `pnpm check:bundles`.
- **Could not run here:** real Google sign-in and writes to `tear-682cf` (the owner), and App Check metrics in the console.

## Log

- 2026-11-20 Card opened.
  - PR 1 hardens the rules, with tests under the emulator.
  - The Gauntlet clear boards (lower is better) were agreed with the keys-gauntlet session.
  - The replay limits (6 chunks, owner-only ids) were agreed with the replay overhaul session.
- 2026-11-20 PR 1 opened as [#349](https://github.com/shaku1z/tear/pull/349).
- 2026-11-20 PR 2: the modular SDK. The adapter moved onto two small ports (Auth, Firestore paths), and
  `src/platform/firebase-sdk.ts` implements them with Auth and Firestore Lite.
  - Sizes: the SDK chunk is 219,880 B raw / 66,303 B gzip. Before, the four 10.12.2 compat scripts from gstatic were 539,470 / 158,763 B.
  - The chunk is not precached (precache 46/46 entries, 2,625,576 → 2,623,912 B), and startup grows by 25 B.
  - Remote Config is no longer fetched. Its only template (version 1, 2026-07-04) kept all four multipliers at 1, so nothing changes. PR 4 deletes `REMOTE` and its readers.
