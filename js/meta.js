// ------- meta-progression: persistent coins + shop (localStorage) -------
const META = {
  data: { lifetimeEarned: 0, lifetimeSpent: 0, buy: {} },
  load() {
    let raw = {};
    try { raw = JSON.parse(CG.store.get("tear_meta") || "{}"); } catch (e) {}
    
    // ONE-TIME MIGRATION: Convert legacy 'coins' to ledger format
    if ('coins' in raw && !('lifetimeEarned' in raw)) {
      raw.lifetimeEarned = raw.coins || 0;
      raw.lifetimeSpent = 0;
      delete raw.coins;
      try { CG.store.set("tear_meta", JSON.stringify(raw)); } catch (e) {}
    }
    
    this.data = Object.assign({ lifetimeEarned: 0, lifetimeSpent: 0, buy: {} }, raw);
    return this.data;
  },
  save() { try { CG.store.set("tear_meta", JSON.stringify(this.data)); } catch (e) {} },
  coins() { return Math.max(0, (this.data.lifetimeEarned || 0) - (this.data.lifetimeSpent || 0)); },
  level(id) { return this.data.buy[id] || 0; },
  addCoins(n) { this.data.lifetimeEarned = (this.data.lifetimeEarned || 0) + n; this.save(); },
  cost(item) {
    const lv = this.level(item.id);
    if (item.costs) return item.costs[Math.min(lv, item.costs.length - 1)];
    return Math.round(item.baseCost * (1 + 0.28 * lv + 0.09 * lv * lv) / 25) * 25;
  },
  canBuy(item) { return this.level(item.id) < item.maxLevel && this.coins() >= this.cost(item); },
  buy(item) {
    if (!this.canBuy(item)) return false;
    this.data.lifetimeSpent = (this.data.lifetimeSpent || 0) + this.cost(item);
    this.data.buy[item.id] = this.level(item.id) + 1;
    this.save();
    if (typeof Cloud !== "undefined" && Cloud.loggedIn()) Cloud.push();
    return true;
  },
  // apply all purchased passives at the start of a run; ctx = { player, blade, mods }
  apply(ctx) { for (const it of SHOP) { const lv = this.level(it.id); if (lv > 0) it.apply(lv, ctx); } },
  // non-destructive merge of a remote wallet (cloud sync): keep the higher coins + levels
  merge(r) {
    if (!r) return;
    
    // Remote migration inline (if cloud still has legacy 'coins' and no ledger)
    if (r.coins !== undefined && r.lifetimeEarned === undefined) {
      r.lifetimeEarned = r.coins;
      r.lifetimeSpent = 0;
      delete r.coins;
    }
    
    this.data.lifetimeEarned = Math.max(this.data.lifetimeEarned || 0, r.lifetimeEarned || 0);
    this.data.lifetimeSpent = Math.max(this.data.lifetimeSpent || 0, r.lifetimeSpent || 0);
    if (r.buy) for (const k in r.buy) this.data.buy[k] = Math.max(this.data.buy[k] || 0, r.buy[k] || 0);
  },
};

// each item: cat = armory section, glyph = card icon, now(lv) = the cumulative
// effect you own at level lv (shown on the card once bought)
const SHOP = [
  { id: "tough", name: "Toughness", desc: "+12 starting max HP per level.", baseCost: 325, maxLevel: 8,
    cat: "vit", glyph: "❤", now: (lv) => "+" + 12 * lv + " HP",
    apply: (lv, { player }) => { player.maxHp += 12 * lv; player.hp = player.maxHp; } },
  { id: "sharp", name: "Sharpness", desc: "+6% damage per level.", baseCost: 375, maxLevel: 8,
    cat: "blade", glyph: "⚔", now: (lv) => "+" + Math.round((Math.pow(1.06, lv) - 1) * 100) + "% dmg",
    apply: (lv) => { CONFIG.blade.damageScale *= Math.pow(1.06, lv); CONFIG.blade.maxDamage = Math.round(CONFIG.blade.maxDamage * Math.pow(1.05, lv)); } },
  { id: "swift", name: "Swiftness", desc: "+4% move speed per level.", baseCost: 350, maxLevel: 6,
    cat: "tempo", glyph: "≫", now: (lv) => "+" + Math.round((Math.pow(1.04, lv) - 1) * 100) + "% speed",
    apply: (lv) => { CONFIG.player.moveSpeed *= Math.pow(1.04, lv); } },
  { id: "recovery", name: "Conditioning", desc: "-6% dash cooldown per level.", baseCost: 375, maxLevel: 6,
    cat: "tempo", glyph: "↯", now: (lv) => "−" + Math.round((1 - Math.pow(0.94, lv)) * 100) + "% dash cd",
    apply: (lv) => { CONFIG.dash.cooldown *= Math.pow(0.94, lv); } },
  { id: "headstart", name: "Head Start", desc: "Begin each run with a random upgrade.", baseCost: 3000, maxLevel: 1,
    cat: "fortune", glyph: "✦", now: () => "1 free upgrade",
    apply: (lv, ctx) => { const pool = UPGRADES.filter((u) => !u.unique); applyUpgrade(pool[Math.floor(Math.random() * pool.length)], ctx); } },
  { id: "greed", name: "Coin Magnet", desc: "+8% score-derived coins per level.", baseCost: 650, maxLevel: 5,
    cat: "fortune", glyph: "◆", now: (lv) => "+" + 8 * lv + "% score coins",
    apply: () => {} },   // applied at coin-award time via META.level("greed")
  { id: "reach", name: "Long Arm", desc: "+ blade reach & length per level.", baseCost: 425, maxLevel: 5,
    cat: "blade", glyph: "↔", now: (lv) => "+" + 12 * lv + " reach",
    apply: (lv) => { CONFIG.blade.aimRadius += 12 * lv; CONFIG.blade.length += 6 * lv; CONFIG.blade.maxReach += 12 * lv; } },
  { id: "throwarm", name: "Throwing Arm", desc: "+8% thrown-blade damage per level.", baseCost: 400, maxLevel: 6,
    cat: "blade", glyph: "➹", now: (lv) => "+" + Math.round((Math.pow(1.08, lv) - 1) * 100) + "% throw dmg",
    apply: (lv) => { CONFIG.blade.throw.damage *= Math.pow(1.08, lv); CONFIG.blade.throw.damageFromSpeed *= Math.pow(1.08, lv); } },
  { id: "thickskin", name: "Thick Skin", desc: "Take -4% damage per level.", baseCost: 475, maxLevel: 6,
    cat: "vit", glyph: "▣", now: (lv) => "−" + Math.round((1 - Math.pow(0.96, lv)) * 100) + "% dmg taken",
    apply: (lv) => { CONFIG.player.dmgTakenMult *= Math.pow(0.96, lv); } },
  { id: "warding", name: "Warding", desc: "Begin each run with a one-hit shield per level.", baseCost: 1100, maxLevel: 2,
    cat: "fortune", glyph: "⬡", now: (lv) => lv + " shield" + (lv > 1 ? "s" : ""),
    apply: (lv, { player }) => { player.maxShield = Math.max(player.maxShield, lv); player.shield = player.maxShield; } },
  { id: "aircharge", name: "Aether Step", desc: "Start with an extra mid-air dash charge.", baseCost: 3500, maxLevel: 1,
    cat: "tempo", glyph: "⇈", now: () => "+1 air dash",
    // additive so it STACKS with the Air Dash ability instead of both flat-capping at 2.
    // Safe as +=: META.apply runs once per run on a fresh player (base 1).
    apply: (lv, { player }) => { player.maxDashCharges += lv; player.dashCharges = player.maxDashCharges; } },
  { id: "lifeline", name: "Lifeline", desc: "Recover +5 HP on each wave clear per level.", baseCost: 550, maxLevel: 4,
    cat: "vit", glyph: "✚", now: (lv) => "+" + 5 * lv + " HP / wave",
    apply: (lv, { mods }) => { if (mods) mods.waveHeal += 5 * lv; } },
  { id: "phoenix", name: "Second Wind", desc: "Once per run, revive with 35% HP when you would fall.", baseCost: 6000, maxLevel: 1,
    cat: "vit", glyph: "❁", now: () => "1 revive",
    apply: (lv, { player }) => { player.shopRevives += lv; } },
  { id: "momentum", name: "Momentum Transfer", desc: "Retain 6% more horizontal momentum after a dash per level.", baseCost: 450, maxLevel: 5,
    cat: "tempo", glyph: "↠", now: (lv) => "+" + Math.round((Math.pow(1.06, lv) - 1) * 100) + "% dash carry",
    apply: (lv, { player }) => { player.dashMomentumMult *= Math.pow(1.06, lv); } },
  { id: "aerialbracing", name: "Aerial Bracing", desc: "Take 3% less damage while airborne per level.", baseCost: 500, maxLevel: 5,
    cat: "vit", glyph: "△", now: (lv) => "−" + Math.round((1 - Math.pow(0.97, lv)) * 100) + "% air damage",
    apply: (lv, { player }) => { player.airborneDmgMult *= Math.pow(0.97, lv); } },
  { id: "slinggrip", name: "Sling Grip", desc: "Thrown-blade release recovery is 4% shorter per level.", baseCost: 500, maxLevel: 5,
    cat: "blade", glyph: "➶", now: (lv) => "−" + Math.round((1 - Math.pow(0.96, lv)) * 100) + "% release recovery",
    apply: (lv, { blade }) => { blade.throwCooldownMult *= Math.pow(0.96, lv); } },
  { id: "recallwindow", name: "Recall Window", desc: "Recall a distant blade 0.10s earlier per level.", baseCost: 550, maxLevel: 4,
    cat: "blade", glyph: "↶", now: (lv) => (0.10 * lv).toFixed(2) + "s early recall",
    apply: (lv, { blade }) => { blade.recallWindow += 0.10 * lv; } },
  { id: "hazardboots", name: "Hazard Boots", desc: "Take 6% less floor and environmental hazard damage per level.", baseCost: 450, maxLevel: 5,
    cat: "vit", glyph: "▱", now: (lv) => "−" + Math.round((1 - Math.pow(0.94, lv)) * 100) + "% hazard damage",
    apply: (lv, { player }) => { player.hazardDmgMult *= Math.pow(0.94, lv); } },
  { id: "secondbreath", name: "Second Breath", desc: "Once per stage below 30% HP, regenerate 1.25% max HP/s for 4s per level.", baseCost: 750, maxLevel: 4,
    cat: "vit", glyph: "♨", now: (lv) => (5 * lv) + "% HP over " + (4 * lv) + "s",
    apply: (lv, { player }) => { player.secondBreathDuration = 4 * lv; } },
  { id: "reserve", name: "Reserve Pick", desc: "Reserve one unchosen card for your next normal draft.", baseCost: 6500, maxLevel: 1,
    cat: "fortune", glyph: "▣", now: () => "1 reserved draft card",
    apply: (lv, { mods }) => { mods.reservePick = lv > 0; } },
  { id: "reroll", name: "Reroll", desc: "Gain one normal-draft reroll charge per level, shared across the run.", costs: [3000, 5500, 9000], maxLevel: 3,
    cat: "fortune", glyph: "⟳", now: (lv) => lv + " reroll" + (lv === 1 ? "" : "s") + " / run",
    apply: (lv, { mods }) => { mods.draftRerolls += lv; } },
  { id: "expanded", name: "Expanded Draft", desc: "Normal drafts offer four cards instead of three.", baseCost: 10000, maxLevel: 1,
    cat: "fortune", glyph: "▥", now: () => "4-card normal drafts",
    apply: (lv, { mods }) => { mods.expandedDraft = lv > 0; } },
];
