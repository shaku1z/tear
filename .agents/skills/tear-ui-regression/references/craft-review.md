# Visual craft review

Inspect screenshots and interaction traces for qualities deterministic gates cannot fully judge.

## Hierarchy and composition

- Primary action and current state are immediately legible.
- Titles, sections, cards, and controls form a deliberate reading order.
- Density matches the task; empty space and alignment feel intentional.
- Long or unusual content does not break the composition.

## Readability and feedback

- Text, icons, tells, and status information remain readable over every relevant biome/background.
- Hover, focus, selected, disabled, loading, empty, success, error, and destructive states are distinguishable.
- Motion clarifies cause and continuity without delaying control or violating reduced-motion settings.
- Combat HUD and telegraphs prioritize actionable information.

## Input and responsive behavior

- Keyboard/controller focus is visible and follows a coherent order.
- Every route has an obvious semantic back/escape action.
- Touch targets, safe areas, scroll affordances, and portrait layouts remain usable.
- Input modality changes do not strand focus, retain stale hover, or activate twice.

## Design-system use

Compare call sites with the live implementation in `src/presentation/ui*.ts` and `docs/DESIGN_SYSTEM.md`. Prefer existing tokens/components; add a reusable component when interface chrome repeats. Allow direct drawing for in-world art and specialized visual effects when it does not duplicate interface chrome.

Report concrete file/state evidence and separate automated defects from subjective polish recommendations.
