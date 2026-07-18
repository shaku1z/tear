# Tear Economy Rework

Design plan only. No gameplay or save behavior has been changed.

## Executive summary

- The current economy is structurally overfunded: all 97 achievement rewards total **121,100 coins**, while the entire current shop costs only **48,250 coins**.
- Preserve score and leaderboards, but reduce ordinary score-to-coin conversion from **3% to 2%** and the unmultiplied depth floor from **12 to 10 coins per reached wave**.
- Replace One-Hit's flat reward with a depth-ramped reward. It starts around Hard-mode income through wave 8, pulls away sharply after that, and reaches approximately **5x Normal by wave 20**.
- Replace the current steep item-specific exponential price curves with one transparent polynomial curve, raise early bases, and price one-time/draft-control purchases separately.
- Repricing the existing shop raises it from **48,250 to 74,375 coins**. Adding all approved upgrades produces a **137,350-coin, 92-rank shop**.
- Reduce achievement rewards to a **69,200-coin** lifetime pool, approximately 50% of the expanded shop instead of 251% of the current shop.

## Evidence and assumptions

The reference model mirrors Campaign enemy counts and current score generation from the live code. Payout comparisons assume:

- average style multiplier of `2.0`;
- no affix-score bonus;
- no Bounty Hunter, Fortune, or Coin Magnet;
- the run ends on the listed wave;
- boss waves contribute one scoring kill.

These are deterministic design estimates, not player telemetry. The implementation now records run-end wave, score, difficulty, earned coins, wallet balance, Coin Magnet rank, Fortune/Bounty stacks, and purchased shop ranks so live pacing can be compared against the model.

## Implemented run-income formula

Keep score itself unchanged so existing score feel and difficulty-separated leaderboards are not invalidated.

```text
score coins = floor(final score * 0.02 * Coin Magnet * difficulty coin modifier)
depth coins = floor(reached wave * 10)
run coins = floor((score coins + depth coins) * Fortune)
```

The flat depth payment remains outside difficulty and Coin Magnet scaling. This guarantees some progression while preventing shallow difficulty farming. Fortune applies last to the full earned subtotal, making a draft pick noticeable even in early runs where the depth payment is still a large share of income.

### Difficulty coin modifiers

Difficulty already changes score and, except One-Hit, enemy density. The coin modifier should therefore be smaller than it is today.

| Difficulty | Existing score modifier | Proposed coin modifier |
| --- | ---: | ---: |
| Easy | 0.70 | 0.80 |
| Normal | 1.00 | 1.00 |
| Hard | 1.40 | 1.10 |
| Extreme | 2.00 | 1.15 |
| One-Hit | 2.20 | Depth-ramped, below |

### One-Hit depth ramp

```text
progress = clamp((reachedWave - 8) / 12, 0, 1)
acceleratedProgress = 1 - (1 - progress)^2
oneHitCoinModifier = 0.70 + 2.35 * acceleratedProgress
```

Through wave 8, One-Hit remains at the base `2.2 * 0.70 = 1.54x` score-derived reward and produces approximately Hard-mode total income. After wave 8, the ease-out curve rises quickly instead of withholding the reward until an exceptionally deep run. It reaches about 5x Normal total payout at wave 20 and may exceed 5x deeper into the run; that is acceptable because surviving One-Hit beyond that point is itself exceptional.

| Reached wave | Normal payout | One-Hit payout | One-Hit / Normal |
| ---: | ---: | ---: | ---: |
| 5 | 72 | 84 | 1.17x |
| 10 | 211 | 446 | 2.11x |
| 15 | 379 | 1,485 | 3.92x |
| 20 | 667 | 3,334 | 5.00x |
| 30 | 1,454 | 8,044 | 5.53x |
| 50 | 4,367 | 26,452 | 6.06x |

The anti-farming check is deliberately strict: One-Hit wave 5 pays **84 coins**, only 22% of the **379 coins** modeled for Normal wave 15 (the middle of stage two).

## Supporting income-upgrade adjustments

- **Coin Magnet:** reduce from +15% to **+8% coins per rank**, retain 5 ranks (maximum +40%). Its price rises substantially because it repays itself.
- **Fortune:** cap at **5 stacks** and apply it to the complete run payout, including the depth payment. Each stack adds 12%, while stack 3 unlocks **Prosperity** (+25% milestone bonus, ×1.61 total) and stack 5 unlocks **Jackpot** (+35% milestone bonus, ×2.20 total). One pick is deliberately modest; the valuable breakpoints require repeatedly sacrificing combat power. Fortune leaves the draft pool at five stacks and its card previews the next milestone.
- **Bounty Hunter:** reduce score gain from +20% to **+15% per pick**. It still improves both leaderboard score and score-derived coins.
- Apply all percentage income bonuses multiplicatively; keep the fixed depth payment outside them.

## Implemented shop price curve

For ordinary multi-rank upgrades, use one zero-based rank formula and round each result to the nearest 25 coins:

```text
rank cost = roundTo25(base * (1 + 0.28 * level + 0.09 * level^2))
```

This raises the first purchases while making the late curve less explosive and easier to reason about than the current mix of `1.5x`, `1.6x`, and `1.8x` exponentials.

One-time purchases and Reroll use explicit prices because their value is discrete rather than incremental.

## Repriced existing shop

| Upgrade | Rank prices | Total |
| --- | --- | ---: |
| Toughness | 325 / 450 / 625 / 850 / 1,150 / 1,500 / 1,925 / 2,400 | 9,225 |
| Sharpness | 375 / 525 / 725 / 1,000 / 1,325 / 1,750 / 2,225 / 2,775 | 10,700 |
| Swiftness | 350 / 475 / 675 / 925 / 1,250 / 1,625 | 5,300 |
| Conditioning | 375 / 525 / 725 / 1,000 / 1,325 / 1,750 | 5,700 |
| Head Start | 3,000 | 3,000 |
| Coin Magnet | 650 / 900 / 1,250 / 1,725 / 2,325 | 6,850 |
| Long Arm | 425 / 575 / 825 / 1,125 / 1,525 | 4,475 |
| Throwing Arm | 400 / 550 / 775 / 1,050 / 1,425 / 1,850 | 6,050 |
| Thick Skin | 475 / 650 / 900 / 1,250 / 1,700 / 2,200 | 7,175 |
| Warding | 1,100 / 1,500 | 2,600 |
| Aether Step | 3,500 | 3,500 |
| Lifeline | 550 / 750 / 1,050 / 1,450 | 3,800 |
| Second Wind | 6,000 | 6,000 |

**Repriced existing-shop total: 74,375 coins**, 54% above the current 48,250.

## Approved new upgrades and prices

Effects and rank counts remain as recorded in `SHOP_UPGRADE_DESIGN.md`.

| Upgrade | Rank prices | Total |
| --- | --- | ---: |
| Momentum Transfer | 450 / 625 / 875 / 1,200 / 1,600 | 4,750 |
| Aerial Bracing | 500 / 675 / 950 / 1,325 / 1,775 | 5,225 |
| Sling Grip | 500 / 675 / 950 / 1,325 / 1,775 | 5,225 |
| Recall Window | 550 / 750 / 1,050 / 1,450 | 3,800 |
| Hazard Boots | 450 / 625 / 875 / 1,200 / 1,600 | 4,750 |
| Second Breath | 750 / 1,025 / 1,450 / 2,000 | 5,225 |
| Reserve Pick | 6,500 | 6,500 |
| Reroll | 3,000 / 5,500 / 9,000 | 17,500 |
| Expanded Draft | 10,000 | 10,000 |

**New-upgrade total: 62,975 coins.** Draft control alone costs **34,000 coins**, intentionally making it the premium end of meta progression.

**Expanded 22-item shop total: 137,350 coins across 92 ranks.**

## Achievement reward rework

| Rarity | Achievements | Previous each | Implemented each | Implemented lifetime pool |
| --- | ---: | ---: | ---: | ---: |
| Common | 6 | 100 | 75 | 450 |
| Uncommon | 19 | 300 | 200 | 3,800 |
| Rare | 29 | 700 | 450 | 13,050 |
| Epic | 31 | 1,500 | 900 | 27,900 |
| Legendary | 12 | 4,000 | 2,000 | 24,000 |

The actual 97-achievement pool falls from **121,100 to 69,200 coins**. Achievements remain important acceleration, but cannot independently buy out the expanded shop.

## Save and rollout behavior

- Do not claw back coins or purchased ranks from existing saves.
- Changing achievement rewards cannot undo previously granted retrofit coins without violating the monotonic ledger model. Existing players will therefore retain a legacy advantage.
- Evaluate balance on a fresh profile first. If pre-release/beta save parity is required, handle that as a separate explicit reset decision—not as a hidden economy migration.
- The Arsenal achievement derives its target and progress from the live `SHOP` catalogue, so future additions cannot leave it stale.
- Run-end economy telemetry includes wave, score, difficulty, coins awarded, wallet balance, Coin Magnet rank, Fortune/Bounty stacks, and purchased shop ranks.

## Verification and live-balance gates

1. Simulate low (`1.0x`), typical (`2.0x`), and strong (`3.0x`) average style performance across waves 5, 10, 20, 30, and 50.
2. Confirm One-Hit wave 5 remains below 30% of Normal wave 15 income.
3. Confirm One-Hit is clearly ahead of Hard after wave 8 and reaches 4.8-5.2x Normal total payout around wave 20.
4. Confirm the first ordinary purchase takes approximately 2-4 decent Normal runs without achievement grants.
5. Confirm the achievement pool remains below 55% of full-shop cost.
6. Playtest fresh-profile progression before changing live prices or reward grants.
