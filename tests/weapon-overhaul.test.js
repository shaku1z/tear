const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({
  console,
  Math,
  JSON,
  Set,
  Map,
  performance: { now: () => 0 },
  CLOCK: { sim: 1 },
  Input: {
    touchAim: false, stickAim: null, locked: false, mouseX: 900, mouseY: 450,
    tetherHeld: false, consumeDelta: () => ({ x: 0, y: 0 }),
  },
  THEME: { ink: "#111", rim: "#fff", dark: false },
  GFX: { low: true },
});

for (const file of ["config.js", "utils.js", "weapons.js", "blade.js", "player.js", "upgrades.js", "enemy.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, "js", file), "utf8"), context, { filename: file });
}

vm.runInContext(`
  globalThis.__test = {
    CONFIG,
    WEAPONS,
    getWeapon,
    applyWeapon,
    Blade,
    Player,
    Enemy,
    newMods,
    UPGRADES,
  };
`, context);

const { CONFIG, WEAPONS, getWeapon, Blade, Player, Enemy, newMods, UPGRADES } = context.__test;

assert.equal(WEAPONS.map((weapon) => weapon.id).join(","), "sword,hammer,spear,chainblade,ringblade");
assert.equal(new Set(WEAPONS.map((weapon) => weapon.throwIdentity)).size, 5);
for (const weapon of WEAPONS) {
  assert.equal(typeof weapon.applyPhysics, "function", `${weapon.id} physics`);
  assert.equal(typeof weapon.applyPlayerChassis, "function", `${weapon.id} chassis`);
  assert.equal(typeof weapon.qualityMetric, "function", `${weapon.id} quality`);
  assert.equal(typeof weapon.onThrowLaunch, "function", `${weapon.id} throw launch`);
  assert.equal(typeof weapon.updateThrown, "function", `${weapon.id} thrown update`);
  assert.equal(typeof weapon.onThrowHit, "function", `${weapon.id} throw hit`);
  assert.equal(typeof weapon.onSecondaryThrowAction, "function", `${weapon.id} secondary action`);
  assert.equal(weapon.tags.length, 3);
  assert.ok(weapon.weaknesses.length >= 3);
}

const baseline = JSON.parse(JSON.stringify(CONFIG));
function restoreConfig() {
  for (const key of Object.keys(baseline)) CONFIG[key] = JSON.parse(JSON.stringify(baseline[key]));
}
function makeBlade(id) {
  restoreConfig();
  const weapon = getWeapon(id);
  weapon.applyPhysics({ config: CONFIG, weapon });
  weapon.applyPlayerChassis({ config: CONFIG, weapon });
  const blade = new Blade();
  blade.weapon = weapon;
  blade.model = weapon.model;
  blade.aimX = 100; blade.aimY = 0; blade.tipSpeed = 1600;
  return blade;
}

const sword = makeBlade("sword");
assert.equal(sword.throwBlade(), true);
assert.equal(sword.state, "flying");
assert.ok(sword.throwOrigin && sword.throwId === 1);

const hammer = makeBlade("hammer");
assert.ok(CONFIG.blade.maxReach < baseline.blade.maxReach, "Hammer has shorter practical reach");
assert.ok(CONFIG.player.knockbackMult < 1, "Hammer chassis resists knockback");
hammer.throwBlade();
assert.equal(hammer.throwGravity, CONFIG.weapons.hammer.meteorGravity);

const spear = makeBlade("spear");
assert.ok(CONFIG.blade.length > baseline.blade.length, "Spear is longest");
spear.tipVX = 1000; spear.tipVY = 0; spear.angle = 0; spear.tipSpeed = 1000;
assert.ok(spear.axialQuality() > 0.99);
spear.tipVX = 0; spear.tipVY = 1000;
assert.ok(spear.axialQuality() < 0.01);

const chain = makeBlade("chainblade");
chain.throwBlade();
assert.ok(chain.linkT > 0);

const ring = makeBlade("ringblade");
ring.orbit = 1;
ring.throwBlade();
assert.equal(ring.state, "circuiting");
assert.ok(ring.circuitEnergy > CONFIG.weapons.ringblade.circuitEnergy);

restoreConfig();
const enemy = new Enemy(100, 100, { w: 30, h: 30, hp: 200, speed: 1, contactDmg: 10, knockbackTaken: 1 });
enemy.applySever(3);
assert.equal(enemy.severMult, CONFIG.sever.normalMult[2]);
assert.equal(enemy.outgoingDamageMult(), enemy.severMult);
const targetPlayer = new Player(300, 300);
const hpBefore = targetPlayer.hp;
targetPlayer.takeDamage(10, 0, enemy);
assert.equal(hpBefore - targetPlayer.hp, 10 * CONFIG.sever.normalMult[2], "Sever resolves through shared outgoing damage");
assert.equal(enemy.applyBreak(CONFIG.weapons.hammer.breakThreshold + 1), true);
assert.ok(enemy.stun > 0);

const mods = newMods();
for (const hook of ["onSwingHit", "onPerfectParry", "onThrowLaunch", "onThrowResolve", "onThrowSecondary", "onReturnHit", "onWeaponCatch", "onEnemyFirstDamaged", "onEnemyDeath", "onSkillKill", "onDashStart", "onDashContact", "onReflectedHit"]) {
  assert.ok(Array.isArray(mods[hook]), `${hook} is normalized event channel`);
}
const abilityNames = new Set(UPGRADES.map((upgrade) => upgrade.name));
for (const name of ["Overdrive", "Second Pass", "Remote Link", "Redirect", "Capture", "Collapse", "Stormbank", "Overrun", "Sever"]) {
  assert.ok(abilityNames.has(name), `${name} is draftable/Codex-visible`);
}
for (const cut of ["Glacial Wake", "Discord", "Frenzy"]) assert.equal(abilityNames.has(cut), false);

console.log("weapon-overhaul tests passed");
