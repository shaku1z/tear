# Screen

1. Define the legal states and transitions in the application layer (`src/app/`).
2. Route input as a semantic `ScreenAction` (`src/domain/screen-actions.ts`). A renderer never receives a
   callback to run.
3. Build an immutable snapshot before drawing (the `*-snapshots.ts` modules in `src/presentation/`).
4. Draw under `src/presentation/screens/` with the shared components and tokens in
   `src/presentation/ui.ts` and `src/presentation/ui-tokens.ts`. A sheet screen uses the page pattern and a
   run overlay the overlay pattern of [docs/DESIGN_SYSTEM.md](../../../../docs/DESIGN_SYSTEM.md); do not
   build a second frame.
5. Keep gameplay, saving, replay stepping, cloud calls, audio and platform work in controllers and adapters.
6. Add renderer or snapshot tests and action-routing tests.
7. Add or extend the browser journey that reaches the screen
   ([docs/BROWSER_JOURNEY_COVERAGE.md](../../../../docs/BROWSER_JOURNEY_COVERAGE.md)).

Engineering screens (Boss Test, Enemy Test and the like) exist only in dev and test builds: `README.md`,
"Release builds and engineering builds". Cursor and pointer-lock behaviour follows
[docs/CURSOR_INPUT_CONTRACT.md](../../../../docs/CURSOR_INPUT_CONTRACT.md).

Use `tear-ui-regression` for interaction and visual review.
