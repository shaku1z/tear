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

- [x] `pnpm test:rules` passes and runs in the CI unit job; every collection the game uses has allowed and refused cases (PR 1).
- [x] The standalone build bundles the modular SDK in a lazy chunk. Nothing loads from gstatic, the CrazyGames build has no Firebase code, and the sizes before and after are in the pull request (PR 2).
- [ ] App Check with reCAPTCHA v3 is wired in monitor mode and fails open; the owner registers the site key (PR 3).
- [ ] Remote Config v1 is removed, or kept with its readers named. `/ghosts` is listed as removed once the replay overhaul's PR 8 lands. The authorized-domain fixes are listed for the owner (PR 4).
- [x] The owner has deployed the rules from PR 1 (released 2026-11-21 08:46 UTC; the deployed ruleset matches main's `firestore.rules`).
- [x] Leaderboard bests are spaced by the server's clock: the rules first (PR 2a, deployed by the owner), then the client that writes it (PR 2).

## Remaining slices (handover, 2026-11-21)

Paused for the weekly budget. Another agent can pick these up from the repo alone. Steps marked **OWNER** are Firebase or Google console actions that only the owner does. Firestore rules deploys are the lead's: tell the lead when a change to `firestore.rules` merges.

### PR 3: App Check in monitor mode (branch `codex/firebase-app-check`, pushed)

The branch has the code. It is PR 2 plus:
- `FIREBASE_APP_CHECK_SITE_KEY` in `src/platform/firebase-config.ts`, empty, so App Check stays off;
- `createFirebaseServices(config, { appCheck })` in `src/platform/firebase-sdk.ts`, which calls `initializeAppCheck` with `ReCaptchaV3Provider` and refreshes the token automatically. A failure is caught, and requests go on without a token (fails open).
- `tests/rules/firebase-app-check.test.ts`, which shows the adapter signing in, saving and submitting with a provider that never returns a token.
- `tests/unit/privacy-page.test.ts`, which requires the privacy page to name reCAPTCHA exactly when the key is set.

1. Take in main after PR 2's squash merge. A plain `git merge origin/main` conflicts on everything PR 2 touched. Instead:
   - `git merge <squash>^` (main just before PR 2's squash);
   - `git merge -s ours <squash>` (PR 2's content is already on the branch);
   - `git merge origin/main`.
2. Keep App Check inside the `firebase-sdk` chunk. A separate App Check chunk makes Rolldown split out a shared `index.esm-*.js`, which takes a 47th precache entry; the budget is 46.
3. Checks: `pnpm test:rules` (42 tests), `pnpm check:quick`, then `pnpm build:standalone`, `pnpm build:crazygames`, `pnpm check:bundles` and `pnpm check:load-budgets`. The SDK chunk was 234,220 B raw / 71,850 B gzip with App Check.
4. Open the PR. With the key empty it changes nothing at run time.
5. **OWNER**: create a reCAPTCHA v3 key for `tearblade.com`, `tear-preview.shatheartboy.workers.dev` and `localhost`.
6. **OWNER**: in Firebase console, App Check, register the web app with that key and its secret. Leave enforcement OFF for Firestore and Authentication (metrics only), and set the token time to live to 1 day. Give the lead the site key; it is public.
7. A follow-up PR sets `FIREBASE_APP_CHECK_SITE_KEY`. It must also:
   - name reCAPTCHA on `public/privacy.html` (the privacy test fails otherwise);
   - show Google's reCAPTCHA notice, or keep the badge.
8. Cost: free tier only. reCAPTCHA gives 10,000 assessments a month; without billing it returns errors past that and charges nothing. With enforcement off nobody is blocked. Turning enforcement on is a later decision for the owner, after the metrics show real traffic passing.

### PR 4: cleanup and domains (not started; branch from `origin/main`)

1. Remove `REMOTE` (`src/config/game-config.ts`, all four multipliers fixed at 1) and its readers. Find them with `git grep -n "REMOTE" -- src`:
   - `planRunStart(…, REMOTE)` in `src/app/run/run-start-host.ts` and `src/app/engineering/state-setup-progression.ts`;
   - the multipliers in `src/app/replay/seed-race-composition.ts`;
   - the wiring in `src/app/shell/composition.ts` and `src/app/shell/game-runtime-dependencies.ts`;
   - the parameter in `src/gameplay/run/run-start-plan.ts`.
   Multiplying by 1 changes nothing, so `pnpm test:determinism` must stay green; keep any replay or seed-race field that stores the multipliers readable.
2. Delete `remoteconfig.template.json` and the `remoteconfig` entry in `firebase.json`.
3. **OWNER** (optional): delete the Remote Config template in Firebase console (version 1, 2026-07-04, all four values at 1).
4. `/ghosts`: once the replay overhaul's PR 8 has removed `loadGhost` and every `/ghosts` read, and after agreeing with the session that owns replay storage:
   - remove `match /ghosts/{board}` from `firestore.rules`, and its tests in `tests/rules/`;
   - tell the lead when it merges, so the lead can deploy.
5. **OWNER**: in Firebase console, Authentication, Settings, Authorized domains, add `tear-preview.shatheartboy.workers.dev` so Google sign-in works on preview, and remove `tear-psi.vercel.app`.
6. Follow-ups, each its own small PR:
   - Credit Firebase and Workbox on the credits screen, as for the other bundled dependencies; the bundle strips their licence comments.
   - Once no build that writes bests without `at` is in use, require `at` on every best in `isRowWrite`. That is one line and a test; the lead deploys it.

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
- 2026-11-20 PR 1 opened as [#349](https://github.com/shaku1z/tear/pull/349). After the lead's review:
  - Replay summaries are held to the game's values: a known mode and difficulty, bounded ints, `won` a bool, `lb` true exactly for an `lb_` id, and a thumbnail that is null or a JPEG data URL of at most 32 KB (an outside link would send every viewer's address to that site). Only a leaderboard replay is written over, and its date moves only forward.
  - Leaderboard rows are never deleted, so a delete cannot reset "must beat" or the 10 s spacing. A new best may replace the row outright and drop a slower run's replay link (the Gauntlet rework writes it so).
  - The `run_end` statistic has a key allow-list and a type and range for each value.
  - The adapter cuts replay chunks by UTF-8 bytes as well as characters (Firestore's 1 MiB document limit), never inside a surrogate pair. It publishes without a thumbnail that is not one.
  - CI restores the emulator jar from the Actions cache, keyed on the firebase-tools version.
  - Rules cannot cap how many documents a player creates (replays per player, orphaned chunks). App Check (PR 3) is the answer to scripted writes.
- 2026-11-21 PR 1 merged (e3468d40). The owner deployed its rules. A read-only fetch of the live `cloud.firestore` release shows the same source as main's `firestore.rules`.
- 2026-11-21 PR 2a: the rules side of the server-clock spacing, on its own.
  - A best may carry `at`, and only as the server's time.
  - A row that has `at` takes the next best only after 10 s of server time, and every later best must carry it.
  - Rows without `at` are spaced by `ts` as before.
  - Builds in use today write no `at`, and these rules accept their writes unchanged.
  - Once the owner has deployed these rules, PR 2's client can start writing `at`. The rules from PR 1 refuse that field.
- 2026-11-21 PR 2: the modular SDK. The adapter moved onto two small ports (Auth, Firestore paths), and
  `src/platform/firebase-sdk.ts` implements them with Auth and Firestore Lite.
  - Sizes: the SDK chunk is 220,347 B raw / 66,553 B gzip, loaded on demand and not precached. Before, the four 10.12.2 compat scripts from gstatic were 539,470 / 158,763 B.
  - `pnpm check:bundles` passes on both targets: standalone startup scripts 1,730,302 B, precache 46/46 entries. The CrazyGames build has no Firebase code.
  - Remote Config is no longer fetched. Its only template (version 1, 2026-07-04) kept all four multipliers at 1, so nothing changes. PR 4 deletes `REMOTE` and its readers.
  - The adapter writes `at` with `serverTimestamp()` on every best, including the full replace of a new best from #347. PR 2a's rules space bests by it.
  - **Deploy order:** the owner deploys PR 2a's rules before PR 2 merges. Every merge to main goes to preview, which uses the same Firebase project, and PR 1's rules refuse a best that carries `at`.
- 2026-11-21 PR 2a's rules deployed (14:37Z). PR 2's load check now counts bytes to playing from every origin: main about 803 KB (642,700 same-origin plus 160,421 of gstatic scripts), PR 2 705,325, cap 740,000 (about 5% above). Standalone has no cross-origin scripts (caps 0/0). App Check (PR 3) and the cleanup (PR 4) are paused for the weekly budget; the lead deploys rules from now on.
