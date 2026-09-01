# Tear combat presentation pipeline

```text
120 Hz simulation/contact fact
  -> AttackPresentationCue (typed semantic boundary)
  -> AttackPresentationDirector (bounded dedupe + weapon profile)
  -> existing FX/floater Canvas ports
  -> capped/cullable particle and world render layers
```

Simulation owns hit detection, damage, attack/swing/throw identity, phase, direction, and intensity. The director may choose color, particle count, ribbon/ring composition, and accessibility fallback, but it cannot advance time, change hit-stop, alter damage, or feed data back into gameplay.

All five signature weapon families now enter the same director at their authoritative contact, impact, release, or projectile boundary. Generic damage numbers, hit-stop, camera, audio, and physical blade rendering remain in their established owners; only weapon-signature ribbons, rings, particles, and labels are recipe-directed. This avoids duplicating gameplay authority while allowing the visual grammar to evolve independently.

While Ghost recording is active, accepted cues are also projected into a compact `attack:v1` cosmetic replay event. Replay encoding is skipped entirely during ordinary play; decoding is bounded and presentation-only, and never enters canonical state, causal events, action tracks, RNG, or authoritative hashes. Legacy recordings and unknown future versions retain their existing fallback behavior.

## Frame-performance changes

- Canvas backing-size and safe-area calculation now runs at viewport startup and browser resize/fullscreen invalidation, not in every presentation frame.
- `EnvironmentState` reuses an immutable snapshot for the current revision.
- Environment presentation projection reuses the same result for the same frozen snapshot.
- Diagnostics record unclamped requestAnimationFrame intervals, p99, and maximum values in addition to JS frame work.

## Rollout order

1. Generic held strike phases.
2. Generic throw launch/contact/return/catch.
3. Sword Reversal/Threadcut (representative slice; active).
4. Hammer Break/Meteor/return (active).
5. Greatsword Cleave/Wheel Cut/return (active).
6. Chainblade Lash/Hook/tangential Sling release (active).
7. Riftlock Razor Round/Recoil/Capture/Backblast (active).
8. Generic parry, upgrade proc, kill, and boss recipe migration remains staged.
9. Remove each remaining legacy direct call only after parity and performance evidence.
