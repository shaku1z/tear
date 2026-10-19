# Tear Economy Rework

## Authority metadata

- **Owner:** Economy/balance owner
- **Status:** Active
- **Closure condition:** Live-balance evidence and achievement-pool totals reconcile with the typed implementation and approved model; no balance claim closes from documentation alone.
- **Branch policy:** Start each change from protected canonical `main` in a short-lived `codex/*` branch; do not use a stale feature branch as the live development target.

Partially implemented. Active remaining scope is fresh-profile progression and
live-balance validation. Catalogue totals are reconciled below; this document
does not authorize gameplay, reward, price, or save changes.

## Current source facts and evidence

- The current typed catalogue has **100 achievements / 73,000 coins**. Its
  rarity counts are **6 common, 19 uncommon, 29 rare, 33 epic, 13 legendary**.
  This includes the hidden Witness achievement (900 coins). A fresh Profile
  shows 99 because `ACH.list` hides locked hidden entries; unlocking Witness
  reveals the 100th entry. The canonical `_all` reward pool is unchanged.
- The current shop has **22 items / 92 ranks / 137,350 coins**. Achievement
  rewards therefore cover **53.1488897%** of the shop, below the 55% ceiling.
- The original economy implementation at
  `5daff1a86f47490b32d6600e40dca9bba670ce6b` already had **98 achievements /
  70,100 coins**, including **32 epic** achievements. This plan's original
  **97 / 69,200** counted only 31 epics; it was a documentation error, not a
  missing achievement or an unresolved reward change.
- Commit `81a7facf` added `boss_rootbound` (**900**, epic) and
  `rootbound_regrowth` (**2,000**, legendary): **+2 achievements / +2,900 coins**.
  These account for the current 100 / 73,000 totals without changing old grants.
- Source catalogue receipt:
  `C:/tmp/tear-shop-catalogue-reconciliation-20261019.json`, revision
  `a1ff3cb0717eaa5d98deab58d95cc2de868dcd4e`. Its `meta.ts` checkout SHA-256 is
  `b135f8c0be7aa0bec8ef9126a8933faa8f7bab5eefcb5602afe1a82fe02a3e03`
  (Windows CRLF bytes).
- The reproducible R18 numerical evidence in
  `C:/tmp/tear-economy-model-20261019/` pins source revision
  `831275a81dabd2b9aecc20cae0a1fb2859cb031d`; `source-manifest.json` records
  25 canonical Git source hashes. `results.json` contains **900 conditional
  rows** across three styles, five difficulties and Campaign waves 1–60; its
  SHA-256 is `663fa3d16604b08937bbda038972e780536619803be7bd064b6382fdd381ad71`.
  The script executes production wave planning, kill scoring and coin awards.
  These local receipts are numerical evidence, not fresh-profile playtests.

## Historical proposal summary

The following figures describe the original proposal and its design estimates,
not current catalogue facts or newly approved balancing. In particular, the
proposal's 97-achievement count and 69,200-coin pool were miscounted; no corrected
historical pre-rework reward/shop totals are inferred here.

- The proposal described an overfunded economy using **97 achievements / 121,100 coins** against a **48,250-coin** shop; retain these as historical estimates only.
- Preserve score and leaderboards, but reduce ordinary score-to-coin conversion from **3% to 2%** and the unmultiplied depth floor from **12 to 10 coins per reached wave**.
- Replace One-Hit's flat reward with a depth-ramped reward. It starts around Hard-mode income through wave 8, pulls away sharply after that, and reaches approximately **5x Normal by wave 20**.
- Replace the current steep item-specific exponential price curves with one transparent polynomial curve, raise early bases, and price one-time/draft-control purchases separately.
- The proposal repriced its existing shop estimate from **48,250 to 74,375 coins**. The expanded **137,350-coin, 92-rank shop** is now implemented.
- The proposal targeted a **69,200-coin** lifetime pool, approximately 50% of the expanded shop instead of its estimated 251% of the earlier shop. The original implementation was actually **70,100**, and the current pool is **73,000**.

## Evidence and assumptions

The current numerical model uses production Campaign wave planning, per-kill
score rounding and the production coin-award function. Payout comparisons assume:

- a fixed style multiplier of `2.0` at every scoring kill for the reference table;
- no affix-score bonus;
- no Bounty Hunter, Fortune, or Coin Magnet;
- every scheduled wave through the listed wave is fully cleared;
- boss waves contribute one scoring kill.

Remote multipliers use their default value of 1. Extra scoring summons and
missed enemies are outside this model. A real death partway through the reached
wave can earn less than the full-clear table. Fixed per-kill style is not a
measured time-average player style.

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

Difficulty already changes score and, except One-Hit, enemy density. The
implemented coin modifiers below apply in addition to those changes.

| Difficulty | Implemented score modifier | Implemented coin modifier |
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
| 50 | 4,292 | 25,945 | 6.04x |

The current typical-style model reproduces the historical table through wave 30.
The old wave-50 estimate was 4,367 Normal / 26,452 One-Hit. Current Verdant
`countAdd: 5`, compared with the old positional estimate of 6, removes one
scheduled kill per wave 31–39; production rounding yields the 75 / 507 coin
difference. This records source/model drift without changing rewards.

Style sensitivity at wave 20 is **4.0808x / 4.9985x / 5.4444x** One-Hit versus
Normal for fixed **1.0x / 2.0x / 3.0x** style. The 4.8–5.2x target is supported
at the original typical 2.0x reference assumption; it is not a universal ratio
across styles. Matched-style anti-farming ratios (One-Hit wave 5 / Normal wave
15) are **25.38% / 22.16% / 20.65%**, all below 30%. One-Hit exceeds Hard at
every modeled wave 9–60; the wave-9 margins are **16.58% / 22.18% / 24.35%**.
The plan does not define a numerical threshold for "clearly ahead."

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

The proposal chose this curve to raise first-purchase prices and make the late
curve less explosive than its historical `1.5x`, `1.6x`, and `1.8x` exponential
references. The polynomial curve above is the current implementation.

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

**Implemented original-item group: 74,375 coins**. The proposal compared this
with its historical 48,250-coin estimate (approximately 54% higher).

## Implemented upgrades added by the original proposal

Effects and rank counts remain as recorded in [SHOP_UPGRADE_DESIGN.md](../../docs/product/SHOP_UPGRADE_DESIGN.md).

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

## Current achievement rewards

| Rarity | Current achievements | Historical proposed previous each | Implemented each | Current lifetime pool |
| --- | ---: | ---: | ---: | ---: |
| Common | 6 | 100 | 75 | 450 |
| Uncommon | 19 | 300 | 200 | 3,800 |
| Rare | 29 | 700 | 450 | 13,050 |
| Epic | 33 | 1,500 | 900 | 29,700 |
| Legendary | 13 | 4,000 | 2,000 | 26,000 |

The current **100-achievement pool totals 73,000 coins**, or **53.1488897%** of
the expanded shop. Historical previous-per-achievement rates above are retained
for proposal context; applying them to today's catalogue would not establish
the historical pre-rework pool. Achievements remain important acceleration but
cannot independently buy out the expanded shop.

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

Numerical gates 1, 2 and 5 are supported by the source-bound model/receipts;
gate 3 is conditional on the stated style assumptions. Gates 4 and 6 remain
open. The cheapest ordinary rank costs 325 coins: at typical 2.0x style, equal
full-clear Normal runs at waves 5 / 8 / 10 / 15 earn **72 / 158 / 211 / 379**,
requiring **5 / 3 / 2 / 1** identical runs respectively. "Decent" has no defined
depth, score or survival distribution, so these estimates cannot establish
actual first-purchase pacing.

The smallest outstanding gameplay trace uses one isolated fresh local profile,
baseline Normal Campaign and up to four consecutive real-input runs. Record
wave, score, time, actual run award, income upgrades, purchased ranks, wallet and
achievement grants separately. An earned-only shadow wallet starts at zero;
its first crossing of 325 must occur on run 2–4 for that trace to support the
target. Preserve natural outcomes, perform the production purchase when
eligible, and report earlier/later crossings honestly. One trace is not
population acceptance. Do not reset existing saves, inject currency, or change
prices/rewards to manufacture the result.
