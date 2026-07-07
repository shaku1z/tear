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
  cost(item) { return Math.round(item.baseCost * Math.pow(item.costMult || 1.5, this.level(item.id))); },
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

const SHOP = [
  { id: "tough", name: "Toughness", desc: "+12 starting max HP per level.", baseCost: 160, costMult: 1.5, maxLevel: 8,
    apply: (lv, { player }) => { player.maxHp += 12 * lv; player.hp = player.maxHp; } },
  { id: "sharp", name: "Sharpness", desc: "+6% damage per level.", baseCost: 185, costMult: 1.6, maxLevel: 8,
    apply: (lv) => { CONFIG.blade.damageScale *= Math.pow(1.06, lv); CONFIG.blade.maxDamage = Math.round(CONFIG.blade.maxDamage * Math.pow(1.05, lv)); } },
  { id: "swift", name: "Swiftness", desc: "+4% move speed per level.", baseCost: 160, costMult: 1.5, maxLevel: 6,
    apply: (lv) => { CONFIG.player.moveSpeed *= Math.pow(1.04, lv); } },
  { id: "recovery", name: "Conditioning", desc: "-6% dash cooldown per level.", baseCost: 170, costMult: 1.5, maxLevel: 6,
    apply: (lv) => { CONFIG.dash.cooldown *= Math.pow(0.94, lv); } },
  { id: "headstart", name: "Head Start", desc: "Begin each run with a random upgrade.", baseCost: 420, maxLevel: 1,
    apply: (lv, ctx) => { const pool = UPGRADES.filter((u) => !u.unique); applyUpgrade(pool[Math.floor(Math.random() * pool.length)], ctx); } },
  { id: "greed", name: "Coin Magnet", desc: "+15% coins earned per level.", baseCost: 200, costMult: 1.6, maxLevel: 5,
    apply: () => {} },   // applied at coin-award time via META.level("greed")
  { id: "reach", name: "Long Arm", desc: "+ blade reach & length per level.", baseCost: 200, costMult: 1.5, maxLevel: 5,
    apply: (lv) => { CONFIG.blade.aimRadius += 12 * lv; CONFIG.blade.length += 6 * lv; CONFIG.blade.maxReach += 12 * lv; } },
  { id: "throwarm", name: "Throwing Arm", desc: "+8% thrown-blade damage per level.", baseCost: 185, costMult: 1.5, maxLevel: 6,
    apply: (lv) => { CONFIG.blade.throw.damage *= Math.pow(1.08, lv); CONFIG.blade.throw.damageFromSpeed *= Math.pow(1.08, lv); } },
  { id: "thickskin", name: "Thick Skin", desc: "Take -4% damage per level.", baseCost: 220, costMult: 1.6, maxLevel: 6,
    apply: (lv) => { CONFIG.player.dmgTakenMult *= Math.pow(0.96, lv); } },
  { id: "warding", name: "Warding", desc: "Begin each run with a one-hit shield per level.", baseCost: 400, costMult: 1.8, maxLevel: 2,
    apply: (lv, { player }) => { player.maxShield = Math.max(player.maxShield, lv); player.shield = player.maxShield; } },
  { id: "aircharge", name: "Aether Step", desc: "Start with an extra mid-air dash charge.", baseCost: 560, maxLevel: 1,
    apply: (lv, { player }) => { player.maxDashCharges = Math.max(player.maxDashCharges, 1 + lv); player.dashCharges = player.maxDashCharges; } },
  { id: "lifeline", name: "Lifeline", desc: "Recover +5 HP on each wave clear per level.", baseCost: 270, costMult: 1.5, maxLevel: 4,
    apply: (lv, { mods }) => { if (mods) mods.waveHeal += 5 * lv; } },
  { id: "phoenix", name: "Second Wind", desc: "Once per run, revive with 35% HP when you would fall.", baseCost: 850, maxLevel: 1,
    apply: (lv, { player }) => { player.shopRevives += lv; } },
];
