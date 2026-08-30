# Verdant/Pale post-integration hardening contract

## Desired result

Harden the integrated six-stage production campaign and Playground-only Pale
preview without changing their authored gameplay. Shared environment state,
serialization, observation, replay, and State Forge behavior must be genuinely
biome-neutral; Verdant and Pale remain independent consumers. Rootbound's
implemented phases must be canonical and generically forgeable. TearBench
direct runs must execute honestly and retain the artifact path they report.

## Authority and scope

- Base: protected `origin/main` at
  `81a7facfc3f0ab5aa3b1525af10991682cb7c991`.
- Owning repository: Tear game only.
- Primary owners: `src/gameplay/environment`, `src/gameplay/run`,
  `src/game-reference`, `src/tearbench`, their focused tests, the source
  architecture gate, and current architecture/feature documentation.
- Compatibility: retain the six published stages ending at Wave 60; keep Pale
  unpublished and selectable through Playground/engineering composition;
  preserve v2 hazard envelopes, deterministic replay, State Forge, browser
  presentation, and existing frozen evidence history.

## Required proof

- Focused TypeScript, architecture, content-policy, reference, environment,
  replay, State Forge, boss, and TearBench tests.
- Built-browser Verdant/Pale/State Forge and selected TearBench evidence.
- Exact clean implementation commit followed by the full `pnpm check` gate.
- A final adversarial source/evidence audit and a compact superseding evidence
  manifest. Any post-audit finding must be closed through a new temporary
  checklist and the affected gates plus `pnpm check` rerun.

## Non-goals and protected boundaries

- Do not rewrite the immutable Verdant (`25c589844ec2cfe85a8a6deead881ebb3d699198`)
  or Pale (`4ec0ea52642c4c1830a2403a0910ebb3000a72d1`) freezes.
- Do not edit the comparison-only oracle, music repository, wiki repository,
  protected `main`, or live services.
- Do not push, merge, deploy, dispatch game-reference data, replace final music,
  alter universal weapon abilities, rebalance the campaign, or claim C40
  certification.
- Raw logs and generated evidence remain under ignored `artifacts/` paths;
  only this contract and the final compact manifest are durable records.
