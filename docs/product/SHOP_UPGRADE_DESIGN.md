# Shop Upgrade Design

Approved specification. Implemented in the game runtime and retained here as the balancing contract.

## Permanent shop upgrades

| Upgrade | Ranks | Effect |
| --- | ---: | --- |
| Momentum Transfer | 5 | Retain 6% more horizontal momentum after a dash per rank. Apply multiplicatively to dash exit momentum; the 35% base becomes about 47% at rank 5. |
| Aerial Bracing | 5 | Take 3% less damage while airborne per rank (multiplicative; about 14% less at rank 5). |
| Sling Grip | 5 | Thrown-blade release recovery is 4% shorter per rank (about 18.5% shorter at rank 5). The current combat model releases instantly, so this shortens the between-throw recovery without adding an artificial windup. |
| Recall Window | 4 | Manually recall the blade 0.10 seconds earlier per rank (0.40 seconds at rank 4). |
| Hazard Boots | 5 | Take 6% less environmental and floor-hazard damage per rank (multiplicative; about 27% less at rank 5). |
| Second Breath | 4 | Once per stage, the first time the player falls below 30% HP, regenerate 1.25% max HP per second for 4 seconds per rank. This restores 5% / 10% / 15% / 20% max HP over 4 / 8 / 12 / 16 seconds. |
| Reserve Pick | 1 | After selecting an upgrade, reserve one unchosen card. It replaces one card in the next draft. |
| Reroll | 3 | Start each run with one shared normal-draft reroll charge per rank. Replacing a draft must not immediately return cards from the discarded hand. |
| Expanded Draft | 1 | Normal upgrade drafts offer four cards instead of three. |

## Run-build abilities

| Ability | Type | Effect |
| --- | --- | --- |
| Afterimage | One-time Unique ability; no evolutions | After a dash, gain 25% movement speed for 1.0 second. |
| Hard Turn | Stackable draft ability | During the final third of a dash, gain 10% steering authority per stack. |

## Expanded Draft UI plan

The normal draft remains a single row of large cards. Expanded Draft adds a fourth card on the right; it does not use the compact multi-row tier-up grid.

- Use four cards at approximately 300 px wide, the existing normal card height (about 384 px), and 24 px gaps in the 1600 px virtual canvas.
- Preserve the existing card hierarchy and deal-in animation: accent strip, type/category tag, name, description, and select affordance.
- Bind selection to keys `1` through `4` when Expanded Draft is active.
- Put Reroll outside the card row as a secondary control, e.g. `REROLL · 2 [R]`, with a muted disabled state at zero charges.
- A reroll deals the replacement hand in with the existing animation; the external control immediately updates to confirm the remaining charge count.
- Reroll applies only to normal upgrade drafts, never boss evolution selection.
- Reserve Pick is a short second phase after the main selection: dim the remaining cards and ask the player to reserve one for the next draft, with a skip control when none fit the build.
