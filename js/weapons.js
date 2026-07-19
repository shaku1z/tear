// ------- interchangeable weapons (one per run, chosen at setup) -------
// The Blade owns shared position, aim, collision helpers, and event identity. Each
// definition below owns feel, quality, damage expression, throw lifecycle, model,
// chassis, and selection copy. Hooks are deliberately capability-based: abilities
// consume normalized combat events and never switch on weapon ids.

function weaponChannels(values) {
  return Object.assign({
    throwPower: 1, throwSpeed: 1, remoteRange: 1,
    secondaryPower: 1, returnSpeed: 1, controlDuration: 1,
  }, values || {});
}

const WEAPONS = [
  {
    id: "sword", name: "Sword", model: "sword",
    playstyle: "Control, parries, and consistency.",
    description: "Responsive and precise. Clean cuts apply Seams, and the recalled Sword retraces its path to Crosscut marked targets.",
    blurb: "Responsive precision · True Edge · Crosscut recall",
    tags: ["Precision", "Parry", "Recall"], weaknesses: ["Low burst", "Weak armor", "No wide control"],
    throwIdentity: "Crosscut", ratings: { handling: 5, impact: 3, reach: 3, difficulty: 2 },
    channels: weaponChannels(),
    applyPhysics() {
      const B = CONFIG.blade;
      B.springStiffness *= 1.08; B.angleSmooth *= 1.1;
      B.deflectMinSpeed *= 0.9; B.perfectSpeed *= 0.9;
    },
    applyPlayerChassis() { CONFIG.player.thrownMoveBoost = 1.15; },
    qualityMetric(ctx) { return ctx.blade.sliceQuality(); },
    damageProfile(ctx) {
      const W = CONFIG.weapons.sword;
      return ctx.quality >= W.trueCutThreshold ? W.trueCutMult : 1;
    },
    onHeldHit(ctx) {
      const W = CONFIG.weapons.sword;
      if (ctx.quality < W.trueCutThreshold) return null;
      return { mechanic: "trueCut", seam: W.seamDuration, hitIframe: W.trueCutHitIframe };
    },
    onThrowLaunch(ctx) { ctx.blade._launchStraight(); },
    updateThrown(ctx) { ctx.blade._updateStandardThrown(ctx.dt, ctx.player, ctx.platforms, true); },
    onThrowHit(ctx) {
      const W = CONFIG.weapons.sword;
      if (ctx.secondary && ctx.enemy.seamT > 0) return { mechanic: "crosscut", damageMult: W.crosscutMult, consumeSeam: true };
      return ctx.secondary ? null : { mechanic: "seam", seam: W.seamDuration };
    },
    onSecondaryThrowAction(ctx) { return ctx.blade._beginReturn(ctx.player, { retrace: true }); },
  },
  {
    id: "hammer", name: "Hammer", model: "hammer",
    playstyle: "Impact, control, and destruction.",
    description: "Slow and devastating. Committed hits build Break, while Meteor throws erupt into seismic shockwaves.",
    blurb: "Committed impact · Break · Meteor shockwave",
    tags: ["Break", "Slam", "Crowd"], weaknesses: ["Slow", "Short control", "Hard parries"],
    throwIdentity: "Meteor", ratings: { handling: 1, impact: 5, reach: 2, difficulty: 3 },
    channels: weaponChannels({ throwPower: 1.35, throwSpeed: 0.82, secondaryPower: 1.18, returnSpeed: 0.78 }),
    applyPhysics() {
      const B = CONFIG.blade;
      B.springStiffness *= 0.62; B.damping *= 1.18; B.gravity *= 1.58;
      B.length += 4; B.aimRadius -= 18; B.maxReach -= 10;
      B.damageScale *= 1.28; B.maxDamage = Math.round(B.maxDamage * 1.48);
      B.minHitSpeed *= 1.34; B.slamMultiplier *= 1.35; B.launchPower *= 1.38;
      B.deflectMinSpeed *= 1.22; B.perfectSpeed *= 1.28;
      B.throw.speed *= 0.82; B.throw.returnSpeed *= 0.78;
    },
    applyPlayerChassis() {
      CONFIG.player.moveSpeed *= 0.96; CONFIG.player.airAccel *= 0.92;
      CONFIG.player.knockbackMult *= 0.75; CONFIG.player.thrownMoveBoost = 1.25;
    },
    qualityMetric(ctx) { return clamp(len(ctx.blade.vx, ctx.blade.vy) / CONFIG.weapons.hammer.commitmentRef, 0, 1); },
    damageProfile(ctx) { return lerp(CONFIG.weapons.hammer.weakFloor, CONFIG.weapons.hammer.fullCommitMult, ctx.quality); },
    onHeldHit(ctx) { return { mechanic: "break", breakPower: ctx.damage * CONFIG.weapons.hammer.breakPerDamage * ctx.quality }; },
    onThrowLaunch(ctx) { ctx.blade._launchBallistic(CONFIG.weapons.hammer.meteorGravity); },
    updateThrown(ctx) { ctx.blade._updateBallisticThrown(ctx.dt, ctx.player, ctx.platforms); },
    onThrowHit() { return { mechanic: "meteor", stop: true }; },
    onWorldImpact() { return { mechanic: "meteor" }; },
    onSecondaryThrowAction(ctx) { return ctx.blade._beginReturn(ctx.player); },
  },
  {
    id: "spear", name: "Spear", model: "spear",
    playstyle: "Reach, pursuit, and movement.",
    description: "Long-reaching and mobile. Drive through targets, then Anchor Cast into enemies or terrain to control distance.",
    blurb: "Axial thrusts · Drive · Anchor Cast traversal",
    tags: ["Reach", "Mobility", "Single Target"], weaknesses: ["Narrow", "Weak sweeps", "Weak slam"],
    throwIdentity: "Anchor Cast", ratings: { handling: 4, impact: 3, reach: 5, difficulty: 4 },
    channels: weaponChannels({ throwSpeed: 1.18, remoteRange: 1.15, returnSpeed: 1.08, controlDuration: 1.1 }),
    applyPhysics() {
      const B = CONFIG.blade;
      B.length += 38; B.aimRadius += 24; B.maxReach += 30;
      B.springStiffness *= 1.06; B.gravity *= 0.82; B.angleSmooth *= 1.08;
      B.slamMultiplier *= 0.58; B.launchPower *= 1.12;
      B.throw.speed *= 1.18;
    },
    applyPlayerChassis() {
      CONFIG.player.moveSpeed *= 1.03; CONFIG.player.airAccel *= 1.08;
      CONFIG.player.knockbackMult *= 0.95; CONFIG.player.thrownMoveBoost = 1.12;
    },
    qualityMetric(ctx) { return ctx.blade.axialQuality(); },
    damageProfile(ctx) {
      const W = CONFIG.weapons.spear;
      const hand = ctx.blade._lastHand;
      const reach = hand ? clamp(len(ctx.blade.tipX - hand.x, ctx.blade.tipY - hand.y) / (CONFIG.blade.maxReach + CONFIG.blade.length), 0, 1) : 0;
      return lerp(W.axialFloor, 1, ctx.quality) * (1 + reach * W.maxReachBonus);
    },
    onHeldHit(ctx) { return ctx.quality >= 0.66 ? { mechanic: "drive", force: CONFIG.weapons.spear.driveForce * ctx.quality } : null; },
    onThrowLaunch(ctx) { ctx.blade._launchStraight(); ctx.blade.linkT = CONFIG.weapons.spear.linkDuration * ctx.blade.channel("controlDuration"); },
    updateThrown(ctx) { ctx.blade._updateSpearThrown(ctx.dt, ctx.player, ctx.platforms); },
    onThrowHit() { return { mechanic: "anchor", stop: true }; },
    onWorldImpact() { return { mechanic: "anchorTerrain" }; },
    onSecondaryThrowAction(ctx) { return ctx.blade._beginSpearReel(ctx.player); },
  },
  {
    id: "chainblade", name: "Chainblade", model: "chainblade",
    playstyle: "Crowd manipulation and advanced momentum control.",
    description: "Build Tension, sweep enemies into position, and Bind priority targets before Yanking them through the fight.",
    blurb: "Flexible reach · Tension and Drag · Bind / Yank",
    tags: ["Control", "Pull", "Expert"], weaknesses: ["Delayed", "Needs space", "Low boss damage"],
    throwIdentity: "Bind / Yank", ratings: { handling: 2, impact: 3, reach: 5, difficulty: 5 },
    channels: weaponChannels({ remoteRange: 1.2, controlDuration: 1.2, secondaryPower: 1.15 }),
    applyPhysics() {
      const B = CONFIG.blade;
      B.length -= 22; B.aimRadius += 20; B.maxReach += 42;
      B.springStiffness *= 0.46; B.damping *= 0.68; B.gravity *= 1.12;
      B.angleSmooth *= 0.58; B.maxSpeed *= 1.08; B.perfectSpeed *= 1.18;
    },
    applyPlayerChassis() {
      CONFIG.player.moveSpeed *= 0.98; CONFIG.player.airAccel *= 0.96;
      CONFIG.player.knockbackMult *= 0.85; CONFIG.player.thrownMoveBoost = 1;
    },
    qualityMetric(ctx) { return ctx.blade.tension; },
    damageProfile(ctx) { return lerp(CONFIG.weapons.chainblade.tensionFloor, 1.12, ctx.quality); },
    onHeldHit(ctx) { return ctx.quality >= CONFIG.weapons.chainblade.fullTensionAt ? { mechanic: "drag", force: CONFIG.weapons.chainblade.dragForce * ctx.quality } : null; },
    onThrowLaunch(ctx) { ctx.blade._launchChain(); },
    updateThrown(ctx) { ctx.blade._updateChainThrown(ctx.dt, ctx.player, ctx.platforms); },
    onThrowHit() { return { mechanic: "bind", stop: true }; },
    onSecondaryThrowAction(ctx) { return ctx.blade._beginYank(ctx.player); },
  },
  {
    id: "ringblade", name: "Ringblade", model: "ringblade",
    playstyle: "Speed, ranged pressure, and continuous flow.",
    description: "Maintain Orbit to increase power, then steer a ricocheting Circuit through the arena.",
    blurb: "Continuous Orbit · fast multi-hit · Circuit ricochet",
    tags: ["Speed", "Throw", "Flow"], weaknesses: ["Low impact", "Weak armor", "Orbit upkeep"],
    throwIdentity: "Circuit", ratings: { handling: 5, impact: 2, reach: 3, difficulty: 4 },
    channels: weaponChannels({ throwSpeed: 1.12, remoteRange: 1.25, returnSpeed: 1.15, controlDuration: 1.3 }),
    applyPhysics() {
      const B = CONFIG.blade;
      B.length -= 16; B.springStiffness *= 1.18; B.damping *= 1.06;
      B.gravity *= 0.62; B.angleSmooth *= 1.22; B.minHitSpeed *= 0.82;
      B.damageScale *= 0.7; B.maxDamage = Math.round(B.maxDamage * 0.68);
      B.enemyHitIframe *= 0.62; B.slamMultiplier *= 0.55; B.launchPower *= 0.65;
      B.deflectMinSpeed *= 0.92; B.throw.speed *= 1.12;
    },
    applyPlayerChassis() {
      CONFIG.player.moveSpeed *= 1.05; CONFIG.player.airAccel *= 1.1;
      CONFIG.player.knockbackMult *= 1.12; CONFIG.player.thrownMoveBoost = 1.06;
    },
    qualityMetric(ctx) { return Math.max(0.28, ctx.blade.orbit); },
    damageProfile(ctx) { return 0.78 + ctx.blade.orbit * CONFIG.weapons.ringblade.orbitDamage; },
    onHeldHit(ctx) { return { mechanic: "orbit", repeatScale: ctx.blade.repeatScale(ctx.enemy) }; },
    onThrowLaunch(ctx) { ctx.blade._launchCircuit(); },
    updateThrown(ctx) { ctx.blade._updateCircuit(ctx.dt, ctx.player, ctx.platforms); },
    onThrowHit(ctx) { return { mechanic: "circuit", damageMult: 0.82 + ctx.blade.circuitOrbit * 0.38, redirect: true }; },
    onSecondaryThrowAction(ctx) { return ctx.blade._beginCircuitReturn(ctx.player); },
  },
];

function getWeapon(id) { return WEAPONS.find((weapon) => weapon.id === id) || WEAPONS[0]; }

function applyWeapon(id) {
  const weapon = getWeapon(id);
  if (weapon.applyPhysics) weapon.applyPhysics({ config: CONFIG, weapon });
  if (weapon.applyPlayerChassis) weapon.applyPlayerChassis({ config: CONFIG, weapon });
  return weapon;
}
