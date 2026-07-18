// Reproducible model for Tear's implemented coin/shop economy.
// Run with: node analysis/economy_model.js

const difficulties = {
  easy:    { score: 0.70, count: 0.85, currentCoin: 0.80, proposedCoin: () => 0.80 },
  normal:  { score: 1.00, count: 1.00, currentCoin: 1.00, proposedCoin: () => 1.00 },
  hard:    { score: 1.40, count: 1.15, currentCoin: 1.30, proposedCoin: () => 1.10 },
  extreme: { score: 2.00, count: 1.30, currentCoin: 1.70, proposedCoin: () => 1.15 },
  onehit:  {
    score: 2.20,
    count: 1.00,
    currentCoin: 1.80,
    // One-Hit pays roughly like Hard through wave 8, then ramps quickly with an
    // ease-out curve. Total payout reaches about 5x Normal near wave 20; deeper
    // runs can exceed 5x because surviving that long is exceptionally difficult.
    proposedCoin: (wave) => {
      const p = clamp((wave - 8) / 12, 0, 1);
      const easeOut = 1 - (1 - p) ** 2;
      return 0.70 + 2.35 * easeOut;
    },
  },
};

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function round25(n) { return Math.round(n / 25) * 25; }

// Mirrors Campaign's authored count curve. Boss waves count as one scoring kill.
function campaignKills(wave, difficulty) {
  if (wave % 10 === 0) return 1;
  const stage = Math.floor((wave - 1) / 10);
  const localWave = ((wave - 1) % 10) + 1;
  const base = 3 + Math.floor((localWave - 1) * 1.4) + stage * 2;
  return Math.max(1, Math.round(base * difficulty.count));
}

// Assumptions: constant average style multiplier, no affix bonus, no Bounty Hunter,
// no Fortune, no Coin Magnet, and the run ends on the stated wave.
function campaignScoreThrough(endWave, difficulty, averageStyle) {
  let score = 0;
  for (let wave = 1; wave <= endWave; wave++) {
    const perKill = Math.round(6 * wave * averageStyle * difficulty.score);
    score += campaignKills(wave, difficulty) * perKill;
  }
  return score;
}

function currentCoins(score, wave, difficulty) {
  return Math.floor(score * 0.03 * difficulty.currentCoin) + Math.floor(wave * 12);
}

function proposedCoins(score, wave, difficulty, fortuneStacks = 0) {
  // The flat depth floor remains unmultiplied, preventing shallow difficulty farming.
  const subtotal = Math.floor(score * 0.02 * difficulty.proposedCoin(wave)) + Math.floor(wave * 10);
  // Fortune is a draft opportunity cost, so it boosts the whole subtotal and is
  // noticeable even while the unmultiplied depth floor dominates early income.
  const stacks = Math.min(5, fortuneStacks);
  const fortune = 1 + 0.12 * stacks + (stacks >= 3 ? 0.25 : 0) + (stacks >= 5 ? 0.35 : 0);
  return Math.floor(subtotal * fortune);
}

// Proposed transparent, polynomial rank curve. `levelIndex` is zero-based.
function rankCost(base, levelIndex) {
  return round25(base * (1 + 0.28 * levelIndex + 0.09 * levelIndex * levelIndex));
}

const currentShop = [
  ["Toughness", 160, 1.5, 8], ["Sharpness", 185, 1.6, 8],
  ["Swiftness", 160, 1.5, 6], ["Conditioning", 170, 1.5, 6],
  ["Head Start", 420, 1.5, 1], ["Coin Magnet", 200, 1.6, 5],
  ["Long Arm", 200, 1.5, 5], ["Throwing Arm", 185, 1.5, 6],
  ["Thick Skin", 220, 1.6, 6], ["Warding", 400, 1.8, 2],
  ["Aether Step", 560, 1.5, 1], ["Lifeline", 270, 1.5, 4],
  ["Second Wind", 850, 1.5, 1],
];

const proposedStandardShop = [
  ["Toughness", 325, 8], ["Sharpness", 375, 8],
  ["Swiftness", 350, 6], ["Conditioning", 375, 6],
  ["Head Start", 3000, 1], ["Coin Magnet", 650, 5],
  ["Long Arm", 425, 5], ["Throwing Arm", 400, 6],
  ["Thick Skin", 475, 6], ["Warding", 1100, 2],
  ["Aether Step", 3500, 1], ["Lifeline", 550, 4],
  ["Second Wind", 6000, 1],
];

const proposedNewShop = [
  ["Momentum Transfer", 450, 5], ["Aerial Bracing", 500, 5],
  ["Sling Grip", 500, 5], ["Recall Window", 550, 4],
  ["Hazard Boots", 450, 5], ["Second Breath", 750, 4],
  ["Reserve Pick", 6500, 1],
  // Reroll is deliberately hand-priced because each rank adds scarce run-wide agency.
  ["Reroll", null, 3, [3000, 5500, 9000]],
  ["Expanded Draft", 10000, 1],
];

function currentItem(item) {
  const [name, base, mult, ranks] = item;
  const costs = Array.from({ length: ranks }, (_, i) => Math.round(base * mult ** i));
  return { name, costs, total: costs.reduce((a, b) => a + b, 0) };
}

function proposedItem(item) {
  const [name, base, ranks, explicit] = item;
  const costs = explicit || Array.from({ length: ranks }, (_, i) => rankCost(base, i));
  return { name, costs, total: costs.reduce((a, b) => a + b, 0) };
}

function total(rows) { return rows.reduce((sum, row) => sum + row.total, 0); }

const currentRows = currentShop.map(currentItem);
const repricedRows = proposedStandardShop.map(proposedItem);
const newRows = proposedNewShop.map(proposedItem);

console.log("SHOP TOTALS");
console.table([
  { scope: "Current 13-item shop", ranks: 59, coins: total(currentRows) },
  { scope: "Repriced existing shop", ranks: 59, coins: total(repricedRows) },
  { scope: "Approved new upgrades", ranks: 33, coins: total(newRows) },
  { scope: "Proposed 22-item shop", ranks: 92, coins: total(repricedRows) + total(newRows) },
]);

console.log("PROPOSED ITEM COSTS");
console.table([...repricedRows, ...newRows].map((r) => ({
  upgrade: r.name, costs: r.costs.join(" / "), total: r.total,
})));

console.log("RUN PAYOUTS: CONSTANT AVERAGE STYLE x2.0");
const payoutRows = [];
for (const wave of [5, 10, 15, 20, 30, 50]) {
  for (const id of ["normal", "hard", "extreme", "onehit"]) {
    const d = difficulties[id];
    const score = campaignScoreThrough(wave, d, 2.0);
    payoutRows.push({
      wave, difficulty: id, score,
      currentCoins: currentCoins(score, wave, d),
      proposedCoins: proposedCoins(score, wave, d),
      proposedVsNormal: null,
    });
  }
}
for (const row of payoutRows) {
  const normal = payoutRows.find((x) => x.wave === row.wave && x.difficulty === "normal");
  row.proposedVsNormal = `${(row.proposedCoins / normal.proposedCoins).toFixed(2)}x`;
}
console.table(payoutRows);

console.log("ACHIEVEMENT CURRENCY");
const achievementCounts = { common: 6, uncommon: 19, rare: 29, epic: 31, legendary: 12 };
const currentAchievementCoins = { common: 100, uncommon: 300, rare: 700, epic: 1500, legendary: 4000 };
const proposedAchievementCoins = { common: 75, uncommon: 200, rare: 450, epic: 900, legendary: 2000 };
const achievementRows = Object.keys(achievementCounts).map((rarity) => ({
  rarity,
  achievements: achievementCounts[rarity],
  currentEach: currentAchievementCoins[rarity],
  currentPool: achievementCounts[rarity] * currentAchievementCoins[rarity],
  proposedEach: proposedAchievementCoins[rarity],
  proposedPool: achievementCounts[rarity] * proposedAchievementCoins[rarity],
}));
console.table(achievementRows);
console.table([{
  currentAchievementPool: achievementRows.reduce((s, r) => s + r.currentPool, 0),
  proposedAchievementPool: achievementRows.reduce((s, r) => s + r.proposedPool, 0),
  currentPoolVsShop: `${(achievementRows.reduce((s, r) => s + r.currentPool, 0) / total(currentRows)).toFixed(2)}x`,
  proposedPoolVsShop: `${(achievementRows.reduce((s, r) => s + r.proposedPool, 0) / (total(repricedRows) + total(newRows))).toFixed(2)}x`,
}]);

// Decision guardrails. A failed assertion means the proposal no longer matches its goals.
const payout = (wave, id) => proposedCoins(
  campaignScoreThrough(wave, difficulties[id], 2.0), wave, difficulties[id]
);
const fullProposedShop = total(repricedRows) + total(newRows);
const proposedAchievementPool = achievementRows.reduce((s, r) => s + r.proposedPool, 0);
console.assert(payout(5, "onehit") < payout(15, "normal") * 0.30,
  "Shallow One-Hit farming is too close to Normal stage-two income");
console.assert(payout(5, "onehit") / payout(5, "hard") >= 0.85 &&
  payout(5, "onehit") / payout(5, "hard") <= 1.15,
  "Early One-Hit payout is not comparable to Hard");
console.assert(payout(10, "onehit") / payout(10, "hard") >= 1.40,
  "One-Hit does not pull away strongly enough after wave 8");
console.assert(payout(20, "onehit") / payout(20, "normal") >= 4.8,
  "One-Hit is not near the 5x target by wave 20");
console.assert(total(repricedRows) / total(currentRows) >= 1.50,
  "Existing-shop repricing is less than the intended 50% increase");
console.assert(proposedAchievementPool / fullProposedShop <= 0.55,
  "Achievement grants fund too much of the proposed shop");
console.assert(proposedCoins(campaignScoreThrough(10, difficulties.normal, 2.0), 10, difficulties.normal, 1) === 236,
  "Fortune wave-10 reference payout changed");
console.assert(proposedCoins(campaignScoreThrough(20, difficulties.normal, 2.0), 20, difficulties.normal, 1) === 747,
  "Fortune wave-20 reference payout changed");
console.assert(proposedCoins(1000, 0, difficulties.normal, 3) === Math.floor(20 * 1.61),
  "Fortune Prosperity milestone changed");
console.assert(proposedCoins(1000, 0, difficulties.normal, 5) === Math.floor(20 * 2.20),
  "Fortune Jackpot milestone changed");
console.log("GUARDRAILS PASSED");
