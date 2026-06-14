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
    try { return Object.assign({ sens: CONFIG.blade.aimSensitivity, shake: 1 }, JSON.parse(localStorage.getItem("tear_settings") || "{}")); }
    catch (e) { return { sens: CONFIG.blade.aimSensitivity, shake: 1 }; }
  }
  function applySettings() { CONFIG.blade.aimSensitivity = settings.sens; shakeScale = settings.shake; }
  function saveSettings() { try { localStorage.setItem("tear_settings", JSON.stringify(settings)); } catch (e) {} }
  applySettings();

  // ---- high scores ----
  function bestKey(mode, diff) { return `tear_best_${mode}_${diff}`; }
  function getBest(mode, diff) {
    try { return Object.assign({ wave: 0, score: 0 }, JSON.parse(localStorage.getItem(bestKey(mode, diff)) || "{}")); }
    catch (e) { return { wave: 0, score: 0 }; }
  }
  function saveBest(mode, diff, wave, score) {
    const b = getBest(mode, diff);
    if (wave > b.wave || (wave === b.wave && score > b.score)) {
      try { localStorage.setItem(bestKey(mode, diff), JSON.stringify({ wave, score })); } catch (e) {}
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
  const platforms = [
    { x: 0, y: CONFIG.world.groundY, w: W, h: H - CONFIG.world.groundY },  // solid floor
    { x: 180, y: 470, w: 240, h: 24, oneway: true },
    { x: 860, y: 470, w: 240, h: 24, oneway: true },
    { x: 520, y: 300, w: 240, h: 24, oneway: true },
  ];

  // ---- state ----
  let state = "menu";
  let player, blade, enemies, projectiles, floaters, hitStop, shake;
  let timeScale = 1, slowmo = 0, zoom = 1, flash = 0, bannerT = 0, dashGhostT = 0; // feel/juice
  let run = null;             // { mode, diff, wave, score, mods, spawnQueue, spawnTimer, waveActive }
  let draftChoices = [];
  let overInfo = null;        // game-over summary
  let selMode = "endless", selDiff = "normal";
  let uiButtons = [];
  let focus = -1, lastUiState = null;   // keyboard focus for menus/draft

  // ---- helpers ----
  function addShake(m) { const v = m * shakeScale; if (v > shake) shake = v; }
  function addZoom(p) { if (1 + p > zoom) zoom = 1 + p; }
  function addFlash(f) { if (f > flash) flash = f; }
  function triggerSlowmo() { slowmo = CONFIG.juice.parrySlowmo; }
  function addFloater(x, y, text, big) { floaters.push({ x, y, text, life: 0.8, big }); }
  function spawnSide() { return Math.random() < 0.5 ? 120 : W - 120; }
  function nearestEnemy(x, y) {
    let best = null, bd = Infinity;
    for (const e of enemies) { if (e.dead) continue; const d = len(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  function fire(list, ev) { for (const f of list) f(ev); }
  function makeEv(x, y, enemy) { return { player, enemies, fx: FX, x, y, enemy, dealAoE, addFloater }; }
  // area damage that does NOT re-fire onKill (prevents detonate/slam recursion)
  function dealAoE(cx, cy, radius, dmg) {
    for (const e of enemies) {
      if (e.dead) continue;
      if (len(e.x - cx, e.y - cy) <= radius + e.radius) {
        e.hit(dmg, e.x - cx, e.y - cy);
        FX.burst(e.x, e.y, e.x - cx, e.y - cy, 5);
        addFloater(e.x, e.y - 24, Math.round(dmg).toString(), false);
        if (e.dead) { addKillScore(); FX.death(e.x, e.y, CONFIG.juice.deathShards); }
      }
    }
  }

  // ---- score + "Attack Trick" style meter ----
  function addKillScore() {
    run.score += Math.round(CONFIG.run.scorePerKill * run.wave * run.mult);
    run.waveKills++;
  }
  function addStyle(kind) {
    const T = CONFIG.trick;
    let pts = T.pts[kind] || 2;
    if (kind !== run.lastTrick) pts *= T.variety;   // reward varied tricks
    run.lastTrick = kind;
    run.combo += pts;
    run.comboTimer = T.decay;
    recomputeTrick();
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
  // Scatter Parry: split a deflected shot into 3 weaker, bouncing shards
  function spawnSplitShards(p) {
    const spd = len(p.vx, p.vy) || CONFIG.proj.speed;
    const baseAng = Math.atan2(p.vy, p.vx);
    p.deflectDmg = Math.max(8, Math.round(p.deflectDmg * 0.5));
    p.bounces = 3;
    for (const off of [-0.34, 0.34]) {
      const a = baseAng + off;
      const q = new Projectile(p.x, p.y, Math.cos(a) * spd, Math.sin(a) * spd);
      q.deflect(Math.cos(a), Math.sin(a), spd, p.perfect);
      q.deflectDmg = p.deflectDmg;
      q.bounces = 3;
      if (p.pierce) { q.pierce = true; q.pierced = new Set(); }
      projectiles.push(q);
    }
  }

  // ---- run / wave management ----
  function startRun(mode, diff) {
    restoreConfig();
    applySettings();
    const d = CONFIG.difficulties.find((x) => x.id === diff) || CONFIG.difficulties[0];
    player = new Player(W * 0.5, CONFIG.world.groundY - 60);
    player.oneHit = d.oneHit;
    blade = new Blade();
    enemies = []; projectiles = []; floaters = [];
    hitStop = 0; shake = 0; FX.reset();
    timeScale = 1; slowmo = 0; zoom = 1; flash = 0; bannerT = 0; dashGhostT = 0;
    run = {
      mode, diff, wave: 0, score: 0, mods: newMods(),
      spawnQueue: [], spawnTimer: 0, waveActive: false, clearTimer: -1,
      runTime: 0, waveTime: 0, waveKills: 0, wavePeak: 1, waveLog: [],
      combo: 0, comboTimer: 0, mult: 1, rank: "", lastTrick: "",
    };
    startNextWave();
    state = "playing";
    requestLock();
  }

  function startNextWave() {
    run.wave++;
    const R = CONFIG.run;
    const count = R.firstWaveCount + Math.floor((run.wave - 1) * R.countPerWave);
    const hpScale = 1 + (run.wave - 1) * R.hpScalePerWave;
    run.spawnQueue = [];
    for (let i = 0; i < count; i++) {
      const ranged = run.wave >= 2 && Math.random() < 0.4;
      run.spawnQueue.push({ type: ranged ? "ranged" : "charger", hpScale });
    }
    run.spawnTimer = R.startDelay;
    run.waveActive = true;
    run.waveTime = 0; run.waveKills = 0; run.wavePeak = run.mult;
    bannerT = CONFIG.juice.bannerTime;
  }

  function spawnOne(spec) {
    const e = spec.type === "ranged"
      ? new Ranged(spawnSide(), CONFIG.world.groundY - 80)
      : new Charger(spawnSide(), CONFIG.world.groundY - 80);
    e.hp *= spec.hpScale; e.maxHp *= spec.hpScale;
    enemies.push(e);
  }

  function updateWave(dt) {
    const R = CONFIG.run;
    if (run.spawnQueue.length && enemies.length < R.maxConcurrent) {
      run.spawnTimer -= dt;
      if (run.spawnTimer <= 0) { spawnOne(run.spawnQueue.shift()); run.spawnTimer = R.spawnInterval; }
    }
    // wave cleared -> wait a beat (let death FX finish) before the draft
    if (run.waveActive && run.spawnQueue.length === 0 && enemies.length === 0) {
      run.waveActive = false;
      run.waveLog.push({ wave: run.wave, time: run.waveTime, kills: run.waveKills, peak: run.wavePeak });
      if (!player.oneHit) player.heal(R.healEachWave);
      run.clearTimer = R.waveClearPause;
    }
    if (run.clearTimer > 0) {
      run.clearTimer -= dt;
      if (run.clearTimer <= 0) {
        run.clearTimer = -1;
        draftChoices = rollUpgrades(3, run.mods);
        state = "draft";
        document.exitPointerLock();   // free the cursor so the draft is clickable
      }
    }
  }

  function endRun() {
    // log the in-progress wave the player died on
    if (run.waveActive) run.waveLog.push({ wave: run.wave, time: run.waveTime, kills: run.waveKills, peak: run.wavePeak, died: true });
    const best = getBest(run.mode, run.diff);
    const isNew = saveBest(run.mode, run.diff, run.wave, run.score);
    overInfo = { wave: run.wave, score: run.score, time: run.runTime, log: run.waveLog.slice(), best: getBest(run.mode, run.diff), isNew };
    state = "gameover";
    document.exitPointerLock();
  }

  // ---- combat step (the PLAYING simulation) ----
  const STEP = 1 / 120;
  let acc = 0, last = performance.now();

  function stepPlaying(dt) {
    // faster while unarmed (blade thrown)
    player.moveBoost = (blade.state !== "held") ? CONFIG.player.thrownMoveBoost : 1;
    player.update(dt, platforms);
    blade.update(dt, player, platforms);

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
            addStyle("hit"); if (e.dead) onKill(e);
          }
        }
      }
    } else dashGhostT = 0;

    if (Input.consumeThrow()) {
      if (blade.state === "held") {
        if (blade.throwBlade()) { FX.burst(blade.x, blade.y, blade.vx, blade.vy, 6); addShake(CONFIG.juice.shakeSmall); }
      } else {
        const r = blade.tryRecall(player);
        const hand = blade.handPos(player);
        if (r === "recalled") { FX.ring(blade.x, blade.y, 8); addShake(CONFIG.juice.shakeSmall); }
        else if (r === "toofar") addFloater(hand.x, hand.y - 40, "too far", false);
      }
    }

    updateWave(dt);
    for (const e of enemies) e.update(dt, platforms, player, projectiles);
    FX.update(dt);

    // held blade vs enemies (slam / launch + hooks)
    const baseDmg = blade.damageAt();
    for (const e of enemies) {
      if (e.dead || e.hitCd > 0) continue;
      if (segCircle(blade.x, blade.y, blade.tipX, blade.tipY, e.x, e.y, e.radius + 4)) {
        if (baseDmg > 0) {
          const isSlam = !player.onGround && blade.tipVY > CONFIG.blade.slamMinDownSpeed;
          const isLaunch = blade.tipVY < -CONFIG.blade.launchMinUpSpeed;
          // rising uppercut: upward momentum (jump / up-dash) empowers the launch
          const riseF = isLaunch ? clamp(Math.max(0, -player.vy) / CONFIG.blade.risingSpeedRef, 0, 1) : 0;
          const empowered = isLaunch && riseF > 0.45;
          let dmg = baseDmg * (isSlam ? CONFIG.blade.slamMultiplier : 1);
          if (isLaunch) dmg *= 1 + riseF * CONFIG.blade.risingDmgBonus;
          if (run.mods.berserk && player.hp < player.maxHp * 0.5) dmg *= 1.3;
          const big = isSlam || empowered || dmg >= CONFIG.hitStop.threshold;
          e.hit(dmg, blade.tipVX, blade.tipVY);
          if (isLaunch) e.vy = -CONFIG.blade.launchPower * (1 + riseF * CONFIG.blade.risingLaunchBonus);
          // Tempest: an empowered uppercut also launches nearby enemies
          if (empowered && run.mods.tempest) {
            for (const e2 of enemies) {
              if (e2.dead || e2 === e) continue;
              if (len(e2.x - e.x, e2.y - e.y) < 175) {
                e2.vy = -CONFIG.blade.launchPower; e2.hit(baseDmg * 0.5, 0, -1);
                FX.burst(e2.x, e2.y, 0, -1, 4); if (e2.dead) onKill(e2);
              }
            }
            FX.ring(e.x, e.y, 12);
          }
          const cp = segPointDist(blade.x, blade.y, blade.tipX, blade.tipY, e.x, e.y);
          FX.burst(cp.px, cp.py, blade.tipVX, blade.tipVY, CONFIG.juice.sparkCount);
          if (isSlam || empowered) FX.ring(e.x, e.y, 8);
          const tag = isSlam ? "!" : (isLaunch ? (empowered ? "⇈" : "↑") : "");
          addFloater(e.x, e.y - 26, Math.round(dmg) + tag, big || isLaunch);
          hitStop = big ? CONFIG.hitStop.big : CONFIG.hitStop.small;
          addShake(big || isLaunch ? CONFIG.juice.shakeBig : CONFIG.juice.shakeSmall);
          if (big) addZoom(CONFIG.juice.zoomBig);
          addStyle(isSlam ? "slam" : (empowered ? "uppercut" : (isLaunch ? "launch" : "hit")));
          fire(run.mods.onHit, makeEv(cp.px, cp.py, e));
          if (isSlam) fire(run.mods.onSlam, makeEv(e.x, e.y, e));
          if (e.dead) onKill(e);
        }
      }
    }

    // thrown blade pierce
    if (blade.thrown) {
      for (const e of enemies) {
        if (e.dead || blade.pierced.has(e)) continue;
        if (segCircle(blade.x, blade.y, blade.tipX, blade.tipY, e.x, e.y, e.radius + 4)) {
          blade.pierced.add(e);
          let tdmg = blade.throwDmg;
          if (blade.state === "returning" && run.mods.stormRecall) tdmg *= 2;   // Storm Recall
          if (run.mods.berserk && player.hp < player.maxHp * 0.5) tdmg *= 1.3;
          e.hit(tdmg, blade.vx, blade.vy);
          // Razor Momentum: the blade speeds up and hits harder per pierce
          if (run.mods.throwRamp) {
            const s = 1 + run.mods.throwRamp;
            blade.throwDmg *= s; blade.vx *= s; blade.vy *= s;
          }
          FX.burst(e.x, e.y, blade.vx, blade.vy, CONFIG.juice.sparkCount);
          addFloater(e.x, e.y - 26, Math.round(tdmg).toString(), true);
          hitStop = CONFIG.hitStop.small; addShake(CONFIG.juice.shakeSmall);
          addStyle("throwHit");
          fire(run.mods.onHit, makeEv(e.x, e.y, e));
          if (e.dead) onKill(e);
        }
      }
    }

    // held blade vs projectiles (deflect / perfect parry)
    for (const p of projectiles) {
      if (p.dead || p.deflected || blade.state !== "held") continue;
      if (segCircle(blade.x, blade.y, blade.tipX, blade.tipY, p.x, p.y, p.r + 4)) {
        if (blade.tipSpeed >= CONFIG.blade.deflectMinSpeed) {
          const perfect = blade.tipSpeed >= CONFIG.blade.perfectSpeed || run.mods.perfectGuard;
          let dirX = blade.tipVX, dirY = blade.tipVY;
          if (perfect) { const t = nearestEnemy(p.x, p.y); if (t) { dirX = t.x - p.x; dirY = t.y - p.y; } }
          p.deflect(dirX, dirY, blade.tipSpeed, perfect);
          if (run.mods.deflectPierce) { p.pierce = true; p.pierced = new Set(); }
          if (run.mods.deflectSplit) spawnSplitShards(p);
          FX.burst(p.x, p.y, dirX, dirY, perfect ? 12 : 5);
          addFloater(p.x, p.y - 18, perfect ? "PARRY!" : "deflect", perfect);
          hitStop = perfect ? CONFIG.hitStop.big : CONFIG.hitStop.small;
          addShake(perfect ? CONFIG.juice.shakeBig : CONFIG.juice.shakeSmall);
          addStyle(perfect ? "parry" : "deflect");
          if (perfect) {
            addZoom(CONFIG.juice.zoomParry);
            addFlash(CONFIG.juice.flashParry);
            triggerSlowmo();
            fire(run.mods.onParry, makeEv(p.x, p.y, null));
          }
        }
      }
    }

    // projectiles vs actors
    for (const p of projectiles) {
      if (p.dead) continue;
      if (p.deflected) {
        for (const e of enemies) {
          if (e.dead) continue;
          if (p.pierce && p.pierced.has(e)) continue;
          if (len(p.x - e.x, p.y - e.y) <= p.r + e.radius) {
            e.hit(p.deflectDmg, p.vx, p.vy);
            FX.burst(p.x, p.y, p.vx, p.vy, CONFIG.juice.sparkCount);
            addFloater(e.x, e.y - 26, Math.round(p.deflectDmg).toString(), p.perfect);
            addShake(p.perfect ? CONFIG.juice.shakeBig : CONFIG.juice.shakeSmall);
            if (e.dead) onKill(e);
            if (p.pierce) p.pierced.add(e); else { p.dead = true; break; }
          }
        }
      } else if (aabbOverlap(p.x, p.y, p.r, p.r, player.x, player.y, player.hw, player.hh)) {
        if (player.takeDamage(CONFIG.proj.dmg, p.x)) { p.dead = true; loseStyle(); }
      }
    }

    // enemy contact damage
    for (const e of enemies) {
      if (e.dead) continue;
      if (aabbOverlap(player.x, player.y, player.hw, player.hh, e.x, e.y, e.hw, e.hh)) {
        if (player.takeDamage(e.cfg.contactDmg, e.x)) loseStyle();
      }
    }

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

  function onKill(e) {
    addKillScore();
    FX.death(e.x, e.y, CONFIG.juice.deathShards);
    fire(run.mods.onKill, makeEv(e.x, e.y, e));
  }

  // ---- main loop ----
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;

    Input.allowLock = (state === "playing");

    if (state === "playing") {
      // feel timers run in real time
      if (slowmo > 0) { slowmo -= dt; timeScale = CONFIG.juice.parrySlowScale; }
      else timeScale = lerp(timeScale, 1, clamp(8 * dt, 0, 1));
      zoom = lerp(zoom, 1, clamp(9 * dt, 0, 1));
      if (flash > 0) flash = Math.max(0, flash - dt * 3.2);
      if (bannerT > 0) bannerT -= dt;

      if (Input.pausePressed()) { state = "paused"; document.exitPointerLock(); }
      else if (hitStop > 0) { hitStop -= dt; }
      else { acc += dt * timeScale; while (acc >= STEP && state === "playing") { stepPlaying(STEP); acc -= STEP; } }
    } else {
      acc = 0;
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
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    uiButtons = [];

    const playLike = state === "playing" || state === "draft" || state === "paused" || state === "gameover";
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
      if (state === "playing" && bannerT > 0) drawBanner();
    }
    if (state === "playing") drawReticle();

    if (state === "menu") renderMenu();
    else if (state === "setup") renderSetup();
    else if (state === "howto") renderHowto();
    else if (state === "highscores") renderHighscores();
    else if (state === "settings") renderSettings();
    else if (state === "draft") renderDraft();
    else if (state === "paused") renderPaused();
    else if (state === "gameover") renderGameover();

    // hover-draw buttons (skip in playing; draft draws its own cards)
    if (state !== "playing" && state !== "draft") drawButtons();

    // mouse cursor in non-playing screens
    if (state !== "playing") UI.cursor(ctx, Input.mouseX, Input.mouseY);

    // reset keyboard focus to the first option when the screen changes
    if (state !== lastUiState) { lastUiState = state; focus = firstEnabledButton(); }

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
    ctx.fillStyle = "#000";
    for (const p of platforms) ctx.fillRect(p.x, p.y, p.w, p.h);
    for (const e of enemies) e.draw(ctx, player);
    for (const p of projectiles) p.draw(ctx);
    if (player) player.draw(ctx);
    if (blade) blade.draw(ctx, player);
    FX.draw(ctx);
    ctx.textAlign = "center";
    for (const f of floaters) {
      ctx.globalAlpha = clamp(f.life / 0.8, 0, 1);
      ctx.fillStyle = "#000";
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
    const x = 20, y = 20, bw = 280;
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.strokeRect(x, y, bw, 18);
    ctx.fillStyle = "#000"; ctx.fillRect(x, y, bw * clamp(player.hp / player.maxHp, 0, 1), 18);
    if (player.oneHit) { ctx.fillStyle = "#000"; UI.text(ctx, "ONE-HIT", x + bw + 10, y + 15, 13); }

    // dash pips
    const ready = 1 - clamp(player.dashCd / CONFIG.dash.cooldown, 0, 1);
    ctx.strokeRect(x, y + 26, 120, 8);
    ctx.fillRect(x, y + 26, 120 * ready, 8);

    // wave + timers (top center)
    UI.title(ctx, "WAVE " + run.wave, W / 2, 38, 26);
    UI.text(ctx, "wave " + run.waveTime.toFixed(1) + "s   ·   total " + fmtTime(run.runTime), W / 2, 58, 14, "center", 0.6);

    // score + trick meter (top right)
    ctx.textAlign = "right";
    UI.text(ctx, "SCORE " + run.score, W - 20, 34, 18);
    if (run.mult > 1) {
      ctx.fillStyle = "#000";
      ctx.font = UI.font(22, true); ctx.textAlign = "right";
      ctx.fillText("x" + run.mult + (run.rank ? "  " + run.rank : ""), W - 20, 62);
      // depleting style bar
      const bw2 = 200, bx = W - 20 - bw2, by = 70;
      ctx.lineWidth = 1.5; ctx.strokeStyle = "#000"; ctx.strokeRect(bx, by, bw2, 6);
      const frac = clamp(run.comboTimer / CONFIG.trick.decay, 0, 1);
      ctx.fillStyle = "#000"; ctx.fillRect(bx, by, bw2 * frac, 6);
    }
    ctx.textAlign = "left";
  }

  function drawBanner() {
    const t = bannerT / CONFIG.juice.bannerTime;          // 1 -> 0
    const a = Math.sin((1 - t) * Math.PI);                // fade in then out
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    UI.title(ctx, "WAVE " + run.wave, W / 2, 150, 60 + (1 - a) * 10);
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
  }

  // ---- menu screens ----
  function vmenu(items, x, top, w, h, gap) {
    items.forEach((it, i) => {
      const b = { x: x - w / 2, y: top + i * (h + gap), w, h, label: it.label, enabled: it.enabled, action: it.action, size: it.size };
      uiButtons.push(b);
    });
  }

  function renderMenu() {
    UI.title(ctx, "T E A R", W / 2, 200, 84);
    UI.text(ctx, "a momentum-blade survival game", W / 2 - 0, 240, 16, "center", 0.6);
    vmenu([
      { label: "PLAY", action: () => { state = "setup"; } },
      { label: "HOW TO PLAY", action: () => { state = "howto"; } },
      { label: "HIGH SCORES", action: () => { state = "highscores"; } },
      { label: "SETTINGS", action: () => { state = "settings"; } },
    ], W / 2, 310, 300, 56, 16);
  }

  function renderSetup() {
    UI.title(ctx, "SELECT RUN", W / 2, 130, 44);
    UI.text(ctx, "Mode", W / 2 - 330, 210, 18, "left", 0.6);
    CONFIG.modes.forEach((m, i) => {
      uiButtons.push({ x: W / 2 - 330, y: 225 + i * 64, w: 300, h: 52, label: m.label + (m.enabled ? "" : " (soon)"),
        enabled: m.enabled, size: 18, action: () => { if (m.enabled) selMode = m.id; },
        sel: selMode === m.id });
    });
    UI.text(ctx, "Difficulty", W / 2 + 30, 210, 18, "left", 0.6);
    CONFIG.difficulties.forEach((d, i) => {
      uiButtons.push({ x: W / 2 + 30, y: 225 + i * 64, w: 300, h: 52, label: d.label, enabled: true, size: 18,
        action: () => { selDiff = d.id; }, sel: selDiff === d.id });
    });
    const m = CONFIG.modes.find((x) => x.id === selMode);
    if (m) UI.text(ctx, m.blurb, W / 2, 470, 15, "center", 0.7);
    uiButtons.push({ x: W / 2 - 230, y: 520, w: 200, h: 56, label: "START", enabled: true,
      action: () => startRun(selMode, selDiff) });
    uiButtons.push({ x: W / 2 + 30, y: 520, w: 200, h: 56, label: "BACK", enabled: true,
      action: () => { state = "menu"; } });
  }

  function renderHowto() {
    UI.title(ctx, "HOW TO PLAY", W / 2, 110, 40);
    const lines = [
      "Move:  A / D      Jump:  W / Space      Drop through platform:  hold S",
      "Dash:  Shift  (aim 8-way with WASD) — i-frames + cooldown",
      "Blade: move the mouse — it carries momentum; damage = tip speed",
      "Throw / recall: right-click  (recall within the dashed ring)",
      "",
      "Slam:    hit while airborne, driving the blade DOWN  (bonus dmg)",
      "Launch:  a fast UP swing pops enemies airborne — juggle them",
      "Uppercut: launch while rising (jump / up-dash) for big damage ⇈",
      "Parry:   swing FAST through a shot — a perfect parry homes it back",
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
        UI.text(ctx, `${m.label} · ${d.label}`, W / 2 - 320, y, 20);
        ctx.textAlign = "right";
        UI.text(ctx, `wave ${b.wave}   ·   ${b.score} pts`, W / 2 + 320, y, 20);
        ctx.textAlign = "left";
        y += 44;
      });
    });
    uiButtons.push({ x: W / 2 - 100, y: 600, w: 200, h: 52, label: "BACK", enabled: true, action: () => { state = "menu"; } });
  }

  function renderSettings() {
    UI.title(ctx, "SETTINGS", W / 2, 140, 40);
    // mouse sensitivity (used while the mouse is captured)
    UI.text(ctx, "Mouse sensitivity", W / 2 - 320, 270, 22);
    UI.text(ctx, settings.sens.toFixed(2), W / 2 + 130, 270, 22, "center");
    uiButtons.push({ x: W / 2 + 60, y: 248, w: 50, h: 36, label: "-", action: () => { settings.sens = clamp(+(settings.sens - 0.1).toFixed(2), 0.2, 3); applySettings(); saveSettings(); } });
    uiButtons.push({ x: W / 2 + 200, y: 248, w: 50, h: 36, label: "+", action: () => { settings.sens = clamp(+(settings.sens + 0.1).toFixed(2), 0.2, 3); applySettings(); saveSettings(); } });
    // screen shake
    UI.text(ctx, "Screen shake", W / 2 - 320, 340, 22);
    UI.text(ctx, Math.round(settings.shake * 100) + "%", W / 2 + 130, 340, 22, "center");
    uiButtons.push({ x: W / 2 + 60, y: 318, w: 50, h: 36, label: "-", action: () => { settings.shake = clamp(+(settings.shake - 0.25).toFixed(2), 0, 2); applySettings(); saveSettings(); } });
    uiButtons.push({ x: W / 2 + 200, y: 318, w: 50, h: 36, label: "+", action: () => { settings.shake = clamp(+(settings.shake + 0.25).toFixed(2), 0, 2); applySettings(); saveSettings(); } });
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

  function renderPaused() {
    UI.dim(ctx, W, H, 0.8);
    UI.title(ctx, "PAUSED", W / 2, 220, 56);
    vmenu([
      { label: "RESUME", action: () => { state = "playing"; requestLock(); } },
      { label: "RESTART", action: () => startRun(run.mode, run.diff) },
      { label: "MAIN MENU", action: () => { state = "menu"; } },
    ], W / 2, 300, 280, 54, 16);
  }

  function renderGameover() {
    UI.dim(ctx, W, H, 0.9);
    UI.title(ctx, "DEFEATED", W / 2, 110, 50);
    UI.text(ctx, "wave " + overInfo.wave + "   ·   " + overInfo.score + " pts   ·   " + fmtTime(overInfo.time), W / 2, 150, 20, "center");
    if (overInfo.isNew) UI.title(ctx, "NEW BEST!", W / 2, 184, 22);
    else UI.text(ctx, "best: wave " + overInfo.best.wave + " · " + overInfo.best.score + " pts", W / 2, 184, 15, "center", 0.6);

    // per-wave results table
    const log = overInfo.log, rows = log.slice(-9);
    const tx = W / 2 - 270, tw = 540;
    let ty = 230;
    ctx.fillStyle = "#000";
    ctx.font = UI.font(14, true);
    ctx.textAlign = "left";  ctx.fillText("WAVE", tx, ty);
    ctx.textAlign = "right"; ctx.fillText("TIME", tx + 200, ty); ctx.fillText("KILLS", tx + 330, ty); ctx.fillText("BEST TRICK", tx + tw, ty);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tx, ty + 8); ctx.lineTo(tx + tw, ty + 8); ctx.stroke();
    ty += 30;
    for (const r of rows) {
      ctx.textAlign = "left";
      UI.text(ctx, (r.died ? "✗ " : "") + r.wave, tx, ty, 16);
      ctx.textAlign = "right";
      UI.text(ctx, r.time.toFixed(1) + "s", tx + 200, ty, 16);
      UI.text(ctx, "" + r.kills, tx + 330, ty, 16);
      UI.text(ctx, "x" + r.peak, tx + tw, ty, 16);
      ty += 26;
    }
    if (log.length > rows.length) UI.text(ctx, "(earlier waves omitted)", W / 2, ty + 2, 12, "center", 0.5);

    vmenu([
      { label: "RETRY", action: () => startRun(run.mode, run.diff) },
      { label: "MAIN MENU", action: () => { state = "menu"; } },
    ], W / 2, 540, 260, 50, 16);
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

    if (Input.confirmPressed()) { const b = uiButtons[focus]; if (b && b.enabled !== false) { b.action(); return; } }

    const c = Input.takeClick();
    if (c) for (const b of uiButtons) { if (b.enabled !== false && UI.pointIn(b, c.x, c.y)) { b.action(); break; } }
  }

  requestAnimationFrame(frame);
})();
