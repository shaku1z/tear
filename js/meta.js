// ------- meta-progression: persistent coins + shop (localStorage) -------
const META = {
  data: { coins: 0, buy: {} },
  load() {
    try { this.data = Object.assign({ coins: 0, buy: {} }, JSON.parse(localStorage.getItem("tear_meta") || "{}")); }
    catch (e) { this.data = { coins: 0, buy: {} }; }
    return this.data;
  },
  save() { try { localStorage.setItem("tear_meta", JSON.stringify(this.data)); } catch (e) {} },
  coins() { return this.data.coins; },
  level(id) { return this.data.buy[id] || 0; },
  addCoins(n) { this.data.coins += n; this.save(); },
  cost(item) { return Math.round(item.baseCost * Math.pow(item.costMult || 1.5, this.level(item.id))); },
  canBuy(item) { return this.level(item.id) < item.maxLevel && this.data.coins >= this.cost(item); },
  buy(item) {
    if (!this.canBuy(item)) return false;
    this.data.coins -= this.cost(item);
    this.data.buy[item.id] = this.level(item.id) + 1;
    this.save();
    return true;
  },
  // apply all purchased passives at the start of a run; ctx = { player, blade, mods }
  apply(ctx) { for (const it of SHOP) { const lv = this.level(it.id); if (lv > 0) it.apply(lv, ctx); } },
};

const SHOP = [
  { id: "tough", name: "Toughness", desc: "+12 starting max HP per level.", baseCost: 120, costMult: 1.5, maxLevel: 8,
    apply: (lv, { player }) => { player.maxHp += 12 * lv; player.hp = player.maxHp; } },
  { id: "sharp", name: "Sharpness", desc: "+6% damage per level.", baseCost: 140, costMult: 1.6, maxLevel: 8,
    apply: (lv) => { CONFIG.blade.damageScale *= Math.pow(1.06, lv); CONFIG.blade.maxDamage = Math.round(CONFIG.blade.maxDamage * Math.pow(1.05, lv)); } },
  { id: "swift", name: "Swiftness", desc: "+4% move speed per level.", baseCost: 120, costMult: 1.5, maxLevel: 6,
    apply: (lv) => { CONFIG.player.moveSpeed *= Math.pow(1.04, lv); } },
  { id: "recovery", name: "Conditioning", desc: "-6% dash cooldown per level.", baseCost: 130, costMult: 1.5, maxLevel: 6,
    apply: (lv) => { CONFIG.dash.cooldown *= Math.pow(0.94, lv); } },
  { id: "headstart", name: "Head Start", desc: "Begin each run with a random upgrade.", baseCost: 320, maxLevel: 1,
    apply: (lv, ctx) => { const pool = UPGRADES.filter((u) => !u.unique); applyUpgrade(pool[Math.floor(Math.random() * pool.length)], ctx); } },
  { id: "greed", name: "Coin Magnet", desc: "+15% coins earned per level.", baseCost: 150, costMult: 1.6, maxLevel: 5,
    apply: () => {} },   // applied at coin-award time via META.level("greed")
];
