# Screen route

1. Define legal state and transitions in the application state/controller layer.
2. Add or update semantic `ScreenAction` routing. Renderers never receive executable callbacks.
3. Build immutable presentation snapshots before drawing.
4. Implement under `src/presentation/screens/` and reuse the live UI foundation/tokens in `src/presentation/ui*.ts`.
5. Keep gameplay, persistence, replay stepping, cloud I/O, audio, and platform SDK work in controllers/adapters.
6. Add renderer/snapshot and action-routing tests.
7. Add or update the real browser journey. Include input/responsive coverage when focus, touch, controller, scrolling, safe areas, or layout changes.

Use `docs/SCREEN_PARITY_CHECKLIST.md` for compatibility/deletion work and `docs/DESIGN_SYSTEM.md` for current UI contracts. Invoke `$tear-ui-regression` for interaction and visual-craft validation.
