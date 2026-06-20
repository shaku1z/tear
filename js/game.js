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
    const cssW = canvas.clientWidth || W;
    const tw = Math.max(W, Math.round(cssW * dpr));
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
    const def = { sens: CONFIG.blade.aimSensitivity, shake: 1, vol: 0.6, music: true };
    try { return Object.assign(def, JSON.parse(localStorage.getItem("tear_settings") || "{}")); }
    catch (e) { return def; }
  }
  function applySettings() {
    CONFIG.blade.aimSensitivity = settings.sens;
    shakeScale = settings.shake;
    if (typeof SFX !== "undefined") { SFX.vol = settings.vol; SFX.musicOn = settings.music; SFX.setVol(settings.vol); SFX.setMusic(settings.music); }
  }
  if (typeof SFX !== "undefined") SFX.init();
  META.load();
  function awardCoins(score) {
    const earned = Math.floor(score * 0.05 * (1 + 0.15 * META.level("greed")));
    META.addCoins(earned);
    return earned;
  }
  function saveSettings() { try { localStorage.setItem("tear_settings", JSON.stringify(settings)); } catch (e) {} }
  applySettings();

  // ---- high scores ----
  function bestKey(mode, diff) { return `tear_best_${mode}_${diff}`; }
  function getBest(mode, diff) {
    try { return Object.assign({ wave: 0, score: 0, time: 0 }, JSON.parse(localStorage.getItem(bestKey(mode, diff)) || "{}")); }
    catch (e) { return { wave: 0, score: 0, time: 0 }; }
  }
  function saveBest(mode, diff, wave, score, time) {
    const b = getBest(mode, diff);
    if (wave > b.wave || (wave === b.wave && score > b.score)) {
      try { localStorage.setItem(bestKey(mode, diff), JSON.stringify({ wave, score, time: time || 0 })); } catch (e) {}
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
  let loreT = 0, loreText = "";       // lore card shown after a boss falls
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
  let codexFilter = "all";              // ABILITIES tab: category filter
  let codexSort = "category";           // ...and sort mode (category | name | type)
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
    FX.ring(x, y, 14, CONFIG.colors.bomber); FX.ring(x, y, 8, CONFIG.colors.bomber);
    FX.burst(x, y, 0, -1, 12, CONFIG.colors.bomber);
    addShake(CONFIG.juice.shakeBig); SFX.boom();
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
    run.score += Math.round(CONFIG.run.scorePerKill * run.wave * run.mult * CONFIG.run.scoreMult);
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
    };
    if (mode === "bossonly") {   // boss gauntlet: chosen boss first, then a shuffled cycle of the rest
      run.bossOrder = shuffledRoster();
      if (selBoss !== "shuffle") { run.bossOrder = run.bossOrder.filter((id) => id !== selBoss); run.bossOrder.unshift(selBoss); }
      run.bossIdx = 0; run.bossesBeaten = 0;
    }
    META.apply({ player, blade, mods: run.mods });
    startNextWave();
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
    }
    if (run.mode === "bossonly") {   // pick the next boss in the gauntlet (re-shuffle each cycle)
      if (run.bossIdx >= run.bossOrder.length) { run.bossOrder = shuffledRoster(); run.bossIdx = 0; }
      run.curBoss = run.bossOrder[run.bossIdx]; run.bossIdx++;
      loadStage(0);   // rebuild the arena fresh between bosses (restore ripped platforms, clear hazards)
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
      }
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

  // pick the boss for the current context: the campaign stage's named boss, else the Warden
  function makeBoss() {
    const id = (run.mode === "campaign") ? stageAt(stageIndex).boss
      : (run.mode === "bossonly") ? run.curBoss : "warden";
    if (id === "echo") return new Echo(W / 2, CONFIG.world.groundY - CONFIG.echo.h / 2);
    if (id === "aldric") return new Aldric(W / 2, CONFIG.world.groundY - CONFIG.aldric.h / 2);
    if (id === "colossus") return new Colossus(W / 2, CONFIG.world.groundY - CONFIG.colossus.h / 2);
    if (id === "warden") return new Warden(W / 2, CONFIG.world.groundY - 140);
    return new Boss(W / 2, CONFIG.world.groundY - 140);   // unbuilt stages -> placeholder
  }

  function spawnOne(spec) {
    let e;
    switch (spec.type) {
      case "ranged":  e = new Ranged(0, 0); break;
      case "flyer":   e = new Flyer(spawnSide(), 200); break;
      case "bomber":  e = new Bomber(0, 0); break;
      case "armored": e = new Armored(0, 0); break;
      case "boss":    e = makeBoss(); break;
      case "priest": case "herald": case "mender": case "anchor": e = new Support(0, 0, spec.type); break;
      case "wraith":  e = new Wraith(spawnSide(), 220); break;
      case "chimera": e = new Chimera(0, 0); break;
      default:        e = new Charger(0, 0);
    }
    if (spec.type !== "boss") {
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
      else if (run.mode === "bossonly" && run.bossesBeaten) { const s = 1 + run.bossesBeaten * 0.12; e.hp *= s; e.maxHp *= s; }     // gauntlet escalates each round
    }
    e.hpDisplay = e.hp;
    e.spawnT = 0.35;   // brief materialize so spawns read as spawns (not teleports)
    enemies.push(e);
  }

  // hammer "lob" throw: a shockwave + stun where the thrown blade lands
  function lobExplode(x, y) {
    const T = CONFIG.blade.throw;
    FX.ring(x, y, 16, CONFIG.colors.slam); FX.ring(x, y, 8, CONFIG.colors.slam);
    FX.burst(x, y, 0, -1, 12, CONFIG.colors.slam);
    addShake(CONFIG.juice.shakeBig); addZoom(CONFIG.juice.zoomBig); SFX.boom();
    dealAoE(x, y, T.lobRadius, Math.round(blade.throwDmg * 0.8));
    for (const e of enemies) if (!e.dead && len(e.x - x, e.y - y) <= T.lobRadius + e.radius) e.stun = Math.max(e.stun, T.lobStun);
  }

  function bomberBlast(e) {
    const C = CONFIG.bomber;
    FX.ring(e.x, e.y, 14, CONFIG.colors.bomber); FX.ring(e.x, e.y, 6, CONFIG.colors.bomber);
    FX.burst(e.x, e.y, 0, -1, 14, CONFIG.colors.bomber);
    addShake(CONFIG.juice.shakeBig); SFX.boom();
    dealAoE(e.x, e.y, C.blastRadius, C.blastDmg);
    if (len(player.x - e.x, player.y - e.y) <= C.blastRadius + player.hw) {
      { const r = player.takeDamage(C.blastDmg, e.x);
        if (r === "hit") { loseStyle(); SFX.hurt(); } else if (r === "absorbed") onShieldAbsorb(); }
    }
  }

  function updateWave(dt) {
    const R = CONFIG.run;
    if (run.spawnQueue.length && enemies.length < R.maxConcurrent) {
      if (enemies.length === 0 && run.spawnTimer > 0.3) run.spawnTimer = 0.3; // short beat (not an instant pop) when the screen empties
      run.spawnTimer -= dt;
      if (run.spawnTimer <= 0) { spawnOne(run.spawnQueue.shift()); run.spawnTimer = R.spawnInterval; }
    }
    // wave cleared -> wait a beat (let death FX finish) before the draft
    if (run.waveActive && run.spawnQueue.length === 0 && enemies.length === 0) {
      run.waveActive = false;
      run.waveLog.push({ wave: run.isBossWave ? "BOSS" : run.wave, time: run.waveTime, kills: run.waveKills, peak: run.wavePeak });
      if (run.isBossWave) {
        if (run.mode === "campaign" && stageIndex >= STAGES.length - 1) { winRun(true); return; }   // final biome cleared -> the ending
        if (run.mode === "campaign" || run.mode === "bossonly") {
          if (!player.oneHit) player.heal(R.healEachWave * 2);   // a boss kill is a milestone, not the end
          if (run.mode === "bossonly") run.bossesBeaten = (run.bossesBeaten || 0) + 1;
          run.bossCleared = true;
          run.clearTimer = R.waveClearPause * 1.6;
        } else { winRun(); return; }   // the Waves+Boss mode still ends in victory
      } else {
        if (!player.oneHit) player.heal(R.healEachWave);
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
          else { draftChoices = rollUpgrades(3, run.mods); state = "draft"; }   // nothing to evolve -> normal draft
        } else {
          draftChoices = rollUpgrades(3, run.mods);
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
  }

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
    // faster while unarmed (blade thrown)
    player.moveBoost = (blade.state !== "held") ? CONFIG.player.thrownMoveBoost : 1;
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
      if (dashGhostT <= 0) { FX.ghost(player.x, player.y, player.hw, player.hh); dashGhostT = CONFIG.juice.dashGhostInterval; }
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
        addFloater(aboss.x, aboss.y - 90, "NOT YET", true, CONFIG.colors.charger);
      }
      if (aboss.mode === "downed" && run.bossAdds && run.bossAdds.length && run.bossAdds.every((a) => a.dead)) {
        aboss.revive(); addFloater(aboss.x, aboss.y - 90, "FRENZY!", true, CONFIG.colors.charger); addShake(CONFIG.juice.shakeBig);
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
          // Crater: a Power Slam erupts in a shockwave that scales with descent
          if (empSlam && run.mods.crater) {
            const cr = 130 + descF * 110;
            dealAoE(e.x, e.y, cr, baseDmg * (0.7 + descF));
            FX.ring(e.x, e.y, 15, CONFIG.colors.slam); FX.ring(e.x, e.y, 9, CONFIG.colors.slam);
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
          if (blade.state === "returning" && run.mods.stormRecall) tdmg *= run.mods.stormMult;   // Storm Recall (tiered)
          if (run.mods.berserk && player.hp < player.maxHp * 0.5) tdmg *= 1.25;
          tdmg *= e.damageTakenMult();
          e.hit(tdmg, blade.vx, blade.vy);
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
            triggerSlowmo();
            if (fullCounter) FX.ring(p.x, p.y, 10, CONFIG.colors.perfect);
            if (run.mods.parryGuard) player.guardT = CONFIG.resilience.parryGuardTime;   // Riposte
            fire(run.mods.onParry, makeEv(p.x, p.y, null));
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
            e.hit(p.deflectDmg, p.vx, p.vy);
            FX.burst(p.x, p.y, p.vx, p.vy, CONFIG.juice.sparkCount, CONFIG.colors.deflected);
            addFloater(e.x, e.y - 26, Math.round(p.deflectDmg).toString(), p.perfect);
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

    if (player.hp <= 0) { endRun(); return; }
  }

  function onKill(e, cause) {
    addKillScore();
    if (e.affixCount) run.score += Math.round(CONFIG.run.scorePerKill * run.wave * run.mult * 0.4 * e.affixCount);
    FX.death(e.x, e.y, CONFIG.juice.deathShards, e.color);
    SFX.death();
    fire(run.mods.onKill, makeEv(e.x, e.y, e, cause));
    if (e.isBoss) {
      for (const p of projectiles) if (p.shock || p.sweeper) p.dead = true;   // clear the boss's lingering hazards
      if (run.mode === "campaign" && currentStage && currentStage.lore) { loreT = 7; loreText = currentStage.lore; }
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
    const playLike = state === "playing" || state === "draft" || state === "tierup" || state === "paused" || state === "gameover" || state === "win" || state === "confirmquit";
    // biome background (campaign tints the world; menus stay white)
    let bgCol = (playLike && run && run.mode === "campaign") ? currentStage.bg : "#fff";
    if (playLike && Array.isArray(enemies)) { const ef = enemies.find((e) => e.whiteFlash > 0); if (ef) bgCol = blendCol(bgCol, "#ffffff", ef.whiteFlash); }   // The Echo's white-out
    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, W, H);
    uiButtons = [];

    // theme: on a dark biome, flip the HUD / player / in-world text to light ink
    THEME.dark = !!(playLike && run && run.mode === "campaign" && currentStage && currentStage.dark);
    THEME.ink = THEME.dark ? "#ece9f7" : "#000";
    UI.ink = THEME.ink;

    if (playLike) {
      renderWorld();
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

    if (state === "menu") renderMenu();
    else if (state === "shop") renderShop();
    else if (state === "codex") renderCodex();
    else if (state === "setup") renderSetup();
    else if (state === "howto") renderHowto();
    else if (state === "highscores") renderHighscores();
    else if (state === "settings") renderSettings();
    else if (state === "draft") renderDraft();
    else if (state === "tierup") renderTierUp();
    else if (state === "paused") renderPaused();
    else if (state === "confirmquit") renderConfirmQuit();
    else if (state === "gameover") renderGameover();
    else if (state === "win") renderWin();

    // hover-draw buttons (skip in playing; draft draws its own cards)
    if (state !== "playing" && state !== "draft") drawButtons();

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

  function renderWorld() {
    ctx.save();
    // camera: zoom-punch + shake, both pivoting on screen center
    const cx = W / 2, cy = H / 2;
    let ox = 0, oy = 0;
    if (shake > 0 && state === "playing") { ox = (Math.random() * 2 - 1) * shake; oy = (Math.random() * 2 - 1) * shake; }
    ctx.translate(cx + ox, cy + oy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = (run && run.mode === "campaign") ? currentStage.plat : "#000";
    for (const p of platforms) ctx.fillRect(p.x, p.y, p.w, p.h);
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
    const ink = THEME.ink;
    const x = 20, y = 20, bw = 280;
    ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.strokeRect(x, y, bw, 18);
    ctx.fillStyle = ink; ctx.fillRect(x, y, bw * clamp(player.hp / player.maxHp, 0, 1), 18);
    if (player.oneHit) { ctx.fillStyle = ink; UI.text(ctx, "ONE-HIT", x + bw + 10, y + 15, 13); }

    // dash pips
    const ready = 1 - clamp(player.dashCd / CONFIG.dash.cooldown, 0, 1);
    ctx.strokeRect(x, y + 26, 120, 8);
    ctx.fillRect(x, y + 26, 120 * ready, 8);

    // Aegis shield pips (cyan) — only shown once Aegis is owned
    for (let i = 0; i < player.maxShield; i++) {
      const sx = x + 132 + i * 16;
      ctx.strokeStyle = CONFIG.colors.armoredShield; ctx.lineWidth = 2;
      ctx.strokeRect(sx, y + 26, 12, 8);
      if (i < player.shield) { ctx.fillStyle = CONFIG.colors.armoredShield; ctx.fillRect(sx, y + 26, 12, 8); }
    }
    ctx.strokeStyle = ink; ctx.fillStyle = ink;

    // owned abilities/upgrades list (left column)
    let oy = y + 52;
    for (const id in run.mods.owned) {
      const up = UPGRADES.find((u) => u.id === id);
      if (!up) continue;
      const label = (up.unique ? "★ " : "") + up.name + (up.unique ? "" : " x" + run.mods.owned[id]);
      UI.text(ctx, label, x, oy, 13, "left", 0.85);
      oy += 17;
    }

    // ---- center stack (kept off the edges so nothing clips) ----
    const remaining = enemies.length + run.spawnQueue.length;
    UI.title(ctx, run.isBossWave ? "BOSS" : "WAVE " + run.wave, W / 2, 40, 26);
    UI.text(ctx, "SCORE " + run.score + "    enemies left: " + remaining + "    " + fmtTime(run.runTime),
      W / 2, 64, 15, "center", 0.8);

    // trick meter (centered, colored by tier)
    if (run.mult > 1) {
      const tc = trickColor(run.mult);
      ctx.fillStyle = tc; ctx.font = UI.font(22, true); ctx.textAlign = "center";
      ctx.fillText("x" + run.mult + (run.rank ? "  " + run.rank : ""), W / 2, 96);
      const bw2 = 220, bx = W / 2 - bw2 / 2, by = 104;
      ctx.lineWidth = 1.5; ctx.strokeStyle = ink; ctx.strokeRect(bx, by, bw2, 6);
      ctx.fillStyle = tc; ctx.fillRect(bx, by, bw2 * clamp(run.comboTimer / CONFIG.trick.decay, 0, 1), 6);
    }
    ctx.textAlign = "left";

    // boss HP bar (centered, below the stack)
    const boss = enemies.find((e) => e.isBoss);
    if (boss) {
      const bbw = 560, bx = (W - bbw) / 2, by = 122;
      ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bbw, 14);
      ctx.fillStyle = ink; ctx.fillRect(bx, by, bbw * clamp(boss.hp / boss.maxHp, 0, 1), 14);
      UI.text(ctx, "BOSS", bx, by - 4, 12, "left", 0.7);
    }
  }

  function drawBanner() {
    const t = bannerT / CONFIG.juice.bannerTime;          // 1 -> 0
    const a = Math.sin((1 - t) * Math.PI);                // fade in then out
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    UI.title(ctx, run.isBossWave ? "BOSS" : "WAVE " + run.wave, W / 2, 150, 60 + (1 - a) * 10);
    ctx.restore();
  }

  // a boss-defeat lore caption at the top (non-blocking, fades over ~7s)
  function drawLore() {
    const a = Math.min(loreT, 1) * Math.min((7 - loreT) * 2, 1);
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    ctx.fillStyle = "#fff"; ctx.fillRect(W / 2 - 390, 28, 780, 104);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - 390, 28, 780, 104);
    ctx.fillStyle = currentStage.accent || "#000"; ctx.font = UI.font(13, true); ctx.textAlign = "center";
    ctx.fillText((currentStage.name || "STAGE").toUpperCase() + " — CLEARED", W / 2, 50);
    wrapText(loreText, W / 2 - 360, 72, 720, 18, 13);
    ctx.restore();
  }

  // campaign stage-transition banner ("STAGE N — Name")
  function drawStageBanner() {
    const a = Math.min(stageBannerT, 1) * Math.min((3.0 - stageBannerT) * 2.5, 1);
    const gauntlet = run && run.mode === "bossonly";
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); ctx.textAlign = "center";
    ctx.fillStyle = currentStage.accent || "#000"; ctx.font = UI.font(18, true);
    ctx.fillText(gauntlet ? "BOSS GAUNTLET" : "STAGE " + (stageIndex + 1), W / 2, H / 2 - 70);
    ctx.fillStyle = THEME.ink; ctx.font = UI.font(54, true);
    ctx.fillText(stageName || currentStage.name, W / 2, H / 2 - 22);
    ctx.globalAlpha = clamp(a, 0, 1) * 0.7; ctx.font = UI.font(18, false);
    ctx.fillText(gauntlet ? "" : (currentStage.blurb || ""), W / 2, H / 2 + 12);
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
  function vmenu(items, x, top, w, h, gap) {
    items.forEach((it, i) => {
      const b = { x: x - w / 2, y: top + i * (h + gap), w, h, label: it.label, enabled: it.enabled, action: it.action, size: it.size };
      uiButtons.push(b);
    });
  }

  function renderMenu() {
    UI.title(ctx, "T E A R", W / 2, 220, 84);
    UI.text(ctx, "a momentum-blade survival game", W / 2, 260, 16, "center", 0.6);
    UI.text(ctx, META.coins() + " coins", W / 2, 300, 18, "center", 0.7);
    vmenu([
      { label: "PLAY", action: () => { state = "setup"; } },
      { label: "SHOP", action: () => { state = "shop"; } },
      { label: "ABILITIES", action: () => { state = "codex"; } },
      { label: "HOW TO PLAY", action: () => { state = "howto"; } },
      { label: "HIGH SCORES", action: () => { state = "highscores"; } },
      { label: "SETTINGS", action: () => { state = "settings"; } },
    ], W / 2, 320, 300, 48, 12);
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

  function drawAbilityCard(x, y, w, h, up) {
    const cat = ABIL_CATS[up.cat] || ABIL_CATS.utility;
    const hovered = Input.mouseX >= x && Input.mouseX <= x + w && Input.mouseY >= y && Input.mouseY <= y + h;
    UI.panel(ctx, x, y, w, h);
    if (hovered) { ctx.globalAlpha = 0.05; ctx.fillStyle = "#000"; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
      ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeRect(x, y, w, h); }
    // category accent strip
    ctx.fillStyle = cat.color; ctx.fillRect(x, y, w, 6);
    ctx.textBaseline = "alphabetic";
    // top row: type tag (left) + category (right)
    ctx.font = UI.font(11, true);
    ctx.fillStyle = up.unique ? CONFIG.colors.perfect : "#999"; ctx.textAlign = "left";
    ctx.fillText(up.unique ? "★ UNIQUE" : "STACKS", x + 12, y + 26);
    ctx.fillStyle = cat.color; ctx.textAlign = "right";
    ctx.fillText(cat.name, x + w - 12, y + 26);
    // name (shrink to fit)
    ctx.fillStyle = "#000"; ctx.textAlign = "left";
    let ns = 21; ctx.font = UI.font(ns, true);
    while (ctx.measureText(up.name).width > w - 24 && ns > 13) { ns--; ctx.font = UI.font(ns, true); }
    ctx.fillText(up.name, x + 12, y + 54);
    // tier track: one pip per tier this ability has; the pip you're viewing is filled.
    // (clicking the card steps through the tiers — see renderCodex)
    const tierCount = 1 + (up.tiers ? up.tiers.length : 0);
    let view = codexTierView[up.id] || 0; if (view >= tierCount) view = 0;
    for (let i = 0; i < tierCount; i++) {
      ctx.beginPath(); ctx.arc(x + 17 + i * 16, y + 73, 5, 0, Math.PI * 2);
      if (i === view) { ctx.fillStyle = cat.color; ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 1.2; ctx.stroke(); }
      else { ctx.strokeStyle = cat.color; ctx.lineWidth = 2; ctx.stroke(); }
    }
    if (tierCount > 1) {
      ctx.fillStyle = cat.color; ctx.font = UI.font(11, true); ctx.textAlign = "left";
      ctx.fillText(view === 0 ? "BASE" : "TIER " + (view + 1), x + 17 + tierCount * 16 + 2, y + 77);
    }
    // description for the tier currently being viewed
    const desc = view === 0 ? up.desc : up.tiers[view - 1].desc;
    wrapText(desc, x + 12, y + 99, w - 24, 17, 12);
    // hint that the card cycles
    if (tierCount > 1) { ctx.fillStyle = "#9a9a9a"; ctx.font = UI.font(10, true); ctx.textAlign = "center"; ctx.fillText("click to step through tiers", x + w / 2, y + h - 8); }
  }

  function renderCodex() {
    UI.title(ctx, "ABILITIES", W / 2, 52, 34);
    UI.text(ctx, "★ unique = one-time  ·  others stack  ·  click a card to step through its tiers (boss-kill evolutions)",
      W / 2, 80, 13, "center", 0.55);

    // ---- filter chips (All + each category) + a sort toggle ----
    const chips = [["all", "ALL"]].concat(ABIL_CAT_ORDER.map((c) => [c, (ABIL_CATS[c].name)]));
    const cw0 = 96, cg = 6, totalC = chips.length * cw0 + (chips.length - 1) * cg;
    let cx0 = (W - totalC) / 2 - 70;
    chips.forEach(([id, label]) => {
      uiButtons.push({ x: cx0, y: 96, w: cw0, h: 28, label, size: 12, sel: codexFilter === id,
        action: () => { codexFilter = id; listScroll = 0; } });
      cx0 += cw0 + cg;
    });
    uiButtons.push({ x: cx0 + 8, y: 96, w: 150, h: 28, size: 12,
      label: "SORT: " + codexSort.toUpperCase(),
      action: () => { codexSort = codexSort === "category" ? "name" : (codexSort === "name" ? "type" : "category"); listScroll = 0; } });

    let list = UPGRADES.filter((u) => codexFilter === "all" || (u.cat || "utility") === codexFilter);
    list.sort((a, b) => {
      if (codexSort === "name") return a.name.localeCompare(b.name);
      if (codexSort === "type") return (a.unique ? 0 : 1) - (b.unique ? 0 : 1) || a.name.localeCompare(b.name);
      const ca = ABIL_CAT_ORDER.indexOf(a.cat || "utility"), cb = ABIL_CAT_ORDER.indexOf(b.cat || "utility");
      if (ca !== cb) return ca - cb;
      return (a.unique ? 1 : 0) - (b.unique ? 1 : 0);
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
    if (maxOff > 0) UI.text(ctx, (off > 0 ? "▲ " : "") + "scroll" + (off < maxOff ? " ▼" : ""), W / 2, H - 86, 13, "center", 0.5);
    uiButtons.push({ x: W / 2 - 100, y: H - 66, w: 200, h: 46, label: "BACK", action: () => { state = "menu"; } });
  }

  function renderShop() {
    UI.title(ctx, "SHOP", W / 2, 90, 40);
    UI.text(ctx, META.coins() + " coins", W / 2, 128, 22, "center");
    UI.text(ctx, "permanent upgrades, applied at the start of every run", W / 2, 152, 14, "center", 0.55);
    let y = 190;
    for (const it of SHOP) {
      const lv = META.level(it.id), maxed = lv >= it.maxLevel;
      UI.text(ctx, it.name + "   (" + lv + "/" + it.maxLevel + ")", W / 2 - 380, y + 20, 20);
      UI.text(ctx, it.desc, W / 2 - 380, y + 44, 14, "left", 0.6);
      uiButtons.push({ x: W / 2 + 250, y: y + 6, w: 140, h: 44,
        label: maxed ? "MAX" : META.cost(it) + "c",
        enabled: !maxed && META.canBuy(it),
        action: () => { if (META.buy(it)) SFX.ui(); } });
      y += 72;
    }
    uiButtons.push({ x: W / 2 - 100, y: H - 90, w: 200, h: 50, label: "BACK", action: () => { state = "menu"; } });
  }

  function renderSetup() {
    UI.title(ctx, "SELECT RUN", W / 2, 110, 40);
    const top = 175, bw = 300, bh = 50, gap = 12;
    const col = (label, x, items, get, set) => {
      UI.text(ctx, label, x, top, 18, "left", 0.6);
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

    const wsel = WEAPONS.find((x) => x.id === selWeapon);
    if (wsel) UI.text(ctx, wsel.blurb, W / 2, 552, 16, "center", 0.8);

    if (selMode === "bossonly") {
      // boss gauntlet: pick the first boss (then it shuffles through the rest, tier-up after each)
      UI.text(ctx, "Boss Test cycles every boss, with a tier-up after each. Start with:", W / 2, 582, 14, "center", 0.6);
      const opts = [{ id: "shuffle", label: "Shuffle" }].concat(BOSS_ROSTER.map((b) => ({ id: b.id, label: b.name })));
      const bbw = 178, bbg = 10, totalw = opts.length * bbw + (opts.length - 1) * bbg, bx = (W - totalw) / 2;
      opts.forEach((o, i) => uiButtons.push({ x: bx + i * (bbw + bbg), y: 596, w: bbw, h: 40, size: 14, label: o.label, sel: selBoss === o.id, action: () => { selBoss = o.id; } }));
    } else {
      const msel = CONFIG.modes.find((x) => x.id === selMode);
      if (msel) UI.text(ctx, msel.blurb, W / 2, 588, 14, "center", 0.55);
    }

    uiButtons.push({ x: W / 2 - 230, y: 660, w: 200, h: 56, label: "START", action: () => startRun(selMode, selDiff) });
    uiButtons.push({ x: W / 2 + 30, y: 660, w: 200, h: 56, label: "BACK", action: () => { state = "menu"; } });
  }

  function renderHowto() {
    UI.title(ctx, "HOW TO PLAY", W / 2, 110, 40);
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
    ctx.textAlign = "left";
    lines.forEach((l, i) => UI.text(ctx, l, 230, 180 + i * 32, 18));
    uiButtons.push({ x: W / 2 - 100, y: 600, w: 200, h: 52, label: "BACK", enabled: true, action: () => { state = "menu"; } });
  }

  function renderHighscores() {
    UI.title(ctx, "HIGH SCORES", W / 2, 130, 40);
    let y = 230;
    CONFIG.modes.forEach((m) => {
      CONFIG.difficulties.forEach((d) => {
        const b = getBest(m.id, d.id);
        UI.text(ctx, `${m.label} · ${d.label}`, W / 2 - 360, y, 20);
        ctx.textAlign = "right";
        UI.text(ctx, `wave ${b.wave}   ·   ${b.score} pts   ·   ${fmtTime(b.time || 0)}`, W / 2 + 360, y, 20);
        ctx.textAlign = "left";
        y += 44;
      });
    });
    uiButtons.push({ x: W / 2 - 100, y: 600, w: 200, h: 52, label: "BACK", enabled: true, action: () => { state = "menu"; } });
  }

  function renderSettings() {
    UI.title(ctx, "SETTINGS", W / 2, 120, 40);
    const row = (label, valStr, y, dec, inc) => {
      UI.text(ctx, label, W / 2 - 320, y + 22, 22);
      UI.text(ctx, valStr, W / 2 + 130, y + 22, 22, "center");
      uiButtons.push({ x: W / 2 + 60, y, w: 50, h: 36, label: "-", action: dec });
      uiButtons.push({ x: W / 2 + 200, y, w: 50, h: 36, label: "+", action: inc });
    };
    row("Volume", Math.round(settings.vol * 100) + "%", 200,
      () => { settings.vol = clamp(+(settings.vol - 0.1).toFixed(2), 0, 1); applySettings(); saveSettings(); },
      () => { settings.vol = clamp(+(settings.vol + 0.1).toFixed(2), 0, 1); applySettings(); saveSettings(); });
    // music toggle
    UI.text(ctx, "Music", W / 2 - 320, 292, 22);
    uiButtons.push({ x: W / 2 + 60, y: 270, w: 190, h: 36, label: settings.music ? "ON" : "OFF",
      action: () => { settings.music = !settings.music; applySettings(); saveSettings(); } });
    row("Mouse sensitivity", settings.sens.toFixed(2), 340,
      () => { settings.sens = clamp(+(settings.sens - 0.1).toFixed(2), 0.2, 3); applySettings(); saveSettings(); },
      () => { settings.sens = clamp(+(settings.sens + 0.1).toFixed(2), 0.2, 3); applySettings(); saveSettings(); });
    row("Screen shake", Math.round(settings.shake * 100) + "%", 410,
      () => { settings.shake = clamp(+(settings.shake - 0.25).toFixed(2), 0, 2); applySettings(); saveSettings(); },
      () => { settings.shake = clamp(+(settings.shake + 0.25).toFixed(2), 0, 2); applySettings(); saveSettings(); });
    uiButtons.push({ x: W / 2 - 100, y: 600, w: 200, h: 52, label: "BACK", enabled: true, action: () => { state = "menu"; } });
  }

  function renderDraft() {
    UI.dim(ctx, W, H, 0.82);
    UI.title(ctx, "WAVE " + run.wave + " CLEARED", W / 2, 130, 40);
    UI.text(ctx, "choose an upgrade  —  press 1 / 2 / 3", W / 2, 168, 18, "center", 0.7);
    const cw = 300, gap = 30, ch = 320, total = cw * 3 + gap * 2;
    const x0 = (W - total) / 2, y0 = 220;
    draftChoices.forEach((up, i) => {
      const x = x0 + i * (cw + gap);
      const mouseOver = Input.mouseX >= x && Input.mouseX <= x + cw && Input.mouseY >= y0 && Input.mouseY <= y0 + ch;
      const hovered = mouseOver || i === focus;
      UI.panel(ctx, x, y0, cw, ch);
      if (hovered) { ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.strokeRect(x, y0, cw, ch); ctx.fillStyle = "#000"; ctx.globalAlpha = 0.06; ctx.fillRect(x, y0, cw, ch); ctx.globalAlpha = 1; }
      ctx.fillStyle = "#000";
      UI.text(ctx, up.unique ? "★ UNIQUE ABILITY" : "UPGRADE", x + cw / 2, y0 + 40, 14, "center", 0.5);
      ctx.font = UI.font(24, true); ctx.textAlign = "center";
      ctx.fillText(up.name, x + cw / 2, y0 + 110);
      // word-wrapped description
      wrapText(up.desc, x + 24, y0 + 160, cw - 48, 26, 18);
      const owned = run.mods.owned[up.id] || 0;
      if (owned) UI.text(ctx, "owned x" + owned, x + cw / 2, y0 + ch - 24, 14, "center", 0.5);
      uiButtons.push({ x, y: y0, w: cw, h: ch, label: "", _draftIndex: i, _hideBox: true,
        action: () => chooseUpgrade(i) });
    });
  }

  function wrapText(text, x, y, maxW, lh, size) {
    ctx.font = UI.font(size, false); ctx.textAlign = "center"; ctx.fillStyle = "#000";
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
    UI.dim(ctx, W, H, 0.85);
    UI.title(ctx, "THE WAY OPENS", W / 2, 120, 40);
    UI.text(ctx, "the boss falls — EVOLVE one of your abilities", W / 2, 160, 18, "center", 0.7);
    const n = tierChoices.length, cw = 300, gap = 30, ch = 320;
    const total = cw * n + gap * (n - 1), x0 = (W - total) / 2, y0 = 220;
    tierChoices.forEach((up, i) => {
      const x = x0 + i * (cw + gap);
      const mouseOver = Input.mouseX >= x && Input.mouseX <= x + cw && Input.mouseY >= y0 && Input.mouseY <= y0 + ch;
      const hovered = mouseOver || i === focus;
      UI.panel(ctx, x, y0, cw, ch);
      if (hovered) { ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.strokeRect(x, y0, cw, ch); ctx.fillStyle = "#000"; ctx.globalAlpha = 0.06; ctx.fillRect(x, y0, cw, ch); ctx.globalAlpha = 1; }
      const next = (run.mods.tier[up.id] || 1) + 1;
      const cat = ABIL_CATS[up.cat] || ABIL_CATS.utility;
      ctx.fillStyle = cat.color; ctx.fillRect(x, y0, cw, 6);
      UI.text(ctx, "EVOLVE  →  TIER " + next, x + cw / 2, y0 + 40, 14, "center", 0.6);
      ctx.fillStyle = "#000"; ctx.font = UI.font(24, true); ctx.textAlign = "center";
      ctx.fillText(up.name, x + cw / 2, y0 + 96);
      // tier pips (filled up to current, the next one highlighted)
      for (let t = 0; t < 3; t++) {
        const px = x + cw / 2 - 24 + t * 24, py = y0 + 120;
        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2);
        if (t < next - 1) { ctx.fillStyle = cat.color; ctx.fill(); }
        else if (t === next - 1) { ctx.strokeStyle = cat.color; ctx.lineWidth = 2.5; ctx.stroke(); }
        else { ctx.strokeStyle = "#ccc"; ctx.lineWidth = 1.5; ctx.stroke(); }
      }
      wrapText(nextTierDesc(up, run.mods), x + 24, y0 + 168, cw - 48, 26, 18);
      uiButtons.push({ x, y: y0, w: cw, h: ch, label: "", _draftIndex: i, _hideBox: true, action: () => chooseTierUp(i) });
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
    UI.title(ctx, "PAUSED", W / 2, 220, 56);
    vmenu([
      { label: "RESUME", action: () => { state = "playing"; requestLock(); } },
      { label: "RESTART", action: () => startRun(run.mode, run.diff) },
      { label: "MAIN MENU", action: () => { state = "confirmquit"; } },
    ], W / 2, 300, 280, 54, 16);
  }

  function quitRun() {
    // save progress from the last fully-cleared wave, then bail to the menu
    const completed = run.waveLog.length;
    if (completed > 0) { saveBest(run.mode, run.diff, completed, run.score, run.runTime); awardCoins(run.score); }
    state = "menu";
  }

  function renderConfirmQuit() {
    UI.dim(ctx, W, H, 0.85);
    UI.title(ctx, "QUIT RUN?", W / 2, 250, 48);
    UI.text(ctx, "Your progress (cleared waves & score) is saved to High Scores.", W / 2, 300, 16, "center", 0.7);
    uiButtons.push({ x: W / 2 - 230, y: 350, w: 200, h: 56, label: "QUIT", action: quitRun });
    uiButtons.push({ x: W / 2 + 30, y: 350, w: 200, h: 56, label: "CANCEL", action: () => { state = "paused"; } });
  }

  function drawResultsTable(startY) {
    const log = overInfo.log;
    const tx = W / 2 - 270, tw = 540;
    let ty = startY;
    ctx.fillStyle = "#000"; ctx.font = UI.font(14, true);
    ctx.textAlign = "left"; ctx.fillText("WAVE", tx, ty);
    ctx.textAlign = "right"; ctx.fillText("TIME", tx + 200, ty); ctx.fillText("KILLS", tx + 330, ty); ctx.fillText("BEST TRICK", tx + tw, ty);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tx, ty + 8); ctx.lineTo(tx + tw, ty + 8); ctx.stroke();
    ty += 30;
    const visible = 8, maxOff = Math.max(0, log.length - visible);
    const off = clamp(Math.round(listScroll / 26), 0, maxOff);
    for (const r of log.slice(off, off + visible)) {
      ctx.textAlign = "left"; UI.text(ctx, (r.died ? "✗ " : "") + r.wave, tx, ty, 16);
      ctx.textAlign = "right";
      UI.text(ctx, r.time.toFixed(1) + "s", tx + 200, ty, 16);
      UI.text(ctx, "" + r.kills, tx + 330, ty, 16);
      UI.text(ctx, "x" + r.peak, tx + tw, ty, 16);
      ty += 26;
    }
    if (maxOff > 0) UI.text(ctx, (off > 0 ? "▲ " : "") + "scroll" + (off < maxOff ? " ▼" : ""), W / 2, ty + 6, 12, "center", 0.5);
  }

  function renderGameover() {
    UI.dim(ctx, W, H, 0.9);
    UI.title(ctx, "DEFEATED", W / 2, 110, 50);
    UI.text(ctx, "wave " + overInfo.wave + "   ·   " + overInfo.score + " pts   ·   " + fmtTime(overInfo.time), W / 2, 150, 20, "center");
    if (overInfo.isNew) UI.title(ctx, "NEW BEST!", W / 2, 184, 22);
    else UI.text(ctx, "best: wave " + overInfo.best.wave + " · " + overInfo.best.score + " pts", W / 2, 184, 15, "center", 0.6);
    UI.text(ctx, "+" + overInfo.earned + " coins  (" + overInfo.coins + " total)", W / 2, 210, 16, "center", 0.7);
    drawResultsTable(250);
    vmenu([
      { label: "RETRY", action: () => startRun(run.mode, run.diff) },
      { label: "MAIN MENU", action: () => { state = "menu"; } },
    ], W / 2, 560, 260, 50, 16);
  }

  function renderWin() {
    UI.dim(ctx, W, H, 0.92);
    if (overInfo.campaign) {   // finished the whole Adventure — a proper ending beat
      UI.title(ctx, "THE TEAR CLOSES", W / 2, 96, 46);
      wrapText(CAMPAIGN_ENDING, W / 2 - 380, 140, 760, 20, 15, "center");
      UI.text(ctx, overInfo.score + " pts   ·   " + fmtTime(overInfo.time) + (overInfo.isNew ? "   ·   NEW BEST!" : ""), W / 2, 392, 17, "center", 0.85);
      UI.text(ctx, "+" + overInfo.earned + " coins  (" + overInfo.coins + " total)", W / 2, 416, 15, "center", 0.65);
      vmenu([
        { label: "PLAY AGAIN", action: () => startRun(run.mode, run.diff) },
        { label: "MAIN MENU", action: () => { state = "menu"; } },
      ], W / 2, 470, 260, 50, 16);
      return;
    }
    UI.title(ctx, "VICTORY", W / 2, 110, 54);
    UI.text(ctx, "boss down!   ·   " + overInfo.score + " pts   ·   " + fmtTime(overInfo.time), W / 2, 152, 20, "center");
    if (overInfo.isNew) UI.title(ctx, "NEW BEST!", W / 2, 184, 22);
    UI.text(ctx, "+" + overInfo.earned + " coins  (" + overInfo.coins + " total)", W / 2, 210, 16, "center", 0.7);
    drawResultsTable(250);
    vmenu([
      { label: "PLAY AGAIN", action: () => startRun(run.mode, run.diff) },
      { label: "MAIN MENU", action: () => { state = "menu"; } },
    ], W / 2, 560, 260, 50, 16);
  }

  // highlight hovered / keyboard-focused / selected, then draw
  function drawButtons() {
    for (let i = 0; i < uiButtons.length; i++) {
      const b = uiButtons[i];
      if (b._hideBox) continue;
      const hovered = UI.pointIn(b, Input.mouseX, Input.mouseY);
      UI.button(ctx, b, hovered || b.sel || i === focus);
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

