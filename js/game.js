// ------- main: state machine, menus, waves, draft, combat sim -------
(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = CONFIG.view.w, H = CONFIG.view.h;

  Input.init(canvas);

  // render at device resolution (sharp on hi-dpi / upscaled displays), while all
  // drawing still uses the 1280x720 logical coordinate system.
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    // size the backing store to the ACTUALLY-displayed area. In fullscreen the canvas is
    // 100%x100% with object-fit:contain, so the visible frame is the 16:9 box that fits
    // inside it — use that (not the full element) so ultrawides don't over-allocate pixels.
    const cw = canvas.clientWidth || W, ch = canvas.clientHeight || H;
    const fitW = Math.min(cw, ch * W / H);
    const tw = Math.max(W, Math.round(fitW * dpr));
    const th = Math.round(tw * H / W);
    if (canvas.width !== tw || canvas.height !== th) { canvas.width = tw; canvas.height = th; }
  }
  window.addEventListener("resize", resizeCanvas);
  document.addEventListener("fullscreenchange", resizeCanvas);
  resizeCanvas();

  function requestLock() { if (canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch (e) {} } }

  // pristine copy of all tunables, so per-run upgrades never leak across runs
  const BASE = JSON.parse(JSON.stringify(CONFIG));
  function restoreConfig() {
    Object.keys(BASE).forEach((k) => { CONFIG[k] = JSON.parse(JSON.stringify(BASE[k])); });
  }

  // ---- settings (persisted) ----
  let shakeScale = 1;
  let settings = loadSettings();
  function loadSettings() {
    const def = { sens: CONFIG.blade.aimSensitivity, shake: 1, vol: 0.6, music: true, gfx: "auto" };
    try { return Object.assign(def, JSON.parse(CG.store.get("tear_settings") || "{}")); }
    catch (e) { return def; }
  }
  // a coarse pointer (touch) or few CPU cores -> treat as low-end for the "auto" default
  function isLowEnd() {
    try { return (navigator.hardwareConcurrency || 8) <= 4 || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches); }
    catch (e) { return false; }
  }
  function applySettings() {
    CONFIG.blade.aimSensitivity = settings.sens;
    shakeScale = settings.shake;
    GFX.low = settings.gfx === "low" || (settings.gfx === "auto" && isLowEnd());
    if (typeof SFX !== "undefined") { SFX.vol = settings.vol; SFX.musicOn = settings.music; SFX.setVol(settings.vol); SFX.setMusic(settings.music); }
  }
  if (typeof SFX !== "undefined") SFX.init();
  META.load();
  // CrazyGames: pause audio during ads, and once the SDK is ready re-read saved
  // progress from cloud storage (no-ops + plain localStorage off-platform)
  CG.setHooks(
    () => { if (typeof SFX !== "undefined") SFX.mute(true, "ad"); },     // ad break: silence
    () => { if (typeof SFX !== "undefined") SFX.mute(false, "ad"); },    // ad over: restore
    (on) => { if (typeof SFX !== "undefined") SFX.mute(on, "cg"); });    // CrazyGames portal mute toggle
  CG.loadingStart();
  CG.init().then(() => { META.load(); settings = loadSettings(); applySettings(); CG.loadingStop(); });
  function awardCoins(score) {
    // leaner economy: a small fraction of score + a flat per-wave trickle, so a strong run
    // buys 1-3 upgrades (not the whole shop). run.coinMod lets difficulty scale the reward.
    const flat = Math.floor((run.wave || 0) * 12);
    const earned = Math.floor(score * 0.03 * (1 + 0.15 * META.level("greed")) * CONFIG.run.coinMult * (run.coinMod || 1)) + flat;
    META.addCoins(earned);
    return earned;
  }
  // build a draft, guaranteeing at least 2 Specials are OFFERED per 10-wave stage
  function buildDraft() {
    const block = Math.floor((run.wave - 1) / 10);
    if (run.specialBlock !== block) { run.specialBlock = block; run.specialsOffered = 0; }
    const lw = ((run.wave - 1) % 10) + 1;            // wave just cleared (1..9 give drafts)
    const draftsLeft = Math.max(1, 10 - lw);         // drafts remaining this stage, including this one
    const need = 2 - (run.specialsOffered || 0);
    const choices = rollUpgrades(3, run.mods, { forceSpecial: need > 0 && draftsLeft <= need });
    run.specialsOffered = (run.specialsOffered || 0) + choices.filter((u) => u.tiers).length;
    return choices;
  }
  function saveSettings() { try { CG.store.set("tear_settings", JSON.stringify(settings)); } catch (e) {} }
  applySettings();

  // ---- high scores ----
  function bestKey(mode, diff) { return `tear_best_${mode}_${diff}`; }
  function getBest(mode, diff) {
    try { return Object.assign({ wave: 0, score: 0, time: 0 }, JSON.parse(CG.store.get(bestKey(mode, diff)) || "{}")); }
    catch (e) { return { wave: 0, score: 0, time: 0 }; }
  }
  function saveBest(mode, diff, wave, score, time) {
    const b = getBest(mode, diff);
    if (wave > b.wave || (wave === b.wave && score > b.score)) {
      try { CG.store.set(bestKey(mode, diff), JSON.stringify({ wave, score, time: time || 0 })); } catch (e) {}
      return true;
    }
    return false;
  }

  // ---- fullscreen button ----
  const wrap = document.getElementById("wrap");
  const fsBtn = document.getElementById("fs");
  const lockHint = document.getElementById("lockhint");
  const hintEl = document.getElementById("hint");
  if (fsBtn) fsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!document.fullscreenElement) (wrap.requestFullscreen || (() => {})).call(wrap);
    else document.exitFullscreen();
  });

  // ---- world geometry ----
  // platforms are rebuilt per stage (campaign biomes); other modes use stage 0's layout
  let platforms = stagePlatforms(0);
  let stageIndex = 0;                 // current biome (campaign)
  let currentStage = stageAt(0);      // its palette/name
  let stageBannerT = 0;               // "STAGE N — Name" banner timer
  let stageName = "";
  let loreT = 0, loreDur = 7, loreText = "", loreTitle = "";   // lore card (boss-clear caption, or the campaign intro)
  function showLore(text, title, dur) { loreText = text; loreTitle = title || ""; loreDur = dur || 7; loreT = loreDur; }
  // the campaign's opening — shown as a lore card on the first wave of an Adventure run
  const CAMPAIGN_INTRO = "Long ago the sky was torn, and through the wound poured everything that should not be. They named it the Tear. Each soul the Council sent to close it was worn, in time, into the shape of the thing they failed to stop — a guardian of the very wound they meant to end. You are the next to descend. Cut clean. Keep moving. Reach the Source before it wears your shape too.";
  // shown when the whole Adventure is completed (final biome's boss falls)
  const CAMPAIGN_ENDING = "The Tear closes behind you like a held breath let go. Every guardian, every echo of the ones who came before — all of it was the long way of asking whether you'd still be going somewhere when you arrived. You are. Whatever waits on the other side, you walked the whole length of someone else's ending to reach your own beginning. Go finish it.";

  // swap the biome: new platform layout + palette, and clear any lingering hazards
  function loadStage(i) {
    stageIndex = i;
    currentStage = stageAt(i);
    platforms = stagePlatforms(i);
    slowZones = []; tempWalls = [];
  }

  // ---- state ----
  let state = "menu";
  let player, blade, enemies, projectiles, floaters, hitStop, shake;
  let timeScale = 1, slowmo = 0, zoom = 1, flash = 0, bannerT = 0, dashGhostT = 0; // feel/juice
  let wasSwinging = false, wasDashing = false, wasOnGround = true; // audio cadence
  let throwCd = 0;            // brief cooldown between blade throws (not recalls)
  let slowZones = [];         // Sludge puddles: { x, y, r, life }
  let tempWalls = [];         // Geomancer walls (also pushed into `platforms` for collision)
  let wasLocked = false;      // tracks mouse capture so losing it (Esc) pauses the game
  let rankPopT = 0, rankPopText = "";   // style rank-up flash
  let run = null;             // { mode, diff, wave, score, mods, spawnQueue, spawnTimer, waveActive }
  let draftChoices = [];
  let tierChoices = [];               // abilities offered to evolve after a campaign boss
  let overInfo = null;        // game-over summary
  let selMode = "endless", selDiff = "normal", selWeapon = "sword", selBoss = "shuffle";
  // the built bosses — Boss Test cycles through these (with a tier-up after each)
  const BOSS_ROSTER = [
    { id: "warden", name: "The Warden" },
    { id: "colossus", name: "Iron Colossus" },
    { id: "aldric", name: "Berserker King" },
    { id: "echo", name: "The Echo" },
    { id: "source", name: "The Source" },
  ];
  // blend two #rrggbb colors (t: 0=a, 1=b) — used for the Echo's white-out
  function blendCol(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
    const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
    const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  // diagonal hazard stripes (the classic danger pattern), clipped to a rect and scrolling
  function hazardStripes(ctx, x, y, w, h, color, alpha) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = color; ctx.lineWidth = 11; ctx.globalAlpha = alpha;
    const step = 30, off = (performance.now() / 26) % step;
    for (let i = -h; i < w + h; i += step) { ctx.beginPath(); ctx.moveTo(x + i + off, y + h); ctx.lineTo(x + i + off + h, y); ctx.stroke(); }
    ctx.restore();
  }
  function shuffledRoster() {
    const a = BOSS_ROSTER.map((b) => b.id);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  let uiButtons = [];
  let focus = -1, lastUiState = null;   // keyboard focus for menus/draft
  let listScroll = 0;                   // scroll offset for scrollable screens
  let uiT = 0, enterT = 0, lastUiDt = 1 / 60, eIn = 1, winT = 0;   // menu ambient clock, time-since-screen-opened, last frame dt, entrance ease, ending cinematic clock
  let cgWasPlaying = false, continueT = 0;   // CrazyGames gameplay bracket + the rewarded-revive countdown
  const hoverAnim = {};                 // per-button hover progress (key -> 0..1), for hover juice
  const ez = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - (1 - t) * (1 - t); };   // ease-out
  let codexFilter = "all";              // ABILITIES tab: category filter
  let codexSort = "category";           // ...and sort mode (category | name | type)
  let bestiaryFilter = "all";           // INDEX tab: enemy category filter
  let codexTierView = {};               // id -> which tier (0=base) is being previewed on its card

  // ---- helpers ----
  function addShake(m) { const v = m * shakeScale; if (v > shake) shake = v; }
  function addZoom(p) { if (1 + p > zoom) zoom = 1 + p; }
  function addFlash(f) { if (f > flash) flash = f; }
  function triggerSlowmo() { slowmo = CONFIG.juice.parrySlowmo; }
  function addFloater(x, y, text, big, col) { floaters.push({ x, y, text, life: 0.8, big, col: col || "#000" }); }
  // a varied point in the left or right side band (not the exact same corner each time)
  function spawnSide() {
    return Math.random() < 0.5 ? 180 + Math.random() * 240 : (W - 180) - Math.random() * 240;
  }
  function nearestEnemy(x, y) {
    let best = null, bd = Infinity;
    for (const e of enemies) { if (e.dead) continue; const d = len(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  function fire(list, ev) { for (const f of list) f(ev); }
  function makeEv(x, y, enemy, cause) { return { player, enemies, fx: FX, x, y, enemy, cause, dealAoE, addFloater }; }
  // Aegis: feedback when a stored shield pip eats a hit (no HP lost, style kept)
  function onShieldAbsorb() {
    SFX.parry();
    FX.ring(player.x, player.y, 14, CONFIG.colors.armoredShield);
    addFloater(player.x, player.y - 30, "BLOCK", true, CONFIG.colors.armoredShield);
    addShake(CONFIG.juice.shakeSmall); hitStop = CONFIG.hitStop.small;
    if (run.mods.shieldBurst) { dealAoE(player.x, player.y, 145, 28); FX.ring(player.x, player.y, 18, CONFIG.colors.armoredShield); }   // Aegis T3
  }

  // a lobbed bomb / mine detonates: parried-back bombs hit enemies; otherwise the player
  function bombExplode(x, y, deflected) {
    const B = CONFIG.bomber;
    FX.explode(x, y, deflected ? CONFIG.colors.perfect : CONFIG.colors.bomber, deflected ? 1.5 : 1.2);
    addShake(CONFIG.juice.shakeBig); addFlash(CONFIG.juice.flashParry * (deflected ? 0.9 : 0.6)); SFX.boom();
    if (deflected) {
      dealAoE(x, y, B.blastRadius, B.blastDmg * 1.3);   // parried into a crowd = big payoff
    } else if (len(player.x - x, player.y - y) <= B.blastRadius + player.hw) {
      const r = player.takeDamage(B.blastDmg, x);
      if (r === "hit") { loseStyle(); SFX.hurt(); } else if (r === "absorbed") onShieldAbsorb();
    }
  }
  // area damage that does NOT re-fire onKill (prevents detonate/slam recursion)
  function dealAoE(cx, cy, radius, dmg) {
    for (const e of enemies) {
      if (e.dead) continue;
      if (len(e.x - cx, e.y - cy) <= radius + e.radius) {
        e.hit(dmg, e.x - cx, e.y - cy);
        FX.burst(e.x, e.y, e.x - cx, e.y - cy, 5, e.color);
        addFloater(e.x, e.y - 24, Math.round(dmg).toString(), false);
        if (e.dead) { addKillScore(); FX.death(e.x, e.y, CONFIG.juice.deathShards, e.color); }
      }
    }
  }

  // ---- score + "Attack Trick" style meter ----
  function addKillScore() {
    run.score += Math.round(CONFIG.run.scorePerKill * run.wave * run.mult * CONFIG.run.scoreMult * (run.scoreMod || 1));
    run.waveKills++;
  }
  function addStyle(kind) {
    const T = CONFIG.trick;
    let pts = T.pts[kind] || 2;
    if (kind !== run.lastTrick) pts *= T.variety;   // reward varied tricks
    run.lastTrick = kind;
    if (player) { player.lastTrickKind = kind; player.lastTrickT = run.runTime; }   // The Echo mirrors your last trick
    run.combo += pts;
    run.comboTimer = T.decay;
    const prevRank = run.rank;
    recomputeTrick();
    if (run.rank && run.rank !== prevRank && run.mult > 1) {   // climbed a tier
      rankPopT = 1; rankPopText = run.rank; SFX.rankup();
    }
    if (run.mult > run.wavePeak) run.wavePeak = run.mult;
  }
  function loseStyle() {
    run.combo *= (1 - CONFIG.trick.hitLoss);
    run.comboTimer = CONFIG.trick.decay * 0.5;
    recomputeTrick();
  }
  function recomputeTrick() {
    let m = 1, name = "";
    for (const t of CONFIG.trick.tiers) if (run.combo >= t.at) { m = t.mult; name = t.name; }
    run.mult = m; run.rank = name;
  }
  function updateTrick(dt) {
    if (run.comboTimer > 0) run.comboTimer -= dt;
    else if (run.combo > 0) {
      run.combo = Math.max(0, run.combo - CONFIG.trick.drainRate * dt);
      if (run.combo === 0) run.lastTrick = "";
      recomputeTrick();
    }
  }
  function fmtTime(s) {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return m + ":" + String(ss).padStart(2, "0");
  }
  // human-readable name for an enemy (variant + affixes), used by the Enemy Test labels
  function enemyLabel(e) {
    let name;
    if (e.kind === "support") name = { priest: "War Priest", herald: "Herald", mender: "Mender", anchor: "Anchor" }[e.supportType] || "Support";
    else if (e.kind === "wraith") name = "Wraith";
    else if (e.kind === "chimera") name = "Chimera";
    else if (e.kind === "armored") name = e.enraged ? "Armored*" : "Armored";
    else name = e.variantName || (e.kind.charAt(0).toUpperCase() + e.kind.slice(1));
    if (e.affixCount) name += " +" + e.affixCount;
    return name;
  }
  // a small badge over a buffed enemy showing WHICH support effect is on it (and its color)
  function drawBuffBadge(cx, cy, type) {
    const col = CONFIG.colors[type] || "#000";
    ctx.fillStyle = col; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 7.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff"; ctx.lineWidth = 1.6;
    if (type === "priest") {            // shield (protect + empower)
      ctx.beginPath(); ctx.moveTo(cx, cy - 4.5); ctx.lineTo(cx + 3.5, cy - 2); ctx.lineTo(cx + 3.5, cy + 1.5);
      ctx.lineTo(cx, cy + 4.5); ctx.lineTo(cx - 3.5, cy + 1.5); ctx.lineTo(cx - 3.5, cy - 2); ctx.closePath(); ctx.fill();
    } else if (type === "herald") {     // double chevron (haste)
      ctx.beginPath(); ctx.moveTo(cx - 4, cy - 3); ctx.lineTo(cx - 0.5, cy); ctx.lineTo(cx - 4, cy + 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 0.5, cy - 3); ctx.lineTo(cx + 4, cy); ctx.lineTo(cx + 0.5, cy + 3); ctx.stroke();
    } else if (type === "mender") {     // plus (heal)
      ctx.fillRect(cx - 1, cy - 4, 2, 8); ctx.fillRect(cx - 4, cy - 1, 8, 2);
    } else {                            // anchor: a ring (bound/shielded)
      ctx.beginPath(); ctx.arc(cx, cy, 3.8, 0, Math.PI * 2); ctx.stroke();
    }
  }
  function trickColor(mult) {
    const C = CONFIG.colors;
    if (mult >= 5) return C.perfect;
    if (mult >= 4) return C.charger;
    if (mult >= 3) return C.bomber;
    if (mult >= 2) return "#caa520";
    return "#888";
  }
  // Scatter Parry: split a deflected shot into 3 weaker, bouncing shards
  // (speed is capped so the shards stay readable instead of pinballing wildly)
  function spawnSplitShards(p) {
    const spd = Math.min(len(p.vx, p.vy) || CONFIG.proj.speed, CONFIG.proj.speed * 1.3);
    const baseAng = Math.atan2(p.vy, p.vx);
    p.deflectDmg = Math.max(6, Math.round(p.deflectDmg * 0.4));
    p.bounces = 2;
    p.vx = Math.cos(baseAng) * spd; p.vy = Math.sin(baseAng) * spd;   // cap the parent too
    for (const off of [-0.34, 0.34]) {
      const a = baseAng + off;
      const q = new Projectile(p.x, p.y, Math.cos(a) * spd, Math.sin(a) * spd);
      q.deflect(Math.cos(a), Math.sin(a), spd, p.perfect);
      q.vx = Math.cos(a) * spd; q.vy = Math.sin(a) * spd;
      q.deflectDmg = p.deflectDmg;
      q.bounces = 2;
      if (p.pierce) { q.pierce = true; q.pierced = new Set(); }
      projectiles.push(q);
    }
  }

  // ---- run / wave management ----
  function startRun(mode, diff) {
    restoreConfig();
    const weapon = applyWeapon(selWeapon);   // weapon defines base feel; shop/upgrades stack on top
    applySettings();
    const d = CONFIG.difficulties.find((x) => x.id === diff) || CONFIG.difficulties[0];
    const dm = d.mods || {};
    CONFIG.player.dmgTakenMult *= (dm.dmg || 1);   // difficulty: harder = every hit lands heavier (uniform)
    player = new Player(W * 0.5, CONFIG.world.groundY - 60);
    player.oneHit = d.oneHit;
    blade = new Blade();
    blade.throwType = weapon.throwType;
    blade.model = weapon.model || "sword";
    enemies = []; projectiles = []; floaters = [];
    hitStop = 0; shake = 0; FX.reset();
    timeScale = 1; slowmo = 0; zoom = 1; flash = 0; bannerT = 0; dashGhostT = 0; throwCd = 0;
    loadStage(0); stageBannerT = 0; loreT = 0;   // fresh biome 0 (campaign re-stages per wave below)
    run = {
      mode, diff, wave: 0, score: 0, mods: newMods(),
      spawnQueue: [], spawnTimer: 0, waveActive: false, clearTimer: -1,
      runTime: 0, waveTime: 0, waveKills: 0, wavePeak: 1, waveLog: [],
      combo: 0, comboTimer: 0, mult: 1, rank: "", lastTrick: "", lifestealCd: 0,
      specialBlock: -1, specialsOffered: 0,   // draft guarantee: ≥2 Specials offered per stage
      adRevived: false,   // CrazyGames: the one-time rewarded-ad revive is still available
      coinMod: dm.coin || 1, scoreMod: dm.score || 1,   // difficulty: risk = reward
      diffHp: dm.hp || 1, diffCount: dm.count || 1,      // difficulty: enemy toughness + density
    };
    if (mode === "bossonly") {   // boss gauntlet: chosen boss first, then a shuffled cycle of the rest
      run.bossOrder = shuffledRoster();
      if (selBoss !== "shuffle") { run.bossOrder = run.bossOrder.filter((id) => id !== selBoss); run.bossOrder.unshift(selBoss); }
      run.bossIdx = 0; run.bossesBeaten = 0;
      run.curBoss = run.bossOrder[0]; loadStage(bossBiome(run.curBoss));   // open in the first boss's home biome
    } else if (mode === "gauntlet") {   // Endless + Bosses: a shuffled boss cycle punctuating the waves
      run.bossOrder = shuffledRoster(); run.bossIdx = 0; run.bossesBeaten = 0;
    }
    META.apply({ player, blade, mods: run.mods });
    startNextWave();
    if (mode === "campaign") showLore(CAMPAIGN_INTRO, "THE TEAR", 11);   // the opening beat
    state = "playing";
    requestLock();
  }

  function modeWaves(mode) { const m = CONFIG.modes.find((x) => x.id === mode); return (m && m.waves) || 0; }

  // effective wave for content gating — the sandbox unlocks the whole roster at once
  function contentWave() { return (run && run.mode === "sandbox") ? 99 : run.wave; }

  // weighted enemy pick; new types unlock as waves progress
  function pickEnemyType(wave) {
    // campaign: each biome fields its own curated roster, staggered by the wave WITHIN the stage
    if (run && run.mode === "campaign") {
      const st = stageAt(stageIndex);
      if (st.pool && st.pool.length) {
        const lw = ((run.wave - 1) % 10) + 1;
        const elig = st.pool.filter((p) => lw >= (p[2] || 1));
        const list = elig.length ? elig : st.pool;
        let total = 0; for (const p of list) total += p[1];
        let r = Math.random() * total;
        for (const p of list) { if ((r -= p[1]) <= 0) return p[0]; }
        return list[0][0];
      }
    }
    const w = (run && run.mode === "sandbox") ? 99 : wave;
    const pool = [["charger", 1]];
    if (w >= 2) pool.push(["ranged", 0.6]);
    if (w >= 3) pool.push(["flyer", 0.5]);
    if (w >= 4) pool.push(["bomber", 0.4]);
    if (w >= 5) pool.push(["armored", 0.35]);
    // rarer support + special types arrive later (and all at once in the sandbox)
    if (w >= 6) { pool.push(["priest", 0.18]); pool.push(["mender", 0.16]); }
    if (w >= 7) { pool.push(["herald", 0.16]); pool.push(["anchor", 0.14]); pool.push(["wraith", 0.2]); }
    if (w >= 8) pool.push(["chimera", 0.16]);
    let total = 0; for (const p of pool) total += p[1];
    let r = Math.random() * total;
    for (const [t, w2] of pool) { if ((r -= w2) <= 0) return t; }
    return "charger";
  }

  function startNextWave() {
    run.wave++;
    const R = CONFIG.run;
    if (run.mode === "campaign") {
      // 9 waves of enemies then a boss, per stage; biome swaps on each new stage
      const ns = Math.floor((run.wave - 1) / 10);
      if (run.wave === 1 || ns !== stageIndex) {
        loadStage(ns);
        stageBannerT = 3.0; stageName = stageAt(ns).name;
      }
      run.isBossWave = (run.wave % 10 === 0);
      run.stage = ns;
    } else {
      const m = CONFIG.modes.find((x) => x.id === run.mode);
      const total = modeWaves(run.mode);
      run.isBossWave = (m && m.bossOnly) || (total > 0 && run.wave > total);
      if (run.mode === "gauntlet") run.isBossWave = (run.wave % 8 === 0);   // a full boss every 8 waves
    }
    // ---- Endless 2.0: cycle biomes, flag horde windows + mini-boss / boss waves ----
    run.horde = false; run.miniBoss = null; run.waveTag = "";
    const endlessLike = run.mode === "endless" || run.mode === "gauntlet";
    if (endlessLike) {
      const bi = Math.floor((run.wave - 1) / 5);   // a fresh biome every 5 waves
      if (run.wave === 1 || bi !== run._biomeIdx) {
        run._biomeIdx = bi; loadStage(bi);          // stageAt() cycles the 5 biomes via modulo
        stageBannerT = 2.6; stageName = stageAt(bi).name; run.stage = bi;
      }
      if (run.isBossWave) {   // gauntlet: pick the next boss in the cycle (re-shuffle on wrap)
        if (run.bossIdx >= run.bossOrder.length) { run.bossOrder = shuffledRoster(); run.bossIdx = 0; }
        run.curBoss = run.bossOrder[run.bossIdx]; run.bossIdx++;
        run.waveTag = (BOSS_ROSTER.find((b) => b.id === run.curBoss) || {}).name || "";
      } else if (run.mode === "endless" && run.wave > 1 && run.wave % 10 === 0) {
        run.miniBoss = pickMiniBoss(); run.waveTag = "MINI-BOSS  ·  " + (BOSS_ROSTER.find((b) => b.id === run.miniBoss) || {}).name;
      } else if (run.wave > 3 && run.wave % 5 === 0) { run.horde = true; run.waveTag = "⚠  HORDE"; }
    }
    if (run.mode === "bossonly") {   // pick the next boss in the gauntlet (re-shuffle each cycle)
      if (run.bossIdx >= run.bossOrder.length) { run.bossOrder = shuffledRoster(); run.bossIdx = 0; }
      run.curBoss = run.bossOrder[run.bossIdx]; run.bossIdx++;
      loadStage(bossBiome(run.curBoss));   // each boss in its home biome (fresh arena: restore platforms, clear hazards)
      stageBannerT = 2.4; stageName = (BOSS_ROSTER.find((b) => b.id === run.curBoss) || {}).name || "BOSS";
    }
    run.spawnQueue = [];
    if (run.isBossWave) {
      run.spawnQueue.push({ type: "boss" });
    } else {
      let count, hpScale, dmgScale = 1;
      if (run.mode === "campaign") {
        // gentle within a stage, a clear step up between stages (see CONFIG.run notes)
        const stage = Math.floor((run.wave - 1) / 10);
        const lw = ((run.wave - 1) % 10) + 1;
        count = R.firstWaveCount + Math.floor((lw - 1) * R.countPerWave) + stage * R.stageCountStep;
        hpScale = (1 + stage * R.stageHpStep) * (1 + (lw - 1) * R.inStageHp);
        dmgScale = (1 + stage * R.stageDmgStep) * (1 + (lw - 1) * R.inStageDmg);
      } else {
        count = R.firstWaveCount + Math.floor((run.wave - 1) * R.countPerWave);
        hpScale = 1 + (run.wave - 1) * R.hpScalePerWave;
        if (run.mode === "endless" || run.mode === "gauntlet") {
          count += Math.floor(Math.max(0, run.wave - 8) * 0.4);     // density accelerates the deeper you go
          if (run.miniBoss) count = Math.floor(count * 0.5);         // a mini-boss wave fields fewer minions
          if (run.horde) { count = Math.round(count * 1.8); hpScale *= 0.6; dmgScale = 0.9; }   // a wall of weaker bodies
        }
      }
      // difficulty: scale enemy toughness + density
      hpScale *= (run.diffHp || 1);
      count = Math.max(1, Math.round(count * (run.diffCount || 1)));
      // a mini-boss leads its wave (Endless)
      if (run.miniBoss) run.spawnQueue.push({ type: "miniboss", bossId: run.miniBoss });
      // in campaign, only inject authored sub-types whose base type belongs to this biome
      const stTypes = (run.mode === "campaign" && stageAt(stageIndex).pool) ? stageAt(stageIndex).pool.map((p) => p[0]) : null;
      for (let i = 0; i < count; i++) {
        if (run.wave >= 4 && Math.random() < 0.15) {       // occasional authored sub-type
          const cand = stTypes ? PRESETS.filter((p) => stTypes.includes(p.type)) : PRESETS;
          if (cand.length) { const p = cand[Math.floor(Math.random() * cand.length)]; run.spawnQueue.push({ type: p.type, hpScale, dmgScale, preset: p }); continue; }
        }
        run.spawnQueue.push({ type: pickEnemyType(run.wave), hpScale, dmgScale });   // affixes rolled at spawn
      }
    }
    // attack kinds present this wave — a Chimera adopts these
    const attackKinds = ["charger", "ranged", "flyer", "bomber", "armored"];
    run.waveKinds = Array.from(new Set(run.spawnQueue.map((s) => s.type).filter((t) => attackKinds.includes(t))));
    run.spawnTimer = R.startDelay;
    run.waveActive = true;
    run.waveTime = 0; run.waveKills = 0; run.wavePeak = run.mult;
    bannerT = CONFIG.juice.bannerTime;
    SFX.wave();
  }

  // ground spawn point: sometimes atop a one-way platform for variety
  function groundSpawn(hh) {
    const plats = platforms.filter((p) => p.oneway);
    if (plats.length && Math.random() < 0.4) {
      const p = plats[Math.floor(Math.random() * plats.length)];
      return { x: p.x + 24 + Math.random() * (p.w - 48), y: p.y - hh };
    }
    return { x: spawnSide(), y: CONFIG.world.groundY - 80 };
  }

  // build a boss instance by id (shared by campaign bosses, the gauntlet, and Endless mini-bosses)
  function bossById(id) {
    if (id === "source") return new Source(W / 2, CONFIG.world.groundY - 300);
    if (id === "echo") return new Echo(W / 2, CONFIG.world.groundY - CONFIG.echo.h / 2);
    if (id === "aldric") return new Aldric(W / 2, CONFIG.world.groundY - CONFIG.aldric.h / 2);
    if (id === "colossus") return new Colossus(W / 2, CONFIG.world.groundY - CONFIG.colossus.h / 2);
    if (id === "warden") return new Warden(W / 2, CONFIG.world.groundY - 140);
    return new Boss(W / 2, CONFIG.world.groundY - 140);   // unbuilt -> placeholder
  }
  // boss test: each boss fights in its home biome (the stage whose .boss matches it)
  function bossBiome(id) { const i = STAGES.findIndex((s) => s.boss === id); return i < 0 ? 0 : i; }
  // pick the boss for the current context: the campaign stage's named boss, else the Warden
  function makeBoss() {
    return bossById((run.mode === "campaign") ? stageAt(stageIndex).boss : (run.mode === "bossonly" || run.mode === "gauntlet") ? run.curBoss : "warden");
  }
  // Endless mini-bosses: any built campaign boss except the finale (the Source stays special)
  const MINI_BOSSES = ["warden", "colossus", "aldric", "echo"];
  function pickMiniBoss() { return MINI_BOSSES[Math.floor(Math.random() * MINI_BOSSES.length)]; }

  function spawnOne(spec) {
    let e;
    switch (spec.type) {
      case "ranged":  e = new Ranged(0, 0); break;
      case "flyer":   e = new Flyer(spawnSide(), 200); break;
      case "bomber":  e = new Bomber(0, 0); break;
      case "armored": e = new Armored(0, 0); break;
      case "boss":    e = makeBoss(); break;
      case "miniboss": e = bossById(spec.bossId); e.hp *= 0.4; e.maxHp *= 0.4; e.isMiniBoss = true; e.bossName = "◇ " + e.bossName; break;
      case "priest": case "herald": case "mender": case "anchor": e = new Support(0, 0, spec.type); break;
      case "wraith":  e = new Wraith(spawnSide(), 220); break;
      case "chimera": e = new Chimera(0, 0); break;
      default:        e = new Charger(0, 0);
    }
    if (spec.type !== "boss" && spec.type !== "miniboss") {
      if (spec.hpScale) { e.hp *= spec.hpScale; e.maxHp *= spec.hpScale; }
      if (spec.dmgScale && spec.dmgScale !== 1) { e.contactDmg *= spec.dmgScale; e.dmgScale = spec.dmgScale; }
      // presets are their own identity; otherwise pick a family variant + roll affixes
      if (spec.preset) applyPreset(e, spec.preset);
      else { applyVariant(e, spec.variant || rollVariant(e.kind, contentWave())); rollAffixes(e, run.wave); }
      if (spec.type !== "flyer" && spec.type !== "wraith") { const pos = groundSpawn(e.hh); e.x = pos.x; e.y = pos.y; }
      // ground enemies can pathfind across platforms — but only ~60% actually climb, with
      // a varied aptitude, so a perched player is pressured without an instant jump swarm
      if (e.kind === "charger" || e.kind === "ranged" || e.kind === "bomber" || e.kind === "armored") {
        e.canClimb = true; e.climber = Math.random() < 0.6; e.climbApt = Math.random();
      }
      // Chimera inherits the attack repertoire of the enemy types present in its wave
      if (e.kind === "chimera") e.moves = (run.waveKinds && run.waveKinds.length) ? run.waveKinds.slice() : ["charger"];
    } else {   // boss
      if (run.mode === "campaign" && stageIndex > 0 && !e.bossName) { const s = 1 + stageIndex * 0.6; e.hp *= s; e.maxHp *= s; }   // placeholder bosses scale by stage
      else if (run.mode === "bossonly" || run.mode === "gauntlet") {
        // scale with the WAVE number (not just bosses-beaten) so a deep-run boss is a deep-run
        // threat — previously a wave-50 boss was barely tougher than the first.
        const s = 1 + (run.wave || 1) * 0.12 + (run.bossesBeaten || 0) * 0.06;
        e.hp *= s; e.maxHp *= s;
        if (typeof e.contactDmg === "number") e.contactDmg *= 1 + (run.wave || 1) * 0.05;   // stays threatening, not just spongy
      }
    }
    e.hpDisplay = e.hp;
    e.spawnT = 0.35;   // brief materialize so spawns read as spawns (not teleports)
    enemies.push(e);
  }

  // hammer "lob" throw: a shockwave + stun where the thrown blade lands
  function lobExplode(x, y) {
    const T = CONFIG.blade.throw;
    FX.explode(x, y, CONFIG.colors.slam, 1.25);
    addShake(CONFIG.juice.shakeBig); addZoom(CONFIG.juice.zoomBig); SFX.boom();
    dealAoE(x, y, T.lobRadius, Math.round(blade.throwDmg * 0.8));
    for (const e of enemies) if (!e.dead && len(e.x - x, e.y - y) <= T.lobRadius + e.radius) e.stun = Math.max(e.stun, T.lobStun);
  }

  function bomberBlast(e) {
    const C = CONFIG.bomber;
    FX.explode(e.x, e.y, CONFIG.colors.bomber, 1.35);
    addShake(CONFIG.juice.shakeBig); addFlash(CONFIG.juice.flashParry * 0.5); SFX.boom();
    dealAoE(e.x, e.y, C.blastRadius, C.blastDmg);
    if (len(player.x - e.x, player.y - e.y) <= C.blastRadius + player.hw) {
      { const r = player.takeDamage(C.blastDmg, e.x);
        if (r === "hit") { loseStyle(); SFX.hurt(); } else if (r === "absorbed") onShieldAbsorb(); }
    }
  }

  function updateWave(dt) {
    const R = CONFIG.run;
    // pack more enemies on-screen the deeper you go (a horde, not a trickle)
    let cap = R.maxConcurrent;
    if (run.mode === "campaign") cap = Math.min(R.maxConcurrentCap, R.maxConcurrent + Math.floor((run.wave - 1) / 10) * R.concurrentPerStage);
    else if (run.mode === "endless" || run.mode === "gauntlet") cap = Math.min(R.maxConcurrentCap + 3, R.maxConcurrent + Math.floor(run.wave / 7) + (run.horde ? 3 : 0));
    if (run.spawnQueue.length && enemies.length < cap) {
      if (enemies.length === 0 && run.spawnTimer > 0.3) run.spawnTimer = 0.3; // short beat (not an instant pop) when the screen empties
      run.spawnTimer -= dt;
      if (run.spawnTimer <= 0) { spawnOne(run.spawnQueue.shift()); run.spawnTimer = R.spawnInterval; }
    }
    // wave cleared -> wait a beat (let death FX finish) before the draft
    if (run.waveActive && run.spawnQueue.length === 0 && enemies.length === 0) {
      run.waveActive = false;
      Backdrop.bloom(currentStage.accent, 0.14, 0.8);   // wave cleared: a breath of light
      run.waveLog.push({ wave: run.isBossWave ? "BOSS" : run.wave, time: run.waveTime, kills: run.waveKills, peak: run.wavePeak });
      if (run.isBossWave) {
        if (run.mode === "campaign" && stageIndex >= STAGES.length - 1) { winRun(true); return; }   // final biome cleared -> the ending
        if (run.mode === "campaign" || run.mode === "bossonly" || run.mode === "gauntlet") {
          if (!player.oneHit) player.heal(R.healEachWave * 2 + (run.mods.waveHeal || 0));   // a boss kill is a milestone, not the end
          if (run.mode === "bossonly" || run.mode === "gauntlet") run.bossesBeaten = (run.bossesBeaten || 0) + 1;
          run.bossCleared = true;
          run.clearTimer = R.waveClearPause * 1.6;
        } else { winRun(); return; }   // the Waves+Boss mode still ends in victory
      } else {
        if (!player.oneHit) player.heal(R.healEachWave + (run.mods.waveHeal || 0));   // + Bulwark
        run.clearTimer = R.waveClearPause;
      }
    }
    if (run.clearTimer > 0) {
      run.clearTimer -= dt;
      if (run.clearTimer <= 0) {
        run.clearTimer = -1;
        document.exitPointerLock();   // free the cursor so the menu is clickable
        if (run.bossCleared) {
          run.bossCleared = false;
          const ups = availableTierUps(run.mods);
          for (let i = ups.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ups[i], ups[j]] = [ups[j], ups[i]]; }
          if (ups.length) { tierChoices = ups.slice(0, 3); state = "tierup"; }
          else { draftChoices = buildDraft(); state = "draft"; }   // nothing to evolve -> normal draft
        } else {
          draftChoices = buildDraft();
          state = "draft";
        }
      }
    }
  }

  function endRun() {
    // log the in-progress wave the player died on
    if (run.waveActive) run.waveLog.push({ wave: run.wave, time: run.waveTime, kills: run.waveKills, peak: run.wavePeak, died: true });
    const best = getBest(run.mode, run.diff);
    const isNew = saveBest(run.mode, run.diff, run.wave, run.score, run.runTime);
    const earned = awardCoins(run.score);
    overInfo = { wave: run.wave, score: run.score, time: run.runTime, log: run.waveLog.slice(), best: getBest(run.mode, run.diff), isNew, earned, coins: META.coins() };
    state = "gameover";
    document.exitPointerLock();
    SFX.gameover();
  }

  function winRun(campaign) {
    const isNew = saveBest(run.mode, run.diff, run.wave, run.score, run.runTime);
    const earned = awardCoins(run.score);
    overInfo = { wave: run.wave, score: run.score, time: run.runTime, log: run.waveLog.slice(), best: getBest(run.mode, run.diff), isNew, win: true, campaign: !!campaign, earned, coins: META.coins() };
    state = "win";
    document.exitPointerLock();
    SFX.wave();
    CG.happytime();   // CrazyGames: victory is a highlight
  }

  // restart after a run ends — a natural break, so show a midgame ad first (no-op off CrazyGames)
  function retryRun() { CG.midgame(() => startRun(run.mode, run.diff)); }

  // ---- combat step (the PLAYING simulation) ----
  const STEP = 1 / 120;
  let acc = 0, last = performance.now();

  // Support family: each frame reset aura flags, then let every support re-apply its
  // effect to nearby allies (it needs the live enemy list, so it lives here, not in the class)
  function updateSupports(dt) {
    for (const e of enemies) { e.auraDR = 1; e.auraDmg = 1; e.auraSpeed = 1; e.auraHaste = 1; e.tetherDR = 1; e.anchored = false; e.buffs = []; }
    const S = CONFIG.support;
    for (const s of enemies) {
      if (s.kind !== "support") continue;
      s.links = [];
      if (s.dead || s.spawnT > 0 || s.stun > 0) continue;
      const t = s.supportType;
      if (t === "priest" || t === "herald") {
        for (const e of enemies) {
          if (e === s || e.dead || e.kind === "support") continue;
          if (len(e.x - s.x, e.y - s.y) <= s.range + e.radius) {
            if (t === "priest") { e.auraDR = Math.min(e.auraDR, S.drMult); e.auraDmg = Math.max(e.auraDmg, S.dmgBuff); }   // protect AND empower
            else { e.auraSpeed = Math.max(e.auraSpeed, S.speedBuff); e.auraHaste = Math.max(e.auraHaste, S.hasteBuff); }    // move AND attack faster
            e.buffs.push(t); s.links.push(e);
          }
        }
      } else if (t === "mender") {
        let best = null, bestHp = Infinity;
        for (const e of enemies) {
          if (e === s || e.dead || e.kind === "support" || e.hp >= e.maxHp) continue;
          if (len(e.x - s.x, e.y - s.y) > s.range * 1.3) continue;
          if (e.hp < bestHp) { bestHp = e.hp; best = e; }
        }
        if (best) { best.hp = Math.min(best.maxHp, best.hp + S.menderRate * dt); best.buffs.push("mender"); s.links = [best]; }
      } else if (t === "anchor") {
        // bond ONCE to the strongest ally anywhere; shared fate (ally dies -> Anchor dies,
        // but not the reverse). The bonded ally gets a shield bubble, regen, and is immovable.
        if (s.bonded && s.bonded.dead) {
          s.dead = true;   // the Anchor cannot outlive what it's anchoring
          FX.ring(s.x, s.y, 16, s.color); FX.burst(s.x, s.y, 0, -1, 8, s.color);
          continue;
        }
        if (!s.bonded) {
          let best = null, bestHp = -1;
          for (const e of enemies) {
            if (e === s || e.dead || e.kind === "support" || e.kind === "wraith" || e.spawnT > 0) continue;
            if (e.maxHp > bestHp) { bestHp = e.maxHp; best = e; }
          }
          s.bonded = best;
        }
        if (s.bonded && !s.bonded.dead) {
          const a = s.bonded;
          a.tetherDR = Math.min(a.tetherDR, S.anchorDR);
          a.hp = Math.min(a.maxHp, a.hp + S.anchorRegen * dt);
          a.anchored = true; a.buffs.push("anchor");
          s.links = [a];
        }
      }
    }
  }

  // Sludge puddles + Geomancer walls: age them out, spawn requested walls, and slow the
  // player while they're standing in mud.
  function updateZonesWalls(dt) {
    for (const z of slowZones) z.life -= dt;
    slowZones = slowZones.filter((z) => z.life > 0);
    for (let i = tempWalls.length - 1; i >= 0; i--) {
      tempWalls[i].life -= dt;
      if (tempWalls[i].life <= 0) {
        const idx = platforms.indexOf(tempWalls[i]); if (idx >= 0) platforms.splice(idx, 1);
        tempWalls.splice(i, 1);
      }
    }
    // a Geomancer that finished channeling raises its wall
    for (const e of enemies) {
      if (!e.wallRequest) continue;
      const X = CONFIG.exotic;
      const w = { x: e.wallRequest.x - X.geoWallW / 2, y: CONFIG.world.groundY - X.geoWallH, w: X.geoWallW, h: X.geoWallH, wall: true, life: X.geoWallLife, maxLife: X.geoWallLife };
      platforms.push(w); tempWalls.push(w);
      FX.ring(e.wallRequest.x, CONFIG.world.groundY, 18, CONFIG.colors.sludge);
      e.wallRequest = null;
    }
    // slow the player in mud
    let slow = 1; const feet = player.y + player.hh;
    for (const z of slowZones) if (Math.abs(player.x - z.x) < z.r && feet >= z.y - 12) slow = Math.min(slow, CONFIG.exotic.sludgeSlow);
    player.slowMult = slow;
  }

  function stepPlaying(dt) {
    // Flow Guard: damage reduction while the trick rank is high (refreshed each step)
    player.flowDR = (run.mods.flowGuard && run.mult >= CONFIG.resilience.flowGuardTier)
      ? CONFIG.resilience.flowGuardMult : 1;
    if (run.mods.flowRegen && run.mult >= 3) player.heal(7 * dt);   // Flow Guard T3: regen while BRUTAL+
    if (run.lifestealCd > 0) run.lifestealCd -= dt;
    if (throwCd > 0) throwCd -= dt;
    updateZonesWalls(dt);   // mud puddles + Geomancer walls; sets player.slowMult
    // faster while unarmed (blade thrown); Tempo adds haste during its window
    player.moveBoost = ((blade.state !== "held") ? CONFIG.player.thrownMoveBoost : 1) * (player.tempoT > 0 ? 1.18 : 1);
    player.update(dt, platforms);
    const wasReturning = blade.state === "returning";
    blade.update(dt, player, platforms);
    if (wasReturning && blade.state === "held" && run.mods.stormBurst) {   // Storm Recall T3: shockwave on catch
      dealAoE(player.x, player.y, 155, 30); FX.ring(player.x, player.y, 15, CONFIG.colors.perfect);
      addShake(CONFIG.juice.shakeBig); SFX.slam();
    }
    if (blade.embeddedNew) { blade.embeddedNew = false; if (blade.throwType === "lob") lobExplode(blade.x, blade.y); }

    // audio cadence: dash start + swing whoosh
    if (player.dashTimer > 0 && !wasDashing) SFX.dash();
    // Concussive Dash: a dash that just ENDED slams out a shockwave
    if (wasDashing && player.dashTimer <= 0 && run.mods.concussive) {
      const R = 155; let caught = 0;
      for (const e of enemies) { if (!e.dead && len(e.x - player.x, e.y - player.y) < R) caught++; }
      dealAoE(player.x, player.y, R - 5, run.mods.concussive);
      for (const e of enemies) {
        if (e.dead || len(e.x - player.x, e.y - player.y) >= R) continue;
        if (run.mods.concStun && !e.isBoss) e.stun = Math.max(e.stun, 0.5);
        const dx = e.x - player.x, dy = e.y - player.y, m = len(dx, dy) || 1;
        e.vx += (dx / m) * 520 / e.weight; e.vy += (dy / m) * 300 / e.weight - 110;
      }
      if (caught > 0) { FX.ring(player.x, player.y, 13, CONFIG.colors.slam); addShake(CONFIG.juice.shakeSmall); SFX.slam(); }
      if (run.mods.concRefund && caught >= 2) { player.dashCharges = player.maxDashCharges; player.dashCd = 0; }
    }
    wasDashing = player.dashTimer > 0;
    // one swish per swing: trigger on crossing into a fast swing, reset when it slows (hysteresis)
    if (blade.state === "held" && blade.tipSpeed > 1500) {
      if (!wasSwinging) { SFX.swing(blade.tipSpeed); wasSwinging = true; }
    } else if (blade.tipSpeed < 900) {
      wasSwinging = false;
    }

    // dash afterimages (+ Phantom Dash ability damage)
    if (player.dashTimer > 0) {
      dashGhostT -= dt;
      if (dashGhostT <= 0) { FX.ghost(player.x, player.y, player.hw, player.hh, run.mods.cinder ? CONFIG.colors.slam : null); dashGhostT = CONFIG.juice.dashGhostInterval; }
      // Cinder Trail: a streaming wake of fire behind the dash
      if (run.mods.cinder) { FX.ember(player.x, player.y - player.hh * 0.3); FX.ember(player.x, player.y + player.hh * 0.2); FX.ember(player.x, player.y); }
      if (run.mods.phantomDash) {
        for (const e of enemies) {
          if (e.dead || e.hitCd > 0) continue;
          if (aabbOverlap(player.x, player.y, player.hw, player.hh, e.x, e.y, e.hw, e.hh)) {
            e.hit(run.mods.phantomDash, player.dashX || 1, player.dashY);
            FX.burst(e.x, e.y, player.dashX, player.dashY, 5);
            addFloater(e.x, e.y - 24, Math.round(run.mods.phantomDash).toString(), false);
            addStyle("hit");
            if (e.dead) { onKill(e); if (run.mods.phantomRefund) { player.dashCharges = player.maxDashCharges; player.dashCd = 0; } }   // Phantom Dash T3
          }
        }
      }
      // Cinder Trail: dashing ignites enemies you pass through (BURN)
      if (run.mods.cinder) {
        for (const e of enemies) {
          if (e.dead) continue;
          if (aabbOverlap(player.x, player.y, player.hw + 6, player.hh + 6, e.x, e.y, e.hw, e.hh)) {
            if (e.burnT <= 0) FX.burst(e.x, e.y, 0, -1, 3, CONFIG.colors.slam);
            e.applyBurn();
          }
        }
      }
      // Phase Step: dashing (with i-frames) through a shot deflects it back
      if (run.mods.phaseStep && player.dashIframe > 0) {
        for (const p of projectiles) {
          if (p.dead || p.deflected) continue;
          if (aabbOverlap(p.x, p.y, p.r, p.r, player.x, player.y, player.hw, player.hh)) {
            const spd = Math.max(len(p.vx, p.vy), CONFIG.proj.speed) * CONFIG.blade.deflectBoost;
            p.deflect(player.dashX || player.facing, player.dashY, spd, false);
            FX.burst(p.x, p.y, player.dashX, player.dashY, 6, CONFIG.colors.deflected);
            addFloater(p.x, p.y - 16, "phase!", false, CONFIG.colors.deflected);
            addStyle("deflect"); SFX.deflect();
          }
        }
      }
    } else dashGhostT = 0;

    // landing dust + thud when arriving on the ground from a real fall
    if (player.onGround && !wasOnGround && player.vy >= 0) {
      const feet = player.y + player.hh;
      FX.burst(player.x, feet, 0, -1, 5);
      SFX.land();
    }
    wasOnGround = player.onGround;

    if (Input.consumeThrow()) {
      if (blade.state === "held") {
        if (throwCd <= 0 && blade.throwBlade()) { throwCd = 0.5; FX.burst(blade.x, blade.y, blade.vx, blade.vy, 6); addShake(CONFIG.juice.shakeSmall); SFX.throwBlade(); }
      } else {
        const r = blade.tryRecall(player);
        const hand = blade.handPos(player);
        if (r === "recalled") { FX.ring(blade.x, blade.y, 8); addShake(CONFIG.juice.shakeSmall); SFX.recall(); }
        else if (r === "toofar") addFloater(hand.x, hand.y - 40, "too far", false);
      }
    }

    updateWave(dt);
    for (const e of enemies) {
      if (e.spawnT > 0) { e.spawnT -= dt; continue; }   // materializing: hold still
      if (e.stun > 0) { e.stun -= dt; continue; }        // stunned (hammer lob / guard break): frozen
      e.update(dt, platforms, player, projectiles);
    }
    updateSupports(dt);   // apply War Priest / Herald / Mender / Anchor effects to allies

    // ---- status effects: tick bleed/burn, mark decay, and credit DoT kills ----
    for (const e of enemies) {
      if (e.dead || e.spawnT > 0) continue;
      e.slowStatus = (run.mods.cinderSlow && e.burnT > 0) ? 0.65 : 1;   // Cinder T2 slow
      if (e.bleedStacks <= 0 && e.burnT <= 0 && e.markT <= 0) continue;
      e.tickStatus(dt);
      e._stFx -= dt;
      if (e._stFx <= 0) {
        e._stFx = 0.05;
        if (e.burnT > 0) { FX.ember(e.x, e.y); FX.ember(e.x, e.y - e.hh * 0.4); }
        if (e.bleedStacks > 0) { FX.drip(e.x, e.y + e.hh * 0.35); if (e.bleedStacks > 2) FX.drip(e.x + (Math.random() - 0.5) * e.hw, e.y + e.hh * 0.2); }
      }
      if (e.dead) onKill(e, "skill");   // a bleed/burn kill is a skill kill (you set it up)
    }

    // boss floor hazards: sustained damage you must keep moving to avoid (off-pulse fire is safe)
    const bossZ = enemies.find((e) => e.isBoss && e.zones && e.zones.length);
    if (bossZ) {
      const Wc = CONFIG.warden, half = Wc.zoneW / 2;
      const onFloor = player.y + player.hh >= CONFIG.world.groundY - 8;
      player.hazardT -= dt;
      let inZone = false;
      for (const z of bossZ.zones) if (onFloor && z.on !== false && Math.abs(player.x - z.x) < half) inZone = true;
      if (inZone && player.hazardT <= 0 && !player.invulnerable) {
        player.hp = Math.max(0, player.hp - Wc.zoneTick * CONFIG.player.dmgTakenMult * player.flowDR);
        player.hazardT = Wc.zoneTickCd; SFX.hurt(); loseStyle();
      }
    }
    // Aldric scripted logic: the fake-death adds + revive
    const aboss = enemies.find((e) => e.isBoss);
    if (aboss) {
      if (aboss.spawnAdds) {
        aboss.spawnAdds = false; run.bossAdds = [];
        for (let i = -1; i <= 1; i += 2) {
          const add = new Charger(clamp(aboss.x + i * 130, 60, W - 60), CONFIG.world.groundY - 22);
          add.behavior = "bull"; add.hp *= 2.2; add.maxHp = add.hp; add.hpDisplay = add.hp;
          add.speedMult *= 1.35; add.contactDmg *= 1.3; add.canClimb = true; add.climber = true; add.climbApt = 0.85; add.spawnT = 0.35;
          enemies.push(add); run.bossAdds.push(add);
        }
        addFloater(aboss.x, aboss.y - 90, aboss.downText || "NOT YET", true, CONFIG.colors.charger);
        addShake(CONFIG.juice.shakeBig); addFlash(CONFIG.juice.flashParry);   // the fake death: a beat that feels like the end
      }
      if (aboss.mode === "downed" && run.bossAdds && run.bossAdds.length && run.bossAdds.every((a) => a.dead)) {
        aboss.revive(); addFloater(aboss.x, aboss.y - 90, aboss.reviveText || "FRENZY!", true, CONFIG.colors.charger); addShake(CONFIG.juice.shakeBig); addFlash(CONFIG.juice.flashParry);
      }
      // The Echo: split into a mirroring clone, then it vanishes when the Echo turns invisible
      if (aboss.spawnClone) {
        aboss.spawnClone = false; run.echoClones = [];
        const cl = new Echo(clamp(aboss.x - aboss.facing * 160, 60, W - 60), aboss.y, true);
        cl.spawnT = 0.3; enemies.push(cl); run.echoClones.push(cl);
        addFloater(aboss.x, aboss.y - 70, "SPLIT", true, CONFIG.colors.perfect);
      }
      if (aboss.mode === "invert" && run.echoClones) { for (const c of run.echoClones) if (!c.dead) { c.dead = true; FX.ghost(c.x, c.y, c.hw, c.hh); } run.echoClones = null; }
    }
    // a spiked enemy slamming into the ground -> impact burst
    for (const e of enemies) {
      if (e.spiked && e.onGround) {
        e.spiked = false;
        const gy = e.y + e.hh;
        FX.ring(e.x, gy, 10, CONFIG.colors.slam); FX.burst(e.x, gy, 0, -1, 7, CONFIG.colors.slam);
        addShake(CONFIG.juice.shakeBig); SFX.slam();
      }
    }
    FX.update(dt);

    // held blade vs enemies (slam / launch + hooks)
    const baseDmg = blade.damageAt();
    // style -> damage: a higher trick rank makes every swing hit harder (capped)
    const styleMult = 1 + Math.min((run.mult - 1) * CONFIG.skill.styleDamage, CONFIG.skill.styleDamageMax);
    for (const e of enemies) {
      if (e.dead || e.hitCd > 0) continue;
      if (segCircle(blade.x, blade.y, blade.tipX, blade.tipY, e.x, e.y, e.radius + 4)) {
        // Wraith: the blade phases straight through — only a thrown blade or a deflected shot harms it
        if (e.immuneToBlade) {
          if (baseDmg > 0) { e.hitCd = 0.18; FX.burst(e.x, e.y, blade.tipVX, blade.tipVY, 4, e.color); }
          continue;
        }
        if (baseDmg > 0) {
          // armored: blocked unless the hit is fast enough / from the flank
          if (e.blocks(blade.tipX, blade.tipSpeed)) {
            const cp = segPointDist(blade.x, blade.y, blade.tipX, blade.tipY, e.x, e.y);
            FX.burst(cp.px, cp.py, e.x - blade.tipX, e.y - blade.tipY, 5, CONFIG.colors.armoredShield);
            addFloater(e.x, e.y - 26, "block", false, CONFIG.colors.armoredShield);
            e.hitCd = 0.12; hitStop = CONFIG.hitStop.small; SFX.deflect();
            continue;
          }
          // breaking a guard with a fast frontal hit staggers the armored enemy and
          // ENRAGES it: shield gone, faster and aggressive (angry, not crippled)
          if (e.cfg.breakSpeed && !e.enraged && Math.sign(blade.tipX - e.x) === e.guardSide && blade.tipSpeed >= e.cfg.breakSpeed) {
            e.stun = 0.8; e.enraged = true;
            FX.ring(e.x, e.y, 14, CONFIG.colors.armoredShield);
            addFloater(e.x, e.y - 30, "SHIELD BREAK", true, CONFIG.colors.armoredShield);
          }
          const Bl = CONFIG.blade;
          const isSlam = !player.onGround && blade.tipVY > Bl.slamMinDownSpeed;
          const isLaunch = blade.tipVY < -Bl.launchMinUpSpeed;
          // spike: slamming an enemy that's still airborne drives it hard into the ground
          const spike = isSlam && !e.onGround;
          // rising UPDRAFT: upward momentum (jump / up-dash) empowers the launch
          const riseF = isLaunch ? clamp(Math.max(0, -player.vy) / Bl.risingSpeedRef, 0, 1) : 0;
          const empowered = isLaunch && riseF > 0.45;
          // committed POWER SLAM: a fast descent empowers the slam (the mirror of the updraft)
          const descF = isSlam ? clamp(player.vy / Bl.slamPowerSpeed, 0, 1) : 0;
          const empSlam = isSlam && descF > Bl.slamEmpowerAt;
          let dmg = baseDmg * (isSlam ? Bl.slamMultiplier : 1);
          dmg *= styleMult;   // style -> damage
          if (isSlam) dmg *= 1 + descF * Bl.slamPowerBonus;       // fast descent = harder slam
          if (isLaunch) dmg *= 1 + riseF * Bl.risingDmgBonus;
          // spike damage scales with how high the enemy is + how hard you struck
          let heightF = 0, strikeF = 0;
          if (spike) {
            heightF = clamp(((CONFIG.world.groundY - e.hh) - e.y) / 400, 0, 1);
            strikeF = clamp(blade.tipSpeed / 4000, 0, 1);
            dmg *= 1 + heightF * 0.6 + strikeF * 0.3;
          }
          if (run.mods.berserk && player.hp < player.maxHp * 0.5) dmg *= 1.25;
          if (!player.onGround && run.mods.airBonus) dmg *= 1 + run.mods.airBonus;  // Air Superiority
          if (!player.onGround && run.mods.aerialRave) dmg *= 1 + Math.min(player.airTime * run.mods.aerialRave, CONFIG.skill.aerialRaveCap);  // Aerial Rave
          if (run.mods.slipstream && player.dashEndT > 0) dmg *= 1.35;   // Slipstream: hit harder just after a dash
          if (player.tempoT > 0 && run.mods.tempo) dmg *= 1 + run.mods.tempo * player.tempoStk;   // Tempo: post-parry surge
          dmg *= e.damageTakenMult();   // armored: reduced grounded, more airborne
          const big = isSlam || empowered || spike || dmg >= CONFIG.hitStop.threshold;
          e.hit(dmg, blade.tipVX, blade.tipVY);
          if (!e.anchored) {   // an anchored ally can't be spiked or launched (break the Anchor first)
            if (spike) { e.vy = (1000 + heightF * 800 + strikeF * 500) / e.weight; e.spiked = true; }
            else if (isLaunch) e.vy = -CONFIG.blade.launchPower * (1 + riseF * CONFIG.blade.risingLaunchBonus) / e.weight;
          }
          // Tempest: an empowered updraft also launches nearby enemies
          if (empowered && run.mods.tempest) {
            for (const e2 of enemies) {
              if (e2.dead || e2 === e || e2.anchored) continue;
              if (len(e2.x - e.x, e2.y - e.y) < 175) {
                e2.vy = -CONFIG.blade.launchPower / e2.weight; e2.hit(baseDmg * 0.5, 0, -1);
                FX.burst(e2.x, e2.y, 0, -1, 4); if (e2.dead) onKill(e2);
              }
            }
            FX.ring(e.x, e.y, 12);
          }
          const cp = segPointDist(blade.x, blade.y, blade.tipX, blade.tipY, e.x, e.y);
          FX.burst(cp.px, cp.py, blade.tipVX, blade.tipVY, CONFIG.juice.sparkCount, e.color);
          if (isSlam || empowered) FX.ring(e.x, e.y, empSlam ? 13 : 8, CONFIG.colors.slam);
          const tag = spike ? "▼" : (empSlam ? "⇊" : (isSlam ? "!" : (isLaunch ? (empowered ? "⇈" : "↑") : "")));
          addFloater(e.x, e.y - 26, Math.round(dmg) + tag, big || isLaunch);
          hitStop = big ? CONFIG.hitStop.big : CONFIG.hitStop.small;
          addShake(big || isLaunch ? CONFIG.juice.shakeBig : CONFIG.juice.shakeSmall);
          if (big) addZoom(CONFIG.juice.zoomBig);
          SFX.hit(big); if (isSlam) SFX.slam(); else if (empowered) SFX.updraft(); else if (isLaunch) SFX.launch();
          addStyle(isSlam ? (empSlam ? "superslam" : "slam") : (empowered ? "updraft" : (isLaunch ? "launch" : "hit")));
          fire(run.mods.onHit, makeEv(cp.px, cp.py, e));
          if (isSlam) fire(run.mods.onSlam, makeEv(e.x, e.y, e));
          // Rupture T2: a Power Slam detonates bleed on every nearby foe
          if (isSlam && run.mods.bleedDetonate) {
            for (const e2 of enemies) {
              if (e2.dead || e2.bleedStacks <= 0 || len(e2.x - e.x, e2.y - e.y) >= 150) continue;
              const d = e2.detonateBleed();
              addFloater(e2.x, e2.y - 30, "RUPTURE " + Math.round(d), true, CONFIG.colors.charger);
              FX.ring(e2.x, e2.y, 9, CONFIG.colors.charger);
              if (e2.dead) onKill(e2, "skill");
            }
          }
          // Crater: a Power Slam erupts in a shockwave that scales with descent
          if (empSlam && run.mods.crater) {
            const cr = 130 + descF * 110;
            dealAoE(e.x, e.y, cr, baseDmg * (0.7 + descF));
            FX.explode(e.x, e.y, CONFIG.colors.slam, 1.0 + descF * 0.8);
            addShake(CONFIG.juice.shakeBig); addZoom(CONFIG.juice.zoomBig);
          }
          // Vampiric Edge: a sliver of lifesteal, capped to once per swing (not per hit)
          if (run.mods.lifesteal > 0 && run.lifestealCd <= 0) {
            player.heal(run.mods.lifesteal); run.lifestealCd = CONFIG.resilience.lifestealCd;
          }
          if (e.dead) {
            onKill(e, isSlam ? "skill" : "");   // slam/spike kills count as skill kills
            if (isSlam && run.mods.slamShield) player.shield = Math.min(player.shield + 1, player.maxShield);
          }
        }
      }
    }

    // thrown blade pierce
    if (blade.thrown) {
      for (const e of enemies) {
        if (e.dead || blade.pierced.has(e)) continue;
        if (segCircle(blade.x, blade.y, blade.tipX, blade.tipY, e.x, e.y, e.radius + 4)) {
          // Duelist parries a thrown blade right back — bait the parry, then throw
          if (e.behavior === "duelist" && e.duelReady) {
            e.duelReady = false; e.duelCd = CONFIG.exotic.duelCd; e.flash = 0.12;
            blade.pierced = new Set(); blade.state = "returning";
            FX.burst(e.x, e.y, -blade.vx, -blade.vy, 8, CONFIG.colors.armoredShield);
            addFloater(e.x, e.y - 28, "PARRIED", true, CONFIG.colors.armoredShield);
            hitStop = CONFIG.hitStop.small; addShake(CONFIG.juice.shakeSmall); SFX.deflect();
            break;
          }
          blade.pierced.add(e);
          let tdmg = blade.throwDmg;
          // outgoing throw favors high-HP foes (opener); recall favors low-HP (finisher)
          const hiHp = e.hp > e.maxHp * 0.5;
          const T = CONFIG.blade.throw;
          if (blade.state === "returning") tdmg *= hiHp ? T.loMult : T.hiMult;
          else tdmg *= hiHp ? T.hiMult : T.loMult;
          if (blade.state === "returning") tdmg *= CONFIG.blade.throw.recallMult;   // Whetstone
          if (blade.state === "returning" && run.mods.stormRecall) tdmg *= run.mods.stormMult;   // Storm Recall (tiered)
          if (run.mods.berserk && player.hp < player.maxHp * 0.5) tdmg *= 1.25;
          if (player.tempoT > 0 && run.mods.tempo) tdmg *= 1 + run.mods.tempo * player.tempoStk;   // Tempo
          tdmg *= e.damageTakenMult();
          e.hit(tdmg, blade.vx, blade.vy);
          // Impale: pin + heavy bleed on the outgoing throw; the recall rips the wound open
          if (run.mods.impale) {
            if (blade.state === "flying" && (run.mods.impaleAll || blade.pierced.size === 1)) {
              e.applyBleed(run.mods.impale); if (!e.isBoss) e.stun = Math.max(e.stun, 1.2); FX.ring(e.x, e.y, 8, CONFIG.colors.charger);
            }
            if (blade.state === "returning" && run.mods.impaleRecall && e.bleedStacks > 0) {
              const d = e.detonateBleed(); addFloater(e.x, e.y - 32, "RUPTURE " + Math.round(d), true, CONFIG.colors.charger); if (e.dead) onKill(e, "skill");
            }
          }
          // Razor Momentum: ramps per pierce, but capped so it can't snowball
          if (run.mods.throwRamp) {
            const s = 1 + run.mods.throwRamp;
            blade.throwDmg = Math.min(blade.throwDmg * s, blade.throwBaseDmg * 2);
            const cap = CONFIG.blade.throw.maxSpeed * 1.2;
            blade.vx = clamp(blade.vx * s, -cap, cap); blade.vy = clamp(blade.vy * s, -cap, cap);
          }
          if (run.mods.razorStun && !e.isBoss) e.stun = Math.max(e.stun, 0.45);   // Razor Momentum T3
          // Vortex Recall: the returning blade drags pierced enemies toward you
          if (run.mods.vortexRecall && blade.state === "returning" && !e.anchored) {
            const dx = player.x - e.x, dy = player.y - e.y, m = len(dx, dy) || 1;
            e.vx += (dx / m) * 720 / e.weight; e.vy += (dy / m) * 420 / e.weight - 120;
            FX.burst(e.x, e.y, dx, dy, 4, CONFIG.colors.perfect);
          }
          FX.burst(e.x, e.y, blade.vx, blade.vy, CONFIG.juice.sparkCount, e.color);
          addFloater(e.x, e.y - 26, Math.round(tdmg).toString(), true);
          hitStop = CONFIG.hitStop.small; addShake(CONFIG.juice.shakeSmall);
          addStyle("throwHit");
          fire(run.mods.onHit, makeEv(e.x, e.y, e));
          if (e.dead) onKill(e);
          // hammer lob: stop on the first enemy and detonate
          if (blade.throwType === "lob") { lobExplode(e.x, e.y); blade.forceEmbed(); break; }
          // Ricochet: the outgoing blade curves to a fresh target after each pierce
          if (run.mods.ricochet && blade.state === "flying") {
            let best = null, bd = Infinity;
            for (const e2 of enemies) { if (e2.dead || blade.pierced.has(e2)) continue; const d = len(e2.x - blade.x, e2.y - blade.y); if (d < bd) { bd = d; best = e2; } }
            if (best && bd < 700) {
              const sp = len(blade.vx, blade.vy) || CONFIG.blade.throw.speed;
              const dx = best.x - blade.x, dy = best.y - blade.y, m = len(dx, dy) || 1;
              blade.vx = (dx / m) * sp; blade.vy = (dy / m) * sp; blade.angle = Math.atan2(dy, dx);
              FX.burst(blade.x, blade.y, dx, dy, 3, CONFIG.colors.bladeTrail);
            }
          }
        }
      }
    }

    // held blade vs projectiles (deflect / perfect parry; mines are defused on contact)
    for (const p of projectiles) {
      if (p.dead || p.deflected || p.shock || blade.state !== "held") continue;   // shocks must be jumped, not parried
      if (segCircle(blade.x, blade.y, blade.tipX, blade.tipY, p.x, p.y, p.r + 4)) {
        if (p.mine) {
          p.dead = true;
          FX.burst(p.x, p.y, 0, -1, 6, CONFIG.colors.deflected);
          addFloater(p.x, p.y - 16, "defused", false, CONFIG.colors.deflected);
          SFX.deflect(); addStyle("deflect");
          continue;
        }
        if (p.bomb) {
          // bomb parry — its OWN mechanic: a real swing DETONATES the bomb on the spot in
          // your favour (a counter-blast that hits the crowd), rather than reflecting it like
          // a bolt. A perfect-speed swing makes it bigger, deadlier, and a true parry.
          if (blade.tipSpeed < CONFIG.blade.deflectMinSpeed) continue;   // a genuine swing is needed to smack it
          const perfect = blade.tipSpeed >= CONFIG.blade.perfectSpeed;
          const B = CONFIG.bomber;
          p.dead = true;
          dealAoE(p.x, p.y, B.blastRadius * (perfect ? 1.7 : 1.2), Math.round(B.blastDmg * (perfect ? 2.4 : 1.6)));
          FX.explode(p.x, p.y, perfect ? CONFIG.colors.perfect : CONFIG.colors.bomber, perfect ? 1.95 : 1.5);
          addFloater(p.x, p.y - 22, perfect ? "DETONATE!" : "SMACK!", perfect, perfect ? CONFIG.colors.perfect : CONFIG.colors.bomber);
          hitStop = CONFIG.hitStop.big; addShake(CONFIG.juice.shakeBig); addZoom(CONFIG.juice.zoomBig);
          addFlash(CONFIG.juice.flashParry * (perfect ? 1.3 : 0.8)); SFX.boom();
          addStyle(perfect ? "parry" : "deflect");
          if (perfect) {
            Backdrop.flare(p.x, p.y, CONFIG.colors.perfect, 520, 0.6); triggerSlowmo();
            fire(run.mods.onParry, makeEv(p.x, p.y, null));
            if (run.mods.parryGuard) player.guardT = CONFIG.resilience.parryGuardTime;   // Riposte
          }
          continue;
        }
        if (blade.tipSpeed >= CONFIG.blade.deflectMinSpeed) {
          // full counter: swinging straight back at the incoming shot lowers the
          // perfect-parry threshold (dot of swing dir vs the shot's reverse dir)
          const psp = len(p.vx, p.vy) || 1, ssp = blade.tipSpeed || 1;
          const counter = clamp((blade.tipVX / ssp) * (-p.vx / psp) + (blade.tipVY / ssp) * (-p.vy / psp), 0, 1);
          const effPerfect = CONFIG.blade.perfectSpeed * lerp(1, CONFIG.blade.counterParryFactor, counter);
          const perfect = blade.tipSpeed >= effPerfect;
          const fullCounter = perfect && counter > 0.7;
          let dirX = blade.tipVX, dirY = blade.tipVY;
          if (perfect) { const t = nearestEnemy(p.x, p.y); if (t) { dirX = t.x - p.x; dirY = t.y - p.y; } }
          p.deflect(dirX, dirY, blade.tipSpeed, perfect);
          if (run.mods.deflectPierce) { p.pierce = true; p.pierced = new Set(); }
          if (perfect && run.mods.deflectSplit) spawnSplitShards(p);   // Scatter only on a real parry
          const pcol = perfect ? CONFIG.colors.perfect : CONFIG.colors.deflected;
          FX.burst(p.x, p.y, dirX, dirY, perfect ? 12 : 5, pcol);
          addFloater(p.x, p.y - 18, fullCounter ? "COUNTER!" : (perfect ? "PARRY!" : "deflect"), perfect, pcol);
          hitStop = perfect ? CONFIG.hitStop.big : CONFIG.hitStop.small;
          addShake(perfect ? CONFIG.juice.shakeBig : CONFIG.juice.shakeSmall);
          if (fullCounter) SFX.counter(); else if (perfect) SFX.parry(); else SFX.deflect();
          addStyle(perfect ? "parry" : "deflect");
          if (perfect) {
            addZoom(fullCounter ? CONFIG.juice.zoomParry * 1.4 : CONFIG.juice.zoomParry);
            addFlash(fullCounter ? CONFIG.juice.flashParry * 1.3 : CONFIG.juice.flashParry);
            Backdrop.flare(p.x, p.y, pcol, fullCounter ? 460 : 320, fullCounter ? 0.55 : 0.4);   // parry lights the world
            triggerSlowmo();
            if (fullCounter) FX.ring(p.x, p.y, 10, CONFIG.colors.perfect);
            if (run.mods.parryGuard) player.guardT = CONFIG.resilience.parryGuardTime;   // Riposte
            fire(run.mods.onParry, makeEv(p.x, p.y, null));
            if (run.mods.tempoSurge) slowmo = Math.max(slowmo, CONFIG.juice.parrySlowmo * 2.4);   // Tempo T3: deep slow-mo
          }
        }
      }
    }

    // projectiles vs actors (bombs/mines/mud handled separately below)
    for (const p of projectiles) {
      if (p.dead || p.bomb || p.mine || p.mud) continue;
      if (p.deflected) {
        for (const e of enemies) {
          if (e.dead) continue;
          if (p.pierce && p.pierced.has(e)) continue;
          if (len(p.x - e.x, p.y - e.y) <= p.r + e.radius) {
            const ddmg = p.deflectDmg * CONFIG.blade.deflectDmgMult;   // Counterforce
            e.hit(ddmg, p.vx, p.vy);
            if (run.mods.parryStun && !e.isBoss) e.stun = Math.max(e.stun, 0.7);   // Backfire
            FX.burst(p.x, p.y, p.vx, p.vy, CONFIG.juice.sparkCount, CONFIG.colors.deflected);
            addFloater(e.x, e.y - 26, Math.round(ddmg).toString(), p.perfect);
            addShake(p.perfect ? CONFIG.juice.shakeBig : CONFIG.juice.shakeSmall);
            if (e.dead) {
              onKill(e, p.perfect ? "skill" : "");   // perfect-parry kills are skill kills
              if (p.perfect && run.mods.aegisParry) player.shield = Math.min(player.shield + 1, player.maxShield);   // Aegis T2
            }
            if (p.pierce) p.pierced.add(e); else { p.dead = true; break; }
          }
        }
      } else if (aabbOverlap(p.x, p.y, p.r, p.r, player.x, player.y, player.hw, player.hh)) {
        { const r = player.takeDamage(p.dmg != null ? p.dmg : CONFIG.proj.dmg, p.x);
          if (r) {
            p.dead = true;
            if (r === "hit") {
              loseStyle(); SFX.hurt();
              if (p.root) { player.rootT = p.root; addFloater(player.x, player.y - 34, "ROOTED", true, CONFIG.colors.armoredShield); }
            } else onShieldAbsorb();
          } }
      }
    }

    // Warlock shots curve once toward the player partway through their flight
    for (const p of projectiles) {
      if (p.dead || !p.curve || p.curved) continue;
      p.curveT -= dt;
      if (p.curveT <= 0) {
        const sp = len(p.vx, p.vy) || CONFIG.proj.speed;
        const dx = player.x - p.x, dy = player.y - p.y, m = len(dx, dy) || 1;
        p.vx = (dx / m) * sp; p.vy = (dy / m) * sp; p.curved = true;
        FX.burst(p.x, p.y, p.vx, p.vy, 4, CONFIG.colors.enemyShot);
      }
    }

    // bombs (arc + explode on impact) and mines (settle, arm, detonate on proximity)
    for (const p of projectiles) {
      if (p.dead) continue;
      if (p.bomb) {
        const hitGround = p.y + p.r >= CONFIG.world.groundY;
        if (p.deflected) {
          let hitE = false;
          for (const e of enemies) { if (!e.dead && e.spawnT <= 0 && len(p.x - e.x, p.y - e.y) <= p.r + e.radius) { hitE = true; break; } }
          if (hitGround || hitE) { bombExplode(p.x, Math.min(p.y, CONFIG.world.groundY - 2), true); p.dead = true; }
        } else if (hitGround || aabbOverlap(p.x, p.y, p.r, p.r, player.x, player.y, player.hw, player.hh)) {
          bombExplode(p.x, Math.min(p.y, CONFIG.world.groundY - 2), false); p.dead = true;
        }
      } else if (p.mud) {
        if (p.y + p.r >= CONFIG.world.groundY) {   // lands -> slowing puddle
          const X = CONFIG.exotic;
          slowZones.push({ x: p.x, y: CONFIG.world.groundY, r: X.sludgeZoneR, life: X.sludgeZoneLife });
          FX.burst(p.x, CONFIG.world.groundY, 0, -1, 8, CONFIG.colors.sludge); p.dead = true;
        }
      } else if (p.mine) {
        if (p.y + p.r >= CONFIG.world.groundY) { p.y = CONFIG.world.groundY - p.r; p.vx = 0; p.vy = 0; }   // settle
        if (!p.armed) { p.armT -= dt; if (p.armT <= 0) p.armed = true; }
        else if (!p.deflected && len(player.x - p.x, player.y - p.y) < p.r + CONFIG.bomber.mineTrigger) {
          bombExplode(p.x, p.y, false); p.dead = true;
        }
        p.life = 6;   // mines persist until triggered or defused
      }
    }

    // enemy contact damage
    for (const e of enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (aabbOverlap(player.x, player.y, player.hw, player.hh, e.x, e.y, e.hw + e.contactReach, e.hh)) {
        { const r = player.takeDamage(e.contactDmg * (e.chargeMult || 1) * (e.auraDmg || 1), e.x);
          if (r === "hit") { loseStyle(); SFX.hurt(); } else if (r === "absorbed") onShieldAbsorb(); }
      }
    }

    // failsafe: an enemy that somehow ends up off the bottom dies instantly (never an unkillable straggler)
    for (const e of enemies) if (e.y > CONFIG.view.h + 40) e.dead = true;

    // bombers that died (fuse or kill) detonate
    for (const e of enemies) if (e.dead && e.isBomber && !e.blasted) { e.blasted = true; bomberBlast(e); }

    enemies = enemies.filter((e) => !e.dead);
    projectiles = projectiles.filter((p) => !p.dead);
    for (const p of projectiles) p.update(dt);
    for (const f of floaters) { f.y -= 30 * dt; f.life -= dt; }
    floaters = floaters.filter((f) => f.life > 0);
    if (shake > 0) shake = Math.max(0, shake - CONFIG.juice.shakeDecay * dt);

    run.runTime += dt; run.waveTime += dt;
    updateTrick(dt);

    if (player.hp <= 0) {
      if (player.revives > 0 && !player.oneHit) {   // Second Wind (shop): rise once more
        player.revives--; player.hp = Math.round(player.maxHp * 0.35); player.iframe = 1.6;
        FX.ring(player.x, player.y, 16, CONFIG.colors.perfect); FX.burst(player.x, player.y, 0, -1, 16, CONFIG.colors.perfect);
        addFloater(player.x, player.y - 44, "SECOND WIND", true, CONFIG.colors.perfect);
        addShake(CONFIG.juice.shakeBig); addFlash(CONFIG.juice.flashParry); SFX.parry();
      } else if (CG.adsAvailable() && !run.adRevived && !player.oneHit) {
        // CrazyGames: offer a one-time "watch an ad to revive" before the run ends
        state = "continue"; continueT = 8; document.exitPointerLock();
      } else { endRun(); return; }
    }
  }

  function onKill(e, cause) {
    addKillScore();
    if (e.affixCount) run.score += Math.round(CONFIG.run.scorePerKill * run.wave * run.mult * 0.4 * e.affixCount);
    FX.death(e.x, e.y, CONFIG.juice.deathShards, e.color);
    SFX.death();
    fire(run.mods.onKill, makeEv(e.x, e.y, e, cause));
    // Rupture T3 / Cinder T3: a bleeding/burning death erupts, spreading the status
    if (run.mods.bleedNova && e.bleedStacks > 0) { for (const e2 of enemies) { if (e2 === e || e2.dead) continue; if (len(e2.x - e.x, e2.y - e.y) < 150 && e2.applyBleed) e2.applyBleed(3); } FX.ring(e.x, e.y, 12, CONFIG.colors.charger); }
    if (run.mods.cinderNova && e.burnT > 0) { for (const e2 of enemies) { if (e2 === e || e2.dead) continue; if (len(e2.x - e.x, e2.y - e.y) < 150 && e2.applyBurn) e2.applyBurn(); } FX.ring(e.x, e.y, 12, CONFIG.colors.slam); }
    if (e.isBoss) {
      CG.happytime();   // CrazyGames: a highlight moment
      Backdrop.bloom("#ffffff", 0.22, 0.9); Backdrop.flare(e.x, e.y, currentStage.accent || "#ffffff", 520, 1.0);   // a boss falls: the world flares
      for (const p of projectiles) if (p.shock || p.sweeper) p.dead = true;   // clear the boss's lingering hazards
      if (run.mode === "campaign" && currentStage && currentStage.lore) showLore(currentStage.lore, "", 8);
    }
  }

  // ---- main loop ----
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;
    if (loreT > 0) loreT -= dt;

    Input.allowLock = (state === "playing");

    if (state === "playing") {
      // feel timers run in real time
      if (slowmo > 0) { slowmo -= dt; timeScale = CONFIG.juice.parrySlowScale; }
      else timeScale = lerp(timeScale, 1, clamp(8 * dt, 0, 1));
      zoom = lerp(zoom, 1, clamp(9 * dt, 0, 1));
      if (flash > 0) flash = Math.max(0, flash - dt * 3.2);
      if (bannerT > 0) bannerT -= dt;
      if (stageBannerT > 0) stageBannerT -= dt;
      if (rankPopT > 0) rankPopT -= dt * 1.2;

      // pause on P, Escape, or losing the mouse capture (Esc releases pointer lock)
      if (Input.locked) wasLocked = true;
      const lostCapture = wasLocked && !Input.locked;
      if (Input.pausePressed() || Input.escapePressed() || lostCapture) {
        state = "paused"; wasLocked = false; document.exitPointerLock();
      }
      else if (hitStop > 0) { hitStop -= dt; }
      else { acc += dt * timeScale; while (acc >= STEP && state === "playing") { stepPlaying(STEP); acc -= STEP; } }
    } else {
      acc = 0; wasLocked = false;
    }
    uiT += dt; enterT += dt; lastUiDt = dt;   // menu animation clocks
    if (state === "win") winT += dt; else winT = 0;   // ending cinematic clock
    // CrazyGames: bracket active gameplay (for ad timing / analytics)
    const _pl = state === "playing";
    if (_pl !== cgWasPlaying) { if (_pl) CG.gameplayStart(); else CG.gameplayStop(); cgWasPlaying = _pl; }
    if (state === "continue" && continueT > 0) { continueT -= dt; if (continueT <= 0) { state = "gameover"; endRun(); } }

    render();
    handleUI();
    Input.endFrame();
    requestAnimationFrame(frame);
  }

  // ---- rendering ----
  function render() {
    // map the 1280x720 logical space onto the (hi-dpi) backing store
    resizeCanvas();
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const playLike = state === "playing" || state === "draft" || state === "tierup" || state === "paused" || state === "gameover" || state === "win" || state === "confirmquit" || state === "continue";
    // biome background (campaign + endless tint the world; menus stay white)
    const biomeMode = !!(run && (run.mode === "campaign" || run.mode === "endless" || run.mode === "bossonly" || run.mode === "gauntlet"));
    let bgCol = (playLike && biomeMode) ? currentStage.bg : "#fff";
    if (playLike && Array.isArray(enemies)) { const ef = enemies.find((e) => e.whiteFlash > 0); if (ef) bgCol = blendCol(bgCol, "#ffffff", ef.whiteFlash); }   // The Echo's white-out
    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, W, H);
    uiButtons = [];

    // theme: derive ink + rim from the actual background luminance, so models stay
    // readable on any biome (light, dark void, or an endless tint) — not just a flag.
    THEME.set((playLike && biomeMode) ? bgCol : "#ffffff");
    UI.ink = THEME.ink;

    if (playLike) {
      renderWorld();
      if (biomeMode) Backdrop.post(ctx, currentStage);   // vignette + grain over the world, under the HUD
      if (flash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "difference";
        ctx.globalAlpha = clamp(flash, 0, 1);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      drawHUD();
      if (loreT > 0) drawLore();
      if (state === "playing" && bannerT > 0) drawBanner();
      if (state === "playing" && stageBannerT > 0) drawStageBanner();
      if (state === "playing" && rankPopT > 0) {
        ctx.save(); ctx.globalAlpha = clamp(rankPopT, 0, 1);
        ctx.fillStyle = trickColor(run.mult); ctx.textAlign = "center";
        ctx.font = UI.font(42 + (1 - clamp(rankPopT, 0, 1)) * 18, true);
        ctx.fillText(rankPopText, W / 2, H / 2 - 140);
        ctx.restore();
      }
    }
    if (state === "playing") drawReticle();

    UI.ink = "#000";   // overlays (menus / win / pause) dim to white — always ink them black
    if (state !== lastUiState) enterT = 0;   // restart the entrance animation on every screen change

    // menu screens: ambient backdrop + a subtle entrance slide that carries the
    // content AND its buttons together, so everything settles into place as one.
    const inMenu = state === "menu" || state === "shop" || state === "codex" ||
      state === "setup" || state === "howto" || state === "highscores" || state === "settings" || state === "bestiary";
    if (inMenu) {
      eIn = ez(enterT / 0.24);
      UI.menuBackdrop(ctx, uiT);
      ctx.save(); ctx.translate(0, (1 - eIn) * 22);
      if (state === "menu") renderMenu();
      else if (state === "shop") renderShop();
      else if (state === "codex") renderCodex();
      else if (state === "setup") renderSetup();
      else if (state === "howto") renderHowto();
      else if (state === "highscores") renderHighscores();
      else if (state === "settings") renderSettings();
      else if (state === "bestiary") renderBestiary();
      drawButtons();
      ctx.restore();
    } else {
      eIn = 1;
      if (state === "draft") renderDraft();
      else if (state === "tierup") renderTierUp();
      else if (state === "paused") renderPaused();
      else if (state === "confirmquit") renderConfirmQuit();
      else if (state === "gameover") renderGameover();
      else if (state === "win") renderWin();
      else if (state === "continue") renderContinue();
      if (state !== "playing" && state !== "draft") drawButtons();
    }

    // mouse cursor in non-playing screens
    if (state !== "playing") UI.cursor(ctx, Input.mouseX, Input.mouseY);

    // reset keyboard focus + scroll when the screen changes
    if (state !== lastUiState) { lastUiState = state; focus = firstEnabledButton(); listScroll = 0; }

    if (lockHint) lockHint.style.display = (state === "playing" && !Input.locked) ? "block" : "none";
    if (hintEl) hintEl.style.display = (state === "playing") ? "block" : "none";
  }

  function firstEnabledButton() {
    for (let i = 0; i < uiButtons.length; i++) if (uiButtons[i].enabled !== false) return i;
    return -1;
  }

  // status visuals on an afflicted enemy: BLEED crimson aura, BURN rising flames,
  // MARK cyan targeting brackets. Particles (drips/embers) are spawned by the loop.
  function drawEnemyStatus(e) {
    const now = performance.now();
    ctx.save();
    if (e.bleedStacks > 0) {   // throbbing crimson wound-aura, deeper with more stacks
      const k = clamp(e.bleedStacks / CONFIG.status.bleedMax, 0, 1);
      ctx.globalAlpha = 0.16 + 0.10 * k + 0.05 * Math.sin(now / 110);
      ctx.fillStyle = CONFIG.colors.charger;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.hw + 6, e.hh + 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (e.burnT > 0) {   // licking flames off the top + an ember underglow
      ctx.globalAlpha = 0.14 + 0.07 * Math.sin(now / 90);
      ctx.fillStyle = CONFIG.colors.slam;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.hw + 5, e.hh + 5, 0, 0, Math.PI * 2); ctx.fill();
      const n = 5, base = e.y - e.hh;
      for (let i = 0; i < n; i++) {
        const fx = e.x - e.hw + (i + 0.5) * (e.hw * 2 / n);
        const fl = Math.sin(now / 70 + i * 1.9) * 0.5 + 0.5;
        ctx.globalAlpha = 0.55 + 0.35 * fl; ctx.fillStyle = i % 2 ? "#ffce33" : CONFIG.colors.slam;
        ctx.beginPath(); ctx.moveTo(fx - 5, base); ctx.quadraticCurveTo(fx, base - (12 + fl * 18), fx + 5, base); ctx.closePath(); ctx.fill();
      }
    }
    if (e.markT > 0) {   // pulsing cyan targeting brackets
      const p = 0.5 + 0.5 * Math.sin(now / 100), m = 5 + p * 4, L = 8;
      const x0 = e.x - e.hw - m, x1 = e.x + e.hw + m, y0 = e.y - e.hh - m, y1 = e.y + e.hh + m;
      ctx.globalAlpha = 0.55 + 0.45 * p; ctx.strokeStyle = CONFIG.colors.eye; ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
      ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
      ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
      ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  function renderWorld() {
    ctx.save();
    // camera: zoom-punch + shake, both pivoting on screen center
    const cx = W / 2, cy = H / 2;
    let ox = 0, oy = 0;
    if (shake > 0 && state === "playing") { ox = (Math.random() * 2 - 1) * shake; oy = (Math.random() * 2 - 1) * shake; }
    ctx.translate(cx + ox, cy + oy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
    const biome = run && (run.mode === "campaign" || run.mode === "endless" || run.mode === "bossonly" || run.mode === "gauntlet");
    if (biome) Backdrop.draw(ctx, currentStage, performance.now() / 1000, player ? player.x : W / 2);   // sky + parallax + motes
    for (const p of platforms) Backdrop.platform(ctx, p, currentStage, !!p.floor);                       // depth: gradient + edge + shadow
    // Geomancer walls: a colored cap + crumble fade as they age
    for (const w of tempWalls) {
      const k = clamp(w.life / w.maxLife, 0, 1);
      ctx.fillStyle = CONFIG.colors.sludge; ctx.globalAlpha = 0.35 + 0.4 * k;
      ctx.fillRect(w.x - 2, w.y, w.w + 4, 6); ctx.globalAlpha = 1;
    }
    // Sludge puddles on the floor
    for (const z of slowZones) {
      ctx.fillStyle = CONFIG.colors.sludge; ctx.globalAlpha = 0.25 + 0.4 * clamp(z.life / 2, 0, 1);
      ctx.beginPath(); ctx.ellipse(z.x, z.y - 2, z.r, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    // boss floor hazards: Warden prohibited zones (red) / Colossus hot panels / Aldric fire.
    // Made loud on purpose — a bold gradient band, scrolling hazard stripes, and a hot rail
    // when live; a clear dashed "arming" telegraph when not.
    const bossZd = enemies.find((e) => e.isBoss && e.zones && e.zones.length);
    if (bossZd) {
      const Wc = CONFIG.warden, gy = CONFIG.world.groundY, bh = H - gy;
      const zc = bossZd.zoneColor || CONFIG.colors.charger;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 140);
      for (const z of bossZd.zones) {
        const x0 = z.x - Wc.zoneW / 2, active = z.on !== false;
        if (active) {
          const grd = ctx.createLinearGradient(0, gy, 0, H);
          grd.addColorStop(0, zc); grd.addColorStop(1, zc);
          ctx.fillStyle = grd; ctx.globalAlpha = 0.42; ctx.fillRect(x0, gy, Wc.zoneW, bh);   // bold band
          hazardStripes(ctx, x0, gy, Wc.zoneW, bh, "#000", 0.16);                            // danger stripes
          hazardStripes(ctx, x0, gy, Wc.zoneW, bh, "#fff", 0.10);
          ctx.fillStyle = zc; ctx.globalAlpha = 0.55 + 0.45 * (pulse);                        // hot top rail
          ctx.fillRect(x0, gy - 3, Wc.zoneW, 7);
          ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.4 + 0.5 * pulse; ctx.fillRect(x0, gy - 1, Wc.zoneW, 2);
        } else {                                                                              // armed, not yet live — telegraph
          ctx.fillStyle = zc; ctx.globalAlpha = 0.12; ctx.fillRect(x0, gy, Wc.zoneW, bh);
          ctx.strokeStyle = zc; ctx.globalAlpha = 0.45 + 0.3 * pulse; ctx.lineWidth = 3; ctx.setLineDash([12, 9]);
          ctx.strokeRect(x0 + 1.5, gy + 1.5, Wc.zoneW - 3, bh - 3); ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
      }
    }
    for (const e of enemies) {
      if (e.spawnT > 0) {   // materializing: telegraph ring + fade in
        const k = clamp(e.spawnT / 0.35, 0, 1);
        ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.globalAlpha = k;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 6 + k * 34, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1 - k * 0.65;
        e.draw(ctx, player);
        ctx.globalAlpha = 1;
      } else if (e.flash > 0) {   // hit-pop (squash)
        ctx.save();
        const s = 1 + 0.14 * (e.flash / 0.08);
        ctx.translate(e.x, e.y); ctx.scale(s, s); ctx.translate(-e.x, -e.y);
        e.draw(ctx, player);
        ctx.restore();
      } else {
        e.draw(ctx, player);
      }
    }
    // status auras / flames / target-brackets, drawn over each afflicted enemy
    for (const e of enemies) { if (!e.dead && e.spawnT <= 0 && (e.bleedStacks > 0 || e.burnT > 0 || e.markT > 0)) drawEnemyStatus(e); }
    // dark biome: a faint light rim keeps dark-bodied enemies (and the player) readable
    if (THEME.dark) {
      ctx.strokeStyle = "rgba(236,233,247,0.45)"; ctx.lineWidth = 1.5;
      for (const e of enemies) { if (e.spawnT > 0) continue; ctx.strokeRect(e.x - e.hw, e.y - e.hh, e.hw * 2, e.hh * 2); }
      ctx.strokeRect(player.x - player.hw, player.y - player.hh, player.hw * 2, player.hh * 2);
    }
    // support effect indicators: outline + badge stack over every buffed enemy, so it's
    // always obvious which enemies are protected/empowered/hasted/healed/shielded
    for (const e of enemies) {
      if (e.spawnT > 0 || !e.buffs || !e.buffs.length) continue;
      ctx.strokeStyle = CONFIG.colors[e.buffs[0]] || "#000"; ctx.lineWidth = 2; ctx.globalAlpha = 0.75;
      ctx.strokeRect(e.x - e.hw - 3, e.y - e.hh - 3, e.hw * 2 + 6, e.hh * 2 + 6);
      ctx.globalAlpha = 1;
      const n = e.buffs.length, by = e.y - e.hh - (run.mode === "sandbox" ? 40 : 22);
      e.buffs.forEach((t, i) => drawBuffBadge(e.x - (n - 1) * 9 + i * 18, by, t));
    }
    // Enemy Test mode: name every enemy so you can learn the roster
    if (run && run.mode === "sandbox") {
      ctx.textBaseline = "alphabetic";
      for (const e of enemies) {
        if (e.spawnT > 0) continue;
        const label = enemyLabel(e);
        const ly = e.y - e.hh - 22;
        ctx.font = UI.font(12, true); ctx.textAlign = "center";
        const tw = ctx.measureText(label).width;
        ctx.globalAlpha = 0.85; ctx.fillStyle = "#fff"; ctx.fillRect(e.x - tw / 2 - 3, ly - 11, tw + 6, 14);
        ctx.globalAlpha = 1; ctx.fillStyle = e.color || "#000";
        ctx.fillText(label, e.x, ly);
      }
    }
    for (const p of projectiles) p.draw(ctx);
    if (player) player.draw(ctx);
    if (blade) blade.draw(ctx, player);
    FX.draw(ctx);
    ctx.textAlign = "center";
    for (const f of floaters) {
      ctx.globalAlpha = clamp(f.life / 0.8, 0, 1);
      ctx.fillStyle = f.col || "#000";
      const age = 0.8 - f.life;                       // pop: big at spawn, settle quickly
      const pop = age < 0.12 ? lerp(1.5, 1, age / 0.12) : 1;
      const base = f.big ? 26 : 16;
      ctx.font = (f.big ? "bold " : "") + Math.round(base * pop) + "px 'Courier New', monospace";
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawHUD() {
    const t = UI.t, ink = THEME.ink;   // UI.ink === THEME.ink during the HUD pass
    const x = 20, y = 20, bw = 280;
    UI.bar(ctx, x, y, bw, 18, player.hp / player.maxHp);
    if (player.oneHit) UI.text(ctx, "ONE-HIT", x + bw + 10, y + 15, t.type.caption);

    // dash readiness
    const ready = 1 - clamp(player.dashCd / CONFIG.dash.cooldown, 0, 1);
    UI.bar(ctx, x, y + 26, 120, 8, ready);

    // Aegis shield pips (cyan) — only shown once Aegis is owned
    for (let i = 0; i < player.maxShield; i++) {
      const sx = x + 132 + i * 16;
      if (i < player.shield) UI.bar(ctx, sx, y + 26, 12, 8, 1, CONFIG.colors.armoredShield, CONFIG.colors.armoredShield);
      else { ctx.strokeStyle = CONFIG.colors.armoredShield; ctx.lineWidth = 2; ctx.strokeRect(sx, y + 26, 12, 8); }
    }
    ctx.strokeStyle = ink; ctx.fillStyle = ink;

    // owned abilities/upgrades list (left column)
    let oy = y + 52;
    for (const id in run.mods.owned) {
      const up = UPGRADES.find((u) => u.id === id);
      if (!up) continue;
      const label = (up.unique ? "★ " : "") + up.name + (up.unique ? "" : " x" + run.mods.owned[id]);
      UI.text(ctx, label, x, oy, t.type.caption, "left", t.alpha.soft);
      oy += 17;
    }

    // ---- center stack (kept off the edges so nothing clips) ----
    const remaining = enemies.length + run.spawnQueue.length;
    UI.title(ctx, run.isBossWave ? "BOSS" : "WAVE " + run.wave, W / 2, 40, t.type.title);
    UI.text(ctx, "SCORE " + run.score + "    enemies left: " + remaining + "    " + fmtTime(run.runTime),
      W / 2, 64, t.type.label, "center", t.alpha.soft);

    // trick meter (centered, colored by tier)
    if (run.mult > 1) {
      const tc = trickColor(run.mult);
      UI.tag(ctx, "x" + run.mult + (run.rank ? "  " + run.rank : ""), W / 2, 96, tc, "center", t.type.lead);
      const bw2 = 220, bx = W / 2 - bw2 / 2, by = 104;
      UI.bar(ctx, bx, by, bw2, 6, clamp(run.comboTimer / CONFIG.trick.decay, 0, 1), tc);
    }
    ctx.textAlign = "left";

    // boss HP bar (centered, below the stack)
    const boss = enemies.find((e) => e.isBoss);
    if (boss) {
      const bbw = 560, bx = (W - bbw) / 2, by = 122;
      UI.bar(ctx, bx, by, bbw, 14, boss.hp / boss.maxHp);
      UI.text(ctx, "BOSS", bx, by - 4, t.type.micro, "left", t.alpha.soft);
    }
  }

  function drawBanner() {
    const t = bannerT / CONFIG.juice.bannerTime;          // 1 -> 0
    const a = Math.sin((1 - t) * Math.PI);                // fade in then out
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    UI.title(ctx, run.isBossWave ? "BOSS" : "WAVE " + run.wave, W / 2, 150, 60 + (1 - a) * 10);
    if (run.waveTag) UI.tag(ctx, run.waveTag, W / 2, 186, run.horde ? CONFIG.colors.charger : CONFIG.colors.perfect, "center", UI.t.type.lead);
    ctx.restore();
  }

  // a boss-defeat lore caption at the top (non-blocking, fades over ~7s)
  function drawLore() {
    const a = Math.min(loreT, 1) * Math.min((loreDur - loreT) * 2, 1);
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    // a deliberately fixed-light caption card (black body text), independent of biome ink
    ctx.fillStyle = "#fff"; ctx.fillRect(W / 2 - 390, 28, 780, 104);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - 390, 28, 780, 104);
    UI.tag(ctx, loreTitle || ((currentStage.name || "STAGE").toUpperCase() + " — CLEARED"), W / 2, 50, currentStage.accent || "#000", "center", UI.t.type.caption);
    wrapText(loreText, W / 2 - 360, 72, 720, 18, UI.t.type.caption);
    ctx.restore();
  }

  // campaign stage-transition banner ("STAGE N — Name")
  function drawStageBanner() {
    const a = Math.min(stageBannerT, 1) * Math.min((3.0 - stageBannerT) * 2.5, 1);
    const bossTest = run && run.mode === "bossonly", endlessLike = run && (run.mode === "endless" || run.mode === "gauntlet");
    const label = bossTest ? "BOSS TEST" : endlessLike ? "ENTERING" : "STAGE " + (stageIndex + 1);
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    UI.tag(ctx, label, W / 2, H / 2 - 70, currentStage.accent || THEME.ink, "center", UI.t.type.body);
    UI.title(ctx, stageName || currentStage.name, W / 2, H / 2 - 22, UI.t.type.display);
    if (!bossTest) { ctx.globalAlpha = clamp(a, 0, 1) * UI.t.alpha.soft; UI.tag(ctx, currentStage.blurb || "", W / 2, H / 2 + 12, THEME.ink, "center", UI.t.type.body); }
    ctx.restore();
  }

  function drawReticle() {
    if (!blade) return;
    const rx = blade.reticleX, ry = blade.reticleY;
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(rx, ry, 4, 0, Math.PI * 2);
    ctx.moveTo(rx - 9, ry); ctx.lineTo(rx + 9, ry);
    ctx.moveTo(rx, ry - 9); ctx.lineTo(rx, ry + 9);
    ctx.stroke();

    // power telegraph: while airborne, a forming POWER SLAM (⇊) or UPDRAFT (⇈)
    // flags the reticle so you can read the bonus hit before it lands (subtle).
    if (player && !player.onGround && blade.state === "held") {
      const Bl = CONFIG.blade;
      const slamReady = blade.tipVY > Bl.slamMinDownSpeed * 0.7 && player.vy > Bl.slamPowerSpeed * Bl.slamEmpowerAt;
      const upReady   = blade.tipVY < -Bl.launchMinUpSpeed * 0.7 && -player.vy > Bl.risingSpeedRef * 0.45;
      if (slamReady || upReady) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = slamReady ? CONFIG.colors.slam : CONFIG.colors.perfect;
        ctx.font = UI.font(22, true); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(slamReady ? "⇊" : "⇈", rx, ry + (slamReady ? 24 : -24));
        ctx.restore();
      }
    }
  }

  // ---- menu screens ----
  // shared layout frame so every sub-screen aligns identically
  const LAY = { fx: W / 2 - 320, rx: W / 2 + 320, backY: H - 96, backW: 220, backH: 52 };
  function vmenu(items, x, top, w, h, gap) {
    items.forEach((it, i) => {
      const b = { x: x - w / 2, y: top + i * (h + gap), w, h, label: it.label, enabled: it.enabled, action: it.action, size: it.size };
      uiButtons.push(b);
    });
  }
  // one BACK button, same place + style on every sub-screen
  function addBack() {
    uiButtons.push({ x: W / 2 - LAY.backW / 2, y: LAY.backY, w: LAY.backW, h: LAY.backH, label: "‹  BACK", action: () => { state = "menu"; } });
  }

  function renderMenu() {
    const t = UI.t;
    // animated "tear" — a cyan slash sweeps through the wordmark every few seconds
    const cyc = (uiT % 4.2) / 0.5;                 // 0..1 sweep, then rests
    UI.title(ctx, "T E A R", W / 2, 220, t.type.wordmark);
    if (cyc < 1) {
      const sx = W / 2 - 260 + cyc * 520, k = Math.sin(cyc * Math.PI);
      ctx.save(); ctx.globalAlpha = 0.85 * k; ctx.strokeStyle = t.color.accent; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(sx - 26, 250); ctx.lineTo(sx + 26, 188); ctx.stroke(); ctx.restore();
    }
    UI.text(ctx, "a momentum-blade survival game", W / 2, 256, t.type.caption, "center", t.alpha.muted);
    UI.divider(ctx, W / 2 - 150, 280, 300, t.alpha.faint);
    UI.tag(ctx, "◆ " + META.coins() + " COINS", W / 2, 306, t.color.accent, "center", t.type.caption);
    vmenu([
      { label: "PLAY", action: () => { state = "setup"; } },
      { label: "SHOP", action: () => { state = "shop"; } },
      { label: "ABILITIES", action: () => { state = "codex"; } },
      { label: "INDEX", action: () => { state = "bestiary"; } },
      { label: "HOW TO PLAY", action: () => { state = "howto"; } },
      { label: "HIGH SCORES", action: () => { state = "highscores"; } },
      { label: "SETTINGS", action: () => { state = "settings"; } },
    ], W / 2, 332, t.metric.btnW, t.metric.btnH, 10);
    UI.text(ctx, "cut clean · keep moving · chase the multiplier", W / 2, H - 40, t.type.micro, "center", t.alpha.faint);
    return;
  }

  // codex: every upgrade & unique ability and what it does (scrollable)
  // category metadata for the ability cards (color accent + label)
  const ABIL_CATS = {
    offense:    { name: "OFFENSE",    color: CONFIG.colors.charger },
    throw:      { name: "THROW",      color: CONFIG.colors.bomber },
    parry:      { name: "PARRY",      color: CONFIG.colors.perfect },
    mobility:   { name: "MOBILITY",   color: CONFIG.colors.ranged },
    resilience: { name: "RESILIENCE", color: CONFIG.colors.deflected },
    utility:    { name: "UTILITY",    color: CONFIG.colors.armored },
  };
  const ABIL_CAT_ORDER = ["offense", "throw", "parry", "mobility", "resilience", "utility"];

  // ability rarity tiers — three clearly-separated classes:
  //   STACKS  — plain upgrades, pile up each pick
  //   UNIQUE  — one-time picks, no evolution
  //   SPECIAL — the prized abilities that EVOLVE a tier with every boss you fell
  const SPECIAL_COLOR = "#e8a32e";   // amber: the evolving "Special" class
  function abilType(up) { return up.tiers ? "special" : (up.unique ? "unique" : "stack"); }
  function abilBadge(up) {
    if (up.tiers) return { label: "✦ SPECIAL", color: SPECIAL_COLOR };
    if (up.unique) return { label: "★ UNIQUE", color: UI.t.color.unique };
    return { label: "STACKS", color: UI.t.color.muted };
  }

  function drawAbilityCard(x, y, w, h, up) {
    const t = UI.t;
    const cat = ABIL_CATS[up.cat] || ABIL_CATS.utility;
    const hovered = Input.mouseX >= x && Input.mouseX <= x + w && Input.mouseY >= y && Input.mouseY <= y + h;
    const special = !!up.tiers, bd = abilBadge(up);
    UI.card(ctx, x, y, w, h, hovered);
    UI.accentStrip(ctx, x, y, w, cat.color);
    // SPECIAL abilities are set apart: an amber under-strip that gleams as it scrolls
    if (special) {
      ctx.fillStyle = SPECIAL_COLOR; ctx.globalAlpha = 0.9; ctx.fillRect(x, y + 6, w, 3);
      const gx = x + ((uiT * 80 + (x % 200)) % (w + 60)) - 30;
      const g = ctx.createLinearGradient(gx - 30, 0, gx + 30, 0);
      g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.85)"); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(x, y + 6, w, 3); ctx.globalAlpha = 1;
    }
    ctx.textBaseline = "alphabetic";
    // top row: rarity class (left) + category (right)
    UI.tag(ctx, bd.label, x + 12, y + 26, bd.color, "left", t.type.micro);
    UI.tag(ctx, cat.name, x + w - 12, y + 26, cat.color, "right", t.type.micro);
    // name (shrink to fit)
    ctx.fillStyle = UI.ink; ctx.textAlign = "left";
    let ns = t.type.title; ctx.font = UI.font(ns, true);
    while (ctx.measureText(up.name).width > w - 24 && ns > t.type.caption) { ns--; ctx.font = UI.font(ns, true); }
    ctx.fillText(up.name, x + 12, y + 54);
    // tier track: one pip per tier this ability has; the pip you're viewing is filled.
    // (clicking the card steps through the tiers — see renderCodex)
    const tierCount = 1 + (up.tiers ? up.tiers.length : 0);
    let view = codexTierView[up.id] || 0; if (view >= tierCount) view = 0;
    for (let i = 0; i < tierCount; i++) {
      ctx.beginPath(); ctx.arc(x + 17 + i * 16, y + 73, 5, 0, Math.PI * 2);
      if (i === view) { ctx.fillStyle = cat.color; ctx.fill(); ctx.strokeStyle = UI.ink; ctx.lineWidth = 1.2; ctx.stroke(); }
      else { ctx.strokeStyle = cat.color; ctx.lineWidth = 2; ctx.stroke(); }
    }
    if (tierCount > 1) UI.tag(ctx, view === 0 ? "BASE" : "TIER " + (view + 1), x + 17 + tierCount * 16 + 2, y + 77, cat.color, "left", t.type.micro);
    // description for the tier currently being viewed
    const desc = view === 0 ? up.desc : up.tiers[view - 1].desc;
    wrapText(desc, x + 12, y + 99, w - 24, 17, t.type.micro);
    // hint that the card cycles
    if (tierCount > 1) UI.tag(ctx, "click to step through tiers", x + w / 2, y + h - 8, t.color.muted, "center", t.type.micro);
  }

  function renderCodex() {
    const t = UI.t;
    UI.title(ctx, "ABILITIES", W / 2, 52, t.type.h1);
    ctx.fillStyle = t.color.accent; ctx.globalAlpha = eIn; ctx.fillRect(W / 2 - 65 * eIn, 66, 130 * eIn, 3); ctx.globalAlpha = 1;
    UI.text(ctx, "STACKS pile up  ·  ★ UNIQUE are one-time  ·  ✦ SPECIAL evolve a tier with every boss  —  click a card to read its tiers",
      W / 2, 86, t.type.caption, "center", t.alpha.muted);

    // ---- filter chips (All + each category) + a sort toggle ----
    const chips = [["all", "ALL"]].concat(ABIL_CAT_ORDER.map((c) => [c, (ABIL_CATS[c].name)]));
    const cw0 = t.metric.chipW, cg = t.space.xs, totalC = chips.length * cw0 + (chips.length - 1) * cg;
    let cx0 = (W - totalC) / 2 - 70;
    chips.forEach(([id, label]) => {
      uiButtons.push({ x: cx0, y: 96, w: cw0, h: t.metric.chipH, label, size: t.type.micro, chip: true, sel: codexFilter === id,
        action: () => { codexFilter = id; listScroll = 0; } });
      cx0 += cw0 + cg;
    });
    uiButtons.push({ x: cx0 + 8, y: 96, w: 150, h: t.metric.chipH, size: t.type.micro, chip: true,
      label: "SORT: " + codexSort.toUpperCase(),
      action: () => { codexSort = codexSort === "category" ? "name" : (codexSort === "name" ? "type" : "category"); listScroll = 0; } });

    let list = UPGRADES.filter((u) => codexFilter === "all" || (u.cat || "utility") === codexFilter);
    const rank = (u) => (u.tiers ? 0 : (u.unique ? 1 : 2));   // SPECIAL -> UNIQUE -> STACKS
    list.sort((a, b) => {
      if (codexSort === "name") return a.name.localeCompare(b.name);
      if (codexSort === "type") return rank(a) - rank(b) || a.name.localeCompare(b.name);
      const ca = ABIL_CAT_ORDER.indexOf(a.cat || "utility"), cb = ABIL_CAT_ORDER.indexOf(b.cat || "utility");
      if (ca !== cb) return ca - cb;
      return rank(a) - rank(b);
    });
    const cols = 4, mx = 70, gap = 22, cardW = (W - mx * 2 - gap * (cols - 1)) / cols;
    const ch = 150, gy = 20, stride = ch + gy, top = 142, visRows = 4;
    const rows = Math.ceil(list.length / cols);
    const maxOff = Math.max(0, rows - visRows);
    const off = clamp(Math.round(listScroll / stride), 0, maxOff);
    for (let r = 0; r < visRows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = (off + r) * cols + c;
        if (idx >= list.length) continue;
        const up = list[idx];
        const x = mx + c * (cardW + gap), y = top + r * stride;
        drawAbilityCard(x, y, cardW, ch, up);
        // clickable: step through this ability's tiers (only if it actually evolves)
        const tc = 1 + (up.tiers ? up.tiers.length : 0);
        uiButtons.push({ x, y, w: cardW, h: ch, label: "", _hideBox: true,
          action: () => { if (tc > 1) codexTierView[up.id] = ((codexTierView[up.id] || 0) + 1) % tc; } });
      }
    }
    if (maxOff > 0) UI.scrollHint(ctx, W / 2, H - 86, off > 0, off < maxOff);
    uiButtons.push({ x: W / 2 - 100, y: H - 66, w: 200, h: 46, label: "BACK", action: () => { state = "menu"; } });
  }

  function renderShop() {
    const t = UI.t, sfx = W / 2 - 560, srx = W / 2 + 560, gap = 40, colW = (srx - sfx - gap) / 2;
    UI.header(ctx, "SHOP", "permanent upgrades — applied at the start of every run", eIn);
    UI.tag(ctx, "◆ " + META.coins() + " COINS", W / 2, 162, t.color.accent, "center", t.type.body);
    const top = 214, rowH = 78, bw = 112;
    SHOP.forEach((it, i) => {
      const cx = sfx + (i % 2) * (colW + gap), y = top + Math.floor(i / 2) * rowH, rxc = cx + colW;
      const lv = META.level(it.id), maxed = lv >= it.maxLevel;
      UI.text(ctx, it.name, cx, y, t.type.lead);
      UI.text(ctx, it.desc, cx, y + 22, t.type.caption, "left", t.alpha.soft);
      UI.pips(ctx, rxc - bw - 14, y - 4, it.maxLevel, lv, t.color.accent);
      uiButtons.push({ x: rxc - bw, y: y - 24, w: bw, h: 44,
        label: maxed ? "MAX" : META.cost(it) + "c",
        enabled: !maxed && META.canBuy(it),
        action: () => { if (META.buy(it)) SFX.ui(); } });
      UI.divider(ctx, cx, y + 42, colW, 0.08);
    });
    addBack();
  }

  function renderSetup() {
    const t = UI.t;
    UI.header(ctx, "SELECT RUN", null, eIn);
    const top = 188, bw = t.metric.btnW, bh = 50, gap = t.metric.btnGap;
    const col = (label, x, items, get, set) => {
      UI.tag(ctx, label.toUpperCase(), x + bw / 2, top, t.color.accent, "center", t.type.caption);
      items.forEach((it, i) => uiButtons.push({
        x, y: top + 18 + i * (bh + gap), w: bw, h: bh, size: 16,
        label: it.label + (it.enabled === false ? " (soon)" : ""),
        enabled: it.enabled !== false,
        action: () => { if (it.enabled !== false) set(it.id); },
        sel: get() === it.id,
      }));
    };
    col("Mode", 180, CONFIG.modes, () => selMode, (v) => selMode = v);
    col("Difficulty", 650, CONFIG.difficulties.map((d) => ({ id: d.id, label: d.label })), () => selDiff, (v) => selDiff = v);
    col("Weapon", 1120, WEAPONS.map((w) => ({ id: w.id, label: w.name })), () => selWeapon, (v) => selWeapon = v);
    const dsel = CONFIG.difficulties.find((x) => x.id === selDiff);
    if (dsel && dsel.desc) UI.text(ctx, dsel.desc, 650 + bw / 2, top + 18 + 5 * (bh + gap) + 6, t.type.caption, "center", t.alpha.soft);

    const wsel = WEAPONS.find((x) => x.id === selWeapon);
    if (wsel) UI.text(ctx, wsel.blurb, W / 2, 552, t.type.body, "center", t.alpha.soft);

    if (selMode === "bossonly") {
      // boss gauntlet: pick the first boss (then it shuffles through the rest, tier-up after each)
      UI.text(ctx, "Boss Test cycles every boss, with a tier-up after each. Start with:", W / 2, 582, t.type.caption, "center", t.alpha.muted);
      const opts = [{ id: "shuffle", label: "Shuffle" }].concat(BOSS_ROSTER.map((b) => ({ id: b.id, label: b.name })));
      const bbw = 178, bbg = 10, totalw = opts.length * bbw + (opts.length - 1) * bbg, bx = (W - totalw) / 2;
      opts.forEach((o, i) => uiButtons.push({ x: bx + i * (bbw + bbg), y: 596, w: bbw, h: 40, size: 14, label: o.label, sel: selBoss === o.id, action: () => { selBoss = o.id; } }));
    } else {
      const msel = CONFIG.modes.find((x) => x.id === selMode);
      if (msel) UI.text(ctx, msel.blurb, W / 2, 588, t.type.caption, "center", t.alpha.muted);
    }

    uiButtons.push({ x: W / 2 - 230, y: 660, w: 200, h: 56, label: "START", action: () => startRun(selMode, selDiff) });
    uiButtons.push({ x: W / 2 + 30, y: 660, w: 200, h: 56, label: "BACK", action: () => { state = "menu"; } });
  }

  function renderHowto() {
    const t = UI.t, hx = W / 2 - 470;
    UI.header(ctx, "HOW TO PLAY", "movement, the blade, and the trick meter", eIn);
    const lines = [
      "Move:  A / D      Jump:  W / Space      Drop through platform:  hold S",
      "Dash:  Shift  (aim 8-way with WASD) — i-frames + cooldown",
      "Blade: move the mouse — clean CUTS beat pokes; commit the swing",
      "Throw / recall: right-click  (recall within the dashed ring)",
      "",
      "Slam:     hit while airborne, driving the blade DOWN  (bonus dmg)",
      "Power Slam: slam during a fast descent for big damage ⇊",
      "Launch:   a fast UP swing pops enemies airborne — juggle them",
      "Updraft:  launch while rising (jump / up-dash) for big damage ⇈",
      "Parry:    swing FAST through a shot — a perfect parry homes it back",
      "Trick:   chain varied tricks to raise your score multiplier",
      "",
      "Pause: P      Release mouse: Esc",
    ];
    lines.forEach((l, i) => { if (l) UI.text(ctx, l, hx, 206 + i * 31, t.type.body, "left", t.alpha.soft); });
    addBack();
  }

  function renderHighscores() {
    const t = UI.t, fx = LAY.fx, rx = LAY.rx;
    UI.header(ctx, "HIGH SCORES", "your best run in every mode", eIn);
    let y = 210, any = false;
    CONFIG.modes.forEach((m) => {
      CONFIG.difficulties.forEach((d) => {
        const b = getBest(m.id, d.id);
        if (!b.wave && !b.score) return;   // only show modes you've actually run (5 difficulties x 6 modes won't fit)
        any = true;
        UI.text(ctx, m.label + "  ·  " + d.label, fx, y, t.type.label);
        UI.text(ctx, "wave " + b.wave + "   ·   " + b.score + " pts   ·   " + fmtTime(b.time || 0), rx, y, t.type.label, "right", t.alpha.soft);
        UI.divider(ctx, fx, y + 11, rx - fx, 0.08);
        y += 34;
      });
    });
    if (!any) UI.text(ctx, "No runs recorded yet — go make some history.", W / 2, 360, t.type.body, "center", t.alpha.soft);
    addBack();
  }

  function renderSettings() {
    const t = UI.t, fx = W / 2 - 260, rx = W / 2 + 260;
    UI.header(ctx, "SETTINGS", "tune sound, feel, and feedback", eIn);
    const bw = 56, lo = rx - 240, hi = rx - bw, valX = (lo + bw + hi) / 2;   // stepper geometry, shared by every row
    let y = 252;
    const stepper = (label, valStr, dec, inc) => {
      UI.text(ctx, label, fx, y + 7, t.type.lead);
      uiButtons.push({ x: lo, y: y - 16, w: bw, h: 46, label: "−", action: dec });
      uiButtons.push({ x: hi, y: y - 16, w: bw, h: 46, label: "+", action: inc });
      UI.text(ctx, valStr, valX, y + 7, t.type.lead, "center");
      UI.divider(ctx, fx, y + 32, rx - fx, 0.1);
      y += 78;
    };
    stepper("Volume", Math.round(settings.vol * 100) + "%",
      () => { settings.vol = clamp(+(settings.vol - 0.1).toFixed(2), 0, 1); applySettings(); saveSettings(); },
      () => { settings.vol = clamp(+(settings.vol + 0.1).toFixed(2), 0, 1); applySettings(); saveSettings(); });
    // Music toggle — control right-anchored at rx so it lines up with the steppers
    UI.text(ctx, "Music", fx, y + 7, t.type.lead);
    uiButtons.push({ x: rx - 132, y: y - 16, w: 132, h: 46, label: settings.music ? "ON" : "OFF",
      sel: settings.music, action: () => { settings.music = !settings.music; applySettings(); saveSettings(); } });
    UI.divider(ctx, fx, y + 32, rx - fx, 0.1); y += 78;
    stepper("Mouse sensitivity", settings.sens.toFixed(2),
      () => { settings.sens = clamp(+(settings.sens - 0.1).toFixed(2), 0.2, 3); applySettings(); saveSettings(); },
      () => { settings.sens = clamp(+(settings.sens + 0.1).toFixed(2), 0.2, 3); applySettings(); saveSettings(); });
    stepper("Screen shake", Math.round(settings.shake * 100) + "%",
      () => { settings.shake = clamp(+(settings.shake - 0.25).toFixed(2), 0, 2); applySettings(); saveSettings(); },
      () => { settings.shake = clamp(+(settings.shake + 0.25).toFixed(2), 0, 2); applySettings(); saveSettings(); });
    // Graphics quality — cycles Auto / High / Low; Low drops the costly glow + motes
    UI.text(ctx, "Effects", fx, y + 7, t.type.lead);
    const gfxLabel = settings.gfx === "auto" ? ("AUTO (" + (GFX.low ? "LOW" : "HIGH") + ")") : (settings.gfx === "low" ? "LOW" : "HIGH");
    uiButtons.push({ x: rx - 200, y: y - 16, w: 200, h: 46, label: gfxLabel,
      action: () => { settings.gfx = settings.gfx === "auto" ? "high" : (settings.gfx === "high" ? "low" : "auto"); applySettings(); saveSettings(); } });
    UI.divider(ctx, fx, y + 32, rx - fx, 0.1); y += 78;
    // Legal — a CrazyGames Basic-launch requirement: an in-game mention of Terms & Privacy.
    UI.text(ctx, "By playing you agree to CrazyGames' Terms of Service and Privacy Policy.",
      fx, y + 2, t.type.caption, "left", t.alpha.muted);
    uiButtons.push({ x: fx, y: y + 18, w: 168, h: 42, label: "Terms of Service",
      action: () => window.open("https://www.crazygames.com/terms-and-conditions", "_blank", "noopener") });
    uiButtons.push({ x: fx + 180, y: y + 18, w: 168, h: 42, label: "Privacy Policy",
      action: () => window.open("https://www.crazygames.com/privacy", "_blank", "noopener") });
    addBack();
  }

  // ---- INDEX (bestiary): every enemy + boss, what they do, stats, and affixes ----
  const AFFIX_DESC = {
    tank: "+80% HP, heavier", swift: "+45% move speed", rapid: "fires 2× as fast",
    volley: "fires a 3-shot volley", armed: "+30% melee dmg & reach", warded: "gains a 60%-HP shield",
  };
  const AFFIX_COLOR = {}; AFFIXES.forEach((a) => { AFFIX_COLOR[a.id] = a.color; });
  const BESTIARY_CAT = { Charger: "melee", Shooter: "ranged", Flyer: "air", Bomber: "ranged", Armored: "melee", Priest: "support", Mender: "support", Herald: "support", Anchor: "support", Wraith: "air", Chimera: "melee" };

  const BESTIARY = [
    { name: "Charger", role: "MELEE RUSHER", variants: "Brawler · Stalker · Executioner · Gravedigger · Duelist",
      desc: "Closes the gap and commits a telegraphed bull-charge. Bait the lunge into a wall — a whiff leaves it stunned and wide open.",
      make: () => { const e = new Charger(0, 0); applyVariant(e, VARIANTS.charger[0]); return e; } },
    { name: "Shooter", role: "KITING RANGED", variants: "Rifleman · Marksman · Warlock · Chain Caster",
      desc: "Holds its distance, winds up a telegraphed shot, then kites away. Swing FAST through the shot to parry it back at them.",
      make: () => { const e = new Ranged(0, 0); applyVariant(e, VARIANTS.ranged[0]); return e; } },
    { name: "Flyer", role: "AERIAL SWOOPER", variants: "Dive Bomber · Swooper",
      desc: "Hovers out of reach, then dives along an arc. Launch it or meet it with an up-swing to knock it out of the sky.",
      make: () => { const e = new Flyer(0, 0); applyVariant(e, VARIANTS.flyer[0]); return e; } },
    { name: "Bomber", role: "ARCING ARTILLERY", variants: "Juggler · Trapper · Sludge · Geomancer",
      desc: "Lobs deflectable bombs from a standoff. Parry one back to detonate it in their face. Variants plant mines, mud, or walls.",
      make: () => { const e = new Bomber(0, 0); applyVariant(e, VARIANTS.bomber[0]); return e; } },
    { name: "Armored", role: "SHIELDED TANK", variants: "—",
      desc: "Plated on the side it faces; shrugs off ground hits. Launch it airborne to strip the guard, then punish — it enrages on break.",
      make: () => new Armored(0, 0) },
    { name: "Priest", role: "SUPPORT · SHIELDS", variants: "—",
      desc: "Hangs back and shields nearby allies. Cut the link beam, or rush the priest itself, to drop their protection.",
      make: () => new Support(0, 0, "priest") },
    { name: "Mender", role: "SUPPORT · HEALS", variants: "—",
      desc: "Steadily heals the most wounded ally. Kill it first, or your damage just gets undone.",
      make: () => new Support(0, 0, "mender") },
    { name: "Herald", role: "SUPPORT · EMPOWERS", variants: "—",
      desc: "Hastes and empowers the pack around it. The whole wave hits harder and faster while it lives.",
      make: () => new Support(0, 0, "herald") },
    { name: "Anchor", role: "SUPPORT · ROOTS", variants: "—",
      desc: "Fragile, but snares you in place from range. Break its line to you, or kill it fast before the root lands.",
      make: () => new Support(0, 0, "anchor") },
    { name: "Wraith", role: "PHASING STALKER", variants: "—",
      desc: "Fades in and out of reach and is hard to pin down. Strike in the brief window it turns solid.",
      make: () => new Wraith(0, 0) },
    { name: "Chimera", role: "ADAPTIVE MIMIC", variants: "—",
      desc: "Adopts the attacks of whatever enemy types share its wave — it might charge, shoot, or bomb you. No two are alike.",
      make: () => new Chimera(0, 0) },
  ];
  const BESTIARY_BOSS = [
    { name: "The Warden", role: "STAGE 1 — THE GROUNDS", boss: true,
      desc: "Keeper of order. Slams shockwaves across the floor, paints prohibited red zones, and in its final phase dives from the ceiling.",
      make: () => new Warden(0, 0) },
    { name: "Iron Colossus", role: "STAGE 2 — THE UNDERCROFT", boss: true,
      desc: "A containment engine. Front-shielded — strike from the air. Hurls a bouncing sweeper, heats floor panels, then charges you down.",
      make: () => new Colossus(0, 0) },
    { name: "Berserker King", role: "STAGE 3 — THE CRIMSON FIELDS", boss: true,
      desc: "Aldric. A pure duel that becomes a throne of fire — then a fake death, a frenzy, and summoned adds. He cannot die during the fall.",
      make: () => new Aldric(0, 0) },
    { name: "The Echo", role: "STAGE 4 — THE VOIDSPIRE", boss: true,
      desc: "You. Mirrors your last trick on a delay; repeat yourself and it anticipates. Splits in two, then vanishes in a blinding white-out.",
      make: () => new Echo(0, 0) },
  ];
  let bestiaryCache = null;
  function bestiary() {
    if (!bestiaryCache) {
      const safe = (m) => { try { return m(); } catch (e) { return null; } };
      const mobs = BESTIARY.map((b) => ({ b, inst: safe(b.make), boss: false, cat: BESTIARY_CAT[b.name] || "melee" }));
      const bosses = BESTIARY_BOSS.map((b) => ({ b, inst: safe(b.make), boss: true, cat: "boss" }));
      bestiaryCache = { all: mobs.concat(bosses) };
    }
    return bestiaryCache;
  }
  const PREVIEW_PLAYER = { x: 360, y: 0, hw: 16, hh: 25, facing: 1, invulnerable: false, dashTimer: 0, vx: 0, vy: 0, onGround: true };
  function drawCreature(inst, bx, by, bw, bh) {
    if (!inst) { ctx.fillStyle = "#eee"; ctx.fillRect(bx + 8, by + 8, bw - 16, bh - 16); return; }
    const maxDim = Math.max(inst.hw * 2, inst.hh * 2) + 18;
    const sc = Math.min((bw - 22) / maxDim, (bh - 22) / maxDim);
    inst.x = 0; inst.y = 0; inst.facing = 1; inst.flash = 0; inst.stun = 0; inst.spawnT = 0; inst._noBar = true;
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
    ctx.translate(bx + bw / 2, by + bh / 2); ctx.scale(sc, sc);
    try { inst.draw(ctx, PREVIEW_PLAYER); } catch (e) { /* fall back to nothing */ }
    ctx.restore();
  }
  function statChip(x, y, label, val) {
    const t = UI.t, w = 92, h = 26;
    ctx.strokeStyle = t.color.disabled; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
    UI.tag(ctx, label, x + 9, y + 17, t.color.muted, "left", t.type.micro);
    ctx.fillStyle = "#000"; ctx.font = UI.font(t.type.caption, true); ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
    ctx.fillText(val, x + w - 9, y + 17);
    return x + w + 8;
  }
  function affixChip(x, y, id) {
    const c = AFFIX_COLOR[id] || "#888", txt = id.toUpperCase();
    ctx.font = UI.font(UI.t.type.micro, true); const w = ctx.measureText(txt).width + 16;
    ctx.fillStyle = c; ctx.globalAlpha = 0.16; ctx.fillRect(x, y - 13, w, 18); ctx.globalAlpha = 1;
    ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.strokeRect(x, y - 13, w, 18);
    ctx.fillStyle = c; ctx.textAlign = "left"; ctx.fillText(txt, x + 8, y);
    return x + w + 7;
  }
  function wrapLeft(text, x, y, maxW, lh, size, alpha) {
    ctx.font = UI.font(size, false); ctx.textAlign = "left"; ctx.fillStyle = "#000"; ctx.globalAlpha = alpha == null ? 1 : alpha;
    const words = text.split(" "); let line = "", yy = y;
    for (const w of words) { const test = line ? line + " " + w : w; if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = test; }
    if (line) ctx.fillText(line, x, yy);
    ctx.globalAlpha = 1; return yy;
  }
  function drawBestiaryEntry(row, x, y, w, h) {
    const t = UI.t, inst = row.inst, b = row.b, ac = row.boss ? t.color.danger : t.color.accent, rx = x + w;
    UI.panel(ctx, x, y, w, h);
    ctx.fillStyle = ac; ctx.fillRect(x, y, 6, h);
    // preview
    const bw = 132, bx = x + 18, by = y + (h - 132) / 2;
    ctx.strokeStyle = t.color.disabled; ctx.lineWidth = 1.5; ctx.strokeRect(bx, by, bw, 132);
    drawCreature(inst, bx, by, bw, 132);
    // header line: name + role
    const ix = bx + bw + 22;
    ctx.fillStyle = "#000"; ctx.font = UI.font(t.type.lead, true); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    const nameW = ctx.measureText(b.name).width;
    ctx.fillText(b.name, ix, y + 34);
    UI.tag(ctx, b.role, ix + nameW + 14, y + 34, ac, "left", t.type.micro);
    // stat chips
    const hp = inst ? Math.round(inst.maxHp) : "—", dmg = inst ? Math.round(inst.contactDmg) : "—", spd = inst ? Math.round(inst.speed || 0) : "—";
    let sx = statChip(ix, y + 46, "HP", "" + hp);
    sx = statChip(sx, y + 46, row.boss ? "TOUCH" : "DMG", "" + dmg);
    if (!row.boss) sx = statChip(sx, y + 46, "SPD", "" + spd);
    // description
    wrapLeft(b.desc, ix, y + 90, rx - ix - 24, 21, t.type.caption, t.alpha.soft);
    // variants line
    if (b.variants && b.variants !== "—") UI.tag(ctx, "VARIANTS:  " + b.variants, ix, y + h - 38, t.color.muted, "left", t.type.micro);
    // bottom line: affix chips (mobs) or a phase note (bosses)
    if (row.boss) {
      UI.tag(ctx, "MULTI-PHASE  —  attacks escalate as its health falls", ix, y + h - 14, t.color.danger, "left", t.type.micro);
    } else if (inst) {
      ctx.font = UI.font(t.type.micro, true); ctx.fillStyle = t.color.muted; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText("CAN ROLL:", ix, y + h - 14);
      let axx = ix + ctx.measureText("CAN ROLL:").width + 12;
      for (const a of AFFIXES.filter((a) => a.appliesTo(inst))) axx = affixChip(axx, y + h - 14, a.id);
    }
  }
  function renderBestiary() {
    const t = UI.t;
    UI.header(ctx, "INDEX", "every foe — what it does, its stats, and the affixes it can roll", eIn);
    // filter chips (like the ABILITIES tab)
    const cats = [["all", "ALL"], ["melee", "MELEE"], ["ranged", "RANGED"], ["air", "AIR"], ["support", "SUPPORT"], ["boss", "BOSS"]];
    const cw0 = 120, cg = 8, totalC = cats.length * cw0 + (cats.length - 1) * cg, cx0 = (W - totalC) / 2;
    cats.forEach(([id, label], i) => uiButtons.push({ x: cx0 + i * (cw0 + cg), y: 150, w: cw0, h: 30, label, size: t.type.micro, chip: true, sel: bestiaryFilter === id, action: () => { bestiaryFilter = id; listScroll = 0; } }));
    // 2-column grid of the filtered roster
    const rows = bestiary().all.filter((r) => bestiaryFilter === "all" || r.cat === bestiaryFilter);
    const cols = 2, mx = 72, gap = 26, cardW = (W - mx * 2 - gap) / cols, cardH = 168, stride = cardH + 18, top = 206, vis = 3;
    const gridRows = Math.ceil(rows.length / cols), maxOff = Math.max(0, gridRows - vis);
    const off = clamp(Math.round(listScroll / stride), 0, maxOff);
    for (let r = 0; r < vis; r++) for (let c = 0; c < cols; c++) {
      const idx = (off + r) * cols + c; if (idx >= rows.length) continue;
      drawBestiaryEntry(rows[idx], mx + c * (cardW + gap), top + r * stride, cardW, cardH);
    }
    if (maxOff > 0) UI.scrollHint(ctx, W / 2, top + vis * stride - 14, off > 0, off < maxOff);
    UI.tag(ctx, "affixes: up to 3 per enemy, each ≈ (wave−1)×6% per slot — chaos scales with the wave", W / 2, top + vis * stride + 4, t.color.muted, "center", t.type.micro);
    addBack();
  }

  // a juicy choice card shared by the upgrade draft and the boss tier-up screen.
  // Deals in from below with a stagger; on hover it lifts, scales, and lights its
  // category accent. Hitbox stays at rest while the visual animates.
  function choiceCard(i, n, o) {
    const t = UI.t, cw = 322, gap = 34, ch = 384;
    const total = cw * n + gap * (n - 1), x0 = (W - total) / 2, y0 = 248;
    const x = x0 + i * (cw + gap), ac = o.accent;
    const hovered = (Input.mouseX >= x && Input.mouseX <= x + cw && Input.mouseY >= y0 && Input.mouseY <= y0 + ch) || i === focus;
    const a = hoverAnim["cc" + i] = lerp(hoverAnim["cc" + i] || 0, hovered ? 1 : 0, clamp(14 * lastUiDt, 0, 1));
    const ce = clamp(ez((enterT - i * 0.08) / 0.34), 0, 1);
    ctx.save();
    ctx.globalAlpha = ce;
    ctx.translate(0, (1 - ce) * 46 - a * 12);                       // deal-in from below + hover lift
    const cx = x + cw / 2, cy = y0 + ch / 2, s = 1 + a * 0.035;
    ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
    ctx.globalAlpha = ce * (0.1 + a * 0.18); ctx.fillStyle = "#000"; ctx.fillRect(x + 5, y0 + 10, cw, ch);   // shadow
    ctx.globalAlpha = ce;
    ctx.fillStyle = "#fff"; ctx.fillRect(x, y0, cw, ch);
    ctx.globalAlpha = ce * (0.04 + a * 0.08); ctx.fillStyle = ac; ctx.fillRect(x, y0, cw, ch);               // category wash
    ctx.globalAlpha = ce;
    ctx.lineWidth = 2 + a * 2.5; ctx.strokeStyle = a > 0.35 ? ac : "#000"; ctx.strokeRect(x, y0, cw, ch);
    ctx.fillStyle = ac; ctx.fillRect(x, y0, cw, 9);                 // top accent strip
    // keybind badge
    ctx.fillStyle = ac; ctx.fillRect(x + cw - 46, y0 + 24, 30, 30);
    ctx.fillStyle = "#fff"; ctx.font = UI.font(t.type.label, true); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("" + (i + 1), x + cw - 31, y0 + 40); ctx.textBaseline = "alphabetic";
    UI.tag(ctx, o.tag, x + 22, y0 + 44, o.tagColor || ac, "left", t.type.micro);
    // name (shrink to fit)
    ctx.fillStyle = "#000"; ctx.textAlign = "center";
    let ns = t.type.title; ctx.font = UI.font(ns, true);
    while (ctx.measureText(o.name).width > cw - 44 && ns > t.type.body) { ns--; ctx.font = UI.font(ns, true); }
    ctx.fillText(o.name, cx, y0 + 96);
    ctx.fillStyle = ac; ctx.fillRect(cx - 28, y0 + 110, 56, 3);     // accent divider
    let descY = y0 + 154;
    if (o.pips) {
      for (let p = 0; p < 3; p++) {
        const px = cx - 26 + p * 26, py = y0 + 136;
        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2);
        if (p < o.pips.next - 1) { ctx.fillStyle = ac; ctx.fill(); }
        else if (p === o.pips.next - 1) { ctx.strokeStyle = ac; ctx.lineWidth = 2.5; ctx.stroke(); }
        else { ctx.strokeStyle = t.color.disabled; ctx.lineWidth = 1.5; ctx.stroke(); }
      }
      descY = y0 + 172;
    }
    wrapText(o.desc, x + 26, descY, cw - 52, 25, t.type.body);
    if (o.foot) UI.tag(ctx, o.foot, cx, y0 + ch - 24, t.color.muted, "center", t.type.caption);
    UI.tag(ctx, a > 0.5 ? "▸  SELECT" : "press  [ " + (i + 1) + " ]", cx, y0 + ch - 46, a > 0.5 ? ac : t.color.muted, "center", t.type.micro);
    ctx.restore();
    uiButtons.push({ x, y: y0, w: cw, h: ch, _hideBox: true, action: o.action });
  }

  function renderDraft() {
    const t = UI.t;
    UI.dim(ctx, W, H, 0.84);
    UI.title(ctx, "WAVE " + run.wave + " CLEARED", W / 2, 122, t.type.display);
    ctx.fillStyle = t.color.accent; ctx.globalAlpha = clamp(ez(enterT / 0.3), 0, 1); ctx.fillRect(W / 2 - 80, 140, 160, 3); ctx.globalAlpha = 1;
    UI.text(ctx, "CHOOSE AN UPGRADE  ·  press 1 / 2 / 3", W / 2, 176, t.type.caption, "center", t.alpha.muted);
    draftChoices.forEach((up, i) => {
      const cat = ABIL_CATS[up.cat] || ABIL_CATS.utility, owned = run.mods.owned[up.id] || 0, bd = abilBadge(up);
      choiceCard(i, draftChoices.length, {
        accent: up.tiers ? SPECIAL_COLOR : cat.color,
        tag: bd.label + "  ·  " + cat.name, tagColor: bd.color,
        name: up.name, desc: up.desc, foot: owned ? "owned ×" + owned : null,
        action: () => chooseUpgrade(i),
      });
    });
  }

  function wrapText(text, x, y, maxW, lh, size, col) {
    ctx.font = UI.font(size, false); ctx.textAlign = "center"; ctx.fillStyle = col || "#000";
    const words = text.split(" "); let line = "", yy = y;
    const cx = x + maxW / 2;
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, cx, yy); line = w; yy += lh; }
      else line = test;
    }
    if (line) ctx.fillText(line, cx, yy);
  }

  function chooseUpgrade(i) {
    const up = draftChoices[i];
    if (up) applyUpgrade(up, { player, blade, mods: run.mods });
    Input.consumeDelta();   // flush any movement built up while the cursor was free
    startNextWave();
    state = "playing";
    requestLock();          // re-capture automatically (we're inside the pick gesture)
  }

  // boss-kill reward: evolve one owned ability to its next tier
  function renderTierUp() {
    const t = UI.t;
    UI.dim(ctx, W, H, 0.86);
    UI.title(ctx, "THE WAY OPENS", W / 2, 122, t.type.display);
    ctx.fillStyle = t.color.accent; ctx.globalAlpha = clamp(ez(enterT / 0.3), 0, 1); ctx.fillRect(W / 2 - 80, 140, 160, 3); ctx.globalAlpha = 1;
    UI.text(ctx, "THE BOSS FALLS  ·  EVOLVE AN ABILITY", W / 2, 176, t.type.caption, "center", t.alpha.muted);
    tierChoices.forEach((up, i) => {
      const cat = ABIL_CATS[up.cat] || ABIL_CATS.utility, next = (run.mods.tier[up.id] || 1) + 1;
      choiceCard(i, tierChoices.length, {
        accent: cat.color,
        tag: "EVOLVE → TIER " + next + "  ·  " + cat.name, tagColor: cat.color,
        name: up.name, desc: nextTierDesc(up, run.mods), pips: { next },
        action: () => chooseTierUp(i),
      });
    });
  }

  function chooseTierUp(i) {
    const up = tierChoices[i];
    if (up) tierUp(up.id, { player, blade, mods: run.mods });
    Input.consumeDelta();
    startNextWave();
    state = "playing";
    requestLock();
  }

  function renderPaused() {
    UI.dim(ctx, W, H, 0.8);
    UI.title(ctx, "PAUSED", W / 2, 220, UI.t.type.display);
    vmenu([
      { label: "RESUME", action: () => { state = "playing"; requestLock(); } },
      { label: "RESTART", action: () => startRun(run.mode, run.diff) },
      { label: "MAIN MENU", action: () => { state = "confirmquit"; } },
    ], W / 2, 300, 280, UI.t.metric.btnH, UI.t.metric.btnGap);
  }

  function quitRun() {
    // save progress from the last fully-cleared wave, then bail to the menu
    const completed = run.waveLog.length;
    if (completed > 0) { saveBest(run.mode, run.diff, completed, run.score, run.runTime); awardCoins(run.score); }
    state = "menu";
  }

  function renderConfirmQuit() {
    UI.dim(ctx, W, H, 0.85);
    UI.title(ctx, "QUIT RUN?", W / 2, 250, UI.t.type.display);
    UI.text(ctx, "Your progress (cleared waves & score) is saved to High Scores.", W / 2, 300, UI.t.type.body, "center", UI.t.alpha.soft);
    uiButtons.push({ x: W / 2 - 230, y: 350, w: 200, h: 56, label: "QUIT", action: quitRun });
    uiButtons.push({ x: W / 2 + 30, y: 350, w: 200, h: 56, label: "CANCEL", action: () => { state = "paused"; } });
  }

  // CrazyGames: the rewarded-ad revive — a one-time "watch an ad to get back up"
  // offered the first time the player would fall in a run (only when ads are live).
  function reviveByAd() {
    continueT = 1e9;   // freeze the expiry while the ad is requested / plays
    CG.rewarded(
      () => {   // reward granted: rise with 35% HP, same feel as Second Wind
        player.hp = Math.round(player.maxHp * 0.35); player.iframe = 1.6; run.adRevived = true;
        FX.ring(player.x, player.y, 16, CONFIG.colors.perfect); FX.burst(player.x, player.y, 0, -1, 16, CONFIG.colors.perfect);
        addFloater(player.x, player.y - 44, "REVIVED", true, CONFIG.colors.perfect);
        addShake(CONFIG.juice.shakeBig); addFlash(CONFIG.juice.flashParry); SFX.parry();
        state = "playing"; requestLock();
      },
      (ok) => { if (!ok && state === "continue") continueT = 5; },   // declined / no ad: a moment to decide, then it lapses
    );
  }

  function renderContinue() {
    UI.dim(ctx, W, H, 0.85);
    UI.title(ctx, "YOU FELL", W / 2, 220, UI.t.type.display);
    UI.text(ctx, "Watch a short ad to revive with 35% health and keep this run going.",
      W / 2, 290, UI.t.type.body, "center", UI.t.alpha.soft);
    UI.text(ctx, "Offer lapses in " + Math.max(0, Math.ceil(continueT > 1e8 ? 0 : continueT)) + "s",
      W / 2, 322, UI.t.type.caption, "center", UI.t.alpha.muted);
    uiButtons.push({ x: W / 2 - 250, y: 360, w: 300, h: 60, label: "REVIVE  ▶ WATCH AD", action: reviveByAd });
    uiButtons.push({ x: W / 2 + 80, y: 360, w: 170, h: 60, label: "GIVE UP", action: () => endRun() });
  }

  function drawResultsTable(startY) {
    const t = UI.t, log = overInfo.log;
    const tx = W / 2 - 270, tw = 540;
    let ty = startY;
    ctx.fillStyle = UI.ink; ctx.font = UI.font(t.type.label, true);
    ctx.textAlign = "left"; ctx.fillText("WAVE", tx, ty);
    ctx.textAlign = "right"; ctx.fillText("TIME", tx + 200, ty); ctx.fillText("KILLS", tx + 330, ty); ctx.fillText("BEST TRICK", tx + tw, ty);
    UI.divider(ctx, tx, ty + 8, tw, t.alpha.full);
    ty += 30;
    const visible = 8, maxOff = Math.max(0, log.length - visible);
    const off = clamp(Math.round(listScroll / 26), 0, maxOff);
    for (const r of log.slice(off, off + visible)) {
      ctx.textAlign = "left"; UI.text(ctx, (r.died ? "✗ " : "") + r.wave, tx, ty, t.type.body);
      ctx.textAlign = "right";
      UI.text(ctx, r.time.toFixed(1) + "s", tx + 200, ty, t.type.body);
      UI.text(ctx, "" + r.kills, tx + 330, ty, t.type.body);
      UI.text(ctx, "x" + r.peak, tx + tw, ty, t.type.body);
      ty += 26;
    }
    if (maxOff > 0) UI.scrollHint(ctx, W / 2, ty + 6, off > 0, off < maxOff);
  }

  function renderGameover() {
    const t = UI.t;
    UI.dim(ctx, W, H, 0.9);
    UI.title(ctx, "DEFEATED", W / 2, 110, t.type.display);
    UI.text(ctx, "wave " + overInfo.wave + "   ·   " + overInfo.score + " pts   ·   " + fmtTime(overInfo.time), W / 2, 150, t.type.lead, "center");
    if (overInfo.isNew) UI.title(ctx, "NEW BEST!", W / 2, 184, t.type.title);
    else UI.text(ctx, "best: wave " + overInfo.best.wave + " · " + overInfo.best.score + " pts", W / 2, 184, t.type.caption, "center", t.alpha.muted);
    UI.text(ctx, "+" + overInfo.earned + " coins  (" + overInfo.coins + " total)", W / 2, 210, t.type.body, "center", t.alpha.soft);
    drawResultsTable(250);
    vmenu([
      { label: "RETRY", action: () => retryRun() },
      { label: "MAIN MENU", action: () => { state = "menu"; } },
    ], W / 2, 560, 260, t.metric.btnH, t.metric.btnGap);
  }

  // the rift's jagged path down the centre (deterministic), narrowing as it seals
  function riftPath(e) {
    ctx.beginPath();
    for (let y = 70; y <= H - 150; y += 16) {
      const jag = Math.sin(y * 0.06 + 3) * (10 + (1 - e) * 22) * Math.sin(y * 0.013 + 1);
      const x = W / 2 + jag * (1 - e * 0.55);
      if (y === 70) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  // the cinematic Adventure ending: the Tear sealing over a quiet void
  function renderEnding() {
    const t = UI.t, seal = clamp(winT / 2.4, 0, 1), e = ez(seal), accent = CONFIG.colors.perfect;
    // void backdrop
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0a0812"); g.addColorStop(1, "#130f24");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // drifting motes, released upward
    for (let i = 0; i < 46; i++) {
      const sx = (i * 137.5) % W, y0 = (i * 89.3) % H, y = ((y0 - winT * (14 + (i % 6) * 7)) % H + H) % H;
      ctx.globalAlpha = 0.1 + 0.1 * Math.sin(winT * 1.4 + i); ctx.fillStyle = i % 4 === 0 ? accent : "#6a5a9a";
      ctx.fillRect(sx, y, 2, 2);
    }
    ctx.globalAlpha = 1;
    // the rift, sealing
    ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = accent;
    for (let p = 0; p < 3; p++) { ctx.globalAlpha = ((1 - e) * 0.55 + 0.12) * (0.5 - p * 0.13); ctx.lineWidth = ((1 - e) * 84 + 4) * (1 - p * 0.26) + 3; riftPath(e); ctx.stroke(); }
    ctx.globalAlpha = 0.9; ctx.strokeStyle = "#eafaff"; ctx.lineWidth = Math.max(1.5, (1 - e) * 10 + 1.5); riftPath(e); ctx.stroke();
    ctx.restore();
    if (seal > 0.8 && seal < 0.95) { ctx.globalAlpha = (1 - Math.abs(seal - 0.875) / 0.075) * 0.45; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    // the survivor, watching it close
    ctx.fillStyle = "#ece9f7"; ctx.fillRect(W / 2 - 9, H - 138, 18, 40);
    ctx.fillStyle = accent; ctx.fillRect(W / 2 - 4, H - 128, 8, 5);
    // text on the void
    UI.ink = "#ece9f7";
    ctx.globalAlpha = clamp(winT / 0.5, 0, 1); UI.title(ctx, "THE TEAR CLOSES", W / 2, 118, t.type.display); ctx.globalAlpha = 1;
    ctx.fillStyle = accent; ctx.globalAlpha = clamp(winT - 0.4, 0, 1) * 0.8; ctx.fillRect(W / 2 - 100 * clamp(winT - 0.4, 0, 1), 136, 200 * clamp(winT - 0.4, 0, 1), 2); ctx.globalAlpha = 1;
    ctx.globalAlpha = clamp((winT - 0.7) / 1.3, 0, 1);
    wrapText(CAMPAIGN_ENDING, W / 2 - 380, 196, 760, 25, t.type.body, "#cfc9e6");
    ctx.globalAlpha = 1;
    UI.text(ctx, overInfo.score + " pts   ·   " + fmtTime(overInfo.time) + (overInfo.isNew ? "   ·   NEW BEST" : ""), W / 2, 446, t.type.caption, "center", clamp((winT - 1) / 1, 0, 1) * 0.75);
    UI.text(ctx, "+" + overInfo.earned + " coins  (" + overInfo.coins + " total)", W / 2, 468, t.type.caption, "center", clamp((winT - 1) / 1, 0, 1) * 0.5);
    if (winT > 1.6) vmenu([
      { label: "DESCEND AGAIN", action: () => retryRun() },
      { label: "MAIN MENU", action: () => { state = "menu"; } },
    ], W / 2, 506, 280, t.metric.btnH, t.metric.btnGap);
    // (UI.ink stays light: the ending's buttons + cursor read on the void)
  }

  function renderWin() {
    const t = UI.t;
    if (overInfo.campaign) { renderEnding(); return; }   // the cinematic finale
    UI.dim(ctx, W, H, 0.92);
    UI.title(ctx, "VICTORY", W / 2, 110, t.type.display);
    UI.text(ctx, "boss down!   ·   " + overInfo.score + " pts   ·   " + fmtTime(overInfo.time), W / 2, 152, t.type.lead, "center");
    if (overInfo.isNew) UI.title(ctx, "NEW BEST!", W / 2, 184, t.type.title);
    UI.text(ctx, "+" + overInfo.earned + " coins  (" + overInfo.coins + " total)", W / 2, 210, t.type.body, "center", t.alpha.soft);
    drawResultsTable(250);
    vmenu([
      { label: "PLAY AGAIN", action: () => retryRun() },
      { label: "MAIN MENU", action: () => { state = "menu"; } },
    ], W / 2, 560, 260, t.metric.btnH, t.metric.btnGap);
  }

  // highlight hovered / keyboard-focused / selected, then draw — with juice:
  // a hover scale-pop, a staggered entrance slide, and an accent focus caret.
  function drawButtons() {
    const k = clamp(12 * lastUiDt, 0, 1);
    for (let i = 0; i < uiButtons.length; i++) {
      const b = uiButtons[i];
      if (b._hideBox) continue;
      const hovered = UI.pointIn(b, Input.mouseX, Input.mouseY) && b.enabled !== false;
      const active = hovered || b.sel || i === focus;
      // persistent hover progress (keyed by label+position so it's stable per frame)
      const key = b._k || (b._k = (b.label || "") + "@" + Math.round(b.x) + "," + Math.round(b.y));
      const a = hoverAnim[key] = lerp(hoverAnim[key] || 0, active ? 1 : 0, k);
      // staggered entrance (only while a menu screen is settling in)
      const eb = ez((enterT - i * 0.025) / 0.2);
      ctx.save();
      ctx.globalAlpha = eb;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2, sc = 1 + a * 0.04;
      ctx.translate(cx, cy + (1 - eb) * 14); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
      if (b.chip) UI.chip(ctx, b, active);
      else UI.button(ctx, b, active);
      ctx.restore();
      // accent caret beside the focused/hovered primary buttons (not chips or selectors)
      if (a > 0.02 && eb > 0.85 && !b.chip && !b.sel) UI.caret(ctx, b.x - 14, cy, a, UI.t.color.accent);
    }
  }

  // unified menu/draft input: mouse hover + click, arrow/WASD nav, Enter/Space, 1/2/3
  function handleUI() {
    if (state === "playing") return;
    listScroll = clamp(listScroll + Input.takeWheel(), 0, 6000);
    const enabled = [];
    uiButtons.forEach((b, i) => { if (b.enabled !== false) enabled.push(i); });
    if (!enabled.length) { Input.takeClick(); return; }

    // mouse hover moves focus
    for (const i of enabled) if (UI.pointIn(uiButtons[i], Input.mouseX, Input.mouseY)) focus = i;

    let pos = enabled.indexOf(focus);
    if (pos < 0) { pos = 0; focus = enabled[0]; }
    if (Input.menuPrev()) { pos = (pos - 1 + enabled.length) % enabled.length; focus = enabled[pos]; }
    if (Input.menuNext()) { pos = (pos + 1) % enabled.length; focus = enabled[pos]; }

    // draft quick-select
    if (state === "draft") {
      if (Input.pressed.has("Digit1")) return chooseUpgrade(0);
      if (Input.pressed.has("Digit2")) return chooseUpgrade(1);
      if (Input.pressed.has("Digit3")) return chooseUpgrade(2);
    }

    if (Input.confirmPressed()) { const b = uiButtons[focus]; if (b && b.enabled !== false) { SFX.ui(); b.action(); return; } }

    const c = Input.takeClick();
    if (c) for (const b of uiButtons) { if (b.enabled !== false && UI.pointIn(b, c.x, c.y)) { SFX.ui(); b.action(); break; } }
  }

  requestAnimationFrame(frame);
})();

