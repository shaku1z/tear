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
    CLOCK,
    newMods,
    UPGRADES,
  };
`, context);

const { CONFIG, WEAPONS, getWeapon, Blade, Player, Enemy, CLOCK, newMods, UPGRADES } = context.__test;

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
  assert.ok(weapon.throwCollisionPad > 0, `${weapon.id} has an explicit thrown collision body`);
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
const hammerOutgoing = hammer.weapon.onThrowHit({ blade: hammer, enemy: {}, secondary: false });
const hammerReturning = hammer.weapon.onThrowHit({ blade: hammer, enemy: {}, secondary: true });
assert.equal(hammerOutgoing.mechanic, "meteor");
assert.equal(hammerOutgoing.stop, true);
assert.notEqual(hammerReturning.stop, true, "Hammer return cannot re-trigger Meteor embedding");
assert.equal(hammer.claimImpact(), true);
assert.equal(hammer.claimImpact(), false, "Meteor is one-shot for a throw route");
assert.ok(hammer.thrownCollisionPad() > sword.thrownCollisionPad(), "Hammer has the wider return body");
hammer.state = "returning";
hammer.pierced = new Set([{}, {}]);
assert.equal(hammer.canHitThrownEnemy({}), false, "Hammer return obeys its target cap");

const spear = makeBlade("spear");
assert.ok(CONFIG.blade.length > baseline.blade.length, "Spear is longest");
spear.tipVX = 1000; spear.tipVY = 0; spear.angle = 0; spear.tipSpeed = 1000;
assert.ok(spear.axialQuality() > 0.99);
spear.tipVX = 0; spear.tipVY = 1000;
assert.ok(spear.axialQuality() < 0.01);

const chain = makeBlade("chainblade");
chain.throwBlade();
assert.ok(chain.linkT > 0);
const chainOutgoing = chain.weapon.onThrowHit({ blade: chain, enemy: {}, secondary: false });
const chainReturning = chain.weapon.onThrowHit({ blade: chain, enemy: {}, secondary: true });
assert.equal(chainOutgoing.stop, true);
assert.notEqual(chainReturning.stop, true, "Yank cannot immediately re-bind its target");

const ring = makeBlade("ringblade");
ring.orbit = 1;
ring.vx = 0; ring.vy = 1000;
ring.throwBlade();
assert.equal(ring.state, "circuiting");
assert.ok(ring.circuitEnergy > CONFIG.weapons.ringblade.circuitEnergy);
assert.ok(Math.abs(ring.vy) > Math.abs(ring.vx), "Circuit inherits the held weapon's release tangent");

const spearThrowEffect = spear.weapon.onThrowHit({ blade: spear, enemy: {}, secondary: false });
const spearReturnEffect = spear.weapon.onThrowHit({ blade: spear, enemy: {}, secondary: true });
assert.equal(spearThrowEffect.stop, true);
assert.notEqual(spearReturnEffect.stop, true, "Spear return cannot re-anchor on contact");

function playerWithHandAt(x, y) {
  return {
    x: x - CONFIG.blade.handOffsetX,
    y: y - CONFIG.blade.handOffsetY,
    vx: 0, vy: 0,
  };
}

function finishLifecycle(blade, player, updateTarget) {
  const dt = 1 / 120;
  for (let i = 0; i < 900 && blade.state !== "held"; i++) {
    if (updateTarget) updateTarget(dt);
    player.x += player.vx * dt; player.y += player.vy * dt;
    blade.update(dt, player, []);
  }
  assert.equal(blade.state, "held", `${blade.weapon.id} secondary route terminates in a catch`);
}

function assertRecallIsIdempotent(blade, player) {
  assert.equal(blade.tryRecall(player), "recalled", `${blade.weapon.id} accepts its secondary action`);
  for (let i = 0; i < 20; i++) assert.equal(blade.tryRecall(player), "busy", `${blade.weapon.id} ignores secondary spam`);
}

for (const id of ["sword", "hammer"]) {
  const blade = makeBlade(id);
  const player = playerWithHandAt(400, 400);
  blade.state = "embedded"; blade.x = 650; blade.y = 400;
  if (id === "sword") blade.throwOrigin = { x: 520, y: 400 };
  assertRecallIsIdempotent(blade, player);
  finishLifecycle(blade, player);
}

{
  const blade = makeBlade("spear");
  const player = playerWithHandAt(400, 400);
  blade.state = "embedded"; blade.x = 650; blade.y = 400;
  blade.anchorTerrain = true; blade.linkT = CONFIG.weapons.spear.linkDuration;
  assertRecallIsIdempotent(blade, player);
  assert.equal(blade.state, "reeling");
  finishLifecycle(blade, player);
}

{
  const blade = makeBlade("chainblade");
  const player = playerWithHandAt(400, 400);
  const target = { x: 590, y: 400, vx: 0, vy: 0, dead: false, dying: false, isBoss: false, weight: 1, anchored: false };
  blade.state = "latched"; blade.x = target.x; blade.y = target.y;
  blade.anchorTarget = target; blade.linkT = CONFIG.weapons.chainblade.bindDuration;
  assertRecallIsIdempotent(blade, player);
  assert.equal(blade.state, "yanking");
  finishLifecycle(blade, player, (dt) => {
    target.x += target.vx * dt; target.y += target.vy * dt;
    target.vx *= Math.exp(-3 * dt); target.vy *= Math.exp(-3 * dt);
  });
}

{
  const blade = makeBlade("chainblade");
  const player = playerWithHandAt(400, 400);
  blade.state = "flying"; blade.x = 900; blade.y = 400; blade.flyTime = 0.2; blade.linkT = 1;
  blade.update(1 / 120, player, []);
  assert.equal(blade.state, "returning", "A missed Bind automatically returns at maximum extension");
  finishLifecycle(blade, player);
}

{
  const blade = makeBlade("ringblade");
  const player = playerWithHandAt(400, 400);
  blade.state = "circuiting"; blade.x = 650; blade.y = 400;
  blade.circuitOrbit = 1; blade.circuitEnergy = 2;
  assertRecallIsIdempotent(blade, player);
  finishLifecycle(blade, player);
}

{
  const blade = makeBlade("ringblade");
  const player = playerWithHandAt(400, 400);
  blade.state = "circuiting"; blade.x = 650; blade.y = 400;
  blade.vx = 800; blade.vy = 0; blade.circuitEnergy = 0.001;
  blade.update(1 / 120, player, []);
  assert.equal(blade.state, "returning", "Circuit automatically returns when energy expires");
  finishLifecycle(blade, player);
}

{
  const blade = makeBlade("ringblade");
  const target = {};
  blade.circuitOrbit = 0;
  CLOCK.sim = 10; blade.recordHit(target); CLOCK.sim += 0.05;
  const repeated = blade.weapon.onThrowHit({ blade, enemy: target, secondary: false });
  assert.ok(repeated.damageMult < 0.82, "Circuit applies same-target diminishing damage");
}

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
