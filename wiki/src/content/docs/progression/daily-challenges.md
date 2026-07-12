---
title: Daily Challenges
description: How Tear's daily challenges work — the shared bounty board, challenge pool, shard rewards, and reset timing.
gameVersion: v0.1
---

Daily Challenges are a set of three objectives that refresh every day and provide a reliable source of Shards for the [Meta Shop](/progression/meta-shop). Because they are **determined by the date**, all players worldwide face the exact same three challenges on any given day — a shared bounty board.

---

## How They Work

Each day, three challenges are selected from the **challenge pool** using the current date as a deterministic seed. The selection is computed client-side from the date, so:

- **All players see the same challenges** on the same date (no server required).
- Challenges are consistent across devices — reloading or reinstalling doesn't change them.
- The reset happens at **midnight local time** (device clock).

---

## Challenge Pool

Ten challenge types rotate through the daily selection:

| Challenge | Target | Notes |
|-----------|--------|-------|
| **Kill Count** | 150 kills | Across one or multiple runs |
| **Parry Count** | 15 parries | Perfect parries count double |
| **Boss Defeats** | 2 bosses | Any mode; Gauntlet counts each boss separately |
| **No-Hit Waves** | 5 no-hit waves | Clear 5 waves without taking damage |
| **Reach Wave** | Wave 15 | In a single run of any mode |
| **Power Slams** | 8 power slams | In total across runs |
| **Updraft Launches** | 10 updraft launches | In total across runs |
| **Finish Runs** | 3 runs | Complete or fail — any mode counts |
| **Deflect Projectiles** | 40 deflects | Normal or perfect parries both count |
| **Airborne Hits** | 25 airborne hits | Must be airborne yourself at time of hit |

---

## Progress Tracking

Progress toward each daily challenge is tracked persistently. You do not need to complete a challenge in a single run — kills, deflects, and other counters accumulate across all runs played on that calendar day until the targets are met.

The exception is **Reach Wave 15** and **Finish 3 Runs** — the former requires reaching wave 15 in a single continuous run, and the latter requires completing (or ending, on death) three distinct run sessions.

---

## Rewards

Each completed daily challenge awards **10–20 Shards**, randomised per challenge:

| Challenge Tier | Shard Range |
|---------------|------------|
| Standard challenges | 10–15 shards |
| Higher-skill challenges (No-Hit Waves, Boss Defeats) | 15–20 shards |

Completing all three daily challenges awards a **bonus 5 shards** on top of the individual rewards, for a potential daily maximum of **65 shards** (3 × 20 + 5 bonus).

---

## Reset Timing

Challenges reset at **midnight local time** (your device clock). If you play across the midnight boundary:
- Progress toward the old challenges that was already banked is lost.
- The new day's challenges begin fresh.
- Any shards from completed challenges are kept.

:::tip
If you're close to completing a challenge and midnight is approaching, finish the run before midnight. Progress that isn't banked (from an in-progress run when the clock ticks over) may not carry.
:::

---

## Strategy

| Challenge | Best Mode |
|-----------|----------|
| Kill Count (150) | Endless — high enemy density at higher waves |
| Parry Count (15) | Adventure or Endless — Ranged enemies are common |
| Boss Defeats (2) | Boss Test — fight bosses directly, twice |
| No-Hit Waves (5) | Gentle difficulty Adventure — predictable enemy patterns |
| Reach Wave 15 | Endless or Gauntlet — easiest modes to extend runs |
| Power Slams (8) | Any — just jump and slam regularly |
| Updraft Launches (10) | Any — prioritise launching over slamming |
| Finish Runs (3) | Boss Test or Tutorial — short sessions that end quickly |
| Deflect (40) | Endless with Ranged-heavy waves |
| Airborne Hits (25) | Adventure — launch enemies and juggle |

---

## Relationship to Achievements

Daily challenges and achievements are separate systems:

- **Achievements** are permanent one-time milestones with no reset.
- **Daily challenges** reset daily and are the primary ongoing Shard income.

A player who completes daily challenges every day earns approximately **60–65 × 30 = 1 800–1 950 Shards per month**, which is substantial meta progression.
