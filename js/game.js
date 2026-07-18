// ------- main: state machine, menus, waves, draft, combat sim -------
(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = CONFIG.view.w, H = CONFIG.view.h;
  // Developer-only world diagnostics. This is deliberately URL-gated rather
  // than exposed as release UI: append ?bossdebug=1 in a local Boss Test boot.
  const PANTHEON_DEBUG = new URLSearchParams(window.location.search).get("bossdebug") === "1";

  Input.init(canvas);

  // render at device resolution (sharp on hi-dpi / upscaled displays), while all
  // drawing still uses the fixed logical coordinate system.
  //
  // TRUE FULLSCREEN: the backing store always fills the WHOLE element (the whole screen
  // in fullscreen). The 1600x900 arena is scaled to fit, and the leftover area on
  // non-16:9 displays becomes OVERSCAN — the scene (sky, backdrop, floor, dims) bleeds
  // into it, so there are no letterbox bars. Gameplay space stays identical everywhere.
  let CSS_PER_LOG = 1;   // CSS px per logical px — how physically small the UI renders
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cw = canvas.clientWidth || W, ch = canvas.clientHeight || H;
    const bw = Math.max(2, Math.round(cw * dpr)), bh = Math.max(2, Math.round(ch * dpr));
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    const s = Math.min(bw / W, bh / H);
    OVERSCAN.x = Math.max(0, (bw / s - W) / 2);
    OVERSCAN.y = Math.max(0, (bh / s - H) / 2);
    CSS_PER_LOG = s / dpr;
    // hardware safe-area (notches / dynamic islands) -> logical px, so HUD anchors and
    // touch controls never hide under the phone's own furniture
    const probe = document.getElementById("safeprobe");
    if (probe) {
      const cs = getComputedStyle(probe), toLog = dpr / s;
      SAFE.t = (parseFloat(cs.paddingTop) || 0) * toLog;
      SAFE.r = (parseFloat(cs.paddingRight) || 0) * toLog;
      SAFE.b = (parseFloat(cs.paddingBottom) || 0) * toLog;
      SAFE.l = (parseFloat(cs.paddingLeft) || 0) * toLog;
    }
  }
  window.addEventListener("resize", resizeCanvas);
  document.addEventListener("fullscreenchange", resizeCanvas);
  resizeCanvas();

  function requestLock() { if (canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch (e) {} } }

  // PWA install moment (standalone site only — the browser fires this when the
  // app is installable; we stash it and offer a quiet row in SETTINGS)
  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; });

  // pristine copy of all tunables, so per-run upgrades never leak across runs
  const BASE = JSON.parse(JSON.stringify(CONFIG));
  function restoreConfig() {
    Object.keys(BASE).forEach((k) => { CONFIG[k] = JSON.parse(JSON.stringify(BASE[k])); });
  }

  // ---- settings (persisted) ----
  let shakeScale = 1;
  let settings = loadSettings();
  function loadSettings() {
    const def = { sens: CONFIG.blade.aimSensitivity, shake: 1, flash: 1, reducedMotion: false, highContrast: false,
      vol: 0.6, music: true, gfx: "auto", controls: "auto", touchAim: "stick", cinematics: "full" };
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
    A11Y.flashScale = clamp(settings.flash == null ? 1 : settings.flash, 0, 1);
    A11Y.reducedMotion = !!settings.reducedMotion; A11Y.motionScale = A11Y.reducedMotion ? 0.18 : 1;
    A11Y.highContrast = !!settings.highContrast;
    shakeScale = settings.shake * A11Y.motionScale;
    GFX.low = settings.gfx === "low" || (settings.gfx === "auto" && isLowEnd());
    Input.forceMode = settings.controls || "auto";   // 2-in-1s can force TOUCH or DESKTOP
    Input.touchAimMode = settings.touchAim || "stick";   // radial stick vs mouse-like drag
    if (typeof SFX !== "undefined") { SFX.vol = settings.vol; SFX.musicOn = settings.music; SFX.setVol(settings.vol); SFX.setMusic(settings.music); }
  }
  if (typeof SFX !== "undefined") SFX.init();
  META.load();
  PROFILE.load();   // shards + achievements + lifetime stats (mirrored to CG cloud)
  // back-credit stats derivable from existing saves so old players aren't cheated
  try { PROFILE.maxStat("shopMaxed", SHOP.filter((s) => META.level(s.id) >= s.maxLevel).length); ACH.check(); PROFILE.save(); } catch (e) {}
  // CrazyGames: pause audio during ads, and once the SDK is ready re-read saved
  // progress from cloud storage (no-ops + plain localStorage off-platform)
  CG.setHooks(
    () => { if (typeof SFX !== "undefined") SFX.mute(true, "ad"); },     // ad break: silence
    () => { if (typeof SFX !== "undefined") SFX.mute(false, "ad"); },    // ad over: restore
    (on) => { if (typeof SFX !== "undefined") SFX.mute(on, "cg"); });    // CrazyGames portal mute toggle
  CG.loadingStart();
  CG.init().then(() => {
    META.load(); PROFILE.load(); settings = loadSettings(); applySettings(); CG.loadingStop();
    // accounts + synced progress: picks CrazyGames / Firebase / Local by environment.
    // A guest logging in (or a returning account) merges cloud progress non-destructively.
    Cloud.init().then(() => Cloud.onChange((u, st) => {
      try { ACH.check(); } catch (e) {}
      // First-run name prompt: a real signed-in account with no display name yet. The
      // username lives in PROFILE (loaded from local storage + merged on sync), so this
      // reads true only when the account genuinely has no name — never a refresh loop.
      // Auto-prompt at most ONCE per session; SKIP is respected until the next launch.
      if (st === "signedin" && Cloud.provider === FirebaseProvider && u && !u.guest &&
          !PROFILE.username() && !renamePrompted && state !== "rename" && !renameContext &&
          typeof beginRenameFlow === "function") {
        renamePrompted = true;
        beginRenameFlow(true);
      }
    }));
  });
  function awardCoins(score) {
    let difficultyCoins = run.coinMod || 1;
    if (run.diff === "onehit") {
      const p = clamp(((run.wave || 0) - 8) / 12, 0, 1);
      const easeOut = 1 - (1 - p) * (1 - p);
      difficultyCoins = (0.70 + 2.35 * easeOut) * REMOTE.coinMult;
    }
    const scoreCoins = Math.floor(score * 0.02 * (1 + 0.08 * META.level("greed")) * difficultyCoins);
    const depthCoins = Math.floor((run.wave || 0) * 10);
    const fortune = Math.min(5, (run.mods.owned && run.mods.owned.fortune) || 0);
    const fortuneMult = 1 + 0.12 * fortune + (fortune >= 3 ? 0.25 : 0) + (fortune >= 5 ? 0.35 : 0);
    const earned = Math.floor((scoreCoins + depthCoins) * fortuneMult);
    META.addCoins(earned);
    if (achTracks()) { PROFILE.addStat("coinsEarned", earned); }
    return earned;
  }
  function economyTelemetry(earned) {
    return {
      earned, wallet: META.coins(), coinMagnet: META.level("greed"),
      fortune: (run.mods.owned && run.mods.owned.fortune) || 0,
      bounty: (run.mods.owned && run.mods.owned.bounty) || 0,
      shopRanks: SHOP.reduce((n, item) => n + META.level(item.id), 0),
    };
  }
  // build a draft, guaranteeing at least 2 Specials are OFFERED per 10-wave stage
  function buildDraft(opts) {
    opts = opts || {};
    const block = Math.floor((run.wave - 1) / 10);
    if (run.specialBlock !== block) { run.specialBlock = block; run.specialsOffered = 0; }
    const lw = ((run.wave - 1) % 10) + 1;            // wave just cleared (1..9 give drafts)
    const draftsLeft = Math.max(1, 10 - lw);         // drafts remaining this stage, including this one
    const need = 2 - (run.specialsOffered || 0);
    const count = run.mods.expandedDraft ? 4 : 3;
    const choices = rollUpgrades(count, run.mods, {
      forceSpecial: need > 0 && draftsLeft <= need,
      excludeIds: opts.excludeIds || [],
    });
    if (run.reservedUpgrade) {
      const reserved = run.reservedUpgrade;
      run.reservedUpgrade = null;
      if (!choices.some((u) => u.id === reserved.id)) {
        let ri = choices.length - 1;
        const nonSpecial = choices.map((u, i) => ({ u, i })).filter((e) => !e.u.tiers);
        if (nonSpecial.length) ri = nonSpecial[nonSpecial.length - 1].i;
        choices[ri] = reserved;
      }
    }
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
  let chapterFlow = null;
  let finale = null;
  // Cinematic safety lock (Pantheon VI P2): protection is a derived lock, not a timer.
  // cinemaProtectActive mirrors "a blocking scene was live last frame" so the falling
  // edge can grant the post-scene grace exactly once; lastCinemaPlayerMode lengthens
  // that grace after a landing beat (the player is mid-fall onto a platform).
  let cinemaProtectActive = false;
  let lastCinemaPlayerMode = null;
  function loreBusy() { return !!(run && run.mode === "campaign" && run.chapterState !== "WAVE_LIVE"); }
  // the campaign's opening — shown as a lore card on the first wave of an Adventure run
  const CAMPAIGN_INTRO = "Long ago the sky was torn, and through the wound poured everything that should not be. They named it the Tear. Each soul the Council sent to close it was worn, in time, into the shape of the thing they failed to stop — a guardian of the very wound they meant to end. You are the next to descend. Cut clean. Keep moving. Reach the Source before it wears your shape too.";
  // shown when the whole Adventure is completed (final biome's boss falls)
  const CAMPAIGN_ENDING = "The Tear closes behind you like a held breath let go. Every guardian, every echo of the ones who came before — all of it was the long way of asking whether you'd still be going somewhere when you arrived. You are. Whatever waits on the other side, you walked the whole length of someone else's ending to reach your own beginning. Go finish it.";

  function beginCampaignChapter(index, priorOutro) {
    const stage = stageAt(index), chapter = stage && stage.chapter;
    if (!run || run.mode !== "campaign" || !chapter) { if (run) run.chapterState = "WAVE_LIVE"; return; }
    const pages = [];
    if (index === 0 && !run._prologueShown) {
      run._prologueShown = true;
      pages.push({ label: "BEFORE THE DESCENT", text: CAMPAIGN_INTRO });
    }
    if (priorOutro) pages.push(priorOutro);
    pages.push(...chapter.pages);
    const brief = settings.cinematics === "brief";
    const flow = chapterFlow = { stage, chapter, pages, state: "LORE_ENTER", page: 0, brief };
    run.chapterState = "LORE_ENTER"; stageBannerT = 0; bossBeat = null;
    const pageBeats = pages.map((page, pageIndex) => ({
      // Full lore pages WAIT for the reader; Brief pages auto-advance after a short hold.
      id: "page-" + pageIndex, view: "page", completion: brief ? "confirm-or-timeout" : "confirm",
      duration: brief ? 1.35 : 2.35, reveal: { mode: "phrase", duration: UI.t.motion.chapterTextReveal * (brief ? 0.52 : 1) },
      playerMode: "locked", number: chapter.number, symbol: chapter.symbol,
      label: page.label, title: chapter.title, text: page.text, color: stage.accent, pageIndex, pageCount: pages.length,
      transition: chapter.transition,
      onEnter() { flow.state = "LORE_READ"; flow.page = pageIndex; run.chapterState = "LORE_READ"; try { SFX.dialogueTone("chapter"); } catch (e) {} },
    }));
    CINEMA.start({
      id: "chapter-" + index, kind: "chapter", color: stage.accent, blocksCombat: true, hideHud: true,
      hint: "TAP TO REVEAL  ·  HOLD TO SKIP CHAPTER", skipHint: "SKIPPING — BIOME REVEAL PRESERVED",
      onStart() { projectiles.length = 0; try { SFX.setMusicDuck(CONFIG.presentation.dialogueDuck, 0.18); } catch (e) {} },   // protection is held by the derived cinematic lock, not iframe
      onSkip(c, director) { director.skipTo("reveal"); },
      onComplete() {
        flow.state = "WAVE_LIVE"; run.chapterState = "WAVE_LIVE"; chapterFlow = null; stageBannerT = 0;
        if (run.wavePendingActivation) activatePreparedWave();   // NOW the wave goes live — horn + banner + spawns
        try { SFX.setMusicDuck(1, 0.7); } catch (e) {}   // release grace comes from the lock's falling edge
      },
      onCancel() {
        if (run) { run.chapterState = "WAVE_LIVE"; if (run.wavePendingActivation) activatePreparedWave(); }
        chapterFlow = null; try { SFX.setMusicDuck(1, 0.25); } catch (e) {}
      },
      beats: [
        { id: "enter", duration: UI.t.motion.chapterIn, playerMode: "locked", onEnter() { flow.state = "LORE_ENTER"; run.chapterState = "LORE_ENTER"; } },
        ...pageBeats,
        { id: "exit", view: "page", exit: true, duration: UI.t.motion.chapterExit, playerMode: "locked",
          number: chapter.number, symbol: chapter.symbol, label: pages[pages.length - 1].label, title: chapter.title,
          text: pages[pages.length - 1].text, color: stage.accent, pageIndex: pages.length - 1, pageCount: pages.length,
          transition: chapter.transition,
          onEnter() { flow.state = "LORE_EXIT"; run.chapterState = "LORE_EXIT"; } },
        { id: "reveal", view: "reveal", duration: brief ? 0.78 : 1.15, playerMode: "locked", number: chapter.number, name: stage.name, line: chapter.intro, color: stage.accent,
          onEnter() { flow.state = "BIOME_REVEAL"; run.chapterState = "BIOME_REVEAL"; try { SFX.setMusicDuck(CONFIG.presentation.biomeRevealDuck, 0.32); } catch (e) {} } },
        { id: "ready", view: "ready", duration: brief ? 0.46 : 0.72, playerMode: "locked", number: chapter.number, name: stage.name, line: stage.blurb, color: stage.accent,
          onEnter() { flow.state = "READY"; run.chapterState = "READY"; } },
      ],
    }, flow);
  }

  function finaleAnchors(x, y) {
    const cx = clamp(x, 270, W - 270), cy = clamp(y, 280, H - 310), r = CONFIG.finale.anchorRadius;
    return [
      { x: cx - 168, y: cy - 72, r, depth: 0.62, cut: false },
      { x: cx + 174, y: cy + 34, r, depth: 0.82, cut: false },
      { x: cx + 8, y: cy - 174, r, depth: 1.0, cut: false },
    ];
  }

  function severFinaleAnchor(auto) {
    if (!finale || finale.severed >= finale.anchors.length) return false;
    const a = finale.anchors[finale.severed]; a.cut = true; a.auto = !!auto;
    finale.severed++; finale.cutFlash = 1; finale.restoredColor = finale.severed >= 1;
    finale.restoredGravity = finale.severed >= 2; finale.tearClosed = finale.severed >= 3;
    FX.ring(a.x, a.y, 18, CONFIG.colors.perfect);
    FX.burst(a.x, a.y, blade.tipVX || 0, blade.tipVY || -1, GFX.low ? 7 : 14, CONFIG.colors.perfect);
    addFlash(0.10 + finale.severed * 0.035); addShake((A11Y.reducedMotion ? 0.2 : 1) * (3 + finale.severed * 2));
    try { SFX.finalCut(finale.severed - 1); } catch (e) {}
    Input.buzz(finale.severed === 3 ? [24, 34, 62] : [18, 24, 34]);
    return true;
  }

  function beginFinaleRestoration() {
    if (!finale || finale.restoring) return;
    while (finale.severed < finale.anchors.length) severFinaleAnchor(true);
    finale.restoring = true; finale.phase = "restoration"; finale.restore = 0;
    stageIndex = 0; currentStage = stageAt(0); platforms = stagePlatforms(0);
    slowZones = []; tempWalls = []; projectiles = []; enemies = [];
    if (run.voidScroll) { run.voidScroll.active = false; run.voidScroll.frozen = true; }
    run.voidDescent = null; worldZoomTarget = 1;
    player.x = clamp(player.x, player.hw + 20, W - player.hw - 20);
    player.y = Math.min(player.y, 220); player.vx = 0; player.vy = 35; player.onGround = false;
    try { SFX.finalRestore(); } catch (e) {}
  }

  function startAdventureFinale(death, recovered) {
    if (!run) return;
    if (run.mode !== "campaign") { winRun(false); return; }
    const prepared = recovered ? run._victoryPrepared : prepareVictoryRecord(true, true);
    const origin = death || run.finalBossDeath || { x: W / 2, y: H * 0.42 };
    enemies = []; projectiles = []; slowZones = []; tempWalls = []; bossIntro = null; bossBeat = null;
    if (run.voidScroll) { run.voidScroll.active = false; run.voidScroll.frozen = true; }
    run.waveActive = false; run.spawnQueue.length = 0; run.chapterState = "WAVE_LIVE";
    worldZoom = CONFIG.finale.worldZoom; worldZoomTarget = CONFIG.finale.worldZoom;
    player.vx = 0; player.vy = 0; player.onGround = false;   // finale safety is the derived cinematic lock (blocksCombat)
    blade.hostile = false; blade.stolenBy = null; blade.state = "held"; blade.finalFree = true;
    blade.restoredTrail = true;
    const hand = blade.handPos(player); blade.x = hand.x; blade.y = hand.y; blade.vx = 0; blade.vy = 0;
    finale = { origin: { x: origin.x, y: origin.y }, anchors: finaleAnchors(player.x, player.y), severed: 0,
      phase: "silence", relicK: 0, relicSounds: 0, restore: 0, landed: false, cutFlash: 0, prepared };
    CINEMA.start({
      id: "adventure-final-cut", kind: "finale", color: CONFIG.colors.perfect,
      blocksCombat: true, hideHud: true, hint: "MOVE THE BLADE  ·  CUT THE TEAR ANCHORS  ·  HOLD CONFIRM TO ASSIST",
      skipHint: "RESTORING THE WORLD",
      onStart() { try { SFX.finalSilence(); } catch (e) {} },
      onSkip(c, director) { while (c.severed < c.anchors.length) severFinaleAnchor(true); director.skipTo("restoration"); },
      onComplete() {
        if (blade) blade.finalFree = false;
        finale = null; winRun(true);
      },
      onCancel() {
        if (blade) blade.finalFree = false;
        try { SFX.setVoidDescent(0, 0.2); SFX.setMusicDuck(1, 0.25); } catch (e) {}
      },
      beats: [
        { id: "silence", duration: CONFIG.finale.silence, playerMode: "locked", hint: "SILENCE",
          onEnter(c) { c.phase = "silence"; } },
        { id: "wound", duration: CONFIG.finale.wound, playerMode: "locked", hint: "THE WOUND REMAINS",
          onEnter(c) { c.phase = "wound"; } },
        { id: "relics", duration: CONFIG.finale.relics, playerMode: "finalBlade", hint: "THE PANTHEON RETURNS TO THE BLADE",
          onEnter(c) { c.phase = "relics"; },
          onUpdate(c, d) {
            c.relicK = d.progress;
            const count = Math.min(4, Math.floor(d.progress * 4.2));
            while (c.relicSounds < count) { try { SFX.finalRelic(c.relicSounds); } catch (e) {} c.relicSounds++; }
          } },
        { id: "cut", playerMode: "finalBlade", minDuration: 0.45, hint: "SWING THROUGH EACH ANCHOR  ·  HOLD CONFIRM OR WAIT FOR ASSIST",
          onEnter(c) { c.phase = "cut"; c.cutStarted = true; },
          onUpdate(c, d) {
            if (d.elapsed >= CONFIG.finale.cutAutoAt + c.severed * CONFIG.finale.cutAutoStep) severFinaleAnchor(true);
          },
          waitUntil(c) { return c.severed >= c.anchors.length; } },
        { id: "restoration", playerMode: "finalLanding", minDuration: CONFIG.finale.restorationMin,
          hint: "THE WORLD REMEMBERS", onEnter(c) { beginFinaleRestoration(); },
          onUpdate(c, d) { c.restore = clamp(d.elapsed / CONFIG.finale.restorationMin, 0, 1); },
          waitUntil(c, d) { return c.landed && d.elapsed >= CONFIG.finale.restorationMin; } },
        { id: "epilogue", view: "epilogue", completion: "confirm", playerMode: "locked",
          reveal: { mode: "phrase", duration: CONFIG.finale.epilogueReveal }, label: "AFTER THE DESCENT",
          title: "THE FIRST MORNING", text: CAMPAIGN_ENDING, hint: "TAP TO REVEAL  ·  TAP AGAIN TO CONTINUE" },
        { id: "reward", view: "reward", completion: "confirm", duration: CONFIG.finale.rewardHold, minDuration: 0.45,
          playerMode: "locked", label: "ADVENTURE COMPLETE", title: "THE WORLD REMEMBERS", sigil: "◇",
          reward: "RESTORED BLADE TRAIL · CAMPAIGN EMBLEM",
          detail: (prepared && prepared.isNew ? "NEW BEST  ·  " : "") + run.score + " PTS  ·  " + fmtTime(run.runTime),
          hint: "TAP TO REVEAL RESULTS" },
      ],
    }, finale);
  }

  // swap the biome: new platform layout + palette, and clear any lingering hazards
  function loadStage(i) {
    if (CINEMA.active) CINEMA.cancel("stage-change");
    stageIndex = i;
    currentStage = stageAt(i);
    platforms = stagePlatforms(i);
    slowZones = []; tempWalls = [];
    if (run) { run.voidScroll = null; run.bossAdds = null; run._preBossPlatforms = null; run._brokenPlats = null; }
    if (blade && blade.stolenBy) { blade.stolenBy = null; blade.hostile = false; blade.state = "returning"; }
    // achievements: count distinct biomes fought in (across the whole profile)
    if (run && achTracks() && currentStage && currentStage.name && !currentStage.dark) {
      const seen = PROFILE.data.stats._biomes || (PROFILE.data.stats._biomes = {});
      if (!seen[currentStage.name]) { seen[currentStage.name] = 1; PROFILE.maxStat("biomesSeen", Object.keys(seen).length); achCheck(); }
    }
    if (run && typeof AT !== "undefined") AT.stageReset();   // fresh per-stage restriction flags
    if (player && player.resetStagePassives) player.resetStagePassives();
    GHOST.stage(i);   // ghost 2.0: replays show the right biome at the right time
  }

  // ---- state ----
  let state = "menu";
  let player, blade, enemies, projectiles, floaters, hitStop, shake;
  let timeScale = 1, slowmo = 0, zoom = 1, flash = 0, bannerT = 0, dashGhostT = 0; // feel/juice
  let worldZoom = 1, worldZoomTarget = 1;   // sustained camera framing (the void run pulls this OUT)
  let wasSwinging = false, wasDashing = false, wasOnGround = true; // audio cadence
  let landVy = 0;   // peak fall speed while airborne -> scales the landing dust
  let throwCd = 0;            // brief cooldown between blade throws (not recalls)
  let slowZones = [];         // Sludge puddles: { x, y, r, life }
  let tempWalls = [];         // Geomancer walls (also pushed into `platforms` for collision)
  let wasLocked = false;      // tracks mouse capture so losing it (Esc) pauses the game
  let rankPopT = 0, rankPopText = "";   // style rank-up flash
  let run = null;             // { mode, diff, wave, score, mods, spawnQueue, spawnTimer, waveActive }
  let draftChoices = [];
  let reserveChoices = [];
  let tierChoices = [];               // abilities offered to evolve after a campaign boss
  let achToast = null, achToastT = 0;   // the "achievement unlocked" banner (pulled from ACH.pending)
  let lastGhost = null;                 // the just-finished run's replay packet (for "watch your run")
  let lastVaultId = null;               // that run's Vault entry id (for publish-from-defeat later)
  let arsenalScroll = 0;                // scroll offset for the pause/defeat "Your Arsenal" panel
  let settingsReturn = "menu";          // where the Settings BACK button returns to (menu, or paused mid-run)
  let replayCtx = null;                 // active replay: { data, stage, platforms, from, loading }
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
    const step = 30, off = (CLOCK.sim * 1000 / 26) % step;
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
  let uiZoom = 1;   // overlay zoom for small touch screens (draft/pause/gameover readability)
  let uiDensity = "desktop";   // current UI density profile (touch = bigger type + targets)
  let bossIntro = null;   // BOSS THEATER arrival ceremony: { boss, t, dur, delay } while the name card runs
  let bossBeat = null;    // screen-space phase title: { text, color, t, dur }
  const CINEMA = new Cinematics.Director();   // one exclusive presentation channel for gameplay cinematics
  let cgWasPlaying = false, continueT = 0;   // CrazyGames gameplay bracket + the rewarded-revive countdown
  let hudHpLag = 1, hudMultPrev = 1, hudMultPop = 0;   // HUD juice: health damage-chip + combo pop
  const hoverAnim = {};                 // per-button hover progress (key -> 0..1), for hover juice
  const ez = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - (1 - t) * (1 - t); };   // ease-out
  let codexTab = "abilities";           // CODEX hub: which view is open (abilities | bestiary | guide)
  let profileTab = "bests";             // PROFILE hub: which view is open (bests | stats)
  let codexFilter = "all";              // ABILITIES tab: category filter
  let codexSort = "category";           // ...and sort mode (category | name | type)
  let bestiaryFilter = "all";           // BESTIARY tab: enemy category filter
  let codexTierView = {};               // id -> which tier (0=base) is being previewed on its card

  // ---- helpers ----
  // screen shake is also the game's haptic driver: big impacts buzz harder (mobile)
  function addShake(m) { const v = m * shakeScale; if (v > shake) shake = v; Input.buzz(m >= CONFIG.juice.shakeBig ? 26 : 12); }
  function addZoom(p) { const z = p * A11Y.motionScale; if (1 + z > zoom) zoom = 1 + z; }
  function addFlash(f) { const v = f * A11Y.flashScale; if (v > flash) flash = v; }
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
      const bombers = enemies.filter((e) => !e.dead && e.isBomber && len(e.x - x, e.y - y) <= B.blastRadius + e.radius);   // bombers caught in the blast
      const kills = dealAoE(x, y, B.blastRadius, B.blastDmg * 1.3);   // parried into a crowd = big payoff
      if (achTracks()) {
        if (kills >= 5) PROFILE.maxStat("bombMultikill", kills);                                   // Chain Reaction (5 in one deflected bomb)
        if (bombers.some((e) => e.dead)) { PROFILE.maxStat("bombDeflectKills", 1); achCheck(); }   // Return to Sender (killed a bomber with its own bomb)
      }
    } else if (len(player.x - x, player.y - y) <= B.blastRadius + player.hw) {
      const r = player.takeDamage(B.blastDmg, x);
      if (r === "hit") { loseStyle(); SFX.hurt(); } else if (r === "absorbed") onShieldAbsorb();
    }
  }
  // area damage that does NOT re-fire onKill (prevents detonate/slam recursion)
  function dealAoE(cx, cy, radius, dmg) {
    let kills = 0;
    for (const e of enemies) {
      if (e.dead) continue;
      if (len(e.x - cx, e.y - cy) <= radius + e.radius) {
        e.hit(dmg, e.x - cx, e.y - cy);
        FX.burst(e.x, e.y, e.x - cx, e.y - cy, 5, e.color);
        addFloater(e.x, e.y - 24, Math.round(dmg).toString(), false);
        if (e.dead) { addKillScore(); FX.death(e.x, e.y, CONFIG.juice.deathShards, e.color); kills++; }
      }
    }
    return kills;   // used by achievement hooks (bomber betrayal)
  }

  // ---- score + "Attack Trick" style meter ----
  function addKillScore() {
    run.score += Math.round(CONFIG.run.scorePerKill * run.wave * run.mult * CONFIG.run.scoreMult * (run.scoreMod || 1));
    run.waveKills++;
  }
  // ---- TUTORIAL: a guided tour of the whole kit ----
  // Detection rides the existing trick pipeline (addStyle kinds) plus a little polling;
  // dummies are real enemies kept permanently stunned so launches/juggles/slams all work.
  // The GHOST is fully KINEMATIC: hand-authored keyframe choreography per lesson — no
  // physics, no input simulation, so it can never drift, misfire, or break.
  const TUT = {
    active: false, idx: 0, doneT: 0, endT: 0, n: {}, gT: 0, anchor: 0,
    _prevGround: true, _prevBlade: "held",
    steps: [
      { t: "MOVE", d: "Run with A and D. Warm up — move both ways.", keys: ["A", "D"],
        prog: () => [(TUT.n.moveL > 25 ? 1 : 0) + (TUT.n.moveR > 25 ? 1 : 0), 2], ok: () => TUT.n.moveL > 25 && TUT.n.moveR > 25 },
      { t: "JUMP", d: "W or Space to jump. Hold S on a ledge to drop through it.", keys: ["W", "SPACE"],
        prog: () => [Math.min(TUT.n.jump || 0, 2), 2], ok: () => (TUT.n.jump || 0) >= 2 },
      { t: "DASH", d: "Shift to dash — steer it mid-flight with W / A / S / D.", keys: ["SHIFT"],
        prog: () => [Math.min(TUT.n.dash || 0, 2), 2], ok: () => (TUT.n.dash || 0) >= 2 },
      { t: "CUT", d: "The blade follows your mouse — SPEED IS DAMAGE. Slash the dummy, fast.", keys: ["MOUSE"], need: 1,
        prog: () => [Math.min(TUT.n.strike || 0, 3), 3], ok: () => (TUT.n.strike || 0) >= 3 },
      { t: "LAUNCH", d: "A fast UPWARD swing pops an enemy into the air.", keys: ["MOUSE ↑"], need: 1,
        prog: () => [Math.min(TUT.n.launch || 0, 1), 1], ok: () => (TUT.n.launch || 0) >= 1 },
      { t: "JUGGLE", d: "Launch it — then cut it again before it lands.", keys: ["MOUSE ↑", "MOUSE"], need: 1,
        prog: () => [Math.min(TUT.n.airHit || 0, 2), 2], ok: () => (TUT.n.airHit || 0) >= 2 },
      { t: "SLAM", d: "While airborne, strike DOWN through an enemy — a slam hits harder.", keys: ["W", "MOUSE ↓"], need: 1,
        prog: () => [((TUT.n.slam || 0) + (TUT.n.superslam || 0)) >= 1 ? 1 : 0, 1], ok: () => (TUT.n.slam || 0) >= 1 || (TUT.n.superslam || 0) >= 1 },
      { t: "POWER SLAM", d: "Dash DOWN to fall fast, then slam mid-fall — a fast descent hits far harder.", keys: ["S + SHIFT", "MOUSE ↓"], need: 1,
        prog: () => [Math.min(TUT.n.superslam || 0, 1), 1], ok: () => (TUT.n.superslam || 0) >= 1 },
      { t: "UPDRAFT", d: "Launch WHILE RISING — jump first, then swing up hard.", keys: ["W", "MOUSE ↑"], need: 1,
        prog: () => [Math.min(TUT.n.updraft || 0, 1), 1], ok: () => (TUT.n.updraft || 0) >= 1 },
      { t: "THROW", d: "Right-click to hurl the blade through an enemy — right-click again to recall it.", keys: ["RMB"], need: 1,
        prog: () => [((TUT.n.throwHit || 0) >= 1 ? 1 : 0) + ((TUT.n.recall || 0) >= 1 ? 1 : 0), 2], ok: () => (TUT.n.throwHit || 0) >= 1 && (TUT.n.recall || 0) >= 1 },
      { t: "PARRY", d: "Swing FAST through an incoming shot to send it back. Perfect timing homes it.", keys: ["MOUSE"], ranged: true,
        prog: () => [(TUT.n.parry || 0) >= 1 ? 2 : Math.min(TUT.n.deflect || 0, 2), 2], ok: () => (TUT.n.parry || 0) >= 1 || (TUT.n.deflect || 0) >= 2 },
      { t: "READY", d: "That's the whole blade. Cut clean. Keep moving. The Tear awaits.", final: true, ok: () => false },
    ],
    start() { this.active = true; this.idx = 0; this.doneT = 0; this.endT = 0; this.n = {}; this.gT = 0; this.anchor = W * 0.20; },
    stop() { this.active = false; },
    mark(k) { if (this.active) this.n[k] = (this.n[k] || 0) + 1; },
    step() { return this.steps[this.idx]; },

    // ---- the kinematic ghost: keyframe choreography, rendered directly ----
    // path/tgt keyframes: [t, x, y] (px relative to the anchor / target base; y NEGATIVE = up)
    // swings: [t0, t1, a0, a1] blade-angle sweeps (radians; 0 = right, -PI/2 = up)
    scripts: {
      "MOVE": { L: 3.0, path: [[0, 0, 0], [1.4, 170, 0], [2.9, 0, 0]] },
      "JUMP": { L: 3.0, path: [[0, 0, 0], [0.5, 0, 0], [0.85, 0, -130], [1.2, 0, 0], [1.7, 0, 0], [2.05, 0, -130], [2.4, 0, 0]] },
      "DASH": { L: 3.0, path: [[0, 0, 0], [0.5, 0, 0], [0.72, 230, 0], [1.7, 230, 0], [1.92, 0, 0]], dashes: [[0.5, 0.72], [1.7, 1.92]] },
      "CUT": { L: 3.0, path: [[0, 0, 0]], swings: [[0.5, 0.68, -0.9, 0.7], [1.3, 1.48, 0.7, -0.9], [2.1, 2.28, -0.9, 0.7]], hits: [0.6, 1.4, 2.2] },
      "LAUNCH": { L: 3.2, path: [[0, 0, 0]], swings: [[0.8, 1.0, 0.8, -1.9]], hits: [0.92],
        tgt: [[0, 0, 0], [0.9, 0, 0], [1.3, 0, -170], [1.8, 0, -50], [2.2, 0, 0]] },
      "JUGGLE": { L: 3.4, path: [[0, 0, 0]], swings: [[0.5, 0.7, 0.8, -1.9], [1.25, 1.42, -0.5, -2.1], [1.95, 2.12, -2.1, -0.5]], hits: [0.62, 1.33, 2.03],
        tgt: [[0, 0, 0], [0.6, 0, 0], [1.0, 0, -160], [1.35, 0, -110], [1.7, 0, -170], [2.05, 0, -120], [2.6, 0, 0]] },
      "SLAM": { L: 3.2, path: [[0, 0, 0], [0.5, 0, 0], [0.85, 40, -140], [1.15, 80, -30], [1.4, 80, 0], [2.2, 0, 0]], swings: [[0.95, 1.15, -0.6, 2.2]], hits: [1.08],
        tgt: [[0, 80, 0]] },
      "POWER SLAM": { L: 3.4, path: [[0, 0, 0], [0.45, 0, 0], [0.75, 30, -170], [0.95, 60, -170], [1.15, 85, -20], [1.35, 85, 0], [2.3, 0, 0]], dashes: [[0.95, 1.15]], swings: [[1.05, 1.25, -0.5, 2.3]], hits: [1.18],
        tgt: [[0, 85, 0]] },
      "UPDRAFT": { L: 3.0, path: [[0, 0, 0], [0.45, 0, 0], [0.8, 20, -150], [1.2, 30, -20], [1.45, 30, 0], [2.2, 0, 0]], swings: [[0.62, 0.82, 1.0, -2.0]], hits: [0.74],
        tgt: [[0, 60, 0], [0.7, 60, 0], [1.1, 60, -190], [1.6, 60, -60], [2.0, 60, 0]] },
      "THROW": { L: 3.4, path: [[0, 0, 0]], throwW: [0.6, 1.9], hits: [1.1] },
      "PARRY": { L: 3.0, path: [[0, 0, 0]], swings: [[0.78, 0.94, 0.9, -1.2]], shot: { t0: 0.3, tHit: 0.86, t1: 1.6 } },
    },
    _interp(frames, t) {
      if (!frames || !frames.length) return { x: 0, y: 0 };
      if (t <= frames[0][0]) return { x: frames[0][1], y: frames[0][2] };
      for (let i = 1; i < frames.length; i++) {
        if (t < frames[i][0]) {
          const a = frames[i - 1], b = frames[i];
          let k = (t - a[0]) / (b[0] - a[0]); k = k * k * (3 - 2 * k);   // smoothstep
          return { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k };
        }
      }
      const l = frames[frames.length - 1]; return { x: l[1], y: l[2] };
    },
    // draw the choreographed ghost + its phantom target (called from renderWorld)
    drawGhost(ctx) {
      if (this.step().final) return;
      const sc = this.scripts[this.step().t]; if (!sc) return;
      const gt = this.gT % sc.L, gy = CONFIG.world.groundY;
      const pos = this._interp(sc.path, gt);
      const gx = this.anchor + pos.x, gyy = gy - 25 + pos.y;   // body centre (25 = half height)
      const tgtBase = sc.tgt ? this._interp(sc.tgt, gt) : { x: 0, y: 0 };
      const ty = gy - 22 + tgtBase.y;   // the target holds x = anchor+185; scripts animate its height
      const cyan = CONFIG.colors.perfect;
      ctx.save();
      // phantom target (skip for pure-movement lessons)
      const showTgt = !["MOVE", "JUMP", "DASH", "PARRY"].includes(this.step().t);
      const hitNow = (sc.hits || []).some((h) => gt >= h && gt < h + 0.12);
      if (showTgt) {
        ctx.globalAlpha = hitNow ? 0.55 : 0.26;
        ctx.fillStyle = hitNow ? "#fff" : CONFIG.colors.charger;
        ctx.fillRect(this.anchor + 185 - 17, ty - 22, 34, 44);
        ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2; ctx.strokeRect(this.anchor + 185 - 17, ty - 22, 34, 44);
        if (hitNow) { ctx.strokeStyle = cyan; ctx.beginPath(); ctx.arc(this.anchor + 185, ty, 26, 0, 6.283); ctx.stroke(); }
      }
      // dash afterimages
      if (sc.dashes) for (const dW of sc.dashes) {
        if (gt >= dW[0] && gt < dW[1] + 0.15) {
          const k = clamp((gt - dW[0]) / (dW[1] - dW[0]), 0, 1);
          for (let i = 1; i <= 3; i++) {
            const p2 = this._interp(sc.path, Math.max(0, gt - i * 0.05));
            ctx.globalAlpha = 0.12 * (4 - i) * (1 - k * 0.5);
            ctx.fillStyle = THEME.ink;
            ctx.fillRect(this.anchor + p2.x - 14, gy - 25 + p2.y - 22, 28, 44);
          }
        }
      }
      // the ghost body
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = THEME.ink;
      ctx.fillRect(gx - 14, gyy - 22, 28, 44);
      ctx.fillStyle = cyan;
      const face = (sc.path.length > 1 && this._interp(sc.path, gt + 0.05).x < pos.x) ? -1 : 1;
      ctx.fillRect(gx + face * 4 - 3, gyy - 11, 7, 5);
      // the blade: swinging (with a cyan arc), thrown (flying to the target and back), or at rest
      const hand = { x: gx, y: gyy - 4 };
      let ang = 0.25, swinging = false;
      if (sc.swings) for (const sw of sc.swings) {
        if (gt >= sw[0] && gt < sw[1]) {
          const k = (gt - sw[0]) / (sw[1] - sw[0]);
          ang = sw[2] + (sw[3] - sw[2]) * k; swinging = true;
          ctx.globalAlpha = 0.30; ctx.strokeStyle = cyan; ctx.lineWidth = 7; ctx.lineCap = "round";
          ctx.beginPath(); ctx.arc(hand.x, hand.y, 66, sw[2], ang, sw[3] < sw[2]); ctx.stroke();
        }
      }
      if (sc.throwW && gt >= sc.throwW[0] && gt < sc.throwW[1]) {
        // blade flight: out to the target, hang, and return
        const k = (gt - sc.throwW[0]) / (sc.throwW[1] - sc.throwW[0]);
        const out = k < 0.4 ? k / 0.4 : (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
        const bx = hand.x + (this.anchor + 185 - hand.x) * out, by = hand.y + (ty - hand.y) * out;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(gt * 14);
        ctx.globalAlpha = 0.4; ctx.strokeStyle = THEME.ink; ctx.lineWidth = 5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.stroke(); ctx.restore();
      } else {
        ctx.globalAlpha = 0.34; ctx.strokeStyle = THEME.ink; ctx.lineWidth = 5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(hand.x, hand.y);
        ctx.lineTo(hand.x + Math.cos(ang) * 58, hand.y + Math.sin(ang) * 58); ctx.stroke();
        if (swinging) { ctx.globalAlpha = 0.5; ctx.fillStyle = cyan; ctx.beginPath(); ctx.arc(hand.x + Math.cos(ang) * 58, hand.y + Math.sin(ang) * 58, 4, 0, 6.283); ctx.fill(); }
      }
      // the parry lesson's scripted shot: flies in red, meets the sweep, returns cyan
      if (sc.shot) {
        const s2 = sc.shot;
        if (gt >= s2.t0 && gt < s2.t1) {
          let sx2, sa;
          if (gt < s2.tHit) { const k = (gt - s2.t0) / (s2.tHit - s2.t0); sx2 = gx + 320 - 260 * k; sa = CONFIG.colors.enemyShot; }
          else { const k = (gt - s2.tHit) / (s2.t1 - s2.tHit); sx2 = gx + 60 + 340 * k; sa = cyan; }
          ctx.globalAlpha = 0.55; ctx.fillStyle = sa;
          ctx.beginPath(); ctx.arc(sx2, hand.y - 6, 7, 0, 6.283); ctx.fill();
          ctx.globalAlpha = 0.25; ctx.fillRect(sx2 + (gt < s2.tHit ? 8 : -26), hand.y - 8, 20, 4);
        }
      }
      ctx.globalAlpha = 0.55;
      UI.tag(ctx, "GHOST", gx, gyy - 40, cyan, "center", UI.t.type.micro);
      ctx.restore();
    },
    update(dt) {
      if (!this.active) return;
      const s = this.step();
      this.gT += dt;
      if (Input.pressed.has("KeyN") && !s.final && this.doneT <= 0) { this.doneT = 0.4; SFX.ui(); }   // skip the lesson
      // polling detections
      if (Input.left()) this.n.moveL = (this.n.moveL || 0) + dt * 60;
      if (Input.right()) this.n.moveR = (this.n.moveR || 0) + dt * 60;
      if (this._prevGround && !player.onGround && player.vy < -200) this.mark("jump");
      this._prevGround = player.onGround;
      if (player.dashTimer > 0 && !this._dashed) { this.mark("dash"); this._dashed = true; }
      if (player.dashTimer <= 0) this._dashed = false;
      if (this._prevBlade === "returning" && blade.state === "held") this.mark("recall");
      this._prevBlade = blade.state;
      // keep the practice dummies stocked + harmless (stunned, no contact damage, tanky)
      if (s.need) {
        let dummies = 0;
        for (const e of enemies) if (e.tutDummy && !e.dead) { dummies++; e.stun = Math.max(e.stun, 1); if (e.hp < e.maxHp * 0.5) e.hp = e.maxHp; }
        if (dummies < s.need) {
          spawnOne({ type: "charger", hpScale: 8 });
          const e = enemies[enemies.length - 1];
          if (e) { e.tutDummy = true; e.affixCount = 0; e.contactDmg = 0; e.x = clamp(player.x + (player.facing || 1) * 260, 160, W - 160); e.y = CONFIG.world.groundY - e.hh; }
        }
      }
      if (s.ranged) {   // the parry teacher: one live ranged shooter
        let shooter = 0;
        for (const e of enemies) if (e.kind === "ranged" && !e.dead) shooter++;
        if (!shooter) spawnOne({ type: "ranged", hpScale: 2 });
      }
      // completion -> a beat, then the next lesson
      if (this.doneT > 0) {
        this.doneT -= dt;
        if (this.doneT <= 0) { this.idx = Math.min(this.idx + 1, this.steps.length - 1); this.n.airHit = 0; this.n.strike = 0; this.gT = 0; }
      } else if (s.final) {
        this.endT += dt;
        if (this.endT > 5) { this.stop(); state = "menu"; document.exitPointerLock(); PROFILE.addStat("tutorialDone", 1); achCheck(); }
      } else if (s.ok()) { this.doneT = 1.1; SFX.rankup(); }
    },
  };

  // ---- PLAYGROUND: an open arena with everything on tap ----
  const PG_KINDS = ["charger", "ranged", "flyer", "bomber", "armored", "wraith", "chimera", "priest"];
  const PG_ALL_KINDS = ["charger", "ranged", "flyer", "bomber", "armored", "wraith", "chimera", "priest", "herald", "mender", "anchor"];
  // the open training arena (floor + two practice ledges) — the playground's "home" stage
  function trainingPlatforms() {
    return [
      { x: 0, y: CONFIG.world.groundY, w: W, h: H - CONFIG.world.groundY, floor: true },
      { x: W * 0.28, y: 560, w: 300, h: 24, oneway: true },
      { x: W * 0.62, y: 430, w: 260, h: 24, oneway: true },
    ];
  }

  // ---- NO SHELTER: per-boss arenas ------------------------------------------
  // Each boss owns its ground. Swapped in when the boss spawns, restored when it
  // falls (or the stage changes). Authored in 1600x900 like stage layouts.
  function bossArena(bossId) {
    const vw = W, vh = H, gy = CONFIG.world.groundY;
    const material = ({ warden: "wardenSteel", colossus: "colossusGantry", aldric: "aldricStone" })[bossId] || "arena";
    const floor = { x: 0, y: gy, w: vw, h: vh - gy, floor: true,
      platformId: `arena:${bossId}:floor`, arenaBoss: bossId, arenaPlatId: `${bossId}:floor`, arenaMaterial: `${material}Floor` };
    const ox = (vw - 1600) / 2, oy = (vh - 900) / 2;
    const P = (x, y, w, index) => {
      const p = { x: x + ox, y: y + oy, w, h: 22, oneway: true,
        platformId: `arena:${bossId}:${index}`, arenaBoss: bossId, arenaPlatId: `${bossId}:${index}`,
        arenaMaterial: material, material, arenaState: "stable", stress: 0, stressDelay: 0,
        crackWarn: 0, respawnIn: 0, respawnWarn: CONFIG.bossArena.reformWarn };
      p.baseSpec = { x: p.x, y: p.y, w: p.w, h: p.h, oneway: true,
        platformId: p.platformId, arenaBoss: bossId, arenaPlatId: p.arenaPlatId,
        arenaMaterial: material, material };
      return p;
    };
    if (bossId === "warden")   return [floor, P(150, 430, 240, 0), P(1210, 430, 240, 1), P(680, 555, 240, 2)];   // the Yard: spread, high — perch time is exposure time
    if (bossId === "colossus") return [floor, P(430, 400, 230, 0), P(685, 400, 230, 1), P(940, 400, 230, 2), P(110, 645, 210, 3), P(1280, 645, 210, 4)];   // the Foundry: sectional gantry + low access blocks
    if (bossId === "aldric")   return [floor, P(250, 610, 260, 0), P(690, 500, 220, 1), P(1090, 610, 260, 2)];   // Royal Ruins: movement without a permanent throne
    return null;   // source/echo fight over the stage layout (then the void takes it)
  }

  function standingArenaPlatform(who) {
    if (!who || !who.onGround) return null;
    const feet = who.y + who.hh;
    return platforms.find((p) => p.arenaPlatId && !p.floor && p.oneway &&
      Math.abs(feet - p.y) < 8 && who.x + who.hw > p.x && who.x - who.hw < p.x + p.w) || null;
  }
  function activeArenaRouteCount() {
    return platforms.filter((p) => p.arenaPlatId && !p.floor && p.oneway).length;
  }
  function arenaMaterialColor(p) {
    if (p.arenaMaterial === "aldricStone") return "#caa85c";
    if (p.arenaMaterial === "colossusGantry") return CONFIG.colors.armoredShield;
    return CONFIG.colors.boss;
  }
  function startArenaWarning(p, request) {
    const A = CONFIG.bossArena;
    if (!p || !p.arenaPlatId || p.floor || !["stable", "stressed"].includes(p.arenaState) ||
        activeArenaRouteCount() <= A.minElevatedActive) return false;
    p.arenaState = "warning"; p.crackWarn = A.crackWarn;
    p.crackColor = (request && request.color) || arenaMaterialColor(p);
    p.fractureReason = (request && request.reason) || "standing";
    return true;
  }
  function playerClearOfArenaPlatform(p) {
    const m = CONFIG.bossArena.reformClearMargin;
    return !player || !aabbOverlap(player.x, player.y, player.hw, player.hh,
      p.x + p.w / 2, p.y + p.h / 2, p.w / 2 + m, p.h / 2 + m);
  }
  function updateBossArenaPlatforms(dt) {
    if (!run) return;
    const A = CONFIG.bossArena, standing = standingArenaPlatform(player);
    run._arenaBroken = run._arenaBroken || [];

    for (let i = platforms.length - 1; i >= 0; i--) {
      const p = platforms[i];
      if (!p.arenaPlatId || p.floor) continue;

      if (p.arenaFractureRequest) {
        const request = p.arenaFractureRequest; p.arenaFractureRequest = null;
        if (startArenaWarning(p, request)) continue;   // preserve the complete warning interval
      }

      if (p.arenaState === "warning") {
        p.crackWarn = Math.max(0, p.crackWarn - dt);
        if (p.crackWarn <= 0) {
          // Resolve simultaneous warnings one by one. The last elevated route is
          // retained even if another impact requested its collapse this frame.
          if (activeArenaRouteCount() <= A.minElevatedActive) {
            p.arenaState = "stressed"; p.stress = A.standBeforeWarn * 0.65;
            p.stressDelay = A.stressDrainDelay;
          } else {
            platforms.splice(i, 1);
            p.arenaState = "broken"; p.stress = 0; p.stressDelay = 0;
            p.respawnWarn = A.reformWarn; p.respawnIn = A.brokenDuration + A.reformWarn;
            run._arenaBroken.push(p);
            const color = p.crackColor || arenaMaterialColor(p);
            FX.ring(p.x + p.w / 2, p.y, 18, color);
            FX.burst(p.x + p.w / 2, p.y, 0, 1, 8, color);
            const owner = enemies && enemies.find((e) => !e.dead && e.presentationId === p.arenaBoss);
            if (owner && typeof BOSSFX !== "undefined") BOSSFX.event(owner, "platformBreak", { color, quiet: true });
          }
        }
        continue;
      }

      if (standing === p) {
        p.stress = Math.min(A.standBeforeWarn, p.stress + dt);
        p.stressDelay = A.stressDrainDelay;
      } else if (p.stressDelay > 0) p.stressDelay = Math.max(0, p.stressDelay - dt);
      else p.stress = Math.max(0, p.stress - A.stressDrainRate * dt);
      p.arenaState = p.stress > 0 ? "stressed" : "stable";
      if (p.stress >= A.standBeforeWarn) startArenaWarning(p, null);
    }

    for (let i = run._arenaBroken.length - 1; i >= 0; i--) {
      const p = run._arenaBroken[i];
      p.respawnIn = Math.max(0, p.respawnIn - dt);
      if (p.respawnIn <= p.respawnWarn) p.arenaState = "reforming";
      if (p.respawnIn > 0 || !playerClearOfArenaPlatform(p)) continue;
      Object.assign(p, p.baseSpec);
      p.arenaState = "stable"; p.stress = 0; p.stressDelay = 0;
      p.crackWarn = 0; p.respawnIn = 0; p.respawnWarn = A.reformWarn;
      p.crackColor = null; p.fractureReason = null; p.arenaFractureRequest = null;
      platforms.push(p); run._arenaBroken.splice(i, 1);
      const color = arenaMaterialColor(p);
      FX.ring(p.x + p.w / 2, p.y, 12, color);
      if (!GFX.low) FX.burst(p.x + p.w / 2, p.y, 0, -1, 5, color);
      const owner = enemies && enemies.find((e) => !e.dead && e.presentationId === p.arenaBoss);
      if (owner && typeof BOSSFX !== "undefined") BOSSFX.event(owner, "platformRebuild", { color, quiet: true });
    }
  }

  // ---- THE SOURCE: runtime arena mutation for the final void run ------------
  function voidGenOptions(startX) {
    const C = CONFIG.source;
    return {
      startX,
      chunkWidthMin: C.voidChunkWidthMin, chunkWidthMax: C.voidChunkWidthMax,
      platformWidthMin: C.voidPlatformWidthMin, platformWidthMax: C.voidPlatformWidthMax,
      lowerBandMin: C.voidLowerMin, lowerBandMax: C.voidLowerMax,
      upperBandMin: C.voidUpperMin, upperBandMax: C.voidUpperMax,
      laneClearance: C.voidLaneClearance,
      transferDeltaMin: C.voidTransferMin, transferDeltaMax: C.voidTransferMax,
      scrollSpeedMin: C.scrollSpeed, scrollSpeedMax: C.scrollSpeedMax * (C.thawSpeedMult || 1.35),
      firePeriod: C.voidFirePeriod, fireArmTime: C.voidFireArm, fireHotTime: C.voidFireHot,
      cageHeight: C.voidCageH, cageHalfWidth: C.voidCageHalfW,
      viewportWidth: W,
      playerHalfWidth: CONFIG.player.w / 2, playerHalfHeight: CONFIG.player.h / 2,
      physics: {
        jumpSpeed: CONFIG.player.jumpSpeed, gravity: CONFIG.world.gravity,
        moveSpeed: CONFIG.player.moveSpeed, dashSpeed: CONFIG.dash.speed, dashDuration: CONFIG.dash.duration,
      },
    };
  }
  function shiftVoidChunk(chunk, dx) {
    chunk.x += dx;
    if (chunk.transferWindow) { chunk.transferWindow.x0 += dx; chunk.transferWindow.x1 += dx; }
    for (const p of chunk.platforms) {
      p.x += dx;
      if (p.cageX != null) p.cageX += dx;
      if (p.cageRect) p.cageRect.x += dx;
    }
  }
  function liveVoidChunk(canonical, offsetX, materializationState) {
    // VoidGen retains canonical chunks for validation. Collision/rendering gets
    // a clone so conveyor motion can never corrupt the reproducible route graph.
    return VoidGen.materialize(canonical, offsetX, materializationState || "active");
  }
  function appendVoidChunk(vs) {
    const result = VoidGen.next(vs.gen);
    vs.gen = result.state;
    const chunk = liveVoidChunk(result.chunk, vs.scrollOffset, vs.forming ? "forming" : "active");
    vs.chunks.push(chunk);
    for (const p of chunk.platforms) platforms.push(p);
    return chunk;
  }
  function supportingVoidPlatform(who) {
    if (!who) return null;
    const feet = who.y + who.hh;
    let best = null, bestDy = 8;
    for (const p of platforms) {
      if (!p.void || !p.oneway || p.materializationState === "gone") continue;
      if (who.x + who.hw <= p.x || who.x - who.hw >= p.x + p.w) continue;
      const dy = Math.abs(feet - p.y);
      if (dy < bestDy) { best = p; bestDy = dy; }
    }
    return best;
  }
  function syncVoidPlayerSupport() {
    const vs = run && run.voidScroll;
    if (!vs) { player.supportPlatform = null; player.voidLane = null; player.voidMajorWindow = false; return null; }
    const standing = supportingVoidPlatform(player);
    const chunk = vs.chunks.find((c) => player.x >= c.x && player.x <= c.x + c.width);
    player.voidMajorWindow = !!(chunk && chunk.majorAttackWindow);
    player.supportPlatform = standing;
    if (standing) {
      if (vs.playerLane && standing.voidLane !== vs.playerLane) {
        player.voidTransferT = Math.max(player.voidTransferT || 0, CONFIG.source.voidTransferGrace);
        if (typeof SFX !== "undefined" && SFX.voidTransfer) SFX.voidTransfer();
      }
      vs.playerLane = standing.voidLane; player.voidLane = standing.voidLane;
    } else {
      player.voidLane = vs.playerLane;
      if (voidConnectionWindow(vs, player.x)) player.voidTransferT = Math.max(player.voidTransferT || 0, CONFIG.source.voidTransferGrace * 0.45);
    }
    return standing;
  }
  function voidConnectionWindow(vs, x) {
    return !!(vs && vs.chunks.some((c) => c.transferWindow && x >= c.transferWindow.x0 && x <= c.transferWindow.x1));
  }
  function removeLiveVoidPlatform(p) {
    const i = platforms.indexOf(p);
    if (i >= 0) platforms.splice(i, 1);
    // A support-bound shock dies in the same simulation step as its surface.
    // Projectile/player collision runs before Projectile.update(), so leaving
    // this to the projectile's next self-check creates one invisible damage tick.
    if (p && p.platformId != null) {
      for (const shot of projectiles) {
        if (shot.surfacePlatformId === p.platformId) shot.dead = true;
      }
    }
  }
  function moveSurfaceProjectiles(dx) {
    for (const shot of projectiles) {
      if (shot.family !== "groundShock" || !shot.surfacePlatformId) continue;
      const surface = platforms.find((p) => p.platformId === shot.surfacePlatformId);
      if (!surface) { shot.dead = true; continue; }
      shot.x += dx;
      shot.surfaceLeft = surface.x; shot.surfaceRight = surface.x + surface.w; shot.surfaceY = surface.y;
      shot.y = surface.y - shot.r;
    }
  }
  function startVoidScroll(owner, opts) {
    if (run.voidScroll && (run.voidScroll.active || run.voidScroll.frozen)) return;
    const C = CONFIG.source, cinematic = !!(opts && opts.cinematic), options = voidGenOptions(-C.voidSpawnBehind);
    platforms = [];
    const vs = run.voidScroll = {
      active: !cinematic, frozen: cinematic, forming: cinematic, owner, speed: C.scrollSpeed, speedCap: C.scrollSpeedMax, wispT: 1.8, rescueCd: 0,
      arriveT: C.descentArrival, options, gen: VoidGen.create(run.voidSeed, options),
      chunks: [], scrollOffset: 0, playerLane: null, arrivalQueue: [], arrivalIndex: 0, arrivalFxT: 0,
    };
    while (vs.gen.nextX + vs.scrollOffset < W + C.voidSpawnAhead) appendVoidChunk(vs);
    // The guaranteed ingress is built under the player's projected body. No
    // coordinate assignment is permitted here: the player reaches it by falling.
    const anchorX = player.x + player.vx * 0.18;
    const anchorY = player.y + player.hh + C.descentIngressBelow;
    const ingress = VoidGen.ingress(run.voidSeed, anchorX, anchorY, options);
    vs.chunks.unshift(ingress); platforms.push(ingress.platforms[0]); vs.ingress = ingress.platforms[0];
    player.onGround = false; player.iframe = Math.max(player.iframe, 1.1);
    player.voidSlowT = 0; player.voidTransferT = C.voidTransferGrace;
    projectiles = projectiles.filter((p) => p.owner !== owner);
    // THE ARRIVAL: the stream materializes with a rift bloom, not a hard cut
    FX.explode(W / 2, CONFIG.world.groundY, owner.color, 2.4);
    vs.arrivalQueue = platforms.slice().sort((a, b) => Math.abs((a.x + a.w / 2) - W / 2) - Math.abs((b.x + b.w / 2) - W / 2));
    addFlash(0.55); addShake(9);
    return vs;
  }
  function startVoidDescent(owner) {
    if (!owner || CINEMA.active) return;
    const C = CONFIG.source;
    const context = run.voidDescent = { owner, unmade: false, floorReleased: false, stream: null };
    const unmakeArena = (c) => {
      if (c.unmade) return; c.unmade = true;
      let i = 0;
      for (const p of platforms) if (p.oneway && !p.floor) {
        p.crackT = C.crackWarn * (0.38 + (i++ % 5) * 0.11); p.crackMax = p.crackT; p.crackColor = owner.color;
      }
      projectiles = projectiles.filter((p) => p.owner !== owner);
      FX.explode(owner.x, owner.y, owner.color, 1.35); addFlash(0.24); addShake(5);
    };
    const releaseFloor = (c) => {
      unmakeArena(c); if (c.floorReleased) return; c.floorReleased = true;
      platforms = platforms.filter((p) => !p.floor);
      player.onGround = false; player.vy = Math.min(player.vy, -80);
      FX.shockwave(player.x, CONFIG.world.groundY, 15, owner.color, 420, 7);
      if (!c.groundTearSound) { c.groundTearSound = true; try { SFX.voidGroundTear(); } catch (e) {} }
    };
    const ensureStream = (c) => {
      if (c.stream) return c.stream;
      releaseFloor(c); c.stream = startVoidScroll(owner, { cinematic: true });
      if (c.stream && c.stream.ingress) FX.ring(c.stream.ingress.x + c.stream.ingress.w / 2, c.stream.ingress.y, 18, owner.color);
      return c.stream;
    };
    CINEMA.start({
      id: "voidDescent", color: owner.color, blocksCombat: true, hideHud: true,
      onStart() {
        bossBeat = null; owner.breachState = "follow"; owner.breachContactSpent = true;
        projectiles = projectiles.filter((p) => p.owner !== owner);
        worldZoomTarget = 1;   // safety is the cinematic lock; no iframe pin
        try { SFX.setMusicDuck(CONFIG.presentation.dialogueDuck, 0.18); SFX.setVoidDescent(0, 0.05); } catch (e) {}
      },
      onSkip(c, director) { unmakeArena(c); director.skipTo("release"); },
      onComplete(c) {
        const vs = ensureStream(c);
        if (vs) {
          vs.forming = false; vs.frozen = false; vs.active = true;
          for (const p of platforms) if (p.void) p.materializationState = "active";
        }
        owner.beginVoidRun();
        player.voidTransferT = Math.max(player.voidTransferT || 0, C.voidTransferGrace);
        worldZoomTarget = C.voidCamZoom; run.voidDescent = null;
        try { SFX.setVoidDescent(0, 0.9); SFX.setMusicDuck(1, 0.75); } catch (e) {}
      },
      onCancel() { try { SFX.setVoidDescent(0, 0.2); SFX.setMusicDuck(1, 0.25); } catch (e) {} },
      beats: [
        { id: "challenge", completion: "confirm-or-timeout", playerMode: "locked",
          speaker: "THE SOURCE", line: "YOU MISTOOK THE FLOOR FOR MERCY.", onEnter() { try { SFX.dialogueTone("source"); } catch (e) {} } },
        { id: "declaration", completion: "confirm-or-timeout", playerMode: "locked",
          speaker: "THE SOURCE", line: "THERE IS NO BELOW.", onEnter() { try { SFX.dialogueTone("source"); } catch (e) {} } },
        { id: "unmake", duration: C.descentDissolve, playerMode: "locked",
          onEnter(c) { unmakeArena(c); try { SFX.setVoidDescent(CONFIG.presentation.voidUnmakeMix, 0.3); } catch (e) {} },
          onUpdate(c, director) { worldZoomTarget = lerp(1, C.voidCamZoom, director.progress * 0.45); } },
        { id: "release", duration: C.descentLift, skipScale: 1, playerMode: "float",
          onEnter(c) { releaseFloor(c); try { SFX.setVoidDescent(CONFIG.presentation.voidReleaseMix, 0.45); } catch (e) {} },
          onUpdate(c, director) { worldZoomTarget = lerp(0.92, C.voidCamZoom, director.progress); } },
        { id: "reveal", duration: C.descentReveal, playerMode: "float",
          onEnter(c) { ensureStream(c); addFlash(0.36); addShake(7); try { SFX.setVoidDescent(CONFIG.presentation.voidRevealMix, 0.55); } catch (e) {} },
          onUpdate(c, director) {
            const vs = c.stream; if (!vs) return;
            if (director.progress > 0.32) for (const p of platforms) if (p.void) p.materializationState = "active";
          } },
        { id: "land", playerMode: "landing", minDuration: 0.18,
          onEnter(c) {
            const vs = ensureStream(c); if (vs) for (const p of platforms) if (p.void) p.materializationState = "active";
            player.vy = Math.max(player.vy, 90); player.onGround = false;
          },
          waitUntil() { return !!supportingVoidPlatform(player); } },
      ],
    }, context);
  }
  function startBossTransformation(owner, cue) {
    if (!owner || !cue || CINEMA.active) return false;
    const seenKey = "tear.cinematic." + cue.id;
    let seen = false; try { seen = localStorage.getItem(seenKey) === "1"; } catch (e) {}
    // "seen" no longer compresses timing — it only lets the skip prompt read sooner.
    // Full vs Brief is the player's explicit choice; neither multiplies choreography.
    const brief = !!(cue.brief || settings.cinematics === "brief");
    const context = { owner, cue, crownStart: null, crownTarget: null, crownPlatform: null };
    const prepareCrown = (c) => {
      const crown = c.owner.crown; if (!c.cue.crownFall || !crown || c.crownStart) return;
      const below = platforms.filter((p) => (p.oneway || p.floor) && crown.x >= p.x && crown.x <= p.x + p.w && p.y >= crown.y)
        .sort((a, b) => a.y - b.y)[0];
      c.crownStart = { x: crown.x, y: crown.y, rot: crown.rot || 0 };
      c.crownPlatform = below || null;
      c.crownTarget = { x: below ? clamp(crown.x + owner.facing * 42, below.x + 18, below.x + below.w - 18) : crown.x + owner.facing * 42,
        y: below ? below.y - 10 : CONFIG.world.groundY - 10 };
      crown.vx = 0; crown.vy = 0; crown.state = "airborne";
    };
    const settleCrown = (c, k) => {
      if (!c.crownStart || !c.owner.crown) return;
      const crown = c.owner.crown, reduced = A11Y.reducedMotion;
      const smooth = reduced ? (k >= 0.82 ? 1 : 0) : k * k * (3 - 2 * k);
      crown.x = lerp(c.crownStart.x, c.crownTarget.x, smooth);
      crown.y = lerp(c.crownStart.y, c.crownTarget.y, smooth) - (reduced ? 0 : Math.sin(k * Math.PI) * 62);
      crown.rot = c.crownStart.rot + owner.facing * smooth * 2.25;
      if (k >= 1) {
        crown.state = "fallen"; crown.vx = 0; crown.vy = 0; crown.restPlatform = c.crownPlatform;
        if (c.crownPlatform && c.crownPlatform.arenaPlatId) c.crownPlatform.arenaFractureRequest = { reason: "crownfall", color: CONFIG.colors.bomber };
        if (!c.crownSound) { c.crownSound = true; try { SFX.aldricCrownFall(); } catch (e) {} }
      }
    };
    owner.cinematicRequest = null;
    CINEMA.start({
      id: cue.id, color: cue.color || owner.color, blocksCombat: true, hideHud: true, brief,
      hint: brief ? "BRIEF SCENE  ·  HOLD TO SKIP" : "TAP TO ADVANCE  ·  HOLD TO SKIP",
      skipHint: "SKIPPING — TRANSFORMATION REMAINS SAFE",
      onStart(c) {
        bossBeat = null; c.owner.cinematicT = 0; c.owner.vx = 0; c.owner.vy = 0;
        projectiles = projectiles.filter((p) => p.owner !== c.owner && !p.bossAttack);
        prepareCrown(c);   // safety is held by player.cinematicProtected (derived from the active lock)
        try { SFX.setMusicDuck(CONFIG.presentation.dialogueDuck, 0.18); } catch (e) {}
        if (cue.sfx && typeof SFX[cue.sfx] === "function") { try { SFX[cue.sfx](); } catch (e) {} }
      },
      onComplete(c) {
        settleCrown(c, 1); c.owner.cinematicPose = null; c.owner.cinematicColor = null; c.owner.cinematicT = 0;
        if (cue.after === "throwShield" && typeof c.owner._throwShield === "function") c.owner._throwShield(projectiles);
        if (cue.firstVertical && typeof c.owner._chooseVerticalTarget === "function") {
          const target = c.owner._chooseVerticalTarget(player, platforms);
          if (target) c.owner._startVertical("vault", target, player);
          else { c.owner.verticalCd = 0; c.owner.verticalTrackT = CONFIG.aldric.verticalResponse; }
        }
        try { localStorage.setItem(seenKey, "1"); } catch (e) {}
        try { SFX.setMusicDuck(1, 0.55); } catch (e) {}
      },
      onCancel(c) {
        if (c && c.owner) { c.owner.cinematicPose = null; c.owner.cinematicColor = null; c.owner.cinematicT = 0; }
        try { SFX.setMusicDuck(1, 0.25); } catch (e) {}
      },
      beats: [
        { id: "frame", duration: 0.24, completion: "timed", playerMode: "locked",
          onUpdate(c, d) { c.owner.cinematicT = clamp(d.elapsed / 0.24, 0, 1) * 0.2; } },
        // the spoken beat: reveals at a human rate, holds fully-visible, and only
        // then auto-resumes combat (never sub-second); a tap advances once readable
        { id: "declaration", completion: "confirm-or-timeout", playerMode: "locked",
          speaker: cue.speaker || owner.bossName, line: cue.line,
          onEnter() { try { SFX.dialogueTone(owner.bossId || "chapter"); } catch (e) {} },
          onUpdate(c, d) { c.owner.cinematicT = 0.2 + d.revealProgress * 0.42; settleCrown(c, d.revealProgress * 0.48); } },
        { id: "resolve", duration: 0.46, completion: "timed", playerMode: "locked",
          onUpdate(c, d) { const k = clamp(d.elapsed / 0.46, 0, 1); c.owner.cinematicT = 0.62 + k * 0.38; settleCrown(c, 0.48 + k * 0.52); } },
        { id: "grace", duration: 0.35, completion: "timed", skipScale: 1, playerMode: "locked" },
      ],
    }, context);
    return true;
  }
  function stepCinematicPlaying(dt) {
    const mode = CINEMA.playerMode;
    lastCinemaPlayerMode = mode;   // remembered so the release grace can be longer after a landing
    if (mode === "locked") {
      player.vx *= Math.exp(-10 * dt); player.vy = 0;
    } else if (mode === "float") {
      player.onGround = false; player.vx *= Math.exp(-5 * dt);
      player.vy = lerp(player.vy, CONFIG.source.descentLiftV, clamp(3.5 * dt, 0, 1));
      player.x = clamp(player.x + player.vx * dt, player.hw, W - player.hw);
      player.y = Math.max(player.hh + 50, player.y + player.vy * dt);
    } else if (mode === "landing") {
      const prevBottom = player.y + player.hh;
      player.vx *= Math.exp(-7 * dt); player.x = clamp(player.x + player.vx * dt, player.hw, W - player.hw);
      player.vy = Math.min(CONFIG.player.maxFall, player.vy + CONFIG.world.gravity * dt);
      player.y += player.vy * dt; player.onGround = false;
      let landing = null;
      for (const p of platforms) {
        if (!p.void || !p.oneway || p.materializationState === "gone") continue;
        if (player.x + player.hw <= p.x || player.x - player.hw >= p.x + p.w) continue;
        if (prevBottom <= p.y + 2 && player.y + player.hh >= p.y) { landing = p; break; }
      }
      if (landing) { player.y = landing.y - player.hh; player.vy = 0; player.onGround = true; }
    } else if (mode === "finalBlade") {
      player.onGround = false; player.vx = 0; player.vy = 0;
    } else if (mode === "finalLanding") {
      const prevBottom = player.y + player.hh;
      player.vx *= Math.exp(-7 * dt); player.x = clamp(player.x + player.vx * dt, player.hw, W - player.hw);
      player.vy = Math.min(CONFIG.player.maxFall, player.vy + CONFIG.world.gravity * dt);
      player.y += player.vy * dt; player.onGround = false;
      let landing = null;
      for (const p of platforms) {
        if (!(p.floor || p.oneway)) continue;
        if (player.x + player.hw <= p.x || player.x - player.hw >= p.x + p.w) continue;
        if (prevBottom <= p.y + 2 && player.y + player.hh >= p.y) { landing = p; break; }
      }
      if (landing) {
        player.y = landing.y - player.hh; player.vy = 0; player.onGround = true;
        if (finale && !finale.landed) { finale.landed = true; FX.burst(player.x, landing.y, 0, -1, GFX.low ? 5 : 10, currentStage.accent); SFX.land(); }
      }
    }
    player.updateSafetyTimers(dt);   // drain any residual hit-iframe/grace; protection itself is the derived lock
    if (blade) blade.update(dt, player, platforms);
    if (mode === "finalBlade" && finale && finale.phase === "cut" && finale.severed < finale.anchors.length && blade) {
      const a = finale.anchors[finale.severed];
      const cut = segPointDist(blade.prevTipX, blade.prevTipY, blade.tipX, blade.tipY, a.x, a.y).dist <= a.r;
      if (cut && blade.tipSpeed >= CONFIG.finale.cutSpeed) severFinaleAnchor(false);
    }
    if (finale) finale.cutFlash = Math.max(0, finale.cutFlash - dt * 2.5);
    if (run.voidScroll) syncVoidPlayerSupport();
  }
  function updateVoidPlatformHazards(vs, dt) {
    const C = CONFIG.source, standing = syncVoidPlayerSupport();
    const dangerous = !(vs.owner.dead || vs.owner.dying);
    for (const p of platforms.slice()) {
      if (!p.void) continue;
      const on = standing === p;
      if (p.voidType === "crumble" && on && p.touchT < 0) { p.touchT = C.voidCrumbleStand; p.materializationState = "cracking"; }
      if (p.touchT >= 0) {
        p.touchT -= dt;
        if (p.touchT <= 0) {
          p.touchT = 0; p.materializationState = "gone"; removeLiveVoidPlatform(p);
          FX.ring(p.x + p.w / 2, p.y, 12, vs.owner.color); FX.burst(p.x + p.w / 2, p.y, 0, 1, 7, vs.owner.color);
          continue;
        }
      }
      p.fireState = VoidGen.hazardState(p, run.runTime, vs.options);
      p.fireOn = p.fireState === "hot";
      if (dangerous && on && p.fireOn && player.hazardT <= 0) {
        const r = player.takeDamage(12 * player.hazardDmgMult, p.x + p.w / 2, vs.owner); player.hazardT = 0.48;
        if (r === "hit") { loseStyle(); SFX.hurt(); } else if (r === "absorbed") onShieldAbsorb();
      }
      if (dangerous && p.voidType === "cage") {
        const cr = VoidGen.cageGeometry(p, vs.options);
        if (aabbOverlap(player.x, player.y, player.hw, player.hh, cr.x + cr.w / 2, cr.y + cr.h / 2, cr.w / 2, cr.h / 2) && player.hazardT <= 0) {
          const r = player.takeDamage(14 * player.hazardDmgMult, cr.centerX, vs.owner); player.hazardT = 0.48;
          if (r === "hit") { loseStyle(); SFX.hurt(); } else if (r === "absorbed") onShieldAbsorb();
        }
      }
    }
  }
  function updateVoidScroll(dt) {
    const vs = run && run.voidScroll;
    if (!vs) return;
    if (vs.rescueCd > 0) vs.rescueCd -= dt;
    if (player.voidTransferT > 0) player.voidTransferT = Math.max(0, player.voidTransferT - dt);
    const C = CONFIG.source;
    if (vs.arrivalIndex < vs.arrivalQueue.length) {
      vs.arrivalFxT -= dt;
      if (vs.arrivalFxT <= 0) {
        vs.arrivalFxT = (CONFIG.effects && CONFIG.effects.voidArrivalFxStep) || 0.07;
        const p = vs.arrivalQueue[vs.arrivalIndex++];
        if (p && p.materializationState !== "gone") FX.ring(p.x + p.w / 2, p.y, 10, vs.owner.color);
        if (vs.arrivalIndex >= vs.arrivalQueue.length) { vs.arrivalQueue.length = 0; vs.arrivalIndex = 0; }
      }
    }
    // THE ARRIVAL grace: the stream materializes and eases into motion (scroll
    // ramps from 0 over arriveT — the platforms don't lurch on the first frame)
    if (vs.arriveT > 0) { vs.arriveT -= dt; if (vs.arriveT < 0) vs.arriveT = 0; }
    const arriveK = vs.arriveT > 0 ? 1 - clamp(vs.arriveT / C.descentArrival, 0, 1) : 1;
    if (vs.active && !vs.frozen) {
      // the run tightens: speed ramps toward the cap over the phase
      vs.speed = Math.min(vs.speedCap || C.scrollSpeedMax || 260, vs.speed + (C.scrollRamp || 4) * dt);
      const standingBefore = supportingVoidPlatform(player);
      const dx = -vs.speed * arriveK * dt;   // eased in over the arrival grace
      vs.scrollOffset += dx;
      for (const chunk of vs.chunks) shiftVoidChunk(chunk, dx);
      if (standingBefore) player.x += dx;
      moveSurfaceProjectiles(dx);

      // Retire and append whole paired chunks; a broken crumble remains part of
      // its authored chunk until both lanes leave the camera together.
      for (let i = vs.chunks.length - 1; i >= 0; i--) {
        const chunk = vs.chunks[i];
        if (chunk.x + chunk.width >= -C.voidRecycleMargin) continue;
        for (const p of chunk.platforms) removeLiveVoidPlatform(p);
        vs.chunks.splice(i, 1);
      }
      while (vs.gen.nextX + vs.scrollOffset < W + C.voidSpawnAhead) appendVoidChunk(vs);

      syncVoidPlayerSupport();
      vs.wispT -= dt;
      if (vs.wispT <= 0) {
        vs.wispT = C.voidWispCd;
        const liveWisps = enemies.filter((e) => e.isVoidWisp && !e.dead).length;
        if (liveWisps < 2) {
          const pressure = vs.chunks.find((c) => c.x + c.width > W * 0.68) || vs.chunks[vs.chunks.length - 1];
          const lane = (pressure && (pressure.wispLane || pressure.pressureLane)) || (vs.playerLane === "upper" ? "lower" : "upper");
          const landing = pressure && pressure.lanes[lane] && pressure.lanes[lane][0];
          const w = new VoidWisp(W + 60, landing ? landing.y - 80 : (lane === "upper" ? 330 : 535));
          w.voidLane = lane; w.spawnT = 0.25; enemies.push(w);
        }
      }
    }
    updateVoidPlatformHazards(vs, dt);

    // The bite is deliberately nonfatal, including One-Hit mode: it costs health and
    // position, then throws the player straight back into play.
    if (player.y > H + 70 && vs.rescueCd <= 0) {
      const r = player.takeDamage(C.voidFallDmg * player.hazardDmgMult, player.x, vs.owner);
      if (player.hp <= 0) player.hp = 1;
      const safe = VoidGen.selectRescue(platforms, W * 0.45, run.runTime, vs.options);
      if (safe) {
        player.x = clamp(safe.x + safe.w / 2, player.hw, W - player.hw); player.y = safe.y - 190;
        player.voidLane = safe.voidLane; vs.playerLane = safe.voidLane;
      }
      else { player.x = W / 2; player.y = 420; }
      player.vy = -1350; player.iframe = Math.max(player.iframe, 1.0); player.voidSlowT = C.voidSlowDur;
      player.voidTransferT = Math.max(player.voidTransferT, C.voidTransferGrace);
      player.dashCharges = player.maxDashCharges; vs.rescueCd = 0.8;
      const fed = vs.owner && typeof vs.owner.startVoidSiphon === "function" ? vs.owner.startVoidSiphon(player) : 0;
      FX.shockwave(player.x, player.y + 150, 12, CONFIG.colors.perfect, 210, 5); FX.burst(player.x, player.y + 120, 0, -1, 16, CONFIG.colors.perfect);
      addFloater(player.x, player.y - 28, "THE VOID BITES  -" + C.voidFallDmg, true, CONFIG.colors.perfect);
      if (fed > 0) addFloater(vs.owner.x, vs.owner.y - 56, "+" + Math.round(fed) + "  FEED", true, CONFIG.colors.perfect);
      if (r === "hit") { loseStyle(); SFX.hurt(); } else if (r === "absorbed") onShieldAbsorb();
    }
  }
  // live difficulty swap: renormalize damage-taken and re-point every difficulty mod,
  // so the playground exercises the exact same tiers the real modes use
  function pgSetDiff(id) {
    const d = CONFIG.difficulties.find((x) => x.id === id) || CONFIG.difficulties[1];
    const dm = d.mods || {};
    CONFIG.player.dmgTakenMult *= (dm.dmg || 1) / (run.diffDmg || 1);
    run.diffDmg = dm.dmg || 1;
    run.diff = d.id; run.diffHp = dm.hp || 1; run.diffCount = dm.count || 1;
    run.coinMod = dm.coin || 1; run.scoreMod = dm.score || 1;
    player.oneHit = !!d.oneHit;
    addFloater(player.x, player.y - 60, d.label.toUpperCase(), true, CONFIG.colors.perfect);
  }
  // arena rotation INCLUDING the training stage: TRAINING -> the five biomes -> TRAINING
  function pgNextArena() {
    Wipe.begin();
    const cur = run.pgArena == null ? -1 : run.pgArena;
    const next = cur >= STAGES.length - 1 ? -1 : cur + 1;
    run.pgArena = next;
    if (next === -1) { loadStage(0); platforms = trainingPlatforms(); }
    else loadStage(next);
  }
  function pgArenaName() { return (run.pgArena == null || run.pgArena === -1) ? "TRAINING GROUNDS" : currentStage.name.toUpperCase(); }
  // spawn with the playground's HP / count modifiers applied
  function pgSpawn(kind) {
    const pg = run.pg;
    for (let i = 0; i < (pg.count || 1); i++) spawnOne({ type: kind, hpScale: pg.hpMul || 1 });
  }
  function pgSpawnDummy() {
    spawnOne({ type: "charger", hpScale: 10 });
    const e = enemies[enemies.length - 1];
    if (e) { e.tutDummy = true; e.affixCount = 0; e.contactDmg = 0; e.x = clamp(player.x + (player.facing || 1) * 280, 160, W - 160); e.y = CONFIG.world.groundY - e.hh; }
  }
  function stepPlayground() {
    const pg = run.pg || (run.pg = { god: false, freeze: false, slow: false, hpMul: 1, count: 1 });
    if (pg.god && player.hp < player.maxHp) player.hp = player.maxHp;   // god mode: wounds seal instantly
    for (const e of enemies) if (e.tutDummy && !e.dead) { e.stun = Math.max(e.stun, 1); if (e.hp < e.maxHp * 0.5) e.hp = e.maxHp; }   // target dummies stay up
    if (Input.pressed.has("Tab") || Input.pressed.has("KeyE")) { state = "pgmenu"; document.exitPointerLock(); return; }
    for (let i = 0; i < PG_KINDS.length; i++) {
      if (Input.pressed.has("Digit" + (i + 1))) {
        pgSpawn(PG_KINDS[i]);
        addFloater(player.x, player.y - 60, PG_KINDS[i].toUpperCase(), false, CONFIG.colors[PG_KINDS[i]] || "#000");
      }
    }
    if (Input.pressed.has("KeyT")) { pgSpawnDummy(); addFloater(player.x, player.y - 60, "DUMMY", false, "#888"); }
    if (Input.pressed.has("KeyB")) {   // next boss in the cycle
      run.curBoss = run.bossOrder[run.bossIdx % run.bossOrder.length]; run.bossIdx++;
      spawnOne({ type: "boss" });
    }
    if (Input.pressed.has("KeyK")) { for (const e of enemies) { e.dead = true; } projectiles.length = 0; addFloater(player.x, player.y - 60, "CLEARED", true, CONFIG.colors.perfect); }
    if (Input.pressed.has("KeyH")) { player.hp = player.maxHp; addFloater(player.x, player.y - 60, "HEALED", true, "#1faf5a"); }
    if (Input.pressed.has("KeyU")) { state = "pglab"; listScroll = 0; document.exitPointerLock(); }
    if (Input.pressed.has("KeyM")) {   // summon / dismiss THE ECHO — the full Mirror-driven boss duel
      const mh = enemies.find((e) => e.isMirrorBoss && !e.dead);
      if (mh) { mh.dead = true; if (typeof Mirror !== "undefined") Mirror.active = false; addFloater(player.x, player.y - 60, "ECHO DISMISSED", false, "#b06cff"); }
      else { run.curBoss = "echo"; spawnOne({ type: "boss" }); addFloater(player.x, player.y - 60, "THE ECHO", true, "#b06cff"); }
    }
  }

  // the GMod-style build menu: a two-column board — everything on tap, arena frozen behind
  function renderPgMenu() {
    const t = UI.t, pg = run.pg, bh = 42, gap = 10;
    UI.dim(ctx, W, H, 0.88);
    UI.header(ctx, "PLAYGROUND", "build the scene — Tab / Esc resumes", eIn);
    const lx = W / 2 - 620, rx = W / 2 + 20, colW = 600;
    // ---- left: ENEMIES (kind-coloured), the target dummy, spawn modifiers ----
    UI.tag(ctx, "SPAWN ENEMIES", lx, 196, t.color.accent, "left", t.type.micro);
    PG_ALL_KINDS.forEach((k, i) => {
      const cx = lx + (i % 3) * (196 + gap), cy = 208 + Math.floor(i / 3) * (bh + gap);
      uiButtons.push({ x: cx, y: cy, w: 196, h: bh, size: 13, label: k.toUpperCase(), accent: CONFIG.colors[k] || "#888",
        action: () => { pgSpawn(k); SFX.ui(); } });
    });
    uiButtons.push({ x: lx, y: 208 + 4 * (bh + gap), w: 402, h: bh, size: 13, label: "TARGET DUMMY  (passive)", accent: "#888",
      action: () => { pgSpawnDummy(); SFX.ui(); } });
    const my = 208 + 5 * (bh + gap) + 26;
    UI.tag(ctx, "SPAWN MODIFIERS", lx, my - 10, t.color.accent, "left", t.type.micro);
    UI.text(ctx, "HP", lx, my + 28, t.type.label);
    [1, 3, 10].forEach((m, i) => uiButtons.push({ x: lx + 44 + i * 92, y: my + 4, w: 84, h: 38, size: 13, label: "×" + m, sel: (pg.hpMul || 1) === m, action: () => { pg.hpMul = m; } }));
    UI.text(ctx, "COUNT", lx + 340, my + 28, t.type.label);
    [1, 5].forEach((m, i) => uiButtons.push({ x: lx + 424 + i * 92, y: my + 4, w: 84, h: 38, size: 13, label: "×" + m, sel: (pg.count || 1) === m, action: () => { pg.count = m; } }));
    // difficulty — the SAME tiers the real modes use, swapped live
    const dy = my + 66;
    UI.tag(ctx, "DIFFICULTY", lx, dy - 10, t.color.accent, "left", t.type.micro);
    CONFIG.difficulties.forEach((d, i) => uiButtons.push({ x: lx + i * (116 + 5), y: dy + 4, w: 116, h: 38, size: 11,
      label: d.label.toUpperCase(), sel: run.diff === d.id, action: () => { pgSetDiff(d.id); } }));
    // ---- right: BOSSES, ARENA, WEAPONS ----
    UI.tag(ctx, "SUMMON A BOSS", rx, 196, t.color.accent, "left", t.type.micro);
    BOSS_ROSTER.forEach((b, i) => {
      uiButtons.push({ x: rx + (i % 2) * (295 + gap), y: 208 + Math.floor(i / 2) * (bh + gap), w: 295, h: bh, size: 13, label: b.name.toUpperCase(), accent: CONFIG.colors.boss,
        action: () => { run.curBoss = b.id; spawnOne({ type: "boss" }); SFX.ui(); } });
    });
    const ay = 208 + 3 * (bh + gap) + 26;
    UI.tag(ctx, "ARENA", rx, ay - 10, t.color.accent, "left", t.type.micro);
    uiButtons.push({ x: rx, y: ay + 4, w: colW, h: bh, size: 13, label: "NEXT ARENA  ›  now: " + pgArenaName(), accent: (run.pgArena === -1 || run.pgArena == null) ? t.color.accent : currentStage.accent,
      action: () => { pgNextArena(); SFX.ui(); } });
    const wy = ay + bh + 30;
    UI.tag(ctx, "WEAPON  (restarts the arena)", rx, wy - 10, t.color.accent, "left", t.type.micro);
    WEAPONS.forEach((w, i) => {
      uiButtons.push({ x: rx + i * ((colW - gap * (WEAPONS.length - 1)) / WEAPONS.length + gap), y: wy + 4, w: (colW - gap * (WEAPONS.length - 1)) / WEAPONS.length, h: bh, size: 13,
        label: w.name.toUpperCase(), sel: selWeapon === w.id, action: () => { selWeapon = w.id; startRun("playground", run.diff); } });
    });
    // ---- bottom band: toggles + actions ----
    const ty = 640;
    UI.tag(ctx, "MODIFIERS", W / 2 - 620, ty - 10, t.color.accent, "left", t.type.micro);
    const tog = (i, label, sel, action) => uiButtons.push({ x: W / 2 - 620 + i * (300 + 12), y: ty + 4, w: 300, h: bh, size: 13, label, sel, action });
    tog(0, "GOD MODE", pg.god, () => { pg.god = !pg.god; });
    tog(1, "FREEZE ENEMIES", pg.freeze, () => { pg.freeze = !pg.freeze; });
    tog(2, "SLOW MOTION", pg.slow, () => { pg.slow = !pg.slow; });
    tog(3, "ONE-HIT MODE", player.oneHit, () => { player.oneHit = !player.oneHit; });
    const ayy = ty + bh + 18;
    const act = (i, label, action, accent) => uiButtons.push({ x: W / 2 - 620 + i * (300 + 12), y: ayy, w: 300, h: bh, size: 13, label, action, accent });
    act(0, "ABILITY LAB  ›", () => { state = "pglab"; listScroll = 0; }, t.color.accent);
    act(1, "CLEAR ENEMIES", () => { for (const e of enemies) e.dead = true; projectiles.length = 0; SFX.ui(); });
    act(2, "FULL HEAL", () => { player.hp = player.maxHp; SFX.ui(); });
    act(3, "RESET PLAYGROUND", () => { startRun("playground", selDiff); });   // full factory reset: build, toggles, arena, difficulty
    uiButtons.push({ x: W / 2 - 160, y: ayy + bh + 16, w: 320, h: 50, label: "RESUME", action: () => { state = "playing"; requestLock(); } });
  }

  // the ABILITY LAB: every ability in the game on one page — take anything, evolve anything
  let pgLabFilter = "all";
  let achFilter = "all";   // Achievements menu category filter
  let lbMode = "", lbDiff = "normal", lbKey = "", lbData = null, lbLoading = false, lbGhostMsg = "";   // Leaderboards tab
  let lbTab = "global";   // LEADERBOARDS hub: which view is open (global | replays)
  let replayFeedData = null, replayFeedLoading = false, replayMsg = "";   // FEED tab (LB) + REPLAYS vault (Profile)
  const replayThumbs = {};   // dataURL -> Image cache for vault/feed thumbnails
  function renderPgLab() {
    const t = UI.t;
    UI.dim(ctx, W, H, 0.9);
    UI.header(ctx, "ABILITY LAB", "take anything · evolve anything · no waves, just you", eIn);
    // category filter chips
    const cats = ["all", "offense", "parry", "throw", "mobility", "resilience", "utility"];
    const cw = 148, cgap = 8, cx0 = W / 2 - (cats.length * (cw + cgap) - cgap) / 2;
    cats.forEach((c, i) => uiButtons.push({ x: cx0 + i * (cw + cgap), y: 168, w: cw, h: 34, chip: true, size: 11,
      label: c.toUpperCase(), sel: pgLabFilter === c, action: () => { pgLabFilter = c; listScroll = 0; } }));
    // the catalogue (2 columns, scrollable)
    const list = UPGRADES.filter((u) => pgLabFilter === "all" || u.cat === pgLabFilter);
    const colWd = 588, rowH = 92, top = 232, fx = W / 2 - colWd - 12, viewH = H - top - 118;
    const rows = Math.ceil(list.length / 2);
    const maxScroll = Math.max(0, rows * rowH - viewH);
    listScroll = clamp(listScroll, 0, maxScroll);
    ctx.save(); ctx.beginPath(); ctx.rect(0, top - 10, W, viewH + 20); ctx.clip();
    list.forEach((u, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = fx + col * (colWd + 24), y = top + row * rowH - listScroll;
      if (y < top - rowH || y > top + viewH) return;
      const cat = ABIL_CATS[u.cat] || ABIL_CATS.utility;
      const ownedN = run.mods.owned[u.id] || 0;
      const tier = run.mods.tier[u.id] || 0;
      const maxT = u.tiers ? u.tiers.length + 1 : 1;
      UI.card(ctx, x, y, colWd, rowH - 12, UI.pointIn({ x, y, w: colWd, h: rowH - 12 }, Input.mouseX, Input.mouseY));
      UI.accentStrip(ctx, x, y, colWd, cat.color);
      UI.text(ctx, u.name + (u.tiers ? "  ★" : ""), x + 16, y + 30, t.type.lead);
      UI.text(ctx, u.desc, x + 16, y + 52, t.type.micro, "left", t.alpha.soft);
      if (ownedN) UI.tag(ctx, u.tiers ? ("TIER " + tier + " / " + maxT) : (u.unique ? "OWNED" : "OWNED ×" + ownedN), x + 16, y + 71, cat.color, "left", t.type.micro);
      // the action: TAKE / EVOLVE / +1 / MAX
      let label = "TAKE", enabled = true;
      if (ownedN && u.tiers) { if (tier < maxT) label = "EVOLVE"; else { label = "MAX"; enabled = false; } }
      else if (ownedN && u.unique) { label = "OWNED"; enabled = false; }
      else if (ownedN) label = "+1";
      uiButtons.push({ x: x + colWd - 118, y: y + 20, w: 102, h: 40, size: 13, label, enabled,
        action: () => {
          const ctx2 = { player, blade, mods: run.mods };
          if (ownedN && u.tiers && tier < maxT) tierUp(u.id, ctx2); else applyUpgrade(u, ctx2);
          SFX.rankup();
        } });
    });
    ctx.restore();
    if (maxScroll > 0) UI.scrollHint(ctx, W / 2, top + viewH + 24, listScroll > 0, listScroll < maxScroll);
    uiButtons.push({ x: W / 2 - 320, y: H - 78, w: 300, h: 50, label: "‹  BUILD MENU", action: () => { state = "pgmenu"; } });
    uiButtons.push({ x: W / 2 + 20, y: H - 78, w: 300, h: 50, label: "RESUME", action: () => { state = "playing"; requestLock(); } });
  }

  function addStyle(kind) {
    TUT.mark(kind);   // the tutorial listens to the trick pipeline
    // ghost 2.0: the big beats land in the event track (+ the run's thumbnail)
    if (GHOST.recording() && (kind === "parry" || kind === "superslam" || kind === "updraft" || kind === "slam")) {
      GHOST.event(kind, player ? player.x : 0, player ? player.y : 0);
      GHOST.snapshot(canvas, kind === "superslam" ? 3 : kind === "parry" ? 2 : 1);
    }
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
    // haptics: the sharpest beats reach the thumbs (no-op off-touch/unsupported)
    if (kind === "parry") Input.buzz(24);
    else if (kind === "superslam") Input.buzz([14, 20, 14]);
    // achievements: the blade's craft (skip training sandboxes)
    if (achTracks()) {
      if (kind === "parry") { PROFILE.addStat("parries", 1); PROFILE.addStat("deflects", 1); DAILY.bump("parries", 1); DAILY.bump("deflect", 1); }
      else if (kind === "deflect") { PROFILE.addStat("deflects", 1); DAILY.bump("deflect", 1); }
      else if (kind === "superslam") { PROFILE.addStat("superslams", 1); DAILY.bump("superslam", 1); }
      else if (kind === "updraft") { PROFILE.addStat("updrafts", 1); DAILY.bump("updraft", 1); }
      else if (kind === "throwHit") PROFILE.addStat("throwHits", 1);
      // reached the top style tier this run?
      const topName = T.tiers.length ? T.tiers[T.tiers.length - 1].name : "";
      if (topName && run.rank === topName) PROFILE.maxStat("topRank", 1);
      achCheck();
    }
  }
  // achievements track everywhere EXCEPT the training sandboxes (trivially farmable)
  function achTracks() { return run && run.mode !== "tutorial" && run.mode !== "playground"; }
  function achCheck() { try { ACH.check(); PROFILE.save(); } catch (e) {} }

  // ---- AT: the "cult-classic" exotic achievement tracker ----
  // Bespoke state machines for combos, self-imposed restrictions, boss-humiliation, and
  // status/deflect feats. All gated to real modes; entities set a few flags this reads.
  const AT = {
    on() { return run && run.mode !== "tutorial" && run.mode !== "playground"; },
    // per-stage restriction flags (reset each biome/stage)
    stageReset() { if (run) run.biomeState = { swung: false, thrown: false, jumped: false }; },
    swung() { if (run && run.biomeState) run.biomeState.swung = true; },
    thrown() { if (run && run.biomeState) run.biomeState.thrown = true; },
    jumped() { if (run && run.biomeState) run.biomeState.jumped = true; },
    // boss damage-source tracking (Set on the entity) for the humiliation feats
    bossHit(e, src) { if (e && e.isBoss) { (e.dmgSrc || (e.dmgSrc = new Set())).add(src); e._lastSrc = src; } },
    bossKill(e) {
      if (!this.on() || !e || !e.bossId) return;
      const s = e.dmgSrc || new Set(), only = (k) => s.has(k) && ![...s].some((x) => x !== k);
      if (e.bossId === "warden" && only("deflect")) PROFILE.maxStat("wardenDeflectOnly", 1);   // Stop Hitting Yourself
      if (e.bossId === "colossus" && s.size > 0 && !s.has("melee")) PROFILE.maxStat("colossusThrowOnly", 1);   // David and Goliath
      if (e.bossId === "echo" && e._lastSrc === "deflect") PROFILE.maxStat("echoReflectKill", 1);   // I Am Rubber
      if (e.bossId === "source" && run._bossFightT != null && run.runTime - run._bossFightT < 60) PROFILE.maxStat("sourceSpeedrun", 1);   // Pulling the Plug
    },
    // a stage (10-wave biome) was cleared: evaluate the self-imposed restrictions
    stageDone() {
      if (!this.on() || !run.biomeState) return;
      const b = run.biomeState;
      if (!b.thrown) PROFILE.maxStat("stageNoThrow", 1);        // No Takebacks
      if (!b.swung) PROFILE.maxStat("stageThrowOnly", 1);       // Butterfingers (cleared without a single melee swing)
      if (!b.jumped) PROFILE.maxStat("stageNoJump", 1);         // Heavy Boots
      if (META.level("thickskin") === 0 && META.level("warding") === 0 && META.level("sharp") > 0) PROFILE.maxStat("stageGlassCannon", 1);   // Glass Cannon
      achCheck();
    },
    // called from onKill for airborne combos + transition kills
    onKill(e) {
      if (!this.on()) return;
      if (!player.onGround) { run._airKills = (run._airKills || 0) + 1; PROFILE.maxStat("airComboKills", run._airKills); }
      if (run.clearTimer > 0) PROFILE.maxStat("transitionKills", 1);   // Stylishly Late
    },
    // perfect parry with the "static" streak (no move / dash / damage between)
    parry() { if (this.on()) { run._staticParry = (run._staticParry || 0) + 1; PROFILE.maxStat("staticParryStreak", run._staticParry); } },
    breakStreak() { if (run) run._staticParry = 0; },
    // a projectile dodged through with i-frames (Matador) — distinct per run
    dashDodge(p) { if (this.on() && p && !p._dodged) { p._dodged = true; run._projDashes = (run._projDashes || 0) + 1; PROFILE.maxStat("projectileDashes", run._projDashes); } },
    revived() { if (run) run._revivedT = true; },
    hordeCleared(sec) { if (this.on() && sec < 15) PROFILE.maxStat("fastHordeClear", 1); },
    // per-frame: air-time, status combos, off-screen launches, revive-to-full, streak resets
    tick(dt) {
      if (!this.on()) return;
      if (player.onGround) { run._airKills = 0; }
      // Static parry streak breaks on any deliberate move / dash
      if (Input.left() || Input.right() || player.dashTimer > 0) this.breakStreak();
      // Taste the Rainbow: bleed + burn + mark on one enemy at once
      let rainbow = false, launched = false;
      for (const en of enemies) {
        if (en.dead) continue;
        if (en._updraftT > 0) { en._updraftT -= dt; if (en.y < -40) launched = true; }   // Space Program
        if (en.bleedStacks > 0 && en.burnT > 0 && en.markT > 0) rainbow = true;
      }
      if (rainbow) PROFILE.maxStat("tripleStatus", 1);
      if (launched) PROFILE.maxStat("launchOffScreen", 1);
      if (run._revivedT && player.hp >= player.maxHp) PROFILE.maxStat("reviveToFull", 1);   // From the Ashes
    },
  };
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
    if (CINEMA.active) CINEMA.cancel("new-run");
    finale = null;
    if (typeof Mirror !== "undefined") { Mirror.active = false; Mirror.host = null; }   // a summoned Echo never leaks into a new run
    bossIntro = null;   // no arrival ceremony leaks across runs
    bossBeat = null;
    if (typeof BOSSFX !== "undefined") BOSSFX.q.length = 0;
    restoreConfig();
    const weapon = applyWeapon(selWeapon);   // weapon defines base feel; shop/upgrades stack on top
    applySettings();
    try { SFX.setVoidDescent(0, 0.05); SFX.setMusicDuck(1, 0.12); } catch (e) {}
    const d = CONFIG.difficulties.find((x) => x.id === diff) || CONFIG.difficulties[0];
    const dm = d.mods || {};
    CONFIG.player.dmgTakenMult *= (dm.dmg || 1);   // difficulty: harder = every hit lands heavier (uniform)
    player = new Player(W * 0.5, CONFIG.world.groundY - 60);
    player.oneHit = d.oneHit;
    blade = new Blade();
    blade.throwType = weapon.throwType;
    blade.model = weapon.model || "sword";
    blade.restoredTrail = !!(PROFILE.data.rewards && PROFILE.data.rewards.restoredBladeTrail);
    enemies = []; projectiles = []; floaters = [];
    hitStop = 0; shake = 0; FX.reset(); Backdrop.resetFx(); CLOCK.sim = 0;
    timeScale = 1; slowmo = 0; zoom = 1; flash = 0; bannerT = 0; dashGhostT = 0; throwCd = 0;
    worldZoom = 1; worldZoomTarget = 1;
    loadStage(0); stageBannerT = 0; chapterFlow = null;   // fresh biome 0 (campaign re-stages per wave below)
    // Stable per-run identity for procedural sub-systems. P3 consumes the Void
    // stream state; creating it here makes layouts reproducible without changing
    // any existing combat RNG in this foundational phase.
    const runSeed = ((Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0) || 1;
    const voidSeed = (Math.imul(runSeed ^ 0x7f4a7c15, 1664525) + 1013904223) >>> 0;
    run = {
      mode, diff, wave: 0, score: 0, mods: newMods(),
      spawnQueue: [], spawnTimer: 0, waveActive: false, clearTimer: -1,
      runTime: 0, waveTime: 0, waveKills: 0, wavePeak: 1, waveLog: [],
      combo: 0, comboTimer: 0, mult: 1, rank: "", lastTrick: "", lifestealCd: 0,
      specialBlock: -1, specialsOffered: 0,   // draft guarantee: ≥2 Specials offered per stage
      adRevived: false,   // CrazyGames: the one-time rewarded-ad revive is still available
      // difficulty mods, scaled by the live Remote Config knobs (all 1.0 unless tuned)
      coinMod: (dm.coin || 1) * REMOTE.coinMult, scoreMod: (dm.score || 1) * REMOTE.scoreMult,
      diffHp: (dm.hp || 1) * REMOTE.enemyHpMult, diffCount: (dm.count || 1) * REMOTE.enemyDensityMult,
      _dmgThisWave: false, _dmgThisRun: false, _dmgThisStage: false,   // no-hit achievement flags
      _achSnap: Object.keys(PROFILE.data.ach),   // achievements already owned at run start (to show "earned this run")
      weaponId: selWeapon,   // for the "win with each weapon" achievement
      biomeState: { swung: false, thrown: false, jumped: false },   // per-stage restriction feats
      _staticParry: 0, _airKills: 0, _projDashes: 0, _aldricSlams: 0, _revivedT: false, _bossFightT: null,
      runSeed, voidSeed: voidSeed || 1,
      chapterState: mode === "campaign" ? "LORE_ENTER" : "WAVE_LIVE", pendingBossOutro: null, _prologueShown: false,
    };
    // Exodia (The Forbidden Technique): Long Arm + Throwing Arm + Aether Step + Lifeline all owned
    if (achTracks() && META.level("reach") > 0 && META.level("throwarm") > 0 && META.level("aircharge") > 0 && META.level("lifeline") > 0) PROFILE.maxStat("exodiaBuild", 1);
    arsenalScroll = 0;
    // "played every mode" counts the five always-visible modes (not the debug sandboxes)
    if (mode !== "bossonly" && mode !== "sandbox") { PROFILE.markMode(mode); achCheck(); }
    if (achTracks()) GHOST.startRec();   // record the hero's path for replay (real modes only)
    if (mode === "bossonly") {   // boss gauntlet: chosen boss first, then a shuffled cycle of the rest
      run.bossOrder = shuffledRoster();
      if (selBoss !== "shuffle") { run.bossOrder = run.bossOrder.filter((id) => id !== selBoss); run.bossOrder.unshift(selBoss); }
      run.bossIdx = 0; run.bossesBeaten = 0;
      run.curBoss = run.bossOrder[0]; loadStage(bossBiome(run.curBoss));   // open in the first boss's home biome
    } else if (mode === "gauntlet") {   // Endless + Bosses: a shuffled boss cycle punctuating the waves
      run.bossOrder = shuffledRoster(); run.bossIdx = 0; run.bossesBeaten = 0;
    }
    META.apply({ player, blade, mods: run.mods });
    if (mode === "tutorial" || mode === "playground") {
      // training space: no waves — an open arena (floor + two practice ledges)
      platforms = trainingPlatforms();
      run.wave = 1; run.waveActive = false;
      run.diffDmg = dm.dmg || 1;   // so the playground can live-swap difficulty (renormalizes damage taken)
      if (mode === "playground") { run.bossOrder = shuffledRoster(); run.bossIdx = 0; run.pg = { god: false, freeze: false, slow: false, hpMul: 1, count: 1 }; run.pgArena = -1; }
      if (mode === "tutorial") TUT.start();
    } else startNextWave();
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
        if (run.wave > 1) Wipe.begin();   // tear-wipe into the new biome (not on the opening stage)
        const priorOutro = run.pendingBossOutro; run.pendingBossOutro = null;
        loadStage(ns);
        stageBannerT = 0; stageName = stageAt(ns).name;
        beginCampaignChapter(ns, priorOutro);
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
        if (run.wave > 1) Wipe.begin();             // tear-wipe between biomes
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
      if (run.wave > 1) Wipe.begin();      // tear-wipe into the next boss's home biome
      loadStage(bossBiome(run.curBoss));   // each boss in its home biome (fresh arena: restore platforms, clear hazards)
      stageBannerT = 2.4; stageName = (BOSS_ROSTER.find((b) => b.id === run.curBoss) || {}).name || "BOSS";
    }
    run.spawnQueue = [];
    GHOST.wave(run.wave, run.isBossWave ? "boss" : "start");   // ghost 2.0: chapter marker
    if (run.wave === 2) GHOST.snapshot(canvas, 0);             // baseline thumbnail so every run has one
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
    // The spawn queue is PREPARED above; ACTIVATION (spawn timer, wave SFX, banner,
    // waveActive) is a separate step. A campaign chapter defers activation to its
    // onComplete so the wave horn/banner never fire over the reading card.
    if (run.mode === "campaign" && chapterFlow) {
      run.wavePendingActivation = true; run.waveActive = false;
    } else {
      activatePreparedWave();
    }
  }
  // Flip the prepared wave live: only here do spawning, wave/rank timers, the banner,
  // and the wave SFX begin. Called immediately for non-chapter waves, or from a
  // campaign chapter's onComplete once the reading is over.
  function activatePreparedWave() {
    if (!run) return;
    run.wavePendingActivation = false;
    run.spawnTimer = CONFIG.run.startDelay;
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
    if (id === "echo") return new MirrorHost(W / 2, CONFIG.world.groundY - CONFIG.echo.h / 2, run ? run.mods : null);   // THE ECHO reborn: Mirror-driven duelist (goes _live only when actually fought; old Echo class = its phase-2 clone)
    if (id === "aldric") return new Aldric(W / 2, CONFIG.world.groundY - CONFIG.aldric.h / 2);
    if (id === "colossus") return new Colossus(W / 2, CONFIG.world.groundY - CONFIG.colossus.h / 2);
    if (id === "warden") return new Warden(W / 2, CONFIG.world.groundY - 140);
    return new Boss(W / 2, CONFIG.world.groundY - 140);   // unbuilt -> placeholder
  }
  // boss test: each boss fights in its home biome (the stage whose .boss matches it)
  function bossBiome(id) { const i = STAGES.findIndex((s) => s.boss === id); return i < 0 ? 0 : i; }
  // pick the boss for the current context: the campaign stage's named boss, else the Warden
  function makeBoss() {
    const id = (run.mode === "campaign") ? stageAt(stageIndex).boss : (run.mode === "bossonly" || run.mode === "gauntlet" || run.mode === "playground") ? run.curBoss : "warden";
    const e = bossById(id); e.bossId = id; return e;
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
      case "boss":
        e = makeBoss(); if (e.isMirrorBoss) e._live = true;
        run._bossFightT = run.runTime; if (typeof Clipper !== 'undefined') Clipper.start();   // clock the boss fight (Source speedrun)
        // BOSS THEATER: the arrival ceremony — brief slow-time, letterbox name card,
        // HP bar sweep; the boss's own draw can gesture off e.introT
        bossIntro = { boss: e, t: 0, dur: CONFIG.bossTheater.introDur, delay: (typeof Wipe !== "undefined" && Wipe.t > 0) ? Wipe.t : 0 };
        e.introT = CONFIG.bossTheater.introDur;
        bossBeat = null; bannerT = 0; stageBannerT = 0;
        run.bossAdds = null;
        // NO SHELTER: the boss brings its own arena (restored when it falls)
        { const ar = bossArena(e.bossId);
          if (ar) { run._preBossPlatforms = platforms; run._brokenPlats = null; run._arenaBroken = []; platforms = ar; } }
        break;
      case "miniboss": e = bossById(spec.bossId); if (e.isMirrorBoss) e._live = true; e.hp *= 0.4; e.maxHp *= 0.4; e.isMiniBoss = true; e.bossName = "◇ " + e.bossName; break;
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
      // mode-specific structural scaling (campaign stage depth / gauntlet wave depth) FIRST,
      // then the shared difficulty-tier multiplier so bosses answer to Easy/Normal/Hard/Extreme
      // like everything else — previously named campaign bosses ignored difficulty entirely.
      // Only HP is scaled here: difficulty DAMAGE is applied globally through player.dmgTakenMult
      // (see startRun), so scaling boss contactDmg by difficulty too would double-apply it.
      let s = 1;
      if (run.mode === "campaign" && stageIndex > 0 && !e.bossName) { s = 1 + stageIndex * 0.6; }   // placeholder bosses scale by stage
      else if (run.mode === "bossonly" || run.mode === "gauntlet") {
        // scale with the WAVE number (not just bosses-beaten) so a deep-run boss is a deep-run
        // threat — previously a wave-50 boss was barely tougher than the first.
        s = 1 + (run.wave || 1) * 0.12 + (run.bossesBeaten || 0) * 0.06;
        if (typeof e.contactDmg === "number") e.contactDmg *= 1 + (run.wave || 1) * 0.05;   // stays threatening, not just spongy
      }
      s *= (run.diffHp || 1);   // difficulty-tier + Remote Config HP knob (matches the trash path at hpScale *= run.diffHp)
      e.hp *= s; e.maxHp *= s;
    }
    e.hpDisplay = e.hp;
    e.spawnT = 0.35;   // brief materialize so spawns read as spawns (not teleports)
    FX.ring(e.x, e.y, 10, e.color);   // arrival pulse in the enemy's own colour
    if (e.isBoss && !GFX.low) { FX.ring(e.x, e.y, 22, e.color); FX.burst(e.x, e.y, 0, -1, 10, e.color); }
    // ghost 2.0: log the spawn (kind + variant + boss identity) so replays can rebuild it
    GHOST.spawn(e, e.isBoss ? "boss" : spec.type, { vn: e.variantName || "", b: e.bossId || spec.bossId || "" });
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
    const k = dealAoE(e.x, e.y, C.blastRadius, C.blastDmg);
    if (achTracks() && k > 0) { PROFILE.maxStat("bomberBetrayal", k); achCheck(); }   // Friendly Fire (a bomber kills 3 others)
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
    if (run.spawnQueue.length && enemies.length < cap && !loreBusy()) {   // lore beat holds the wave back until it ends (+ a breath)
      if (enemies.length === 0 && run.spawnTimer > 0.3) run.spawnTimer = 0.3; // short beat (not an instant pop) when the screen empties
      run.spawnTimer -= dt;
      if (run.spawnTimer <= 0) { spawnOne(run.spawnQueue.shift()); run.spawnTimer = R.spawnInterval; }
    }
    // wave cleared -> wait a beat (let death FX finish) before the draft
    if (run.waveActive && run.spawnQueue.length === 0 && enemies.length === 0) {
      run.waveActive = false;
      Backdrop.bloom(currentStage.accent, 0.14, 0.8);   // wave cleared: a breath of light
      run.waveLog.push({ wave: run.isBossWave ? "BOSS" : run.wave, time: run.waveTime, kills: run.waveKills, peak: run.wavePeak });
      GHOST.wave(run.wave, "clear");   // ghost 2.0
      if (achTracks()) {   // progression + no-hit feats, tallied per cleared wave
        PROFILE.maxStat("bestWave", run.wave);
        PROFILE.maxStat("longestRun", Math.floor(run.runTime));
        DAILY.bump("wave", run.wave, "max");
        if (player.oneHit) PROFILE.maxStat("oneHitWave", run.wave);
        if (!run._dmgThisWave) { PROFILE.addStat("noHitWaves", 1); DAILY.bump("nohit", 1); }
        let ownedN = 0; for (const k in run.mods.owned) if (run.mods.owned[k]) ownedN++;
        PROFILE.maxStat("abilitiesInRun", ownedN);
        if (run.mode === "endless") {   // Endless-only milestones (isolated from Gauntlet/Adventure)
          PROFILE.maxStat("bestWaveEndless", run.wave);
          if (run.diff === "hard" && run.wave >= 50) PROFILE.maxStat("wave50Hard", 1);
          if (run.diff === "extreme" && run.wave >= 100) PROFILE.maxStat("wave100Extreme", 1);
          if (run.horde) AT.hordeCleared(run.waveTime);   // Horde Breaker (a horde window cleared fast)
        }
        achCheck();
      }
      run._dmgThisWave = false;
      if (run.isBossWave) {
        if (run.mode === "campaign" && stageIndex >= STAGES.length - 1) { startAdventureFinale(run.finalBossDeath); return; }   // final biome cleared -> the playable ending
        if (run.mode === "campaign" || run.mode === "bossonly" || run.mode === "gauntlet") {
          if (!player.oneHit) player.heal(R.healEachWave * 2 + (run.mods.waveHeal || 0));   // a boss kill is a milestone, not the end
          if (run.mode === "bossonly" || run.mode === "gauntlet") run.bossesBeaten = (run.bossesBeaten || 0) + 1;
          if (run.mode === "campaign" && achTracks()) {   // a full stage (10 waves + boss) is done
            PROFILE.addStat("stageClears", 1);
            if (!run._dmgThisStage) PROFILE.addStat("noHitStages", 1);
            run._dmgThisStage = false;
            AT.stageDone();   // No Takebacks / Butterfingers / Heavy Boots / Glass Cannon
            achCheck();
          }
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
          ups.sort((a, b) => (a.cat < b.cat ? -1 : 1));            // group by category so the grid reads organized
          if (ups.length) { tierChoices = ups; state = "tierup"; listScroll = 0; }   // EVERY evolvable ability is offered
          else { draftChoices = buildDraft(); state = "draft"; }   // nothing to evolve -> normal draft
        } else {
          draftChoices = buildDraft();
          state = "draft";
        }
      }
    }
  }

  // package the run's recording: compose the summary card, drop it in the Vault (every
  // run, win or loss), keep lastGhost for the WATCH REPLAY button, feed the legacy
  // per-board best (superseded once publishing lands).
  function finishRecording(won) {
    const kills = run.waveLog.reduce((s, r) => s + (r.kills || 0), 0);
    const peak = run.waveLog.reduce((m, r) => Math.max(m, r.peak || 1), 1);
    const summary = {
      mode: run.mode, diff: run.diff, wave: run.wave, score: run.score, time: Math.round(run.runTime),
      won: !!won, kills, peak, name: Cloud.displayName(), stage: stageIndex, weapon: run.weaponId,
      loadout: ownedAbilities().map((u) => ({ id: u.id, tier: run.mods.tier[u.id] || 1, n: run.mods.owned[u.id] || 1 })),
    };
    lastGhost = GHOST.stopRec(summary);
    if (lastGhost) {
      summary.thumb = lastGhost.thumb || null;
      lastVaultId = VAULT.add(lastGhost, summary);
    }
    // shared layer: submit the score; an improved personal best auto-publishes its replay
    // and links it to the leaderboard row (self-replacing doc — no cleanup ever needed)
    const mode = run.mode, diff = run.diff, sc = run.score, wv = run.wave, tm = run.runTime, g = lastGhost, vid = lastVaultId;
    Cloud.submitScore(mode, diff, { score: sc, wave: wv, time: tm }).then((ok) => {
      if (ok && g) Cloud.publishReplay(g, null, "lb_" + mode + "_" + diff).then((sid) => {
        if (sid) { Cloud.linkReplay(mode, diff, sid); if (vid) VAULT.setShareId(vid, sid); }
      });
    });
    return lastGhost;
  }

  function endRun() {
    if (typeof Clipper !== 'undefined') Clipper.stop();
    // log the in-progress wave the player died on
    if (run.waveActive) run.waveLog.push({ wave: run.wave, time: run.waveTime, kills: run.waveKills, peak: run.wavePeak, died: true });
    const best = getBest(run.mode, run.diff);
    const isNew = saveBest(run.mode, run.diff, run.wave, run.score, run.runTime);
    const earned = awardCoins(run.score);
    if (achTracks()) { PROFILE.addStat("runs", 1); PROFILE.maxStat("longestRun", Math.floor(run.runTime)); DAILY.bump("runs", 1); achCheck();
      Cloud.push();   // cloud save (finishRecording handles the score + replay link)
      Cloud.logEvent("run_end", Object.assign({ mode: run.mode, diff: run.diff, wave: run.wave, score: run.score, time: Math.round(run.runTime), peak: run.wavePeak, died: true }, economyTelemetry(earned)));   // balancing + economy telemetry
      finishRecording(false); }
    overInfo = { wave: run.wave, score: run.score, time: run.runTime, log: run.waveLog.slice(), best: getBest(run.mode, run.diff), isNew, earned, coins: META.coins() };
    state = "gameover";
    document.exitPointerLock();
    SFX.gameover();
  }

  function prepareVictoryRecord(campaign, persistFinale) {
    if (run._victoryPrepared) return run._victoryPrepared;
    if (typeof Clipper !== 'undefined') Clipper.stop();
    const isNew = saveBest(run.mode, run.diff, run.wave, run.score, run.runTime);
    const earned = awardCoins(run.score);
    if (achTracks()) { PROFILE.addStat("runs", 1); if (campaign) PROFILE.addStat("campaignClears", 1); DAILY.bump("runs", 1);
      // win a run with each weapon (Armory) — a set keyed by weapon id
      const ww = PROFILE.data.weaponsWon || (PROFILE.data.weaponsWon = {}); ww[run.weaponId || "sword"] = 1; PROFILE.maxStat("distinctWeaponsWon", Object.keys(ww).length);
      if (campaign) {   // Adventure difficulty mastery
        const rewards = PROFILE.data.rewards || (PROFILE.data.rewards = {});
        rewards.restoredBladeTrail = true; rewards.campaignEmblem = true;
        if (run.diff === "hard") PROFILE.maxStat("clearAdvHard", 1);
        if (run.diff === "extreme") PROFILE.maxStat("clearAdvExtreme", 1);
        if (!run._dmgThisRun) PROFILE.maxStat("clearAdvNoHit", 1);          // Flawless Victory
        if (run.runTime < 900) PROFILE.maxStat("speedrunUnder15", 1);       // Speedrunner
        const dc = PROFILE.data.advDiffs || (PROFILE.data.advDiffs = {}); dc[run.diff] = 1; PROFILE.maxStat("clearAdvAll", Object.keys(dc).length);
      }
      achCheck();
      Cloud.logEvent("run_end", Object.assign({ mode: run.mode, diff: run.diff, wave: run.wave, score: run.score, time: Math.round(run.runTime), peak: run.wavePeak, won: true, campaign: !!campaign }, economyTelemetry(earned)));
      finishRecording(true); }
    const prepared = run._victoryPrepared = { isNew, earned, coins: META.coins() };
    if (campaign && persistFinale) PROFILE.setPendingFinale({
      mode: run.mode, diff: run.diff, weapon: run.weaponId, wave: run.wave, score: run.score, time: run.runTime,
      log: run.waveLog.slice(), best: getBest(run.mode, run.diff), isNew, earned, coins: META.coins(),
    });
    else PROFILE.save();
    if (achTracks()) Cloud.push();   // includes the pre-finale completion marker
    return prepared;
  }

  function winRun(campaign) {
    const prepared = prepareVictoryRecord(campaign, false);
    overInfo = { wave: run.wave, score: run.score, time: run.runTime, log: run.waveLog.slice(), best: getBest(run.mode, run.diff),
      isNew: prepared.isNew, win: true, campaign: !!campaign, earned: prepared.earned, coins: prepared.coins, diff: run.diff };
    if (campaign) { PROFILE.clearPendingFinale(); if (achTracks()) Cloud.push(); }
    state = "win";
    document.exitPointerLock();
    SFX.wave();
    CG.happytime();   // CrazyGames: victory is a highlight
  }

  function claimSavedFinale() {
    const p = PROFILE.pendingFinale(); if (!p) return;
    selWeapon = p.weapon || selWeapon; startRun("campaign", p.diff || "normal");
    if (CINEMA.active) CINEMA.cancel("claim-final-cut");
    run.wave = p.wave || STAGES.length * 10; run.score = p.score || 0; run.runTime = p.time || 0;
    run.waveLog = p.log || []; run.spawnQueue.length = 0; run.waveActive = false;
    run._victoryPrepared = { isNew: !!p.isNew, earned: p.earned || 0, coins: p.coins || META.coins() };
    stageIndex = 0; currentStage = stageAt(0); platforms = stagePlatforms(0); enemies = []; projectiles = [];
    player.x = W / 2; player.y = CONFIG.world.groundY - player.hh; player.vx = 0; player.vy = 0; player.onGround = true;
    if (GHOST.recording()) GHOST.stopRec({ claimedFinale: true });
    overInfo = { wave: p.wave, score: p.score, time: p.time, log: p.log || [], best: p.best,
      isNew: !!p.isNew, win: true, campaign: true, earned: p.earned || 0, coins: p.coins || META.coins(), diff: p.diff || "normal" };
    PROFILE.clearPendingFinale(); if (achTracks()) Cloud.push();
    state = "win"; winT = 0; SFX.wave(); CG.happytime();
  }

  function resumeSavedFinale() {
    const p = PROFILE.pendingFinale(); if (!p) return;
    selWeapon = p.weapon || selWeapon; startRun("campaign", p.diff || "normal");
    if (CINEMA.active) CINEMA.cancel("resume-final-cut");
    run.wave = p.wave || STAGES.length * 10; run.score = p.score || 0; run.runTime = p.time || 0;
    run.waveLog = p.log || []; run.spawnQueue.length = 0; run.waveActive = false;
    run._victoryPrepared = { isNew: !!p.isNew, earned: p.earned || 0, coins: p.coins || META.coins() };
    stageIndex = STAGES.length - 1; currentStage = stageAt(stageIndex); platforms = stagePlatforms(stageIndex);
    enemies = []; projectiles = []; if (GHOST.recording()) GHOST.stopRec({ resumedFinale: true });
    startAdventureFinale({ x: W / 2, y: H * 0.38 }, true);
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
    CLOCK.sim += dt;
    // CINEMATIC SAFETY LOCK (Pantheon VI P2): protection is derived from the
    // director each frame — inherently released once on EVERY terminal path
    // (complete/skip/cancel/replace/restart/quit/death) because the scene simply
    // stops being active. On the falling edge we grant the short visible grace.
    const blocking = CINEMA.active && CINEMA.blocksCombat;
    if (blocking) { player.cinematicProtected = true; cinemaProtectActive = true; stepCinematicPlaying(dt); return; }
    if (cinemaProtectActive) {
      player.cinematicProtected = false;
      player.cinematicGraceT = Math.max(player.cinematicGraceT,
        (lastCinemaPlayerMode === "landing" || lastCinemaPlayerMode === "finalLanding") ? 0.70 : 0.45);
      lastCinemaPlayerMode = null; cinemaProtectActive = false;
      Input.takeClick(); Input.tJump = false;   // flush the closing tap so it can't also jump/dash/throw
    }
    // Flow Guard: damage reduction while the trick rank is high (refreshed each step)
    player.flowDR = (run.mods.flowGuard && run.mult >= CONFIG.resilience.flowGuardTier)
      ? CONFIG.resilience.flowGuardMult : 1;
    if (run.mods.flowRegen && run.mult >= 3) player.heal(7 * dt);   // Flow Guard T3: regen while BRUTAL+
    if (run.lifestealCd > 0) run.lifestealCd -= dt;
    if (throwCd > 0) throwCd -= dt;
    if (player.hazardT > 0) player.hazardT = Math.max(0, player.hazardT - dt);
    updateZonesWalls(dt);   // mud puddles + Geomancer walls; sets player.slowMult
    // faster while unarmed (blade thrown); Tempo adds haste during its window
    player.moveBoost = ((blade.state !== "held") ? CONFIG.player.thrownMoveBoost : 1) *
      (player.tempoT > 0 ? 1.18 : 1) * (player.afterimageT > 0 ? player.afterimageSpeedMult : 1);
    player.update(dt, platforms);
    if (run.voidScroll) syncVoidPlayerSupport();
    else { player.supportPlatform = null; player.voidLane = null; player.voidMajorWindow = false; }
    const wasReturning = blade.state === "returning";
    blade.update(dt, player, platforms);
    if (wasReturning && blade.state === "held" && run.mods.stormBurst) {   // Storm Recall T3: shockwave on catch
      dealAoE(player.x, player.y, 155, 30); FX.ring(player.x, player.y, 15, CONFIG.colors.perfect);
      addShake(CONFIG.juice.shakeBig); SFX.slam();
    }
    if (blade.embeddedNew) { blade.embeddedNew = false; if (blade.throwType === "lob") lobExplode(blade.x, blade.y); }

    // THE ECHO (Mirror-driven boss): the host enemy runs its brain inside the normal enemy
    // loop; this handles only its own weapon-vs-player exchange + consumes its juice queue.
    if (typeof Mirror !== "undefined" && Mirror.active) {
      Mirror.updateCombat(dt, player, blade);
      if (Mirror.host && Mirror.host.dead) {
        Mirror.active = false;
        addFloater(player.x, player.y - 70, "REFLECTION SHATTERED", true, Mirror.color);
      }
      while (Mirror.fxq.length) {
        const q = Mirror.fxq.shift();
        if (q.shake) addShake(q.shake);
        if (q.flash) addFlash(q.flash);
        if (q.hitstop) hitStop = Math.max(hitStop, q.hitstop);
        if (q.slowmo) slowmo = Math.max(slowmo, q.slowmo);
        if (q.zoom) addZoom(q.zoom);
        if (q.txt) addFloater(q.x != null ? q.x : player.x, q.y != null ? q.y : player.y - 70, q.txt, !!q.big, q.color || Mirror.color);
        if ((q.big || q.shake >= 9) && !q.quiet) { try { SFX.slam(); } catch (e) {} }
      }
    }

    // BOSS THEATER: drain the shared boss juice queue (every boss, always —
    // same grammar as the Echo's fxq above)
    if (typeof BOSSFX !== "undefined") for (const q of BOSSFX.drain()) {
      if (q.shake) addShake(q.shake);
      if (q.flash) addFlash(q.flash);
      if (q.hitstop) hitStop = Math.max(hitStop, q.hitstop);
      if (q.slowmo) slowmo = Math.max(slowmo, q.slowmo);
      if (q.zoom) addZoom(q.zoom);
      if (q.banner) bossBeat = { text: q.banner, color: q.color || CONFIG.colors.boss, t: 1.15, dur: 1.15 };
      if (q.txt) addFloater(q.x != null ? q.x : player.x, q.y != null ? q.y : player.y - 70, q.txt, !!q.big, q.color || CONFIG.colors.boss);
      if (q.cue && typeof SFX[q.cue] === "function") { try { SFX[q.cue](); } catch (e) {} }
    }

    // audio cadence: dash start + swing whoosh
    if (player.dashTimer > 0 && !wasDashing) {
      SFX.dash();
      // dash kick-off: a cyan crack + sparks flung opposite the burst
      FX.burst(player.x, player.y, -player.dashX, -player.dashY, 6, CONFIG.colors.perfect);
      if (!GFX.low) FX.ring(player.x, player.y, 7, CONFIG.colors.perfect);
    }
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
      // (Phase Step now resolves at the projectile-vs-player overlap, so it can't miss.)
    } else dashGhostT = 0;

    // landing dust + thud when arriving on the ground from a real fall — a harder
    // fall kicks a bigger cloud (smoke billows + wider spray)
    if (player.onGround && !wasOnGround && player.vy >= 0) {
      const feet = player.y + player.hh;
      const hard = clamp(landVy / CONFIG.player.maxFall, 0, 1);
      FX.burst(player.x, feet, 0, -1, 5 + Math.round(hard * 6));
      if (!GFX.low) { FX.smoke(player.x - 12, feet - 2); FX.smoke(player.x + 12, feet - 2); if (hard > 0.6) { FX.smoke(player.x, feet - 4); FX.ring(player.x, feet, 8, THEME.ink); } }
      SFX.land();
    }
    landVy = player.onGround ? 0 : Math.max(landVy, player.vy);   // remember the fall speed for the landing puff
    if (!player.onGround && wasOnGround) landVy = 0;
    wasOnGround = player.onGround;

    if (Input.consumeThrow()) {
      if (blade.state === "held") {
        if (throwCd <= 0 && blade.throwBlade()) { throwCd = 0.5 * blade.throwCooldownMult; FX.burst(blade.x, blade.y, blade.vx, blade.vy, 6); addShake(CONFIG.juice.shakeSmall); SFX.throwBlade(); }
      } else {
        const r = blade.tryRecall(player);
        const hand = blade.handPos(player);
        if (r === "recalled") { FX.ring(blade.x, blade.y, 8); addShake(CONFIG.juice.shakeSmall); SFX.recall(); }
        else if (r === "toofar") addFloater(hand.x, hand.y - 40, "too far", false);
      }
    }

    updateWave(dt);
    let transformationStarted = false;
    for (const e of enemies) {
      if (e.dying) {
        e.tickTimers(dt);
        if (e.updateDeath(dt)) onKill(e, e._deathCause || "");
        continue;
      }
      if (e.spawnT > 0) { e.spawnT -= dt; continue; }   // materializing: hold still
      if (run.pg && run.pg.freeze) continue;             // playground: enemies as statues
      if (e.tutDummy) {
        // tutorial dummy: a physics-only puppet. The plain stun path skips update entirely
        // (no gravity, hitCd never ticks), which froze launches and swallowed repeat hits —
        // so dummies tick their timers and integrate, but never think or attack.
        e.tickTimers(dt);
        e.stun = 1;
        e.vy = (e.vy || 0) + CONFIG.world.gravity * dt;
        e.x += (e.vx || 0) * dt; e.y += e.vy * dt;
        e.vx = (e.vx || 0) * Math.max(0, 1 - 4 * dt);
        const fy = CONFIG.world.groundY - e.hh;
        if (e.y >= fy) { e.y = fy; e.vy = 0; e.vx *= 0.85; }
        e.x = clamp(e.x, e.hw, W - e.hw);
        continue;
      }
      if (e.stun > 0) { e.tickTimers(dt); continue; }    // stunned: frozen AI, but timers still tick (tickTimers decrements stun + hitCd — otherwise a stunned enemy freezes its hit-iframe and swallows follow-up combo hits)
      e.update(dt, platforms, player, projectiles);
      if (e.cinematicRequest && !CINEMA.active) {
        transformationStarted = startBossTransformation(e, e.cinematicRequest);
        if (transformationStarted) break;
      }
    }
    if (transformationStarted || (CINEMA.active && CINEMA.blocksCombat)) return;
    updateSupports(dt);   // apply War Priest / Herald / Mender / Anchor effects to allies

    // ---- status effects: tick bleed/burn, mark decay, and credit DoT kills ----
    for (const e of enemies) {
      if (e.dead || e.dying || e.spawnT > 0) continue;
      e.slowStatus = (run.mods.cinderSlow && e.burnT > 0) ? 0.65 : 1;   // Cinder T2 slow
      if (e.bleedStacks <= 0 && e.burnT <= 0 && e.markT <= 0) continue;
      e.tickStatus(dt);
      e._stFx -= dt;
      if (e._stFx <= 0) {
        e._stFx = 0.05;
        if (e.burnT > 0) { FX.ember(e.x, e.y); FX.ember(e.x, e.y - e.hh * 0.4); }
        if (e.bleedStacks > 0) { FX.drip(e.x, e.y + e.hh * 0.35); if (e.bleedStacks > 2) FX.drip(e.x + (Math.random() - 0.5) * e.hw, e.y + e.hh * 0.2); }
      }
      if (e.dead) {
        if (achTracks() && e.kind === "armored" && !e.enraged) PROFILE.maxStat("armorBypassKills", 1);   // Surgical Extraction (status-killed, armor never broken)
        onKill(e, "skill");   // a bleed/burn kill is a skill kill (you set it up)
      }
    }

    // boss floor hazards: sustained damage you must keep moving to avoid (off-pulse fire is safe)
    const bossZ = enemies.find((e) => e.isBoss && e.zones && e.zones.length);
    if (bossZ) {
      const onFloor = player.y + player.hh >= CONFIG.world.groundY - 8;
      let inZone = false;
      let zoneDmg = CONFIG.warden.zoneTick, zoneCd = CONFIG.warden.zoneTickCd;
      for (const z of bossZ.zones) {
        const half = (z.w || CONFIG.warden.zoneW) / 2;
        if ((z.fullHeight || onFloor) && z.on !== false && Math.abs(player.x - z.x) < half) {
          inZone = true; zoneDmg = z.dmg == null ? zoneDmg : z.dmg; zoneCd = z.tickCd || zoneCd; break;
        }
      }
      if (inZone && player.hazardT <= 0 && !player.invulnerable) {
        const r = player.takeDamage(zoneDmg * player.hazardDmgMult, bossZ.x, bossZ);
        player.hazardT = zoneCd;
        if (r === "hit") { SFX.hurt(); loseStyle(); } else if (r === "absorbed") onShieldAbsorb();
      }
    }
    // LIVING ARENAS own stable platform identity across break/reform cycles.
    // Generic cracks remain for non-arena scripted destruction (notably Source).
    updateBossArenaPlatforms(dt);
    // GENERIC platform cracking: non-arena bosses can set p.crackT (+ optional
    // p.respawnIn to give the platform back later). Warning shimmer draws in
    // the world pass; here the timer runs out and the ground gives way.
    for (let i = platforms.length - 1; i >= 0; i--) {
      const p = platforms[i];
      if (p.arenaPlatId) continue;
      if (!(p.crackT > 0)) continue;
      p.crackT -= dt;
      if (p.crackT <= 0 && p.oneway) {
        const spec = { x: p.x, y: p.y, w: p.w, h: p.h, oneway: true };
        platforms.splice(i, 1);
        FX.ring(spec.x + spec.w / 2, spec.y, 18, p.crackColor || THEME.ink);
        FX.burst(spec.x + spec.w / 2, spec.y, 0, 1, 8, p.crackColor || THEME.ink);
        if (p.respawnIn > 0) (run._brokenPlats = run._brokenPlats || []).push({ spec, t: p.respawnIn });
      }
    }
    if (run._brokenPlats) for (let i = run._brokenPlats.length - 1; i >= 0; i--) {
      const b = run._brokenPlats[i];
      b.t -= dt;
      if (b.t <= 0) {
        platforms.push({ ...b.spec });
        FX.ring(b.spec.x + b.spec.w / 2, b.spec.y, 12, "#c9ccd6");
        run._brokenPlats.splice(i, 1);
      }
    }

    // THE VOID RUN: drive the conveyor (this call was missing — the entire
    // platform-stream system existed but never moved)
    updateVoidScroll(dt);
    // Aldric scripted logic: the fake-death adds + revive
    const aboss = enemies.find((e) => e.isBoss);
    if (aboss) {
      if (aboss.witnessEarned) {
        aboss.witnessEarned = false;
        if (achTracks() && typeof ACH !== "undefined" && ACH.unlock) ACH.unlock("witness");
      }
      // NO SHELTER: track platform camping — perched above the boss, the clock
      // runs; on the ground it drains. Bosses read campT/campPlat to answer.
      {
        const perch = player.onGround ? platforms.find((p) => p.oneway && !p.floor &&
          Math.abs(player.y + player.hh - p.y) < 6 && player.x + player.hw > p.x && player.x - player.hw < p.x + p.w) : null;
        if (perch && player.y < aboss.y - aboss.hh * 0.4) {
          aboss.campT = (aboss.campT || 0) + dt; aboss.campPlat = perch;
        } else {
          aboss.campT = Math.max(0, (aboss.campT || 0) - dt * 1.6);
          if (aboss.campT <= 0) aboss.campPlat = null;
        }
      }
      // THE VOID DESCENT is serialized on wall time; simulation enters its
      // protected physical-player step on the next fixed tick.
      if (aboss.requestVoidCinematic) { aboss.requestVoidCinematic = false; startVoidDescent(aboss); }
      if (aboss.freezeVoid && run.voidScroll) { aboss.freezeVoid = false; run.voidScroll.active = false; run.voidScroll.frozen = true; }
      if (aboss.thawVoid && run.voidScroll) {   // TRUE FORM: the conveyor resumes, faster
        aboss.thawVoid = false; run.voidScroll.frozen = false; run.voidScroll.active = true;
        const thawMult = CONFIG.source.thawSpeedMult || 1.35;
        run.voidScroll.speedCap = CONFIG.source.scrollSpeedMax * thawMult;
        run.voidScroll.speed = Math.min(run.voidScroll.speed * thawMult, run.voidScroll.speedCap);
      }
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
      if (aboss.spawnClone) {   // THE ECHO (reborn): split a real, corner-perching ReflectionEnemy
        aboss.spawnClone = false;
        const cl = new ReflectionEnemy(clamp(aboss.x - aboss.facing * 220, 100, W - 100), CONFIG.world.groundY - 300);
        cl.spawnT = 0.3; enemies.push(cl);
        addFloater(aboss.x, aboss.y - 70, "SPLIT", true, cl.color);
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
    // The fall siphon is world geometry, not the Source's rear-plane hurtbox.
    // Test the visible tether itself so a committed held or thrown cut can sever it.
    for (const e of enemies) if (!e.dead && typeof e.trySeverSiphon === "function" && e.trySeverSiphon(blade)) {
      const mx = (blade.x + blade.tipX) / 2, my = (blade.y + blade.tipY) / 2;
      FX.burst(mx, my, blade.tipVX, blade.tipVY, 13, CONFIG.colors.perfect); FX.ring(mx, my, 16, CONFIG.colors.perfect);
      addFloater(mx, my - 22, "SIPHON SEVERED", true, CONFIG.colors.perfect); addStyle("parry"); SFX.deflect();
      hitStop = Math.max(hitStop, CONFIG.hitStop.small); addShake(CONFIG.juice.shakeBig);
    }
    for (const e of enemies) {
      if (e.dead || e.dying || e.introT > 0 || e.hitCd > 0) continue;
      const liveWeapon = e.parryBaton && e.batonStrike > 0 ? e.batonSegment() : null;
      const weaponContact = liveWeapon && weaponCapsuleIntersectsSegment(liveWeapon, blade.x, blade.y, blade.tipX, blade.tipY);
      if (segCircle(blade.x, blade.y, blade.tipX, blade.tipY, e.x, e.y, e.radius + 4) || weaponContact) {
        // Wraith: the blade phases straight through — only a thrown blade or a deflected shot harms it
        if (e.immuneToBlade) {
          if (baseDmg > 0) { e.hitCd = 0.18; FX.burst(e.x, e.y, blade.tipVX, blade.tipVY, 4, e.color); }
          continue;
        }
        if (baseDmg > 0) {
          // THE FIRST EXAM: a fast swing that meets the Warden's STRIKING baton
          // deflects it — posture damage. Fills his guard meter; full = GUARD BROKEN.
          if (e.parryBaton && e.batonStrike > 0) {
            const bs = liveWeapon || e.batonSegment();
            const near = !!weaponContact;
            if (near && e.parryBaton(blade.tipSpeed >= CONFIG.blade.minHitSpeed * 2.2)) {
              FX.burst(bs.x2, bs.y2, 0, -1, 12, "#e0a326"); FX.flash(bs.x2, bs.y2, 34, "#e0a326");
              addFloater(bs.x2, bs.y2 - 16, "PARRIED", true, "#e0a326");
              addStyle("parry"); SFX.deflect();
              hitStop = Math.max(hitStop, CONFIG.hitStop.small);
              e.hitCd = 0.14;   // the deflect IS this exchange — no body damage on the same swing
              continue;
            }
            if (near) {   // an unparryable finisher still meets the visible staff, never the boss body behind it
              FX.burst(bs.x2, bs.y2, 0, -1, 7, CONFIG.colors.charger); SFX.deflect(); e.hitCd = 0.10; continue;
            }
          }
          // armored: blocked unless the hit is fast enough / from the flank.
          // The Colossus's plating gets its own voice: a deep CLANG, bolt
          // sparks, and a plate-flash — fortress armor, not an Armored reskin.
          if (e.blocks(blade.tipX, blade.tipSpeed)) {
            const cp = segPointDist(blade.x, blade.y, blade.tipX, blade.tipY, e.x, e.y);
            if (e.blockStyle === "plate") {
              FX.burst(cp.px, cp.py, e.x - blade.tipX, e.y - blade.tipY, 10, "#c9ccd6");
              FX.flash(cp.px, cp.py, 30, "#c9ccd6");
              addFloater(cp.px, cp.py - 18, "CLANG", false, CONFIG.colors.armoredShield);
              e._plateFlashT = 0.18;   // the struck side flashes (boss draw reads this)
              Input.buzz(10);
            } else {
              FX.burst(cp.px, cp.py, e.x - blade.tipX, e.y - blade.tipY, 5, CONFIG.colors.armoredShield);
              addFloater(e.x, e.y - 26, "block", false, CONFIG.colors.armoredShield);
            }
            e.hitCd = 0.12; hitStop = CONFIG.hitStop.small; SFX.deflect();
            continue;
          }
          // breaking a guard with a fast frontal hit staggers the armored enemy and
          // ENRAGES it: shield gone, faster and aggressive (angry, not crippled)
          if (e.cfg.breakSpeed && !e.enraged && Math.sign(blade.tipX - e.x) === e.guardSide && blade.tipSpeed >= e.cfg.breakSpeed) {
            e.stun = Math.max(e.stun, 0.8); e.enraged = true;   // don't clip a longer stun (lob/impale)
            e.atk = "idle"; e.atkT = 0;   // clear any in-flight stomp charge: its cleanup block is gated on !enraged, so without this the telegraph freezes on screen forever (softlock)
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
          const dealt = e.hit(dmg, blade.tipVX, blade.tipVY);
          // Optional actor-specific physical response. Damage remains owned by
          // Enemy.hit(); this hook only lets authored actors consume the launch /
          // spike impulse using the same measured held-blade motion.
          let impulseHandled = false;
          if (typeof e.onBladeImpulse === "function") {
            const response = e.onBladeImpulse({
              damage: dmg, dealt, held: true, player, blade,
              tipSpeed: blade.tipSpeed, tipVX: blade.tipVX, tipVY: blade.tipVY,
              isSlam, isLaunch, spike, empowered, empSlam, heightF, strikeF,
              strikeType: spike ? "spike" : (empSlam ? "superslam" : (isSlam ? "slam" : (empowered ? "updraft" : (isLaunch ? "launch" : "hit")))),
            });
            impulseHandled = response === true || !!(response && response.handled);
          }
          // Aldric's duel: answering his wound inside the rally window wins blood back
          if (player.rallySource === e) {
            const healed = player.claimRally(dmg);
            if (healed > 0) { addFloater(player.x, player.y - 44, "+" + Math.round(healed), false, "#e8a32e"); FX.ribbon(e.x, e.y - 12, player.x, player.y - 10, "#e8a32e"); }
          }
          if (!e.anchored && !impulseHandled) {   // an anchored ally can't be spiked or launched (break the Anchor first)
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
          TUT.mark("strike");   // tutorial: ANY melee strike counts as a cut (whatever it classified as)
          const airborne = e.y < CONFIG.world.groundY - e.hh - 14;
          if (airborne) TUT.mark("airHit");   // tutorial: a juggled (airborne) cut
          if (achTracks()) {   // skill feats measured at the strike
            if (airborne) { PROFILE.addStat("airHits", 1); DAILY.bump("air", 1); }
            if (blade.tipSpeed > CONFIG.blade.minHitSpeed * 2.1) PROFILE.maxStat("maxMomentum", 1);
            PROFILE.maxStat("maxDamageHit", Math.round(dmg));   // Overkill (3,000 in one strike)
            if (empowered && !isSlam) { run._updraftChain = (run._updraftChain || 0) + 1; PROFILE.maxStat("consecutiveUpdrafts", run._updraftChain); }   // Gravity Defied
            AT.swung(); AT.bossHit(e, "melee");
            if (isLaunch && e.kind === "armored") e._updrafted = true;                          // The Setup: armored launched...
            if (spike && e.kind === "armored" && e._updrafted) PROFILE.maxStat("spikeArmored", 1);  // ...then spiked down
            if (isLaunch && (empowered || isLaunch)) e._updraftT = 1.5;                          // Space Program: mark any launched enemy
            if (e.bossId === "aldric" && empSlam) { run._aldricSlams = (run._aldricSlams || 0) + 1; PROFILE.maxStat("aldricSlams", run._aldricSlams); }   // Silence, King
            achCheck();
          }
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
      // The thrown blade is a lower-reward emergency answer to a sweeper. It
      // cuts integrity and immediately recalls, so it cannot also pierce the room.
      for (const p of projectiles) {
        if (p.dead || p.family !== "sweeper" || p.sweeperState !== "hostile" || p.hitLatch) continue;
        if (!segCircle(blade.x, blade.y, blade.tipX, blade.tipY, p.x, p.y, p.r + 7)) continue;
        const redirected = p.counterSweeper("thrown", blade.vx, blade.vy, len(blade.vx, blade.vy));
        if (redirected) {
          blade.pierced = new Set(); blade.state = "returning";
          FX.burst(p.x, p.y, blade.vx, blade.vy, p.dead ? 10 : 6, p.sweeperStyle === "shard" ? "#6ef2ff" : "#ff8a32");
          addFloater(p.x, p.y - 22, p.dead ? "DEFUSED" : "REDIRECT", true, CONFIG.colors.deflected);
          addStyle("deflect"); hitStop = CONFIG.hitStop.small; addShake(CONFIG.juice.shakeSmall);
          break;
        }
      }
      for (const e of enemies) {
        if (e.dead || e.dying || e.introT > 0 || blade.pierced.has(e)) continue;
        if (segCircle(blade.x, blade.y, blade.tipX, blade.tipY, e.x, e.y, e.radius + 4)) {
          if (e.blocksDamage({ type: "throw" })) continue;
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
          // Aldric's duel: a thrown answer counts for the rally too
          if (player.rallySource === e) {
            const healed = player.claimRally(tdmg);
            if (healed > 0) { addFloater(player.x, player.y - 44, "+" + Math.round(healed), false, "#e8a32e"); FX.ribbon(e.x, e.y - 12, player.x, player.y - 10, "#e8a32e"); }
          }
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
          if (achTracks()) {
            PROFILE.maxStat("maxDamageHit", Math.round(tdmg));         // Overkill can also come from a big throw
            AT.thrown(); AT.bossHit(e, "throw");
            PROFILE.maxStat("bladeBounces", blade.pierced.size);      // Pinball Wizard (4 enemies in one throw)
          }
          fire(run.mods.onHit, makeEv(e.x, e.y, e));
          if (e.dead) {
            if (achTracks() && blade.pierced.size >= 2) { PROFILE.maxStat("throwPierceKills", 1); achCheck(); }   // Collateral Damage (killed through another enemy)
            onKill(e);
          }
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
      if (p.dead || blade.state !== "held") continue;
      if (segCircle(blade.x, blade.y, blade.tipX, blade.tipY, p.x, p.y, p.r + 4)) {
        if (p.family === "sweeper") {
          if (p.sweeperState !== "hostile" || p.hitLatch) continue;
          const psp = len(p.vx, p.vy) || 1, ssp = blade.tipSpeed || 1;
          const counter = clamp((blade.tipVX / ssp) * (-p.vx / psp) + (blade.tipVY / ssp) * (-p.vy / psp), 0, 1);
          // A slow tap or a cut travelling with the saw only clangs it locally.
          // The player must commit to a fast, opposing cut for the real answer.
          if (blade.tipSpeed < CONFIG.blade.deflectMinSpeed || counter < 0.2) {
            if (p.sweeperClang()) {
              FX.burst(p.x, p.y, -p.vx, -p.vy, 4, p.sweeperStyle === "shard" ? "#6ef2ff" : "#ff8a32");
              addFloater(p.x, p.y - 18, "CLANG", false, "#b9c0c8");
              hitStop = CONFIG.hitStop.small * 0.55; addShake(CONFIG.juice.shakeSmall * 0.55);
            }
            continue;
          }
          const effPerfect = CONFIG.blade.perfectSpeed * lerp(1, CONFIG.blade.counterParryFactor, counter);
          const perfect = blade.tipSpeed >= effPerfect && counter > 0.7;
          if (p.counterSweeper(perfect ? "perfect" : "bat", blade.tipVX, blade.tipVY, blade.tipSpeed)) {
            const pcol = perfect ? CONFIG.colors.perfect : (p.sweeperStyle === "shard" ? "#6ef2ff" : "#ff8a32");
            FX.burst(p.x, p.y, blade.tipVX, blade.tipVY, perfect ? 14 : 8, pcol);
            FX.ring(p.x, p.y, perfect ? 12 : 7, pcol);
            addFloater(p.x, p.y - 22, perfect ? "RETURN!" : "BAT!", perfect, pcol);
            hitStop = perfect ? CONFIG.hitStop.big : CONFIG.hitStop.small;
            addShake(perfect ? CONFIG.juice.shakeBig : CONFIG.juice.shakeSmall); addStyle(perfect ? "parry" : "deflect");
            if (perfect) {
              AT.parry(); addZoom(CONFIG.juice.zoomParry * 1.35); addFlash(CONFIG.juice.flashParry * 1.25);
              Backdrop.flare(p.x, p.y, pcol, 480, 0.55); triggerSlowmo();
              if (run.mods.parryGuard) player.guardT = CONFIG.resilience.parryGuardTime;
              fire(run.mods.onParry, makeEv(p.x, p.y, null));
            }
          }
          continue;
        }
        if (p.deflected || p.unparryable) continue;   // capability contract decides what the blade may counter
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
            AT.parry();   // Immovable Object streak
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
            AT.parry();   // Immovable Object streak
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
      if (p.family === "sweeper") {
        if (p.sweeperState === "returned" && p.owner && !p.owner.dead && !p.owner.dying &&
            len(p.x - p.owner.x, p.y - p.owner.y) <= p.r + p.owner.radius) {
          if (typeof p.onCountered === "function") p.onCountered(p);
          p.shatterSweeper("ownerReturn");
        } else if (p.sweeperState === "hostile" &&
            aabbOverlap(p.x, p.y, p.r, p.r, player.x, player.y, player.hw, player.hh)) {
          if (run.mods.phaseStep && player.dashTimer > 0) {
            const spd = Math.max(len(p.vx, p.vy), CONFIG.proj.speed) * CONFIG.blade.deflectBoost;
            p.counterSweeper("phaseStep", player.dashX || player.facing, player.dashY || 0, spd);
            FX.burst(p.x, p.y, player.dashX || player.facing, player.dashY || 0, 9, CONFIG.colors.deflected);
            FX.flash(p.x, p.y, 38, CONFIG.colors.deflected); addFloater(p.x, p.y - 18, "PHASE!", true, CONFIG.colors.deflected);
            addStyle("deflect");
          } else {
            const r = player.takeDamage(p.dmg != null ? p.dmg : CONFIG.proj.dmg, p.x, p.owner);
            if (r) {
              p.shatterSweeper("playerHit");
              if (r === "hit") { loseStyle(); SFX.hurt(); } else onShieldAbsorb();
            } else if (player.dashTimer > 0) AT.dashDodge(p);
          }
        }
        continue;   // batted/returned/embedded sweepers are harmless counter-objects, never generic shots
      }
      if (p.deflected) {
        for (const e of enemies) {
          if (e.dead || e.dying) continue;
          if (p.pierce && p.pierced.has(e)) continue;
          if (len(p.x - e.x, p.y - e.y) <= p.r + e.radius) {
            const ddmg = p.deflectDmg * CONFIG.blade.deflectDmgMult;   // Counterforce
            e.hit(ddmg, p.vx, p.vy);
            if (achTracks()) AT.bossHit(e, "deflect");   // boss-humiliation source tracking
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
        // Phase Step: dashing THROUGH an enemy shot deflects it back (turn defense into offense).
        // Handled here, at the confirmed overlap — the old dash-block check used stale positions
        // and takeDamage returns "" (falsy) while invulnerable, so the shot just slipped through.
        if (run.mods.phaseStep && player.dashTimer > 0 && !p.unparryable) {
          const spd = Math.max(len(p.vx, p.vy), CONFIG.proj.speed) * CONFIG.blade.deflectBoost;
          p.deflect(player.dashX || player.facing, player.dashY || 0, spd, false);
          FX.burst(p.x, p.y, player.dashX, player.dashY, 8, CONFIG.colors.deflected);
          FX.flash(p.x, p.y, 34, CONFIG.colors.deflected);
          addFloater(p.x, p.y - 16, "PHASE!", true, CONFIG.colors.deflected);
          addStyle("deflect"); SFX.deflect();
        } else {
          const r = player.takeDamage(p.dmg != null ? p.dmg : CONFIG.proj.dmg, p.x, p.owner);
          if (r) {
            p.dead = true;
            if (r === "hit") {
              loseStyle(); SFX.hurt();
              if (p.root) { player.rootT = p.root; addFloater(player.x, player.y - 34, "ROOTED", true, CONFIG.colors.armoredShield); }
            } else onShieldAbsorb();
          } else if (player.dashTimer > 0) AT.dashDodge(p);   // Matador: i-frame dashed clean through a shot
        }
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
      if (e.dead || e.dying || e.spawnT > 0 || e.introT > 0) continue;
      if (typeof e.contactDamageEnabled === "function" && !e.contactDamageEnabled(player)) continue;
      if (aabbOverlap(player.x, player.y, player.hw, player.hh, e.x, e.y, e.hw + e.contactReach, e.hh)) {
        { const contactDmg = typeof e.contactDamageAmount === "function" ? e.contactDamageAmount(player) : e.contactDmg;
          const r = player.takeDamage(contactDmg * (e.chargeMult || 1) * (e.auraDmg || 1), e.x, e);
          // The callback observes the attempt as well as the outcome. A dash/iframe
          // that safely phases a one-shot crossover must not let it hit again later.
          if (typeof e.onContactDamage === "function") e.onContactDamage(r, player);
          if (r === "hit") { loseStyle(); SFX.hurt(); } else if (r === "absorbed") onShieldAbsorb(); }
      }
    }

    // THE SOURCE's rule-break: your own stolen blade hunts you until it connects
    // once (or you recall it) — then it snaps back to being yours
    if (blade && blade.hostile && !player.invulnerable &&
        segPointDist(blade.x, blade.y, blade.tipX, blade.tipY, player.x, player.y).dist < player.hw + 12) {
      const r = player.takeDamage((CONFIG.source && CONFIG.source.stolenBladeDmg) || 18, blade.x, blade.stolenBy);
      if (r === "hit") { loseStyle(); SFX.hurt(); } else if (r === "absorbed") onShieldAbsorb();
      blade.hostile = false; blade.stolenBy = null; blade.state = "returning";
      FX.burst(player.x, player.y, blade.vx, blade.vy, 8, CONFIG.colors.perfect);
    }

    // failsafe: an enemy that somehow ends up off the bottom dies instantly (never an unkillable straggler)
    for (const e of enemies) if (e.y > CONFIG.view.h + 40) e.dead = true;

    // bombers that died (fuse or kill) detonate
    for (const e of enemies) if (e.dead && e.isBomber && !e.blasted) { e.blasted = true; bomberBlast(e); }

    if (GHOST.recording()) for (const e of enemies) if (e.dead && e._gid) GHOST.death(e);   // ghost 2.0: log every departure
    enemies = enemies.filter((e) => !e.dead);
    projectiles = projectiles.filter((p) => !p.dead);
    for (const p of projectiles) p.update(dt);
    for (const f of floaters) { f.y -= 30 * dt; f.life -= dt; }
    floaters = floaters.filter((f) => f.life > 0);
    if (shake > 0) shake = Math.max(0, shake - CONFIG.juice.shakeDecay * dt);

    run.runTime += dt; run.waveTime += dt;
    updateTrick(dt);
    if (player.tookHit) { player.tookHit = false; run._dmgThisWave = true; run._dmgThisRun = true; run._dmgThisStage = true; AT.breakStreak(); }   // no-hit tracking (a hit also breaks the static-parry streak)
    GHOST.sample(dt, player, blade, enemies);   // record the hero + enemy positions (no-op unless recording)
    // ---- per-frame achievement tracking (air time, status effects) ----
    if (run._prevGround && !player.onGround && player.vy < -100) AT.jumped();   // Heavy Boots: a real jump happened
    run._prevGround = player.onGround;
    if (player.onGround) { run._airT = 0; run._updraftChain = 0; }
    else run._airT = (run._airT || 0) + dt;
    if (achTracks()) {
      PROFILE.maxStat("maxAirTime", Math.floor(run._airT || 0));   // Air Superiority (15s aloft)
      let maxBleed = 0, burning = 0;
      for (const en of enemies) { if (en.dead) continue; if (en.bleedStacks > maxBleed) maxBleed = en.bleedStacks; if (en.burnT > 0) burning++; }
      PROFILE.maxStat("maxBleedStacks", maxBleed);        // Surgeon (20 bleed)
      PROFILE.maxStat("maxConcurrentBurn", burning);      // Inferno (10 burning)
      AT.tick(dt);                                        // exotic per-frame trackers
      run._achTick = (run._achTick || 0) + dt;
      if (run._achTick >= 0.5) { run._achTick = 0; achCheck(); }   // pop mid-combat unlocks within ~0.5s
    }
    if (run.mode === "tutorial") TUT.update(dt);
    else if (run.mode === "playground") stepPlayground();

    if (player.hp <= 0) {
      if (run.mode === "tutorial" || run.mode === "playground") {
        // training never ends — reset on the spot and keep practising
        player.hp = player.maxHp; player.iframe = 2;
        addFloater(player.x, player.y - 44, "RESET", true, CONFIG.colors.perfect);
        FX.ring(player.x, player.y, 14, CONFIG.colors.perfect);
      } else if (player.shopRevives > 0 && !player.oneHit) {
        // extra life #1 — Second Wind (shop upgrade)
        player.shopRevives--; player.hp = Math.round(player.maxHp * 0.35); player.iframe = 1.6;
        FX.ring(player.x, player.y, 16, CONFIG.colors.perfect); FX.burst(player.x, player.y, 0, -1, 16, CONFIG.colors.perfect);
        addFloater(player.x, player.y - 44, "SECOND WIND", true, CONFIG.colors.perfect);
        addShake(CONFIG.juice.shakeBig); addFlash(CONFIG.juice.flashParry); SFX.parry();
        if (achTracks()) { PROFILE.addStat("revivesUsed", 1); AT.revived(); GHOST.event("revive", player.x, player.y); achCheck(); }
      } else if (player.abilityRevives > 0 && !player.oneHit) {
        // extra life #2 — Last Stand (draftable ability): a defiant, hotter rise
        player.abilityRevives--; player.hp = Math.round(player.maxHp * 0.40); player.iframe = 2.0;
        FX.explode(player.x, player.y, CONFIG.colors.charger, 1.1);
        addFloater(player.x, player.y - 44, "LAST STAND", true, CONFIG.colors.charger);
        addShake(CONFIG.juice.shakeBig); addFlash(CONFIG.juice.flashParry); SFX.counter();
        if (achTracks()) { PROFILE.addStat("revivesUsed", 1); AT.revived(); GHOST.event("revive", player.x, player.y); achCheck(); }
      } else if (CG.adsAvailable() && !run.adRevived && !player.oneHit) {
        // extra life #3 — the CrazyGames rewarded-ad revive (the continue flow)
        state = "continue"; continueT = 8; document.exitPointerLock();
      } else { endRun(); return; }
    }
  }

  function onKill(e, cause) {
    if (e.noScore) { FX.death(e.x, e.y, 8, e.color); return; }
    addKillScore();
    if (e.affixCount) run.score += Math.round(CONFIG.run.scorePerKill * run.wave * run.mult * 0.4 * e.affixCount);
    if (achTracks()) {   // lifetime kill feats
      PROFILE.addStat("kills", 1);
      if (e.kind) PROFILE.addStat("kill_" + e.kind, 1);   // per-kind tally — the bestiary shows "felled ×N"
      PROFILE.maxStat("killsOneWave", run.waveKills);
      DAILY.bump("kills", 1);
      if (e.kind === "bomber") PROFILE.addStat("bomberKills", 1);
      if (e.isBoss && !e.isMiniBoss) {
        PROFILE.addStat("bossKills", 1); DAILY.bump("boss", 1);
        if (!run._dmgThisWave) PROFILE.addStat("bossNoHit", 1);
        if (run.mode === "bossonly") { run._bossOnlyKills = (run._bossOnlyKills || 0) + 1; if (run._bossOnlyKills >= BOSS_ROSTER.length) PROFILE.maxStat("gauntletFull", 1); }
        if (e.bossId) PROFILE.maxStat("kill" + e.bossId.charAt(0).toUpperCase() + e.bossId.slice(1), 1);   // pantheon: killWarden / killColossus / …
        if (player.hp > 0 && player.hp <= player.maxHp * 0.1) PROFILE.maxStat("bossKillsLowHP", 1);         // By a Thread
        AT.bossKill(e);   // Stop Hitting Yourself / David and Goliath / I Am Rubber / Pulling the Plug
        GHOST.event("bossKill", e.x, e.y); GHOST.snapshot(canvas, 4);   // the run's headline moment
      }
      AT.onKill(e);   // air-combo + transition kills
      achCheck();
    }
    FX.death(e.x, e.y, CONFIG.juice.deathShards, e.color);
    SFX.death();
    fire(run.mods.onKill, makeEv(e.x, e.y, e, cause));
    // Rupture T3 / Cinder T3: a bleeding/burning death erupts, spreading the status
    if (run.mods.bleedNova && e.bleedStacks > 0) { for (const e2 of enemies) { if (e2 === e || e2.dead) continue; if (len(e2.x - e.x, e2.y - e.y) < 150 && e2.applyBleed) e2.applyBleed(3); } FX.ring(e.x, e.y, 12, CONFIG.colors.charger); }
    if (run.mods.cinderNova && e.burnT > 0) { for (const e2 of enemies) { if (e2 === e || e2.dead) continue; if (len(e2.x - e.x, e2.y - e.y) < 150 && e2.applyBurn) e2.applyBurn(); } FX.ring(e.x, e.y, 12, CONFIG.colors.slam); }
    if (e.isBoss) {
      if (run.mode === "campaign" && e.bossId === "source" && stageIndex >= STAGES.length - 1) {
        run.finalBossDeath = { x: e.x, y: e.y, color: e.color };
      }
      // NO SHELTER: give the stage its ground back (the Source keeps its frozen void — it never swapped)
      if (run._preBossPlatforms) { platforms = run._preBossPlatforms; run._preBossPlatforms = null; run._brokenPlats = null; run._arenaBroken = null; }
      worldZoomTarget = 1; run.voidDescent = null;   // the void releases the camera when the Source falls
      CG.happytime();   // CrazyGames: a highlight moment
      Backdrop.bloom("#ffffff", 0.22, 0.9); Backdrop.flare(e.x, e.y, currentStage.accent || "#ffffff", 520, 1.0);   // a boss falls: the world flares
      FX.explode(e.x, e.y, e.color, 2.2); FX.explode(e.x, e.y - 20, currentStage.accent || CONFIG.colors.perfect, 1.4);   // a boss DEATH is an event
      addShake(CONFIG.juice.shakeBig * 1.5); addZoom(CONFIG.juice.zoomBig); triggerSlowmo();
      Input.buzz([30, 40, 60]);   // a boss falls: a triple thump in the hand
      for (const p of projectiles) if (p.owner === e || p.shock || p.sweeper) p.dead = true;   // clear the boss's lingering hazards
      e.zones = [];
      if (e.freezeVoid && run.voidScroll) { run.voidScroll.active = false; run.voidScroll.frozen = true; }
      if (blade && blade.stolenBy === e) { blade.hostile = false; blade.stolenBy = null; blade.state = "returning"; }
      if (run.mode === "campaign" && currentStage && currentStage.chapter) run.pendingBossOutro = currentStage.chapter.bossOutro || null;
    }
  }

  // ---- main loop ----
  function isMenuState(s) {
    return s === "menu" || s === "shop" || s === "codex" || s === "setup" ||
      s === "profile" || s === "settings" ||
      s === "achievements" || s === "leaderboards" || s === "rename";
  }
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;

    // controller: translate the pad into the shared Input channels BEFORE the
    // sim + UI read them (menus get dpad nav + A/B, gameplay gets move/aim/actions)
    if (typeof PAD !== "undefined") PAD.poll(dt, state !== "playing");

    // Manual Clipper Hooks
    if (typeof Clipper !== "undefined") {
      if (Input.pressed.has("BracketLeft")) Clipper.start();
      if (Input.pressed.has("BracketRight")) Clipper.stop();
    }

    if (state === "playing" && CINEMA.active) {
      const clicked = !!Input.takeClick();
      // Feed the director RAW per-source held state (not a merged skip boolean).
      // Its input latch ignores whatever was already down when the scene began and
      // arms only after release, so a gameplay-held jump can no longer skip a scene.
      const gp = typeof PAD !== "undefined" && PAD.connected && navigator.getGamepads ? navigator.getGamepads()[PAD.index] : null;
      CINEMA.update(dt, {
        key: Input.held.has("Space") || Input.held.has("Enter") || Input.held.has("NumpadEnter"),
        touch: !!Input.btnHeld.jump,
        pad: !!(gp && gp.buttons[0] && gp.buttons[0].pressed),
        click: clicked || Input.tJump,   // a tap edge (touch-jump press or UI tap) reveals/advances; blade LMB never drives cinema
      });
    }

    Input.allowLock = (state === "playing");

    if (state === "playing") {
      // feel timers run in real time
      if (slowmo > 0) { slowmo -= dt; timeScale = CONFIG.juice.parrySlowScale; }
      else timeScale = lerp(timeScale, 1, clamp(8 * dt, 0, 1));
      if (CINEMA.active) timeScale = 1;
      if (run && run.pg && run.pg.slow) timeScale = Math.min(timeScale, 0.35);   // playground slow-mo toggle
      // BOSS THEATER: the arrival ceremony holds time at a crawl while the card runs
      if (bossIntro) {
        if (bossIntro.delay > 0) bossIntro.delay = Math.max(0, bossIntro.delay - dt);
        else bossIntro.t += dt;
        if (bossIntro.boss) bossIntro.boss.introT = Math.max(0, bossIntro.dur - bossIntro.t);
        if (bossIntro.t >= bossIntro.dur || !bossIntro.boss || bossIntro.boss.dead || bossIntro.boss.dying) bossIntro = null;
        else if (bossIntro.delay <= 0) timeScale = Math.min(timeScale, CONFIG.bossTheater.introScale);
      }
      if (bossBeat) { bossBeat.t -= dt; if (bossBeat.t <= 0) bossBeat = null; }
      // the punch-in zoom always decays toward the world zoom (1, or the pulled-out
      // void framing) — so slam-punches still read but the void stays wide
      worldZoom = lerp(worldZoom, worldZoomTarget, clamp(3 * dt, 0, 1));
      zoom = lerp(zoom, worldZoom, clamp(9 * dt, 0, 1));
      if (flash > 0) flash = Math.max(0, flash - dt * 3.2);
      if (bannerT > 0) bannerT -= dt;
      if (stageBannerT > 0) stageBannerT -= dt;
      if (rankPopT > 0) rankPopT -= dt * 1.2;

      // pause on P, Escape, or losing the mouse capture (Esc releases pointer lock).
      // Touch devices in PORTRAIT also auto-pause: the run must never continue
      // unseen behind the rotate gate.
      if (Input.locked) wasLocked = true;
      const lostCapture = wasLocked && !Input.locked;
      const portraitGate = Input.touchActive() && canvas.clientHeight > canvas.clientWidth;
      if (Input.pausePressed() || Input.escapePressed() || lostCapture || portraitGate) {
        state = "paused"; wasLocked = false; document.exitPointerLock();
      }
      else if (hitStop > 0) { hitStop -= dt; }
      else { acc += dt * timeScale; while (acc >= STEP && state === "playing") { stepPlaying(STEP); acc -= STEP; } }
    } else {
      acc = 0; wasLocked = false;
      // spawn menu: Tab or Esc drops straight back into the action
      if (state === "pgmenu" && (Input.pressed.has("Tab") || Input.escapePressed())) { state = "playing"; requestLock(); }
      else if (state === "pglab" && (Input.pressed.has("Tab") || Input.escapePressed())) { state = "pgmenu"; }
      else if (state === "replay" && Input.escapePressed()) exitReplay();
    }
    uiT += dt; enterT += dt; lastUiDt = dt;   // menu animation clocks
    if (state === "win") winT += dt; else winT = 0;   // ending cinematic clock
    // CrazyGames: bracket active gameplay (for ad timing / analytics)
    const _pl = state === "playing";
    if (_pl !== cgWasPlaying) { if (_pl) CG.gameplayStart(); else CG.gameplayStop(); cgWasPlaying = _pl; }
    if (state === "continue" && continueT > 0) { continueT -= dt; if (continueT <= 0) { state = "gameover"; endRun(); } }
    if (isMenuState(state)) { if (!Attract.ready) Attract.reset(); Attract.update(dt); } else Attract.ready = false;   // live attract-mode demo runs behind every menu tab

    Input.uiMode = (state !== "playing") || (CINEMA.active && CINEMA.playerMode !== "finalBlade");   // the Final Cut deliberately returns blade aim

    // UI density: small touch screens get bigger type + fatter targets everywhere
    // the design system's tokens reach (menus can't zoom — see the render transform)
    const wantDensity = (Input.touchActive() && CSS_PER_LOG < 0.6) ? "touch" : "desktop";
    if (wantDensity !== uiDensity) { uiDensity = wantDensity; UI.setDensity(wantDensity); }

    // biome music: menus follow the attract biome; runs follow the current stage, with
    // the intensified BOSS arrangement while a boss wave is live (reverts on its death)
    if (typeof SFX !== "undefined" && SFX.setMusicTheme) {
      if (isMenuState(state)) SFX.setMusicTheme(Attract.ready ? Attract.stage().name : "menu", false);
      else if (run && currentStage && (run.mode === "campaign" || run.mode === "endless" || run.mode === "bossonly" || run.mode === "gauntlet" || run.mode === "tutorial" || run.mode === "playground"))
        SFX.setMusicTheme(currentStage.name, !!(run.isBossWave && state !== "gameover" && state !== "win"));
      else SFX.setMusicTheme("menu", false);
    }

    render();
    handleUI();
    Input.endFrame();
    requestAnimationFrame(frame);
  }

  // full-screen rect INCLUDING the fullscreen overscan bleed — use for any fill that
  // must reach the true screen edges (backdrops, dims, vignettes), never for layout.
  function screenRect() { return { x: -OVERSCAN.x, y: -OVERSCAN.y, w: W + OVERSCAN.x * 2, h: H + OVERSCAN.y * 2 }; }

  // ---- biome transition: the TEAR WIPE ----
  // On a biome change (attract cycle, campaign stage-up, endless/gauntlet rotation) the
  // old scene is snapshotted and then sliced away along a sweeping diagonal seam with a
  // glowing cyan edge — the game's signature slash, instead of a hard palette snap.
  const Wipe = {
    t: 0, dur: 1.1, snap: null, parts: [],
    begin() {
      try {
        if (!this.snap) this.snap = document.createElement("canvas");
        this.snap.width = canvas.width; this.snap.height = canvas.height;
        this.snap.getContext("2d").drawImage(canvas, 0, 0);   // the frame still holds the OLD biome
        this.t = this.dur; this.parts.length = 0;
      } catch (e) { this.t = 0; }
    },
    draw(dt) {
      const active = this.t > 0 && this.snap;
      if (!active && !this.parts.length) return;
      const glow = !(typeof GFX !== "undefined" && GFX.low);
      const bw = canvas.width, bh = canvas.height, slope = bw * 0.22;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (active) {
        this.t -= dt;
        const k = 1 - Math.max(this.t, 0) / this.dur;          // raw progress
        const e = ez(k);                                        // eased sweep
        const x = -slope + (bw + slope * 2) * e;                // seam x along the top edge
        // seam geometry: direction + the left-pointing normal (the revealed side)
        const dlen = Math.hypot(slope, bh), nx = -bh / dlen, ny = -slope / dlen;
        // 1) dissolve veil: the old biome lingers translucently over the WHOLE frame and
        //    melts away as the seam sweeps — a blend, not just a hard slice
        ctx.globalAlpha = Math.pow(1 - k, 1.6) * 0.45;
        ctx.drawImage(this.snap, 0, 0);
        ctx.globalAlpha = 1;
        // 2) the old scene survives hard RIGHT of the seam
        ctx.save(); ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x - slope, bh); ctx.lineTo(bw, bh); ctx.lineTo(bw, 0); ctx.closePath();
        ctx.clip(); ctx.drawImage(this.snap, 0, 0); ctx.restore();
        // 3) luminous afterglow band trailing the seam on the revealed side
        ctx.save(); ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x - slope, bh); ctx.lineTo(-bw, bh); ctx.lineTo(-bw, 0); ctx.closePath();
        ctx.clip();
        const mx = x - slope / 2, my = bh / 2, bandW = bw * 0.09;
        const bg = ctx.createLinearGradient(mx, my, mx + nx * bandW, my + ny * bandW);
        bg.addColorStop(0, "rgba(19,196,214,0.30)"); bg.addColorStop(0.5, "rgba(19,196,214,0.08)"); bg.addColorStop(1, "rgba(19,196,214,0)");
        ctx.fillStyle = bg;
        if (glow) ctx.globalCompositeOperation = "lighter";
        ctx.fillRect(0, 0, bw, bh);
        ctx.restore();
        // 4) the seam itself: a glowing cyan edge with a white-hot core
        ctx.lineCap = "round";
        if (glow) { ctx.shadowColor = "#13c4d6"; ctx.shadowBlur = 26; }
        ctx.strokeStyle = "rgba(19,196,214,0.85)"; ctx.lineWidth = Math.max(6, bw * 0.006);
        ctx.beginPath(); ctx.moveTo(x, -20); ctx.lineTo(x - slope, bh + 20); ctx.stroke();
        ctx.strokeStyle = "#eafcff"; ctx.lineWidth = Math.max(2, bw * 0.002); if (glow) ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.moveTo(x, -20); ctx.lineTo(x - slope, bh + 20); ctx.stroke();
        ctx.shadowBlur = 0;
        // 5) sparks shed off the seam as it cuts
        if (glow) for (let i = 0; i < 3; i++) {
          const s = Math.random();
          this.parts.push({ x: x - slope * s, y: bh * s, vx: nx * (80 + Math.random() * 220) - slope / dlen * 40 * (Math.random() - 0.5),
            vy: ny * (80 + Math.random() * 220) + bh / dlen * 40 * (Math.random() - 0.5), life: 0.3 + Math.random() * 0.35, max: 0.65, w: 1.5 + Math.random() * 2.5 });
        }
        // 6) an opening flash beat, so the cut "hits"
        if (k < 0.16) { ctx.globalAlpha = (1 - k / 0.16) * 0.22 * A11Y.flashScale; ctx.fillStyle = "#eafcff"; ctx.fillRect(0, 0, bw, bh); ctx.globalAlpha = 1; }
      }
      // spark update + draw (device space; they outlive the sweep briefly)
      if (glow) { ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round"; }
      for (const p of this.parts) {
        p.life -= dt; if (p.life <= 0) continue;
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94;
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        ctx.strokeStyle = Math.random() < 0.4 ? "#eafcff" : "#13c4d6"; ctx.lineWidth = p.w;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
      }
      this.parts = this.parts.filter((p) => p.life > 0);
      ctx.globalAlpha = 1; ctx.restore();
    },
  };
  Attract.onBiomeChange = () => Wipe.begin();   // the menu demo tears between biomes too

  // ---- rendering ----
  function render() {
    // map the logical space onto the (hi-dpi) backing store; on non-16:9 fullscreen the
    // arena is centered and the scene bleeds into the OVERSCAN so nothing letterboxes
    resizeCanvas();
    const vs = canvas.width / (W + OVERSCAN.x * 2);
    ctx.setTransform(vs, 0, 0, vs, OVERSCAN.x * vs, OVERSCAN.y * vs);
    // OVERLAY ZOOM (small touch screens): draft / tier-up / pause / gameover are
    // centered layouts, so on a phone we zoom the whole frame around the view
    // center to make their cards readable. Menus can't zoom (they span the full
    // 900 design height); they get the touch density profile instead.
    const zoomable = state === "draft" || state === "tierup" || state === "paused" ||
      state === "confirmquit" || state === "gameover" || state === "win" || state === "continue";
    const zTarget = (zoomable && Input.touchActive() && CSS_PER_LOG < 0.55)
      ? clamp(0.55 / CSS_PER_LOG, 1, 1.45) : 1;
    uiZoom += (zTarget - uiZoom) * clamp(10 * lastUiDt, 0, 1);
    if (Math.abs(uiZoom - zTarget) < 0.004) uiZoom = zTarget;
    if (uiZoom > 1.001) {
      ctx.translate(W / 2, H / 2); ctx.scale(uiZoom, uiZoom); ctx.translate(-W / 2, -H / 2);
    }
    Input.uiZoom = uiZoom;   // input maps taps through the same zoom (inverse)
    const SR = screenRect();
    ctx.clearRect(SR.x, SR.y, SR.w, SR.h);
    const playLike = state === "playing" || state === "draft" || state === "tierup" || state === "paused" || state === "gameover" || state === "win" || state === "confirmquit" || state === "continue" || state === "pgmenu" || state === "pglab";
    // biome background (campaign + endless tint the world; menus stay white)
    const biomeMode = !!(run && (run.mode === "campaign" || run.mode === "endless" || run.mode === "bossonly" || run.mode === "gauntlet" || run.mode === "tutorial" || run.mode === "playground"));
    let bgCol = (playLike && biomeMode) ? currentStage.bg : "#fff";
    if (playLike && Array.isArray(enemies)) { const ef = enemies.find((e) => e.whiteFlash > 0); if (ef) bgCol = blendCol(bgCol, "#ffffff", ef.whiteFlash * A11Y.flashScale); }   // The Echo's white-out
    ctx.fillStyle = bgCol;
    ctx.fillRect(SR.x, SR.y, SR.w, SR.h);
    uiButtons = [];

    // theme: derive ink + rim from the actual background luminance, so models stay
    // readable on any biome (light, dark void, or an endless tint) — not just a flag.
    THEME.set((playLike && biomeMode) ? bgCol : "#ffffff");
    UI.ink = THEME.ink;

    if (playLike) {
      const worldCamera = renderWorld();
      if (biomeMode) Backdrop.post(ctx, currentStage, worldCamera);   // vignette + grain over the world, under the HUD
      if (flash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "difference";
        ctx.globalAlpha = clamp(flash, 0, 1);
        ctx.fillStyle = "#fff";
        ctx.fillRect(SR.x, SR.y, SR.w, SR.h);
        ctx.restore();
      }
      if (!CINEMA.hideHud) drawHUD();
      if (bossBeat && state === "playing" && !bossIntro && !CINEMA.active) {
        const p = clamp(bossBeat.t / bossBeat.dur, 0, 1), fade = Math.min(1, (1 - p) * 6, p * 5);
        UI.bossPhaseBanner(ctx, { text: bossBeat.text, color: bossBeat.color, alpha: fade });
      }
      if (bossIntro && bossIntro.delay <= 0 && state === "playing") drawBossIntro();   // the arrival ceremony rides over the HUD
      if (CINEMA.active) CINEMA.draw(ctx, UI, screenRect(), A11Y.reducedMotion);
      if (Input.touchActive() && state === "playing" && (!CINEMA.active || CINEMA.playerMode === "finalBlade") && !(typeof PAD !== "undefined" && PAD.active)) drawTouchControls();   // the finale keeps blade/touch control live
      if (state === "playing" && bannerT > 0 && !CINEMA.active) drawBanner();
      if (state === "playing" && stageBannerT > 0 && !CINEMA.active) drawStageBanner();
      if (state === "playing" && rankPopT > 0) {
        ctx.save(); ctx.globalAlpha = clamp(rankPopT, 0, 1);
        ctx.fillStyle = trickColor(run.mult); ctx.textAlign = "center";
        ctx.font = UI.font(42 + (1 - clamp(rankPopT, 0, 1)) * 18, true);
        ctx.fillText(rankPopText, W / 2, H / 2 - 140);
        ctx.restore();
      }
    }
    if (state === "playing" && (!CINEMA.active || CINEMA.playerMode === "landing" || CINEMA.playerMode === "finalBlade")) drawReticle();

    UI.ink = "#000";   // overlays (menus / win / pause) dim to white — always ink them black
    if (state !== lastUiState) {
      enterT = 0;   // restart entrance anim
      if (state === "shop" && lastUiState !== "shop") listScroll = 0;
      if ((state === "gameover" || state === "win" || state === "paused") && lastUiState !== "settings") arsenalScroll = 0;   // (but not when bouncing back from settings)
      if (state === "draft" || state === "reserve" || state === "tierup") listScroll = 0;   // stale menu scroll must never cull choice cards
    }

    // menu screens: the LIVE attract scene backs every tab (not just the main menu), so the
    // gorgeous moving backdrop flows through the whole menu instead of snapping to flat white.
    const inMenu = isMenuState(state);
    if (inMenu) {
      eIn = ez(enterT / 0.24);
      Attract.draw(ctx);
      if (state !== "menu") {
        // sub-tabs: a lighter frosted wash (the duel reads at the edges) + vignette,
        // then THE SHEET — the calm paper surface all content sits on, wearing the
        // screen's signature hue on its top edge.
        ctx.fillStyle = UI.t.color.paper; ctx.globalAlpha = 0.58; ctx.fillRect(SR.x, SR.y, SR.w, SR.h); ctx.globalAlpha = 1;
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, W * 0.62);
        vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.14)");
        ctx.fillStyle = vg; ctx.fillRect(SR.x, SR.y, SR.w, SR.h);
        if (state !== "rename") {
          const sh = UI.sheetRect();
          UI.sheet(ctx, sh.x, sh.y, sh.w, sh.h, SCREEN_HUES[state]);
        }
      }
      ctx.save(); ctx.translate(0, (1 - eIn) * 22);
      if (state === "menu") renderMenu();
      else if (state === "shop") renderShop();
      else if (state === "codex") renderCodex();
      else if (state === "setup") renderSetup();
      else if (state === "profile") renderProfile();
      else if (state === "settings") renderSettings();
      else if (state === "achievements") renderAchievements();
      else if (state === "leaderboards") renderLeaderboards();
      else if (state === "rename") renderRename();
      drawButtons();
      ctx.restore();
    } else {
      eIn = 1;
      if (state === "draft") renderDraft();
      else if (state === "reserve") renderReserve();
      else if (state === "tierup") renderTierUp();
      else if (state === "paused") renderPaused();
      else if (state === "confirmquit") renderConfirmQuit();
      else if (state === "gameover") renderGameover();
      else if (state === "win") renderWin();
      else if (state === "continue") renderContinue();
      else if (state === "pgmenu") renderPgMenu();
      else if (state === "pglab") renderPgLab();
      else if (state === "replay") renderReplay();
      if (state !== "playing") drawButtons();
    }

    // biome tear-wipe rides over EVERYTHING for its beat (device space)
    Wipe.draw(lastUiDt);

    // achievement unlock toast rides above the world + menus (but under the wipe flash)
    drawAchToast(lastUiDt);

    // mouse cursor in non-playing screens
    if (state !== "playing") UI.cursor(ctx, Input.mouseX, Input.mouseY);

    // controller connect/disconnect toast (top center, fades on its own clock)
    if (typeof PAD !== "undefined" && PAD.toastT > 0 && PAD.toastText) {
      ctx.save(); ctx.globalAlpha = clamp(PAD.toastT / 0.6, 0, 1);
      UI.badge(ctx, "◎ " + PAD.toastText, W / 2, 34 + SAFE.t, UI.t.color.accent, "center", 13);
      ctx.restore(); ctx.globalAlpha = 1;
    }

    // mobile in portrait: a REAL gate — covers everything (gameplay already
    // auto-paused in the frame loop), asks for landscape with an animated glyph
    if (Input.touchActive() && canvas.clientHeight > canvas.clientWidth) {
      UI.rotateGate(ctx, screenRect(), uiT);
    }

    // reset keyboard focus + scroll when the screen changes
    if (state !== lastUiState) { lastUiState = state; focus = firstEnabledButton(); listScroll = 0; }

    // the DOM hints describe mouse+keyboard — they have no business on a touch screen
    if (lockHint) lockHint.style.display = (state === "playing" && !Input.locked && !Input.touchActive()) ? "block" : "none";
    if (hintEl) hintEl.style.display = (state === "playing" && !Input.touchActive()) ? "block" : "none";
  }

  function firstEnabledButton() {
    for (let i = 0; i < uiButtons.length; i++) if (uiButtons[i].enabled !== false) return i;
    return -1;
  }

  // status visuals on an afflicted enemy: BLEED crimson aura, BURN rising flames,
  // MARK cyan targeting brackets. Particles (drips/embers) are spawned by the loop.
  function drawEnemyStatus(e) {
    const now = CLOCK.sim * 1000;
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

  function drawPantheonDebug(view, paintView) {
    if (!PANTHEON_DEBUG) return;
    ctx.save();
    // Actual camera bounds (cyan) and the larger painted backdrop bounds
    // (magenta). The painted edge normally lives outside the physical canvas, so
    // the inset map makes both rectangles inspectable without changing the camera.
    if (paintView) {
      ctx.setLineDash([10, 7]); ctx.lineWidth = 2; ctx.strokeStyle = "#ff4fd8"; ctx.globalAlpha = 0.9;
      ctx.strokeRect(paintView.left, paintView.top, paintView.right - paintView.left, paintView.bottom - paintView.top);
    }
    if (view) {
      ctx.setLineDash([]); ctx.lineWidth = 3; ctx.strokeStyle = "#31e6ff"; ctx.globalAlpha = 0.95;
      ctx.strokeRect(view.left, view.top, view.right - view.left, view.bottom - view.top);
    }
    ctx.setLineDash([]); ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.font = "bold 11px 'Courier New', monospace";
    if (view && paintView) {
      const mapX = view.left + 24, mapY = view.top + 24, mapW = 190, mapH = 104;
      const pw = paintView.right - paintView.left, ph = paintView.bottom - paintView.top;
      const ix = mapX + (view.left - paintView.left) / pw * mapW;
      const iy = mapY + (view.top - paintView.top) / ph * mapH;
      const iw = (view.right - view.left) / pw * mapW, ih = (view.bottom - view.top) / ph * mapH;
      ctx.globalAlpha = 0.72; ctx.fillStyle = "#080914"; ctx.fillRect(mapX - 8, mapY - 8, mapW + 16, mapH + 30);
      ctx.globalAlpha = 0.95; ctx.strokeStyle = "#ff4fd8"; ctx.setLineDash([5, 4]); ctx.lineWidth = 2;
      ctx.strokeRect(mapX, mapY, mapW, mapH);
      ctx.setLineDash([]); ctx.strokeStyle = "#31e6ff"; ctx.strokeRect(ix, iy, iw, ih);
      ctx.fillStyle = "#ff4fd8"; ctx.textBaseline = "top"; ctx.fillText("PAINT", mapX + 24, mapY + mapH + 7);
      ctx.fillStyle = "#31e6ff"; ctx.fillText("VISIBLE", mapX + mapW - 38, mapY + mapH + 7);
      ctx.textBaseline = "bottom";
    }
    for (const p of platforms) {
      if (!p.platformId) continue;
      ctx.strokeStyle = p.void ? "#13c4d6" : "#e8a32e"; ctx.globalAlpha = 0.85;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = ctx.strokeStyle; ctx.fillText(p.platformId + (p.arenaState ? `:${p.arenaState}` : ""), p.x + p.w / 2, p.y - 4);
      if (p.voidLane && p.chunkId != null) ctx.fillText(`${p.voidLane} · chunk ${p.chunkId}`, p.x + p.w / 2, p.y + p.h + 15);
    }
    if (run && run._arenaBroken) for (const p of run._arenaBroken) {
      ctx.strokeStyle = p.arenaState === "reforming" ? "#55ff9a" : "#ff6b6b"; ctx.globalAlpha = 0.85;
      ctx.setLineDash([7, 5]); ctx.strokeRect(p.x, p.y, p.w, p.h); ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle; ctx.fillText(`${p.platformId}:${p.arenaState}`, p.x + p.w / 2, p.y - 4);
    }
    if (run && run.voidScroll && run.voidScroll.chunks) {
      const byId = new Map(platforms.filter((p) => p.void).map((p) => [p.platformId, p]));
      ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
      for (const chunk of run.voidScroll.chunks) {
        if (chunk.transferWindow) {
          ctx.fillStyle = "rgba(255,243,107,0.08)";
          ctx.fillRect(chunk.transferWindow.x0, CONFIG.source.voidUpperMin - 34,
            chunk.transferWindow.x1 - chunk.transferWindow.x0, CONFIG.source.voidLowerMax - CONFIG.source.voidUpperMin + 68);
        }
        for (const edge of chunk.connections || []) {
          const a = byId.get(edge.from), b = byId.get(edge.to); if (!a || !b) continue;
          ctx.strokeStyle = "#fff36b"; ctx.beginPath(); ctx.moveTo(a.x + a.w / 2, a.y); ctx.lineTo(b.x + b.w / 2, b.y); ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }
    for (const p of projectiles) {
      if (!p.family || p.family === "ordinaryProjectile") continue;
      ctx.strokeStyle = p.family === "sweeper" ? "#d45ee8" : "#ff944d"; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 7, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.fillText(`${p.family}:${p.counterplay}${p.sweeperState ? `:${p.sweeperState}` : ""}`, p.x, p.y - p.r - 10);
    }
    for (const e of enemies) {
      if (Array.isArray(e.debugGeometry)) {
        ctx.strokeStyle = "#55ff9a"; ctx.globalAlpha = 0.9;
        for (const g of e.debugGeometry) {
          if (!g || !g.a || !g.b) continue;
          ctx.lineWidth = Math.max(1, (g.radius || 0) * 2); ctx.beginPath(); ctx.moveTo(g.a.x, g.a.y); ctx.lineTo(g.b.x, g.b.y); ctx.stroke();
        }
      }
      if (!e.zones) continue;
      ctx.lineWidth = 2;
      for (const z of e.zones) if (z.nextOn || z.warnK > 0) {
        const zw = z.w || CONFIG.warden.zoneW;
        ctx.strokeStyle = "#fff36b"; ctx.globalAlpha = 0.95; ctx.strokeRect(z.x - zw / 2, CONFIG.world.groundY - 44, zw, 44);
      }
    }
    ctx.restore();
  }

  function drawFinaleWorld(layer) {
    if (!finale) return;
    const t = CLOCK.sim, cyan = CONFIG.colors.perfect, phase = finale.phase, motion = A11Y.reducedMotion ? 0.08 : 1;
    ctx.save();
    if (layer === "rear") {
      // The dead Source recedes as a broken depth-body instead of vanishing on
      // the same 2D plane as ordinary enemies.
      const woundK = phase === "silence" ? 0.18 : 1;
      ctx.globalAlpha = 0.16 + 0.18 * woundK; ctx.fillStyle = finale.restoredColor ? "#7257a8" : "#17111f";
      const count = GFX.low ? 8 : CONFIG.finale.fragmentCap;
      for (let i = 0; i < count; i++) {
        const a = i * 2.399, drift = ((phase === "wound" || phase === "relics" || phase === "cut") ? t * (9 + i % 4) : t * 2) * motion;
        const rr = 34 + (i % 5) * 23 + drift, px = finale.origin.x + Math.cos(a) * rr, py = finale.origin.y + Math.sin(a) * rr * 0.58 - drift * 0.24;
        ctx.save(); ctx.translate(px, py); ctx.rotate(a + t * 0.08 * motion * (i % 2 ? 1 : -1));
        ctx.fillRect(-12 - (i % 3) * 4, -8, 24 + (i % 3) * 8, 16 + (i % 2) * 8); ctx.restore();
      }
      if (finale.restoredColor && !finale.restoring) {
        const bands = STAGES.map((s) => s.accent);
        for (let i = 0; i < bands.length; i++) {
          ctx.globalAlpha = (0.035 + finale.cutFlash * 0.022) * (GFX.low ? 0.7 : 1); ctx.fillStyle = bands[i];
          ctx.fillRect(i * W / bands.length, 70, W / bands.length + 1, H - 140);
        }
      }
      const tearAlpha = finale.tearClosed ? Math.max(0, 1 - finale.restore * 2) : 1;
      if (tearAlpha > 0) {
        ctx.globalAlpha = tearAlpha * 0.55; ctx.strokeStyle = cyan; ctx.lineWidth = GFX.low ? 4 : 7;
        if (!GFX.low) { ctx.shadowColor = cyan; ctx.shadowBlur = 22; }
        ctx.beginPath(); ctx.moveTo(W / 2, 58);
        for (let i = 1; i <= 10; i++) ctx.lineTo(W / 2 + (i % 2 ? 18 : -13) * tearAlpha, 58 + i * 70);
        ctx.stroke(); ctx.shadowBlur = 0;
      }
      // Restoration passes all five biomes behind the landing as restrained,
      // occluded silhouettes rather than five full additional canvases.
      if (finale.restoredGravity || finale.restoring) {
        const accents = STAGES.map((s) => s.accent), k = finale.restoring ? finale.restore : 0.18;
        for (let i = 0; i < accents.length; i++) {
          const x = ((i * 360 + k * 260) % (W + 420)) - 210;
          ctx.globalAlpha = (0.06 + 0.08 * Math.sin(Math.PI * k)) * (GFX.low ? 0.65 : 1); ctx.fillStyle = accents[i];
          ctx.beginPath(); ctx.moveTo(x - 170, CONFIG.world.groundY); ctx.lineTo(x - 90, 560 - (i % 2) * 65);
          ctx.lineTo(x + 10, 620 - (i % 3) * 55); ctx.lineTo(x + 150, 520 + (i % 2) * 55); ctx.lineTo(x + 210, CONFIG.world.groundY); ctx.closePath(); ctx.fill();
        }
      }
    }
    for (let i = 0; i < finale.anchors.length; i++) {
      const a = finale.anchors[i], rear = a.depth < 0.75;
      if ((layer === "rear") !== rear || a.cut) continue;
      const active = i === finale.severed && phase === "cut", pulse = A11Y.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 7 + i);
      ctx.globalAlpha = active ? 0.68 + pulse * 0.28 : 0.18;
      ctx.strokeStyle = A11Y.highContrast && active ? "#fff36b" : cyan;
      ctx.lineWidth = active ? (A11Y.highContrast ? 7 : 4) : 2;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r * a.depth * (1 + pulse * 0.06), 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a.x - a.r * 0.55, a.y + a.r * 0.64); ctx.lineTo(a.x - 5, a.y - a.r * 0.72);
      ctx.lineTo(a.x + 8, a.y + 4); ctx.lineTo(a.x + a.r * 0.55, a.y - a.r * 0.62); ctx.stroke();
    }
    if (layer === "front" && finale.relicK > 0 && finale.relicK < 1.05 && blade) {
      const relicColors = [CONFIG.colors.boss, CONFIG.colors.armoredShield, CONFIG.colors.bomber, "#b06cff"];
      for (let i = 0; i < 4; i++) {
        const start = i * 0.18, k = clamp((finale.relicK - start) / 0.34, 0, 1), e = 1 - (1 - k) * (1 - k);
        const sx = A11Y.reducedMotion ? blade.x : (i % 2 ? W + 70 : -70), sy = A11Y.reducedMotion ? blade.y : 170 + i * 145;
        const x = lerp(sx, blade.x, e), y = lerp(sy, blade.y, e);
        ctx.globalAlpha = 0.22 + 0.78 * (1 - k * 0.35); ctx.fillStyle = relicColors[i];
        ctx.beginPath(); ctx.arc(x, y, 7 + 6 * (1 - k), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function renderWorld() {
    ctx.save();
    // camera: zoom-punch + shake, both pivoting on screen center
    const cx = W / 2, cy = H / 2;
    let ox = 0, oy = 0;
    if (shake > 0 && state === "playing") { ox = (Math.random() * 2 - 1) * shake; oy = (Math.random() * 2 - 1) * shake; }
    // Invert the exact camera transform (sustained Source pull-out + transient
    // punch + this frame's shake) so biome art paints every visible world pixel.
    // The small world-space bleed absorbs blur kernels and sub-pixel rounding.
    const srWorld = screenRect(), cameraScale = Math.max(0.01, zoom), backdropBleed = 56;
    const cameraView = {
      left: cx + (srWorld.x - cx - ox) / cameraScale,
      top: cy + (srWorld.y - cy - oy) / cameraScale,
      right: cx + (srWorld.x + srWorld.w - cx - ox) / cameraScale,
      bottom: cy + (srWorld.y + srWorld.h - cy - oy) / cameraScale,
    };
    const backdropView = {
      left: cameraView.left - backdropBleed,
      top: cameraView.top - backdropBleed,
      right: cameraView.right + backdropBleed,
      bottom: cameraView.bottom + backdropBleed,
    };
    const backdropCamera = { cx, cy, ox, oy, scale: cameraScale };
    FX.setViewRect(cameraView);
    ctx.translate(cx + ox, cy + oy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
    const biome = run && (run.mode === "campaign" || run.mode === "endless" || run.mode === "bossonly" || run.mode === "gauntlet" || run.mode === "tutorial" || run.mode === "playground");
    // In debug boots, any camera-visible pixel missed by Backdrop.draw remains
    // screaming magenta. Production pays no fill or branch beyond this false gate.
    if (PANTHEON_DEBUG && biome) {
      ctx.fillStyle = "#ff00a8";
      ctx.fillRect(cameraView.left, cameraView.top, cameraView.right - cameraView.left, cameraView.bottom - cameraView.top);
    }
    const backdropT = CLOCK.sim * (A11Y.reducedMotion ? 0.25 : 1);
    if (biome) Backdrop.draw(ctx, currentStage, backdropT, player ? player.x : W / 2, backdropView);   // sky + parallax + motes
    // ARENA DRESSING: each boss stages its own ground (drawn behind platforms).
    // Suppressed over the void — there is no ground to dress.
    const voidActive = run && run.voidScroll && (run.voidScroll.active || run.voidScroll.frozen);
    {
      const dboss = enemies.find((e) => e.isBoss && !e.isMiniBoss);
      if (dboss && !GFX.low && !voidActive) {
        const now2 = CLOCK.sim * 1000, gy2 = CONFIG.world.groundY;
        ctx.save();
        if (dboss.bossId === "warden") {
          // the Yard: cell-block banners hanging into frame + painted yard lines
          ctx.globalAlpha = 0.14; ctx.fillStyle = dboss.color;
          for (const bx2 of [180, 800, 1420]) {
            const sway = Math.sin(now2 / 1400 + bx2) * 8;
            ctx.beginPath(); ctx.moveTo(bx2 - 26, 0); ctx.lineTo(bx2 + 26, 0);
            ctx.lineTo(bx2 + 18 + sway, 190); ctx.lineTo(bx2 - 18 + sway, 190); ctx.closePath(); ctx.fill();
          }
          ctx.globalAlpha = 0.10; ctx.strokeStyle = THEME.ink; ctx.lineWidth = 3; ctx.setLineDash([26, 22]);
          ctx.beginPath(); ctx.moveTo(120, gy2 + 26); ctx.lineTo(W - 120, gy2 + 26); ctx.stroke(); ctx.setLineDash([]);
        } else if (dboss.bossId === "colossus") {
          // the Foundry: a warm forge glow low on the horizon + hanging chains
          const g2 = ctx.createLinearGradient(0, gy2 - 220, 0, gy2);
          g2.addColorStop(0, "rgba(232,134,46,0)"); g2.addColorStop(1, "rgba(232,134,46,0.10)");
          ctx.fillStyle = g2; ctx.fillRect(0, gy2 - 220, W, 220);
          ctx.globalAlpha = 0.16; ctx.strokeStyle = THEME.ink; ctx.lineWidth = 4;
          for (const cx3 of [260, 640, 1000, 1360]) {
            const sway = Math.sin(now2 / 1700 + cx3) * 10;
            ctx.beginPath(); ctx.moveTo(cx3, 0); ctx.quadraticCurveTo(cx3 + sway, 110, cx3 + sway, 205 + (cx3 % 3) * 24); ctx.stroke();
          }
        } else if (dboss.bossId === "aldric") {
          // the Dueling Ground: the burnt throne on the horizon + drifting embers
          const tx2 = W / 2;
          ctx.globalAlpha = 0.12; ctx.fillStyle = THEME.ink;
          ctx.fillRect(tx2 - 60, gy2 - 150, 120, 150);
          ctx.fillRect(tx2 - 84, gy2 - 96, 24, 96); ctx.fillRect(tx2 + 60, gy2 - 96, 24, 96);
          ctx.beginPath(); ctx.moveTo(tx2 - 40, gy2 - 150); ctx.lineTo(tx2 - 18, gy2 - 196); ctx.lineTo(tx2, gy2 - 154);
          ctx.lineTo(tx2 + 18, gy2 - 196); ctx.lineTo(tx2 + 40, gy2 - 150); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 0.35; ctx.fillStyle = CONFIG.colors.bomber;
          for (let i = 0; i < 7; i++) {
            const ex2 = (i * 257 + now2 / 40) % W, ey2 = gy2 - 60 - ((now2 / 16 + i * 131) % 420);
            ctx.fillRect(ex2, ey2, 3, 3);
          }
        }
        ctx.restore(); ctx.globalAlpha = 1;
      }
    }
    // The braid's route graph is intentionally invisible in release. Transfer
    // windows remain simulation metadata and are inspectable in Pantheon debug.
    // DEPTH PLANE: rear actors render after the biome but before every route
    // surface, producing real occlusion instead of a foreground sprite trick.
    for (const e of enemies) if (!e.dead && typeof e.drawRear === "function") e.drawRear(ctx);
    drawFinaleWorld("rear");
    // Broken arena platforms leave diegetic fragments / reform silhouettes even
    // while they are absent from collision.
    if (run && run._arenaBroken) for (const p of run._arenaBroken) Backdrop.platform(ctx, p, currentStage, false, backdropView);
    for (const p of platforms) Backdrop.platform(ctx, p, currentStage, !!p.floor, backdropView);         // depth: gradient + edge + shadow
    // cracking platforms telegraph the give-way: jagged fractures + a quickening pulse
    for (const p of platforms) {
      if (p.arenaPlatId) continue;   // material-specific arena warnings draw in Backdrop.platform
      if (!(p.crackT > 0)) continue;
      const k = 1 - clamp(p.crackT / (p.crackMax || 0.8), 0, 1);
      ctx.save();
      ctx.globalAlpha = (0.35 + 0.5 * k) * (0.65 + 0.35 * Math.sin(CLOCK.sim * 1000 / (60 - k * 25)));
      ctx.strokeStyle = A11Y.highContrast ? (THEME.dark ? "#fff36b" : "#4b00d1") : (p.crackColor || CONFIG.colors.charger); ctx.lineWidth = A11Y.highContrast ? 4 : 2;
      ctx.beginPath();
      const n = 3 + Math.floor(k * 3);
      for (let ci = 0; ci < n; ci++) {
        const cx2 = p.x + p.w * (0.12 + 0.76 * ((ci * 0.37 + 0.13) % 1));
        ctx.moveTo(cx2, p.y); ctx.lineTo(cx2 + (ci % 2 ? 9 : -9), p.y + (p.h || 22) * 0.7);
      }
      ctx.stroke();
      ctx.restore();
    }
    drawFinaleWorld("front");
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
    if (bossZd && !voidActive) {   // ground hazards never draw over the void
      // ZONE IDENTITY: every hazard kind wears its own skin — the shared "the
      // ground changes colour" band is gone. One damage contract, six looks.
      const Wc = CONFIG.warden, gy = CONFIG.world.groundY, bh = H - gy;
      const zc = bossZd.zoneColor || CONFIG.colors.charger;
      const now = CLOCK.sim * 1000, pulse = 0.5 + 0.5 * Math.sin(now / 140);
      for (const z of bossZd.zones) {
        const zw = z.w || Wc.zoneW, x0 = z.x - zw / 2, active = z.on !== false;
        ctx.save();
        if (z.kind === "searchlight") {
          // a prison-yard LIGHT CONE from above: apex high, pool at the ground, dust motes
          const apex = 60;
          ctx.globalAlpha = active ? 0.16 : 0.07; ctx.fillStyle = "#f4ecc9";
          ctx.beginPath(); ctx.moveTo(z.x - 14, apex); ctx.lineTo(z.x + 14, apex);
          ctx.lineTo(x0 + zw, gy); ctx.lineTo(x0, gy); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = active ? 0.5 + 0.35 * pulse : 0.18; ctx.strokeStyle = active ? zc : "#f4ecc9"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(z.x, gy, zw * 0.5, 8, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = "#f4ecc9"; ctx.globalAlpha = 0.35;   // dust in the beam
          for (let i = 0; i < 5; i++) { const my = apex + ((now / 22 + i * 173) % (gy - apex)); ctx.fillRect(z.x + Math.sin(i * 2.7 + now / 900) * zw * 0.3 * (my / gy), my, 2, 2); }
        } else if (z.kind === "cage") {
          // LOCKDOWN: jail bars of light, full height — not a band
          const bars = 5;
          for (let i = 0; i < bars; i++) {
            const bx2 = x0 + (i + 0.5) * (zw / bars);
            ctx.globalAlpha = 0.55 + 0.35 * Math.sin(now / 160 + i);
            ctx.fillStyle = zc; ctx.fillRect(bx2 - 3, 40, 6, H - 40);
            ctx.globalAlpha = 0.9; ctx.fillStyle = "#fff"; ctx.fillRect(bx2 - 1, 40, 2, H - 40);
          }
        } else if (z.kind === "panel") {
          // FOUNDRY GRATE: slatted plate that heats dull -> orange -> white before igniting
          const heat = z.on ? 1 : (z.arming ? 0.45 + 0.25 * pulse : 0.12);
          const col = z.on ? "#fff" : (z.arming ? "#e8862e" : "#6a6f78");
          ctx.globalAlpha = 0.25 + heat * 0.45; ctx.fillStyle = z.on ? CONFIG.colors.slam : col;
          ctx.fillRect(x0, gy, zw, 30);
          ctx.globalAlpha = 0.85; ctx.strokeStyle = col; ctx.lineWidth = 2;
          for (let i = 0; i <= 6; i++) { const sx2 = x0 + i * (zw / 6); ctx.beginPath(); ctx.moveTo(sx2, gy); ctx.lineTo(sx2, gy + 30); ctx.stroke(); }
          ctx.strokeRect(x0, gy, zw, 30);
          if (z.on || z.arming) {   // heat shimmer rising off the grate
            ctx.globalAlpha = 0.30 * heat; ctx.strokeStyle = z.on ? "#fff" : "#e8862e"; ctx.lineWidth = 1.5;
            for (let i = 0; i < 4; i++) {
              const sx2 = x0 + (i + 0.5) * (zw / 4), off = (now / 7 + i * 40) % 110;
              ctx.beginPath(); ctx.moveTo(sx2 + Math.sin(now / 90 + i) * 5, gy - off);
              ctx.quadraticCurveTo(sx2 + 7, gy - off - 16, sx2, gy - off - 30); ctx.stroke();
            }
          }
        } else if (z.kind === "fire") {
          // THRONE FIRE: tall lane flame when live; during the final 0.8s the
          // upcoming lane owns an amber rail, rising shimmer, then a white commit.
          const fc = CONFIG.colors.bomber, warning = !!z.warn, wk = clamp(z.warnK || 0, 0, 1);
          ctx.globalAlpha = 0.48; ctx.fillStyle = "#1c1514"; ctx.fillRect(x0, gy, zw, 12);
          if (active) {
            const count = GFX.low ? 2 : Math.max(3, Math.floor(zw / 34));
            for (let i = 0; i < count; i++) {
              const fx2 = x0 + (i + 0.5) * zw / count, fh = 48 + Math.sin(now / 85 + i * 2.4 + z.x) * 14;
              ctx.globalAlpha = 0.78; ctx.fillStyle = fc;
              ctx.beginPath(); ctx.moveTo(fx2 - 12, gy); ctx.quadraticCurveTo(fx2 - 5, gy - fh * 0.5, fx2 + Math.sin(now / 68 + i) * 5, gy - fh);
              ctx.quadraticCurveTo(fx2 + 7, gy - fh * 0.45, fx2 + 12, gy); ctx.closePath(); ctx.fill();
            }
            // Stable lane boundaries make the safe/hot column legible while moving.
            ctx.globalAlpha = 0.72; ctx.strokeStyle = "#ffd66e"; ctx.lineWidth = 3;
            for (const bx of [x0 + 2, x0 + zw - 2]) { ctx.beginPath(); ctx.moveTo(bx, gy); ctx.lineTo(bx, gy - 62); ctx.stroke(); }
          }
          if (warning) {
            const nearCommit = wk > 0.78;
            ctx.globalAlpha = 0.65 + wk * 0.3; ctx.fillStyle = nearCommit ? "#fff7d6" : "#e5a62d";
            ctx.fillRect(x0 + 3, gy - 5, zw - 6, nearCommit ? 6 : 4);   // low-effects keeps the essential rail
            ctx.globalAlpha = 0.2 + wk * 0.28; ctx.fillStyle = "#e5a62d";
            ctx.fillRect(x0 + 5, gy - 10 - wk * 12, zw - 10, 8 + wk * 12);   // heat shimmer block
            if (!GFX.low) for (let i = 0; i < 4; i++) {
              const ex2 = x0 + (i + 0.5) * zw / 4, ey2 = gy - 10 - ((now / 7 + i * 31) % (30 + wk * 50));
              ctx.globalAlpha = 0.4 + wk * 0.4; ctx.fillStyle = nearCommit ? "#fff" : "#ffd66e"; ctx.fillRect(ex2, ey2, 3, 3);
            }
          } else {
            ctx.globalAlpha = active ? 0.78 : 0.25 + 0.18 * pulse; ctx.fillStyle = active ? "#fff0bc" : fc;
            ctx.fillRect(x0 + 2, gy - (active ? 4 : 2), zw - 4, active ? 4 : 2);
          }
        } else if (z.kind === "seam") {
          // CLEAVER SEAM: a low, directional fissure. It never impersonates the
          // vertical floor columns and visibly exhausts its authored lifetime.
          const lifeK = clamp(z.life / (z.maxLife || CONFIG.aldric.seamLife), 0, 1), dir = z.dir || 1;
          ctx.globalAlpha = 0.24 + lifeK * 0.68; ctx.strokeStyle = CONFIG.colors.bomber; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(x0, gy - 2);
          for (let i = 1; i <= 6; i++) ctx.lineTo(x0 + zw * i / 6, gy - 2 - ((i % 2) ? 5 * lifeK : 0));
          ctx.stroke();
          ctx.globalAlpha = 0.65 * lifeK; ctx.fillStyle = "#ffd66e";
          for (let i = 1; i < 5; i++) {
            const sx2 = x0 + zw * i / 5, tip = sx2 + dir * 8;
            ctx.beginPath(); ctx.moveTo(sx2 - dir * 5, gy - 10); ctx.lineTo(tip, gy - 5); ctx.lineTo(sx2 - dir * 5, gy); ctx.closePath(); ctx.fill();
          }
          if (!GFX.low) { const ex2 = x0 + ((now / 5 + z.x) % zw); ctx.globalAlpha = 0.6 * lifeK; ctx.fillRect(ex2, gy - 18 - 12 * pulse, 3, 3); }
        } else if (z.kind === "trail") {
          // WARDEN TRAIL: a custody strip with marching barred light, not flame.
          const lifeK = clamp(z.life / (z.maxLife || CONFIG.warden.trailLife || 1), 0, 1);
          ctx.globalAlpha = 0.16 + lifeK * 0.25; ctx.fillStyle = zc; ctx.fillRect(x0, gy - 8, zw, 16);
          ctx.globalAlpha = 0.65 * lifeK; ctx.strokeStyle = "#f4ecc9"; ctx.lineWidth = 2;
          for (let i = 0; i < 5; i++) { const bx2 = x0 + ((i * 29 + now / 18) % Math.max(1, zw)); ctx.beginPath(); ctx.moveTo(bx2, gy - 10); ctx.lineTo(bx2 + 8, gy + 8); ctx.stroke(); }
          ctx.globalAlpha = 0.8 * lifeK; ctx.fillStyle = zc; ctx.fillRect(x0, gy - 2, zw, 4);
        } else {
          // fallback: the classic banded hazard
          ctx.fillStyle = zc; ctx.globalAlpha = active ? 0.42 : 0.12; ctx.fillRect(x0, gy, zw, bh);
          if (active) { hazardStripes(ctx, x0, gy, zw, bh, "#000", 0.16); hazardStripes(ctx, x0, gy, zw, bh, "#fff", 0.10); }
        }
        // Every arming state also has a shape channel: a dashed frame and
        // repeated chevrons. High contrast changes ink/weight, never timing.
        const warning = !!(z.arming || z.warn || z.nextOn || z.warnK > 0);
        if (warning && A11Y.highContrast) {
          const tell = THEME.dark ? "#fff36b" : "#4b00d1", top = gy - (z.kind === "fire" ? 72 : 48);
          ctx.globalAlpha = 0.94; ctx.strokeStyle = tell; ctx.lineWidth = 4; ctx.setLineDash([12, 7]);
          ctx.strokeRect(x0 + 2, top, Math.max(0, zw - 4), gy - top); ctx.setLineDash([]);
          for (let hx = x0 + 22; hx < x0 + zw - 8; hx += 38) {
            ctx.beginPath(); ctx.moveTo(hx - 8, gy - 20); ctx.lineTo(hx, gy - 10); ctx.lineTo(hx + 8, gy - 20); ctx.stroke();
          }
        }
        ctx.restore(); ctx.globalAlpha = 1;
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
    for (const e of enemies) if (!e.dead && e.cinematicPose && typeof drawBossTransformationWorld === "function") drawBossTransformationWorld(ctx, e);
    // status auras / flames / target-brackets, drawn over each afflicted enemy
    for (const e of enemies) { if (!e.dead && e.depthPlane !== "rear" && e.spawnT <= 0 && (e.bleedStacks > 0 || e.burnT > 0 || e.markT > 0)) drawEnemyStatus(e); }
    // dark biome: a faint light rim keeps dark-bodied enemies (and the player) readable
    if (THEME.dark) {
      ctx.strokeStyle = "rgba(236,233,247,0.45)"; ctx.lineWidth = 1.5;
      for (const e of enemies) { if (e.spawnT > 0 || e.depthPlane === "rear") continue; ctx.strokeRect(e.x - e.hw, e.y - e.hh, e.hw * 2, e.hh * 2); }
      ctx.strokeRect(player.x - player.hw, player.y - player.hh, player.hw * 2, player.hh * 2);
    }
    // support effect indicators: outline + badge stack over every buffed enemy, so it's
    // always obvious which enemies are protected/empowered/hasted/healed/shielded
    for (const e of enemies) {
      if (e.spawnT > 0 || e.depthPlane === "rear" || !e.buffs || !e.buffs.length) continue;
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
    if (run && run.mode === "tutorial" && TUT.active) TUT.drawGhost(ctx);   // the translucent demonstrator
    if (player) player.draw(ctx);
    if (blade) blade.draw(ctx, player);
    FX.draw(ctx);
    drawPantheonDebug(cameraView, backdropView);
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
    return backdropCamera;
  }

  function drawHUD() {
    const t = UI.t, ink = THEME.ink, lowG = (typeof GFX !== "undefined" && GFX.low);
    const accent = (currentStage && currentStage.accent) || t.color.accent;
    const hpFrac = clamp(player.hp / player.maxHp, 0, 1);
    if (hpFrac < hudHpLag) hudHpLag += (hpFrac - hudHpLag) * 0.07; else hudHpLag = hpFrac;   // damage chip lags down; heals snap
    const low = hpFrac <= 0.25, pulse = 0.5 + 0.5 * Math.sin(performance.now() / 150);

    // low-HP danger: a pulsing red vignette around the screen edges
    if (low) {
      ctx.save();
      const sr = screenRect();
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.78);
      g.addColorStop(0, "rgba(226,59,59,0)"); g.addColorStop(1, "rgba(226,59,59," + (0.10 + 0.13 * pulse).toFixed(3) + ")");
      ctx.fillStyle = g; ctx.fillRect(sr.x, sr.y, sr.w, sr.h); ctx.restore();
    }

    // ===== top-left: VITALS (no backing slab — crisp elements that read on any biome) =====
    const x = 28 + SAFE.l, y = 26 + SAFE.t, bw = 320, bh = 22;   // inside the hardware safe area
    const ry = y + bh + 12, dw = 34, dh = 11, dg = 6, maxDash = Math.max(1, player.maxDashCharges || 1);

    // --- health: a LIGHT track so the missing chunk is obvious against the dark fill,
    // a red chip over what was just lost, an accent sheen, and a low-HP red pulse ---
    const charcoal = "#262c37";
    const hpFill = low ? "rgb(" + Math.round(150 + 95 * pulse) + "," + Math.round(34 + 22 * pulse) + "," + Math.round(40 + 18 * pulse) + ")" : charcoal;
    ctx.save();
    ctx.globalAlpha = 0.22; ctx.fillStyle = ink; ctx.fillRect(x, y, bw, bh); ctx.globalAlpha = 1;   // empty track (light on dark biomes, grey on light)
    if (hudHpLag > hpFrac) { ctx.fillStyle = "rgba(226,59,59,0.9)"; ctx.fillRect(x + bw * hpFrac, y, bw * (hudHpLag - hpFrac), bh); }   // the chunk just lost
    if (low && !lowG) { ctx.shadowColor = "#e23b3b"; ctx.shadowBlur = 10 + 10 * pulse; }
    ctx.fillStyle = hpFill; ctx.fillRect(x, y, bw * hpFrac, bh); ctx.shadowBlur = 0;                 // health
    ctx.globalAlpha = 0.85; ctx.fillStyle = low ? "#ff9a9a" : accent; ctx.fillRect(x, y, bw * hpFrac, 2);   // accent sheen
    ctx.globalAlpha = 0.35; ctx.strokeStyle = THEME.dark ? "#000" : "#fff"; ctx.lineWidth = 1;        // quarter ticks
    for (let s = 1; s < 4; s++) { const sx = x + bw * s / 4; ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx, y + bh); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.strokeRect(x, y, bw, bh);
    ctx.font = UI.font(t.type.label, true); ctx.textAlign = "right"; ctx.fillStyle = "#fff";   // fixed white reads on the dark bar
    ctx.shadowColor = "rgba(0,0,0,0.65)"; ctx.shadowBlur = 3;
    ctx.fillText(Math.ceil(player.hp) + " / " + player.maxHp, x + bw - 8, y + bh - 5); ctx.shadowBlur = 0;
    ctx.restore();
    if (player.oneHit) UI.tag(ctx, "ONE-HIT", x + bw + 12, y + 6, "#e23b3b", "left", t.type.micro);

    // --- dash charges (bigger) + shield ---
    const dashN = player.dashCharges != null ? player.dashCharges : (player.dashCd <= 0 ? 1 : 0);
    const recharge = 1 - clamp(player.dashCd / CONFIG.dash.cooldown, 0, 1);
    const dashCol = CONFIG.colors.perfect;   // fixed cyan "dash energy" (not biome accent — Grounds' accent is red)
    for (let i = 0; i < maxDash; i++) {
      const px = x + i * (dw + dg);
      if (i < dashN) { ctx.fillStyle = dashCol; ctx.fillRect(px, ry, dw, dh); }
      else if (i === dashN) { ctx.fillStyle = dashCol; ctx.globalAlpha = 0.45; ctx.fillRect(px, ry, dw * recharge, dh); ctx.globalAlpha = 1; }
      ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.strokeRect(px, ry, dw, dh);
    }
    UI.text(ctx, "DASH", x + maxDash * (dw + dg) + 6, ry + dh - 1, t.type.micro, "left", t.alpha.soft);
    const shx = x + maxDash * (dw + dg) + 62;
    for (let i = 0; i < player.maxShield; i++) {
      const sx = shx + i * 20;
      if (i < player.shield) { ctx.fillStyle = CONFIG.colors.armoredShield; ctx.fillRect(sx, ry, 16, dh); }
      else { ctx.strokeStyle = CONFIG.colors.armoredShield; ctx.lineWidth = 2; ctx.strokeRect(sx, ry, 16, dh); }
    }
    ctx.strokeStyle = ink; ctx.fillStyle = ink;

    // owned abilities (compact, below the vitals panel)
    let oy = ry + 36;
    for (const id in run.mods.owned) {
      const up = UPGRADES.find((u) => u.id === id);
      if (!up) continue;
      UI.text(ctx, (up.unique ? "★ " : "") + up.name + (up.unique ? "" : " ×" + run.mods.owned[id]), x, oy, t.type.micro, "left", t.alpha.soft);
      oy += 15;
    }

    // ===== top-center: WAVE + stat chips (training modes show their own card) =====
    if (run.mode === "tutorial") drawTutorialCard();
    else if (run.mode === "playground") drawPlaygroundHelp();
    else {
      UI.title(ctx, run.isBossWave ? "BOSS" : "WAVE " + run.wave, W / 2, 42, t.type.h2);
      const remaining = enemies.length + run.spawnQueue.length;
      const stat = (label, val, cx) => { UI.text(ctx, val, cx, 66, t.type.label, "center"); UI.text(ctx, label, cx, 80, t.type.micro, "center", t.alpha.faint); };
      stat("SCORE", "" + run.score, W / 2 - 150); stat("TIME", fmtTime(run.runTime), W / 2); stat("LEFT", "" + remaining, W / 2 + 150);
    }

    // trick multiplier — pops on increase
    if (run.mult > hudMultPrev) hudMultPop = 1;
    hudMultPrev = run.mult; hudMultPop = Math.max(0, hudMultPop - 0.06);
    if (run.mult > 1) {
      const tc = trickColor(run.mult);
      ctx.save(); ctx.translate(W / 2, 106); ctx.scale(1 + hudMultPop * 0.4, 1 + hudMultPop * 0.4);
      if (!lowG) { ctx.shadowColor = tc; ctx.shadowBlur = 10; }
      UI.tag(ctx, "×" + run.mult + (run.rank ? "  " + run.rank : ""), 0, 0, tc, "center", t.type.lead);
      ctx.restore();
      const bw2 = 240, bx = W / 2 - bw2 / 2;
      ctx.globalAlpha = 0.14; ctx.fillStyle = ink; ctx.fillRect(bx, 114, bw2, 5); ctx.globalAlpha = 1;
      ctx.fillStyle = tc; ctx.fillRect(bx, 114, bw2 * clamp(run.comboTimer / CONFIG.trick.decay, 0, 1), 5);
    }
    ctx.textAlign = "left";

    // ===== boss HP bar (segmented, glowing) — BOSS THEATER edition =====
    const boss = enemies.find((e) => e.isBoss);
    if (boss) {
      const bbw = 620, bx = (W - bbw) / 2, by = 138, bhh = t.metric.bossHudH;
      let bf = clamp(boss.hp / boss.maxHp, 0, 1);
      // arrival ceremony: the bar SWEEPS to full while the name card runs
      if (bossIntro && bossIntro.boss === boss && bossIntro.delay <= 0) bf *= ez(clamp(bossIntro.t / (bossIntro.dur * 0.7), 0, 1));
      UI.bossHud(ctx, { x: bx, y: by, w: bbw, h: bhh, frac: bf, fill: boss.color || CONFIG.colors.boss,
        phaseMarks: boss.phaseMarks, phaseFlash: (boss._phaseFlashT || 0) * A11Y.flashScale,
        guard: boss.guardMeter == null ? null : boss.guardMeter, time: uiT, lowGraphics: lowG });
      if (boss._phaseFlashT > 0) boss._phaseFlashT = Math.max(0, boss._phaseFlashT - lastUiDt);
      // name — epithet · phase tag
      UI.tag(ctx, (boss.bossName || "BOSS").toUpperCase(), W / 2, by - 6, boss.color || CONFIG.colors.boss, "center", t.type.caption);
      if (boss.epithet || boss.phaseTag) {
        UI.tag(ctx, (boss.epithet || "") + (boss.phaseTag ? "   ·   " + boss.phaseTag : ""),
          W / 2, by - 24, t.color.muted, "center", t.type.micro);
      }
    }
  }

  // left-aligned word wrap for the card bodies (wrapText is centre-aligned)
  function wrapLeft(text, x, y, maxW, lh, size, col) {
    ctx.font = UI.font(size, false); ctx.textAlign = "left"; ctx.fillStyle = col || "#000";
    const words = text.split(" "); let line = "", yy = y;
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; }
      else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
    return yy;
  }

  // the tutorial's lesson card — docked TOP-RIGHT (clear of the vitals), with lesson
  // progress dots, a wrapped body, and a ✓ beat on completion
  // little keyboard key-cap chip; returns the x just after it
  function drawKeyCap(x, y, label) {
    ctx.font = UI.font(11, true);
    const w = Math.max(30, ctx.measureText(label).width + 16);
    ctx.fillStyle = "rgba(0,0,0,0.07)"; ctx.fillRect(x, y, w, 22);
    ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, 22);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x + 2, y + 19, w - 4, 2);   // key "depth"
    ctx.fillStyle = "#000"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, x + w / 2, y + 11); ctx.textBaseline = "alphabetic";
    return x + w + 8;
  }

  function drawTutorialCard() {
    const t = UI.t, s = TUT.step(), cw = 700, cx = W - cw - 28 - SAFE.r, cy = 24 + SAFE.t, ch = 138;
    ctx.save();
    ctx.globalAlpha = 0.88; ctx.fillStyle = t.color.paper; ctx.fillRect(cx, cy, cw, ch);
    ctx.globalAlpha = 0.45; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.strokeRect(cx, cy, cw, ch);
    ctx.globalAlpha = 1; ctx.fillStyle = t.color.accent; ctx.fillRect(cx, cy, 4, ch);   // accent spine
    UI.tag(ctx, "LESSON " + (TUT.idx + 1) + " / " + TUT.steps.length, cx + 20, cy + 24, t.color.accent, "left", t.type.micro);
    ctx.fillStyle = "#000"; ctx.font = UI.font(t.type.title, true); ctx.textAlign = "left";
    ctx.fillText(s.t, cx + 20, cy + 52);
    wrapLeft(s.d, cx + 20, cy + 74, cw - 150, 19, t.type.caption, "rgba(0,0,0,0.75)");
    // the objective, LIVE: a big counter + a thin fill bar (right side)
    if (s.prog && !s.final) {
      const [cur, goal] = s.prog();
      ctx.font = UI.font(26, true); ctx.textAlign = "right"; ctx.fillStyle = cur >= goal ? t.color.accent : "#000";
      ctx.fillText(cur + " / " + goal, cx + cw - 22, cy + 52);
      ctx.globalAlpha = 0.15; ctx.fillStyle = "#000"; ctx.fillRect(cx + cw - 122, cy + 62, 100, 5);
      ctx.globalAlpha = 1; ctx.fillStyle = t.color.accent; ctx.fillRect(cx + cw - 122, cy + 62, 100 * clamp(cur / goal, 0, 1), 5);
    }
    // key-cap chips for this lesson's inputs
    if (s.keys) { let kx = cx + 20; ctx.save(); for (const k of s.keys) kx = drawKeyCap(kx, cy + 84, k); ctx.restore(); }
    // progress dots + skip hint along the bottom edge
    for (let i = 0; i < TUT.steps.length; i++) {
      const dx = cx + 20 + i * 18;
      ctx.beginPath(); ctx.arc(dx, cy + ch - 13, 4, 0, 6.2832);
      if (i < TUT.idx) { ctx.fillStyle = t.color.accent; ctx.fill(); }
      else if (i === TUT.idx) { ctx.fillStyle = "#000"; ctx.fill(); }
      else { ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    if (!s.final) { ctx.font = UI.font(t.type.micro, true); ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.textAlign = "right"; ctx.fillText("N — skip lesson", cx + cw - 18, cy + ch - 10); }
    if (TUT.doneT > 0) {   // the ✓ beat pops
      const k = 1 + (1 - Math.abs(TUT.doneT - 0.9) / 0.9) * 0.4;
      ctx.font = UI.font(Math.round(40 * k), true); ctx.fillStyle = t.color.accent; ctx.textAlign = "right";
      ctx.fillText("✓", cx + cw - 22, cy + 108);
    }
    if (s.final) { ctx.font = UI.font(t.type.micro, true); ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.textAlign = "right"; ctx.fillText("returning to the menu…", cx + cw - 16, cy + 24); }
    ctx.restore();
    ctx.textAlign = "left";
  }

  // the playground's legend — docked TOP-RIGHT (clear of the vitals), two tidy key rows
  function drawPlaygroundHelp() {
    const t = UI.t, cw = 700, cx = W - cw - 28 - SAFE.r, cy = 24 + SAFE.t, ch = 92;
    ctx.save();
    ctx.globalAlpha = 0.84; ctx.fillStyle = t.color.paper; ctx.fillRect(cx, cy, cw, ch);
    ctx.globalAlpha = 0.45; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.strokeRect(cx, cy, cw, ch);
    ctx.globalAlpha = 1; ctx.fillStyle = t.color.accent; ctx.fillRect(cx, cy, 4, ch);
    UI.tag(ctx, "PLAYGROUND", cx + 20, cy + 24, t.color.accent, "left", t.type.micro);
    ctx.fillStyle = "rgba(0,0,0,0.78)"; ctx.font = UI.font(t.type.caption, false); ctx.textAlign = "left";
    ctx.fillText("TAB / E — build menu   ·   1–8 quick-spawn   ·   T dummy   ·   B boss", cx + 20, cy + 50);
    ctx.fillText("K clear   ·   H heal   ·   U ability lab   ·   P pause", cx + 20, cy + 74);
    ctx.restore();
    ctx.textAlign = "left";
  }

  // ---- achievement unlock toast: slides down top-centre, holds, slides out ----
  // Pulls one at a time from ACH.pending so a burst of unlocks queues cleanly.
  function drawAchToast(dt) {
    if (!achToast && ACH.pending.length) { achToast = ACH.pending.shift(); achToastT = 0; PROFILE.data.seen[achToast.id] = true; PROFILE.save(); }
    if (!achToast) return;
    achToastT += dt;
    const HOLD = 3.6, IN = 0.4, OUT = 0.4;
    if (achToastT >= HOLD) { achToast = null; return; }
    const t = UI.t, a = achToast, rar = ACH.RARITY[a.rarity] || ACH.RARITY.common, cat = ACH.CATS[a.cat] || {};
    // vertical slide: in, hold, out
    let slide = 1;
    if (achToastT < IN) slide = ez(achToastT / IN);
    else if (achToastT > HOLD - OUT) slide = ez((HOLD - achToastT) / OUT);
    // compact card docked TOP-RIGHT (never covers the wave/score HUD); slides in from
    // the right edge, holds, slides out.
    const cw = 336, ch = 72, restX = W - cw - 22 - SAFE.r, cy = 20 + SAFE.t;
    const cx = restX + (cw + 44) * (1 - slide);
    ctx.save();
    ctx.globalAlpha = clamp(slide, 0, 1);
    ctx.fillStyle = "#0e1017"; ctx.fillRect(cx, cy, cw, ch);
    ctx.globalAlpha = clamp(slide, 0, 1) * 0.9;
    ctx.strokeStyle = rar.color; ctx.lineWidth = 2; ctx.strokeRect(cx, cy, cw, ch);
    ctx.fillStyle = rar.color; ctx.fillRect(cx, cy, cw, 3);           // rarity strip
    ctx.fillStyle = rar.color; ctx.fillRect(cx, cy, 4, ch);           // rarity spine
    // badge (category glyph)
    ctx.globalAlpha = clamp(slide, 0, 1) * 0.18; ctx.fillStyle = rar.color; ctx.fillRect(cx + 14, cy + 15, 44, 44);
    ctx.globalAlpha = clamp(slide, 0, 1);
    ctx.fillStyle = rar.color; ctx.font = UI.font(22, true); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(cat.icon || "★", cx + 36, cy + 38); ctx.textBaseline = "alphabetic";
    // text
    ctx.textAlign = "left";
    ctx.fillStyle = rar.color; ctx.font = UI.font(9, true);
    ctx.fillText("UNLOCKED  ·  " + rar.name, cx + 70, cy + 22);
    ctx.fillStyle = "#f1eff9"; ctx.font = UI.font(15, true);
    ctx.fillText(a.name.length > 22 ? a.name.slice(0, 21) + "…" : a.name, cx + 70, cy + 42);
    ctx.fillStyle = "#9fa3b4"; ctx.font = UI.font(10, false);
    ctx.fillText(a.desc.length > 34 ? a.desc.slice(0, 33) + "…" : a.desc, cx + 70, cy + 59);
    // shard & coin chips (top-right)
    ctx.textAlign = "right"; ctx.fillStyle = "#13c4d6"; ctx.font = UI.font(13, true);
    ctx.fillText("◆ +" + ACH.shardsFor(a) + "  +" + ACH.coinsFor(a) + "c", cx + cw - 12, cy + 22);
    ctx.restore();
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }

  // ---- mobile: the on-screen touch controls (drawn only once a real touch happens) ----
  function drawTouchControls() {
    const L = Input.touchLayout(), ink = THEME.ink;
    ctx.save();
    // floating joystick: rests bottom-left, ANCHORS wherever the thumb lands — the ring
    // marks the anchor (your neutral), the crosshair dot its exact centre, the nub your
    // thumb, so you always feel where "stop" is
    const j = Input.joy, jx = j.active ? j.ax : 200 + SAFE.l, jy = j.active ? j.ay : H - 190 - SAFE.b;
    const m = Math.hypot(j.dx, j.dy) || 1, cap = Math.min(m, 70);
    ctx.globalAlpha = j.active ? 0.38 : 0.16;
    ctx.strokeStyle = ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(jx, jy, 92, 0, 6.2832); ctx.stroke();
    if (j.active) {   // anchor crosshair + deadzone ring
      ctx.globalAlpha = 0.30;
      ctx.beginPath(); ctx.arc(jx, jy, 26, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(jx, jy, 4, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = j.active ? 0.5 : 0.22; ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(jx + (j.active ? j.dx / m * cap : 0), jy + (j.active ? j.dy / m * cap : 0), 42, 0, 6.2832); ctx.fill();
    // aim stick (radial mode): show the anchor ring + deflection nub while aiming,
    // so the thumb always knows where neutral is
    if (Input.touchAim && Input.stickAim) {
      const ax2 = W - 300 - SAFE.r, ay2 = H - 260 - SAFE.b;   // indicator sits in the aim zone, out of the thumb's way
      ctx.globalAlpha = 0.20; ctx.strokeStyle = ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(ax2, ay2, 64, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 0.5; ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(ax2 + Input.stickAim.x * 52, ay2 + Input.stickAim.y * 52, 22, 0, 6.2832); ctx.fill();
    }
    // action buttons: fill warms + ring pops while a finger holds them
    const btn = (z, key, big) => {
      const heldB = !!Input.btnHeld[key];
      ctx.globalAlpha = heldB ? 0.34 : 0.16; ctx.fillStyle = heldB ? UI.t.color.accent : ink;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (heldB ? 0.94 : 1), 0, 6.2832); ctx.fill();
      ctx.globalAlpha = heldB ? 0.8 : 0.4; ctx.strokeStyle = heldB ? UI.t.color.accent : ink; ctx.lineWidth = heldB ? 4 : 3;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 0.62; ctx.fillStyle = ink;
      ctx.font = UI.font(big ? 16 : 13, true); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(z.label, z.x, z.y + 1); ctx.textBaseline = "alphabetic";
    };
    btn(L.jump, "jump", true); btn(L.dash, "dash"); btn(L.throwB, "throwB"); btn(L.pause, "pause");

    // first-run onboarding: label the zones for ~7s, once, then remember forever
    if (!PROFILE.stat("touchOnboarded")) {
      touchTeachT += lastUiDt;
      const oa = touchTeachT < 6 ? 1 : clamp(7 - touchTeachT, 0, 1);
      if (touchTeachT >= 7) PROFILE.addStat("touchOnboarded", 1);
      if (oa > 0) {
        ctx.globalAlpha = oa * 0.85;
        ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        ctx.font = UI.font(20, true);
        ctx.fillText("◉ MOVE", W * 0.20, H - 320 - SAFE.b);
        ctx.fillText("DRAG TO AIM & SWING ↷", W * 0.68, H - 340 - SAFE.b);
        ctx.font = UI.font(13, false); ctx.globalAlpha = oa * 0.6;
        ctx.fillText("left thumb — anywhere on the left", W * 0.20, H - 294 - SAFE.b);
        ctx.fillText("fast flicks = fast cuts · second finger = throw", W * 0.68, H - 314 - SAFE.b);
        ctx.textAlign = "left";
      }
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  let touchTeachT = 0;   // onboarding label clock (counts only while controls draw)

  function drawBanner() {
    const t = bannerT / CONFIG.juice.bannerTime;          // 1 -> 0
    const a = Math.sin((1 - t) * Math.PI);                // fade in then out
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    UI.title(ctx, run.isBossWave ? "BOSS" : "WAVE " + run.wave, W / 2, 150, 60 + (1 - a) * 10);
    if (run.waveTag) UI.tag(ctx, run.waveTag, W / 2, 186, run.horde ? CONFIG.colors.charger : CONFIG.colors.perfect, "center", UI.t.type.lead);
    ctx.restore();
  }

  // BOSS THEATER: the arrival name card — letterbox bars + the boss's name and
  // epithet in the lore language, while time crawls (see the frame-loop clamp)
  function drawBossIntro() {
    const b = bossIntro.boss;
    UI.bossIntro(ctx, { screen: screenRect(), bossName: b.bossName || "BOSS", epithet: b.epithet || "",
      color: b.color || CONFIG.colors.boss, t: bossIntro.t, dur: bossIntro.dur });
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
  // each sub-screen's signature hue — worn on its sheet's top edge + header underline
  const HUE_GOLD = "#e0a326", HUE_GREEN = "#2f9e6b", HUE_VIOLET = "#b06cff", HUE_INK = "#3a3d4d";
  const SCREEN_HUES = {
    shop: HUE_GOLD, achievements: "#13c4d6", leaderboards: HUE_GOLD,
    profile: HUE_GREEN, setup: undefined, codex: HUE_INK, settings: HUE_INK,
  };
  function vmenu(items, x, top, w, h, gap) {
    items.forEach((it, i) => {
      const b = { x: x - w / 2, y: top + i * (h + gap), w, h, label: it.label, enabled: it.enabled, action: it.action, size: it.size, ghost: it.ghost };
      uiButtons.push(b);
    });
  }
  // one BACK button, same place + style on every sub-screen
  function addBack() {
    uiButtons.push({ x: W / 2 - LAY.backW / 2, y: LAY.backY, w: LAY.backW, h: LAY.backH, label: "‹  BACK", action: () => { state = "menu"; } });
  }

  function renderMenu() {
    const t = UI.t;
    // ONE RAIL AXIS: the wordmark, taglines, player card, hero, and every rail button
    // all share this left edge + width, so nothing sits "slightly off" from anything else.
    const railX = 100, MW = 320;

    // left sidebar: softened (was 0.93/0.74) so the live attract duel reads through more
    const sr = screenRect();
    const g = ctx.createLinearGradient(0, 0, 800, 0);
    g.addColorStop(0, "rgba(6,7,12,0.90)"); g.addColorStop(0.56, "rgba(6,7,12,0.60)"); g.addColorStop(1, "rgba(6,7,12,0)");
    ctx.fillStyle = g; ctx.fillRect(sr.x, sr.y, 800 - sr.x, sr.h);

    UI.ink = "#f1eff9";   // light content over the dark sidebar

    // ---- WORDMARK: the plain "T E A R" look, just re-anchored to the shared rail axis ----
    const wmY = 150;
    UI.text(ctx, "T E A R", railX, wmY, t.type.wordmark, "left");
    const cyc = (uiT % 4.2) / 0.5;                 // animated cyan slash sweeping the wordmark
    if (cyc < 1) {
      const sx = railX + cyc * 380, k = Math.sin(cyc * Math.PI);
      ctx.save(); ctx.globalAlpha = 0.85 * k; ctx.strokeStyle = t.color.accent; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(sx - 26, wmY + 10); ctx.lineTo(sx + 26, wmY - 52); ctx.stroke(); ctx.restore();
    }
    UI.text(ctx, "a momentum-blade survival game", railX, wmY + 34, t.type.caption, "left", t.alpha.muted);

    // ---- NOW SHOWING: name the live attract biome playing behind the menu ----
    const biome = (typeof Attract !== "undefined" && Attract.stage) ? Attract.stage().name : "";
    if (biome) UI.tag(ctx, "◈ NOW SHOWING — " + biome.toUpperCase(), railX, wmY + 62, t.color.accent, "left", t.type.micro);

    UI.text(ctx, "cut clean · keep moving · chase the multiplier", railX, H - 46, t.type.micro, "left", t.alpha.faint);

    // ---- PLAYER CARD: identity + currencies; the door to THE PROFILE (no rail button) ----
    const signedIn = typeof Cloud !== "undefined" && Cloud.loggedIn();
    uiButtons.push({ ghost: true, x: railX, y: 240, w: MW, h: 58, size: t.type.title,
      dot: signedIn ? "#2f9e6b" : "#8a93a6",
      label: ((PROFILE.data.rewards && PROFILE.data.rewards.campaignEmblem ? "◇ " : "") + (PROFILE.username() || "GUEST")).toUpperCase(),
      sub: "◆ " + META.coins() + "    ⬡ " + PROFILE.shards() + "    ★ " + PROFILE.unlockedCount(),
      action: () => { state = "profile"; profileTab = "bests"; listScroll = 0; } });

    // ---- HERO PLAY: accent-filled, ~2x tall, with the last mode/difficulty as a subline ----
    const modeLabel = ((CONFIG.modes.find((m) => m.id === selMode) || {}).label || "Endless");
    const diffLabel = ((CONFIG.difficulties.find((d) => d.id === selDiff) || {}).label || "Normal");
    uiButtons.push({ ghost: true, hero: true, x: railX, y: 318, w: MW, h: 86, glyph: "▶",
      label: "PLAY", sub: (modeLabel + " · " + diffLabel).toUpperCase(),
      action: () => { state = "setup"; } });

    // ---- the rail: five glyphed ghost buttons, all snapped to the shared axis ----
    const rail = [
      ["◆", "SHOP", () => { state = "shop"; }],
      ["★", "ACHIEVEMENTS", () => { state = "achievements"; listScroll = 0; }],
      ["☰", "LEADERBOARDS", () => { state = "leaderboards"; lbTab = "global"; listScroll = 0; replayFeedData = null; }],
      ["▤", "CODEX", () => { state = "codex"; codexTab = "abilities"; listScroll = 0; }],
      ["⚙", "SETTINGS", () => { state = "settings"; }],
    ];
    const ry = 426, rh = 52, rgap = 9;
    rail.forEach(([glyph, label, action], i) =>
      uiButtons.push({ ghost: true, glyph, label, action, x: railX, y: ry + i * (rh + rgap), w: MW, h: rh }));

    const pendingFinale = PROFILE.pendingFinale();
    if (pendingFinale) {
      UI.tag(ctx, "◇ SAVED ADVENTURE CLEAR", railX + MW + 34, H - 146, t.color.accent, "left", t.type.micro);
      UI.text(ctx, "The Final Cut was interrupted.", railX + MW + 34, H - 118, t.type.caption, "left", t.alpha.soft);
      uiButtons.push({ x: railX + MW + 34, y: H - 102, w: 196, h: 44, size: t.type.caption, label: "RESUME FINAL CUT", action: resumeSavedFinale });
      uiButtons.push({ x: railX + MW + 242, y: H - 102, w: 174, h: 44, size: t.type.caption, label: "CLAIM RESULTS", action: claimSavedFinale });
    }

    UI.ink = "#000";   // restore the default for sub-screens drawn after this frame
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
    // top row: rarity class (left, a filled badge for the prized ones) + category (right)
    if (up.tiers || up.unique) UI.badge(ctx, bd.label, x + 12, y + 28, bd.color, "left");
    else UI.tag(ctx, bd.label, x + 12, y + 26, bd.color, "left", t.type.micro);
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

  // ---- THE CODEX: one reference hub — ABILITIES / BESTIARY / GUIDE as tabs ----
  // (was three separate menu screens; the draw routines below are unchanged, just
  // re-homed under a shared UI.tabs strip. addBack() exits the whole hub.)
  const CODEX_TABS = [["abilities", "ABILITIES"], ["bestiary", "BESTIARY"], ["guide", "GUIDE"]];
  function renderCodex() {
    const t = UI.t;
    UI.title(ctx, "CODEX", W / 2, 92, t.type.h1);
    ctx.fillStyle = SCREEN_HUES.codex; ctx.globalAlpha = eIn; ctx.fillRect(W / 2 - 65 * eIn, 108, 130 * eIn, 3); ctx.globalAlpha = 1;
    UI.tabs(ctx, "codex", CODEX_TABS.map((x) => x[1]), Math.max(0, CODEX_TABS.findIndex((x) => x[0] === codexTab)), 124, (b) => {
      const i = b._tab;
      b.action = () => { if (CODEX_TABS[i][0] !== codexTab) { codexTab = CODEX_TABS[i][0]; listScroll = 0; } };
      uiButtons.push(b);
    });
    if (codexTab === "bestiary") codexTabBestiary();
    else if (codexTab === "guide") codexTabGuide();
    else codexTabAbilities();
    addBack();
  }

  function codexTabAbilities() {
    const t = UI.t;
    UI.text(ctx, "STACKS pile up  ·  ★ UNIQUE are one-time  ·  ✦ SPECIAL evolve a tier with every boss  —  click a card to read its tiers",
      W / 2, 186, t.type.caption, "center", t.alpha.muted);

    // ---- filter chips (All + each category) + a sort toggle ----
    const chips = [["all", "ALL"]].concat(ABIL_CAT_ORDER.map((c) => [c, (ABIL_CATS[c].name)]));
    const cw0 = t.metric.chipW, cg = t.space.xs, totalC = chips.length * cw0 + (chips.length - 1) * cg;
    let cx0 = (W - totalC) / 2 - 70;
    chips.forEach(([id, label]) => {
      uiButtons.push({ x: cx0, y: 200, w: cw0, h: t.metric.chipH, label, size: t.type.micro, chip: true, sel: codexFilter === id,
        action: () => { codexFilter = id; listScroll = 0; } });
      cx0 += cw0 + cg;
    });
    uiButtons.push({ x: cx0 + 8, y: 200, w: 150, h: t.metric.chipH, size: t.type.micro, chip: true,
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
    const cols = 4, mx = 210, gap = 20, cardW = (W - mx * 2 - gap * (cols - 1)) / cols;   // inside the sheet
    const ch = 150, gy = 20, stride = ch + gy, top = 244, visRows = 3;
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
    if (maxOff > 0) UI.scrollHint(ctx, W / 2, top + visRows * stride + 2, off > 0, off < maxOff);
  }

  // THE ARMORY LEDGER — the shop as four titled sections of glyph cards, a giant
  // gold balance, and a running ledger line. Buy feedback: the shown balance
  // ticks toward the real one; the bought card flashes gold.
  const SHOP_CATS = [["vit", "VITALITY"], ["blade", "BLADE"], ["tempo", "TEMPO"], ["fortune", "FORTUNE"]];
  let shopCoinShow = null, shopFlash = null;
  function renderShop() {
    const t = UI.t, gold = SCREEN_HUES.shop;
    UI.header(ctx, "SHOP", "permanent upgrades — applied at the start of every run", eIn, gold);

    // giant editorial balance (ticks toward the truth after a purchase)
    const real = META.coins();
    shopCoinShow = shopCoinShow == null ? real : shopCoinShow + (real - shopCoinShow) * 0.18;
    if (Math.abs(shopCoinShow - real) < 0.6) shopCoinShow = real;
    ctx.save(); ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = gold; ctx.font = UI.font(t.type.h1, true);
    const balTxt = Math.round(shopCoinShow).toLocaleString();
    const balW = ctx.measureText(balTxt).width;
    ctx.fillText(balTxt, 1380, 108);
    ctx.font = UI.font(t.type.title, true);   // the diamond stays a MARK, not a monolith
    ctx.fillText("◆", 1380 - balW - 14, 108);
    ctx.restore();
    UI.tag(ctx, "COINS", 1380, 130, t.color.muted, "right", t.type.micro);
    // the ledger line: what you own + what the blade has earned you, lifetime
    const owned = SHOP.reduce((n, s) => n + META.level(s.id), 0);
    const cap = SHOP.reduce((n, s) => n + s.maxLevel, 0);
    UI.tag(ctx, owned + " / " + cap + " LEVELS OWNED   ·   LIFETIME EARNED ◆ " + (META.data.lifetimeEarned || 0).toLocaleString(), 240, 130, t.color.muted, "left", t.type.micro);

    // four sections in two scrollable columns; the enlarged catalogue keeps the
    // established ledger-card look instead of shrinking the type or hit targets.
    const colX = [240, 830], colW2 = 550, rowH2 = 74, cardH = 62;
    const viewTop = 158, viewBottom = H - 104, viewH = viewBottom - viewTop;
    const colFill = [[], []];
    SHOP_CATS.forEach(([cat], ci) => colFill[ci < 2 ? 0 : 1].push([cat, SHOP_CATS.find((c) => c[0] === cat)[1]]));
    const columnHeight = (sections) => sections.reduce((h, [cat]) => h + 36 + SHOP.filter((s) => s.cat === cat).length * rowH2, 0);
    const maxShopScroll = Math.max(0, Math.max(...colFill.map(columnHeight)) - viewH);
    listScroll = clamp(listScroll, 0, maxShopScroll);
    ctx.save(); ctx.beginPath(); ctx.rect(210, viewTop, W - 420, viewH); ctx.clip();
    colFill.forEach((sections, ci) => {
      let y = 176 - listScroll;
      sections.forEach(([cat, label]) => {
        y = UI.sectionLabel(ctx, label, colX[ci], y, colW2, gold) + 6;
        SHOP.filter((s) => s.cat === cat).forEach((it) => {
          const lv = META.level(it.id), maxed = lv >= it.maxLevel, afford = META.canBuy(it);
          const visible = y >= viewTop && y + cardH <= viewBottom;
          UI.card(ctx, colX[ci], y, colW2, cardH, false);
          if (shopFlash && shopFlash.id === it.id && uiT - shopFlash.t < 0.45) {   // gold buy-flash
            ctx.globalAlpha = 0.30 * (1 - (uiT - shopFlash.t) / 0.45); ctx.fillStyle = gold;
            ctx.fillRect(colX[ci], y, colW2, cardH); ctx.globalAlpha = 1;
          }
          // glyph box, warmed once you own a level
          ctx.globalAlpha = lv ? 0.16 : 0.06; ctx.fillStyle = lv ? gold : UI.ink;
          ctx.fillRect(colX[ci] + 10, y + 9, 44, 44); ctx.globalAlpha = 1;
          UI.tag(ctx, it.glyph || "◆", colX[ci] + 32, y + 40, lv ? gold : t.color.muted, "center", 22);
          // name + level + desc / owned effect
          const tx = colX[ci] + 66;
          UI.text(ctx, it.name, tx, y + 24, t.type.body);
          UI.tag(ctx, "LV " + lv + "/" + it.maxLevel, tx + ctx.measureText(it.name).width + 14, y + 24, lv ? gold : t.color.muted, "left", t.type.micro);
          // desc clips with an ellipsis before the pips/price zone
          let dTxt = lv && it.now ? "now  " + it.now(lv) + "   ·   " + it.desc : it.desc;
          const dMax = colX[ci] + colW2 - 240 - tx;
          ctx.font = UI.font(t.type.micro, false);
          if (ctx.measureText(dTxt).width > dMax) {
            while (dTxt.length > 4 && ctx.measureText(dTxt + "…").width > dMax) dTxt = dTxt.slice(0, -1);
            dTxt += "…";
          }
          UI.text(ctx, dTxt, tx, y + 45, t.type.micro, "left", t.alpha.soft);
          // pips + the price button (gold when affordable / ghost when not / ink MAX)
          UI.pips(ctx, colX[ci] + colW2 - 118, y + 31, it.maxLevel, lv, gold);
          uiButtons.push({ x: colX[ci] + colW2 - 104, y: y + 11, w: 94, h: 40, size: 13,
            _hideBox: !visible,
            label: maxed ? "MAX" : META.cost(it).toLocaleString() + "c",
            sel: maxed, enabled: visible && !maxed && afford, accent: !maxed && afford ? gold : undefined,
            action: () => { if (META.buy(it)) { SFX.ui(); shopFlash = { id: it.id, t: uiT }; PROFILE.addStat("shopBuys", 1); PROFILE.maxStat("shopMaxed", SHOP.filter((s) => META.level(s.id) >= s.maxLevel).length); achCheck(); } } });
          y += rowH2;
        });
        y += 12;
      });
    });
    ctx.restore();
    if (maxShopScroll > 0) UI.scrollHint(ctx, W / 2, viewBottom + 8, listScroll > 0, listScroll < maxShopScroll);
    addBack();
  }

  // THE WAR TABLE — mode/difficulty/weapon as three framed columns, each with a
  // fixed blurb slot at its own foot (so descriptions can never collide), plus a
  // stakes footer: your best for the selected board + today's bounties.
  const MODE_TRIM = {
    campaign:   { glyph: "▲", sub: "stage after stage, ever deeper" },
    endless:    { glyph: "∞", sub: "biomes cycle — chase your best" },
    gauntlet:   { glyph: "☠", sub: "a full boss every 8 waves" },
    playground: { glyph: "✦", sub: "open arena — test everything" },
    tutorial:   { glyph: "➔", sub: "learn the blade" },
  };
  const DIFF_HEAT = { easy: HUE_GREEN, normal: "#13c4d6", hard: HUE_GOLD, extreme: null, onehit: HUE_VIOLET };  // null = danger red
  function renderSetup() {
    const t = UI.t;
    UI.header(ctx, "SELECT RUN", null, eIn);
    const top = 150, colY = 168, bh = 58, gap = 8;
    const mx = 240, mw = 380, dx = 640, dw = 360, wx = 1020, ww = 340;

    // ---- MODE column (slightly tighter rows so the DEV section clears the blurb slot) ----
    UI.sectionLabel(ctx, "MODE", mx, top, mw);
    const pubModes = CONFIG.modes.filter((m) => !m.debug);
    pubModes.forEach((m, i) => {
      const trim = MODE_TRIM[m.id] || {};
      uiButtons.push({ x: mx, y: colY + i * 60, w: mw, h: 54, size: 17,
        label: m.label.toUpperCase(), glyph: trim.glyph, sub: trim.sub,
        sel: selMode === m.id, action: () => { selMode = m.id; } });
    });
    // dev/test modes: a de-emphasised hairline section, local + Vercel only (never CG)
    if (!CG.live) {
      const devY = colY + pubModes.length * 60 + 12;
      UI.sectionLabel(ctx, "DEV", mx, devY, mw, t.color.muted);
      CONFIG.modes.filter((m) => m.debug).forEach((m, i) => {
        uiButtons.push({ x: mx, y: devY + 12 + i * 40, w: mw, h: 34, size: 12,
          label: m.label.toUpperCase(), sel: selMode === m.id, action: () => { selMode = m.id; } });
      });
    }

    // ---- DIFFICULTY column: the risk ladder ----
    UI.sectionLabel(ctx, "DIFFICULTY", dx, top, dw);
    const showDiff = selMode !== "tutorial" && selMode !== "playground";
    if (showDiff) {
      CONFIG.difficulties.forEach((d, i) => {
        const heat = DIFF_HEAT[d.id] === null ? t.color.danger : (DIFF_HEAT[d.id] || t.color.accent);
        uiButtons.push({ x: dx, y: colY + i * (bh + gap), w: dw, h: bh, size: 17,
          label: d.label.toUpperCase(),
          sub: "×" + d.mods.score.toFixed(1) + " score  ·  " + (d.id === "onehit" ? "×0.7→3.1 coins after wave 8" : "×" + d.mods.coin.toFixed(2).replace(/0$/, "") + " coins"),
          pips: { n: 5, filled: i + 1, color: heat },
          sel: selDiff === d.id, action: () => { selDiff = d.id; } });
      });
    } else {
      UI.text(ctx, "set by the mode —", dx + dw / 2, colY + 120, t.type.caption, "center", t.alpha.muted);
      UI.text(ctx, "training runs tune themselves", dx + dw / 2, colY + 144, t.type.caption, "center", t.alpha.muted);
    }

    // ---- WEAPON column ----
    UI.sectionLabel(ctx, "WEAPON", wx, top, ww);
    const WPN_TRIM = { sword: { glyph: "⚔", sub: "balanced · pierce throw" }, hammer: { glyph: "⚒", sub: "+70% dmg · −reach · lob throw" } };
    WEAPONS.forEach((wpn, i) => {
      const trim = WPN_TRIM[wpn.id] || {};
      uiButtons.push({ x: wx, y: colY + i * (96 + 10), w: ww, h: 96, size: 19,
        label: wpn.name.toUpperCase(), glyph: trim.glyph, sub: trim.sub,
        sel: selWeapon === wpn.id, action: () => { selWeapon = wpn.id; } });
    });

    // ---- fixed blurb slots at each column's foot (collision-proof by reservation) ----
    const blurbY = 588;
    const msel = CONFIG.modes.find((x) => x.id === selMode);
    const dsel = CONFIG.difficulties.find((x) => x.id === selDiff);
    const wsel = WEAPONS.find((x) => x.id === selWeapon);
    const foot = (x, w, txt) => {
      if (!txt) return;
      UI.divider(ctx, x, blurbY - 16, w, 0.10);
      // strict 2-line wrap into the column width; a too-long blurb ellipsizes
      // instead of spilling into the stakes strip below
      ctx.font = UI.font(t.type.caption, false);
      const words = txt.split(" "), lines = [];
      let line = "";
      for (let wi = 0; wi < words.length; wi++) {
        const test = line ? line + " " + words[wi] : words[wi];
        if (ctx.measureText(test).width > w - 8 && line) {
          lines.push(line); line = words[wi];
          if (lines.length === 2) {   // out of room — ellipsize what's left onto line 2
            let last = lines[1] + "…";
            while (ctx.measureText(last).width > w - 8 && lines[1].includes(" ")) {
              lines[1] = lines[1].slice(0, lines[1].lastIndexOf(" ")); last = lines[1] + "…";
            }
            lines[1] = last; line = ""; break;
          }
        } else line = test;
      }
      if (line && lines.length < 2) lines.push(line);
      lines.forEach((l, i) => UI.text(ctx, l, x, blurbY + i * 20, t.type.caption, "left", t.alpha.soft));
    };
    foot(mx, mw, msel && msel.blurb);
    foot(dx, dw, showDiff && dsel ? dsel.desc : "");
    foot(wx, ww, wsel && wsel.blurb);

    // ---- stakes strip: your best on this exact board + today's bounties ----
    const sy = 668;
    UI.divider(ctx, mx, sy - 12, 1120, 0.14);
    const best = getBest(selMode, selDiff);
    UI.tag(ctx, "YOUR BEST", mx, sy + 6, t.color.accent, "left", t.type.micro);
    UI.text(ctx, (best.wave || best.score)
      ? "wave " + best.wave + "   ·   " + best.score + " pts   ·   " + fmtTime(best.time || 0)
      : "no record on this board yet — set one.", mx, sy + 30, t.type.label, "left", t.alpha.soft);
    if (selMode === "bossonly") {
      // dev boss picker takes the bounty slot (Boss Test never ships to CG)
      const opts = [{ id: "shuffle", label: "SHUFFLE" }].concat(BOSS_ROSTER.map((b) => ({ id: b.id, label: b.name.toUpperCase() })));
      const bbw = 120, bbg = 8, bx0 = mx + 1120 - opts.length * (bbw + bbg) + bbg;
      opts.forEach((o, i) => uiButtons.push({ x: bx0 + i * (bbw + bbg), y: sy - 2, w: bbw, h: 34, chip: true, size: 10,
        label: o.label, sel: selBoss === o.id, action: () => { selBoss = o.id; } }));
    } else if (typeof DAILY !== "undefined") {
      UI.tag(ctx, "TODAY'S BOUNTIES", mx + 470, sy + 6, HUE_GOLD, "left", t.type.micro);
      DAILY.today().forEach((ch, i) => {
        const bx0 = mx + 470 + i * 224, done = DAILY.isDone(ch), prog = DAILY.progress(ch);
        UI.text(ctx, ch.txt(ch.goal), bx0, sy + 30, t.type.micro, "left", done ? t.alpha.faint : t.alpha.soft);
        UI.tag(ctx, done ? "✓ DONE" : prog + "/" + ch.goal + " · +" + ch.shards + "⬡", bx0, sy + 48, done ? HUE_GREEN : t.color.muted, "left", t.type.micro);
      });
    }

    // ---- hero START + the standard BACK ----
    // width hugs the content (hero text is left-aligned; a too-wide button
    // reads as a lopsided slab)
    const startSub = ((msel ? msel.label : "") + " · " + (showDiff && dsel ? dsel.label + " · " : "") + (wsel ? wsel.name : "")).toUpperCase();
    ctx.font = UI.font(t.type.caption, true);
    const startW = Math.max(300, Math.round(ctx.measureText(startSub).width) + 100);
    uiButtons.push({ ghost: true, hero: true, x: W / 2 - startW / 2, y: 726, w: startW, h: 62, glyph: "▶", size: 26,
      label: "START", sub: startSub,
      action: () => startRun(selMode, selDiff) });
    addBack();
  }

  // GUIDE tab (CODEX): the FIELD MANUAL — key-cap control chart on the left,
  // and the trick meter's LIVE point values + multiplier ladder on the right
  // (read straight from CONFIG.trick, so this page can never drift from tuning).
  function codexTabGuide() {
    const t = UI.t, lx2 = 250, lw2 = 480, rx2 = 830, rw2 = 520;
    UI.text(ctx, "movement, the blade, and the trick meter", W / 2, 186, t.type.caption, "center", t.alpha.muted);

    // ---- CONTROLS (key-cap chart) ----
    let y = UI.sectionLabel(ctx, "CONTROLS", lx2, 226, lw2) + 22;
    const row = (caps, what) => {
      let cx2 = lx2;
      caps.forEach((k) => { cx2 += UI.keycap(ctx, k, cx2, y) + 8; });
      UI.text(ctx, what, lx2 + 172, y, t.type.label, "left", t.alpha.soft);
      y += 44;
    };
    row(["A", "D"], "move");
    row(["W", "SPACE"], "jump");
    row(["S"], "hold — drop through platforms");
    row(["SHIFT"], "dash · aim 8-way with WASD · i-frames");
    row(["MOUSE"], "the blade — clean CUTS beat pokes");
    row(["RMB"], "throw / recall inside the dashed ring");
    row(["P"], "pause");
    row(["ESC"], "release the mouse");
    // controller (plug-and-play — Gamepad API)
    UI.divider(ctx, lx2, y - 22, lw2, 0.10);
    UI.tag(ctx, "CONTROLLER", lx2, y + 2, t.color.muted, "left", t.type.micro);
    UI.text(ctx, "left stick move · right stick swings the blade", lx2 + 130, y + 2, t.type.micro, "left", t.alpha.soft);
    UI.text(ctx, "A jump · B dash · X throw · ▸ pause", lx2 + 130, y + 22, t.type.micro, "left", t.alpha.soft);

    // ---- THE TRICK METER (live values from CONFIG.trick) ----
    let ty = UI.sectionLabel(ctx, "THE TRICK METER", rx2, 226, rw2) + 22;
    const pts = CONFIG.trick.pts;
    const tricks = [
      ["/", "CUT", pts.hit, "any clean blade hit"],
      ["➹", "THROW HIT", pts.throwHit, "the thrown blade connects"],
      ["↩", "DEFLECT", pts.deflect, "bat a shot away"],
      ["↑", "LAUNCH", pts.launch, "fast UP swing pops them airborne"],
      ["⇂", "SLAM", pts.slam, "airborne hit driving DOWN"],
      ["⇈", "UPDRAFT", pts.updraft, "launch while rising"],
      ["⇊", "POWER SLAM", pts.superslam, "slam during a fast descent"],
      ["✦", "PARRY", pts.parry, "swing FAST through a shot — it homes back"],
    ].sort((a, b) => a[2] - b[2]);
    tricks.forEach(([g, name, p, how]) => {
      UI.tag(ctx, g, rx2, ty, t.color.accent, "left", t.type.label);
      UI.text(ctx, name, rx2 + 30, ty, t.type.label);
      ctx.font = UI.font(t.type.micro, false);
      UI.text(ctx, how, rx2 + 176, ty, t.type.micro, "left", t.alpha.muted);
      UI.tag(ctx, "+" + p, rx2 + rw2, ty, p >= 10 ? HUE_GOLD : t.color.accent, "right", t.type.label);
      ty += 31;
    });

    // the multiplier ladder: gauge thresholds -> rank names (variety feeds it)
    ty = UI.sectionLabel(ctx, "THE LADDER", rx2, ty + 16, rw2) + 20;
    const tiers = CONFIG.trick.tiers.filter((x) => x.name);
    const maxAt = tiers[tiers.length - 1].at;
    tiers.forEach((tier) => {
      ctx.globalAlpha = 0.16; ctx.fillStyle = UI.ink; ctx.fillRect(rx2, ty - 10, 220, 8); ctx.globalAlpha = 1;
      ctx.fillStyle = t.color.accent; ctx.fillRect(rx2, ty - 10, 220 * (tier.at / maxAt), 8);
      UI.text(ctx, tier.name, rx2 + 236, ty, t.type.label);
      UI.tag(ctx, "×" + tier.mult, rx2 + rw2, ty, tier.mult >= 4 ? HUE_GOLD : t.color.muted, "right", t.type.label);
      ty += 27;
    });
    UI.text(ctx, "vary your tricks — a different trick than the last scores ×" + CONFIG.trick.variety, rx2, ty + 10, t.type.micro, "left", t.alpha.muted);
  }

  // ---- THE PROFILE: who you are — identity + sign-in, personal bests, lifetime stats.
  // Entered from the player chip on the main menu (Option A: no rail button). The
  // account card here REPLACES the old Settings ACCOUNT section; future identity
  // features (avatars, replay passport surface) belong in this hub.
  const PROFILE_TABS = [["bests", "BESTS"], ["replays", "REPLAYS"], ["stats", "STATS"]];
  function renderProfile() {
    const t = UI.t, fx = W / 2 - 560, rx = W / 2 + 560;
    UI.title(ctx, "PROFILE", W / 2, 92, t.type.h1);
    ctx.fillStyle = SCREEN_HUES.profile; ctx.globalAlpha = eIn; ctx.fillRect(W / 2 - 65 * eIn, 108, 130 * eIn, 3); ctx.globalAlpha = 1;

    // ---- THE PASSPORT: avatar, name, sync status, currencies, showcase seals ----
    const signedIn = typeof Cloud !== "undefined" && Cloud.loggedIn();
    const fb = typeof Cloud !== "undefined" && Cloud.provider === FirebaseProvider;
    const canIn = typeof Cloud !== "undefined" && Cloud.canSignIn();
    const cardY = 130, cardH = 100, cardW = rx - fx;
    ctx.save();
    ctx.globalAlpha = 0.05; ctx.fillStyle = UI.ink; ctx.fillRect(fx, cardY, cardW, cardH); ctx.globalAlpha = 1;
    UI.spine(ctx, fx, cardY, cardH, signedIn ? SCREEN_HUES.profile : t.color.muted);
    UI.avatar(ctx, fx + 16, cardY + 14, 72);
    // sync dot pinned to the portrait corner
    ctx.beginPath(); ctx.arc(fx + 84, cardY + 22, 6, 0, 6.2832);
    ctx.fillStyle = signedIn ? SCREEN_HUES.profile : "#8a93a6"; ctx.fill();
    ctx.strokeStyle = UI.ink; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = UI.ink; ctx.font = UI.font(t.type.h2, true);
    ctx.fillText((PROFILE.username() || (signedIn ? Cloud.displayName() : "GUEST")).toUpperCase(), fx + 106, cardY + 42);
    ctx.globalAlpha = 0.6; ctx.font = UI.font(t.type.caption, false);
    ctx.fillText(signedIn ? "Signed in — progress synced to the cloud"
      : (canIn ? "Playing as a guest — sign in to keep your progress everywhere" : "Progress saved on this device"), fx + 106, cardY + 66);
    ctx.globalAlpha = 1; ctx.restore();
    // currency badges + achievements chip
    const achN = PROFILE.unlockedCount(), achTotal = (typeof ACH !== "undefined" && ACH.list) ? ACH.list.length : 0;
    const coinW = UI.badge(ctx, "◆ " + META.coins().toLocaleString(), fx + 106, cardY + 90, HUE_GOLD, "left");
    UI.badge(ctx, "⬡ " + PROFILE.shards(), fx + 106 + coinW + 10, cardY + 90, HUE_VIOLET, "left");
    uiButtons.push({ x: rx - 420, y: cardY + 30, w: 130, h: 40, size: 12, chip: true, label: "★ " + achN + (achTotal ? " / " + achTotal : ""),
      action: () => { state = "achievements"; listScroll = 0; } });
    // SHOWCASE: your three rarest earned feats as rarity seals on the passport
    if (typeof ACH !== "undefined" && ACH.list) {
      const RANK = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
      const rare3 = ACH.list.filter((a) => PROFILE.unlocked(a.id))
        .sort((a, b) => (RANK[a.rarity] ?? 5) - (RANK[b.rarity] ?? 5)).slice(0, 3);
      // drawn small, in a row left of the achievements chip
      rare3.forEach((a, i) => {
        const rr = ACH.RARITY[a.rarity] || ACH.RARITY.common, cc = ACH.CATS[a.cat] || {};
        UI.seal(ctx, rx - 560 + i * 46, cardY + 50, 16, rr.color, cc.icon || "★", false);
      });
    }
    // account actions, far right
    const bw2 = 230, bx2 = rx - bw2 - 14;
    if (signedIn) {
      const locked = !Cloud.canRename();
      uiButtons.push({ x: bx2, y: cardY + 10, w: bw2, h: 34, size: 12,
        label: locked ? "NAME LOCKED · " + Cloud.renameCooldownDays() + "d" : (Cloud.hasCustomName() ? "CHANGE NAME" : "SET DISPLAY NAME"),
        enabled: !locked, action: () => beginRenameFlow(false) });
      if (fb) uiButtons.push({ x: bx2, y: cardY + 52, w: bw2, h: 34, size: 12, label: "SIGN OUT", action: () => Cloud.signOut() });
    } else if (canIn) {
      uiButtons.push({ x: bx2, y: cardY + 28, w: bw2, h: 40, size: 13,
        label: (Cloud.authRetryPrompt ? "RETRY · " : "") + Cloud.signInLabel().toUpperCase(), action: () => Cloud.signIn() });
    }

    UI.tabs(ctx, "profile", PROFILE_TABS.map((x) => x[1]), Math.max(0, PROFILE_TABS.findIndex((x) => x[0] === profileTab)), 252, (b) => {
      const i = b._tab;
      b.action = () => { if (PROFILE_TABS[i][0] !== profileTab) { profileTab = PROFILE_TABS[i][0]; listScroll = 0; replayMsg = ""; } };
      uiButtons.push(b);
    });
    if (profileTab === "stats") profileTabStats();
    else if (profileTab === "replays") profileTabReplays();
    else profileTabBests();
    addBack();
  }

  // BESTS tab: your finest run in display type, then every record in the
  // leaderboard table language (column headers, hairline rows)
  function profileTabBests() {
    const t = UI.t, fx = W / 2 - 460, rx = W / 2 + 460;
    // collect every record you actually hold
    const recs = [];
    CONFIG.modes.forEach((m) => CONFIG.difficulties.forEach((d) => {
      const b = getBest(m.id, d.id);
      if (b.wave || b.score) recs.push({ m, d, b });
    }));
    if (!recs.length) {
      const cy = UI.emptyState(ctx, "◆", "No runs recorded yet — go make some history.", W / 2, 440);
      uiButtons.push({ x: W / 2 - 130, y: cy, w: 260, h: 46, size: 14, label: "PLAY A RUN", action: () => { state = "setup"; } });
      return;
    }
    // YOUR FINEST — the single best run you own, in display type
    recs.sort((a, b2) => (b2.b.wave - a.b.wave) || (b2.b.score - a.b.score));
    const top = recs[0];
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = UI.ink; ctx.font = UI.font(t.type.h2, true);
    ctx.fillText("WAVE " + top.b.wave + "  ·  " + top.b.score.toLocaleString() + " PTS", W / 2, 348);
    ctx.restore();
    UI.tag(ctx, "YOUR FINEST — " + (top.m.label + " · " + top.d.label).toUpperCase() + " · " + fmtTime(top.b.time || 0), W / 2, 372, SCREEN_HUES.profile, "center", t.type.micro);
    // the ledger of every record
    const thY = 412;
    ctx.save(); ctx.textAlign = "left"; ctx.fillStyle = UI.ink; ctx.font = UI.font(t.type.micro, true); ctx.globalAlpha = 0.6;
    ctx.fillText("MODE", fx, thY);
    ctx.textAlign = "right"; ctx.fillText("WAVE", rx - 320, thY); ctx.fillText("TIME", rx - 180, thY); ctx.fillText("SCORE", rx - 20, thY);
    ctx.restore(); ctx.textAlign = "left";
    UI.divider(ctx, fx, thY + 8, rx - fx, 0.12);
    let y = thY + 34;
    recs.slice(0, 10).forEach(({ m, d, b }) => {
      UI.text(ctx, m.label, fx, y, t.type.label);
      ctx.font = UI.font(t.type.label, false);
      UI.tag(ctx, d.label.toUpperCase(), fx + 150 + 14, y, (DIFF_HEAT[d.id] === null ? t.color.danger : DIFF_HEAT[d.id]) || t.color.accent, "left", t.type.micro);
      UI.text(ctx, "" + b.wave, rx - 320, y, t.type.label, "right");
      UI.text(ctx, fmtTime(b.time || 0), rx - 180, y, t.type.label, "right", t.alpha.soft);
      UI.text(ctx, b.score.toLocaleString(), rx - 20, y, t.type.label, "right");
      UI.divider(ctx, fx, y + 11, rx - fx, 0.06);
      y += 34;
    });
  }

  // STATS tab: a life in numbers — domain-coloured tiles that count up on entry,
  // plus THE JOURNEY: biomes reached + the boss pantheon
  function profileTabStats() {
    const t = UI.t;
    const RED = t.color.danger, CYN = "#13c4d6";
    const tiles = [   // [statKey, label, glyph, domainColor, fmt?]
      ["kills", "ENEMIES FELLED", "⚔", RED], ["bossKills", "BOSSES FELLED", "☠", RED], ["parries", "PERFECT PARRIES", "✦", CYN], ["deflects", "DEFLECTS", "↩", CYN],
      ["superslams", "POWER SLAMS", "⇊", RED], ["updrafts", "UPDRAFTS", "⇈", CYN], ["runs", "RUNS", "▶", HUE_GREEN], ["bestWave", "BEST WAVE", "▲", HUE_GREEN],
      ["longestRun", "LONGEST RUN", "◔", HUE_GREEN, (v) => fmtTime(v)], ["maxDamageHit", "BIGGEST HIT", "✸", RED, (v) => "" + Math.round(v)],
      ["coinsEarned", "COINS EARNED", "◆", HUE_GOLD], ["noHitWaves", "NO-HIT WAVES", "⬡", HUE_GOLD],
    ];
    const cols = 4, mx = W / 2 - 560, gap = 18, tw = (1120 - gap * (cols - 1)) / cols, th = 96;
    const k = ez(clamp(enterT / 0.5, 0, 1));   // entry count-up
    tiles.forEach(([key, label, glyph, hue, fmt], i) => {
      const x = mx + (i % cols) * (tw + gap), y = 312 + Math.floor(i / cols) * (th + gap);
      const raw = PROFILE.stat(key);
      const shown = fmt ? fmt(raw) : Math.round(raw * k).toLocaleString();
      UI.card(ctx, x, y, tw, th, false);
      ctx.fillStyle = hue; ctx.fillRect(x, y, tw, 4);
      UI.tag(ctx, glyph, x + 20, y + 40, hue, "left", 20);
      ctx.fillStyle = UI.ink; ctx.font = UI.font(t.type.h2, true); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillText("" + shown, x + tw / 2 + 8, y + 50);
      UI.tag(ctx, label, x + tw / 2, y + 78, t.color.muted, "center", t.type.micro);
    });
    // ---- THE JOURNEY: biomes reached (in cycle order) + the boss pantheon ----
    const jy = 312 + 3 * (th + gap) + 8;
    UI.sectionLabel(ctx, "THE JOURNEY", mx, jy, 1120, SCREEN_HUES.profile);
    const seen = PROFILE.stat("biomesSeen");
    let bx = mx;
    STAGES.forEach((s, i) => {
      const lit = i < seen;
      UI.tag(ctx, (lit ? "◆ " : "◇ ") + s.name.toUpperCase(), bx, jy + 34, lit ? SCREEN_HUES.profile : t.color.muted, "left", t.type.micro);
      bx += ctx.measureText((lit ? "◆ " : "◇ ") + s.name.toUpperCase()).width + 26;
    });
    let px = mx;
    BOSS_ROSTER.forEach((b) => {
      const lit = !!PROFILE.stat("kill" + b.id.charAt(0).toUpperCase() + b.id.slice(1));
      UI.tag(ctx, (lit ? "☠ " : "◇ ") + b.name.toUpperCase(), px, jy + 58, lit ? t.color.danger : t.color.muted, "left", t.type.micro);
      px += ctx.measureText((lit ? "☠ " : "◇ ") + b.name.toUpperCase()).width + 26;
    });
  }

  // the ACHIEVEMENTS menu: a shard summary, category filters, and a scrollable grid of
  // rarity-graded cards with live progress bars.
  function renderAchievements() {
    const t = UI.t;
    UI.header(ctx, "ACHIEVEMENTS", "master the blade · earn shards", eIn);

    // ---- DAILY CHALLENGES: three date-seeded bounties, resetting at local midnight ----
    const dsx = W / 2 - 560, dsw = 1120;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    UI.tag(ctx, "DAILY CHALLENGES", dsx, 150, t.color.accent, "left", t.type.micro);
    ctx.fillStyle = UI.ink; ctx.globalAlpha = 0.55; ctx.font = UI.font(t.type.micro, true); ctx.textAlign = "right";
    ctx.fillText("RESETS IN " + DAILY.resetsInText(), dsx + dsw, 150); ctx.globalAlpha = 1; ctx.textAlign = "left";
    const daily = DAILY.today(), dcw = (dsw - 2 * 16) / 3;
    daily.forEach((ch, i) => {
      const x = dsx + i * (dcw + 16), y = 162, h = 86, doneC = DAILY.isDone(ch), prog = DAILY.progress(ch);
      UI.card(ctx, x, y, dcw, h, false);
      if (doneC) { ctx.globalAlpha = 0.08; ctx.fillStyle = "#2f9e6b"; ctx.fillRect(x, y, dcw, h); ctx.globalAlpha = 1; }
      UI.accentStrip(ctx, x, y, dcw, doneC ? "#2f9e6b" : t.color.accent);
      ctx.fillStyle = UI.ink; ctx.font = UI.font(t.type.body, true); ctx.textAlign = "left";
      ctx.fillText(ch.txt(ch.goal), x + 16, y + 30);
      // progress bar
      const pbW = dcw - 130;
      ctx.globalAlpha = 0.16; ctx.fillStyle = UI.ink; ctx.fillRect(x + 16, y + 46, pbW, 6); ctx.globalAlpha = 1;
      ctx.fillStyle = doneC ? "#2f9e6b" : t.color.accent; ctx.fillRect(x + 16, y + 46, pbW * (prog / ch.goal), 6);
      ctx.fillStyle = UI.ink; ctx.globalAlpha = 0.7; ctx.font = UI.font(11, true);
      ctx.fillText(prog + " / " + ch.goal, x + 16, y + 70); ctx.globalAlpha = 1;
      // reward / done marker (right) — done gets the ledger's approval stamp
      if (doneC) UI.stamp(ctx, "✓ DONE", x + dcw - 62, y + 34, "#2f9e6b");
      else {
        ctx.textAlign = "right"; ctx.fillStyle = "#0f9fb0"; ctx.font = UI.font(t.type.lead, true);
        ctx.fillText("◆ +" + ch.shards, x + dcw - 16, y + 34);
        ctx.textAlign = "left";
      }
    });

    // ---- summary strip: shards, completion count, overall bar ----
    const total = ACH.list.length, done = PROFILE.unlockedCount();
    const sfx2 = W / 2 - 560, sw = 1120, sy = 268;
    ctx.save();
    ctx.globalAlpha = 0.06; ctx.fillStyle = UI.ink; ctx.fillRect(sfx2, sy, sw, 46); ctx.globalAlpha = 1;   // light wash, fits the paper theme
    ctx.fillStyle = t.color.accent; ctx.fillRect(sfx2, sy, 4, 46);
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#0f9fb0"; ctx.font = UI.font(22, true);   // deeper cyan reads on light
    ctx.fillText("◆ " + PROFILE.shards(), sfx2 + 22, sy + 24);
    ctx.fillStyle = UI.ink; ctx.font = UI.font(12, true);
    ctx.fillText("SHARDS", sfx2 + 22 + ctx.measureText("◆ " + PROFILE.shards()).width + 46, sy + 24);
    // completion count + a compact bar (middle)
    const barW = 180, barX = sfx2 + 260, barY = sy + 20;
    ctx.textAlign = "left"; ctx.fillStyle = UI.ink; ctx.font = UI.font(13, true);
    ctx.fillText(done + " / " + total, barX + barW + 12, sy + 24);
    ctx.globalAlpha = 0.16; ctx.fillStyle = UI.ink; ctx.fillRect(barX, barY, barW, 6); ctx.globalAlpha = 1;
    ctx.fillStyle = t.color.accent; ctx.fillRect(barX, barY, barW * (done / total), 6);
    // NEXT UP — the nearest-complete locked feats, so the screen has a purpose
    const nextUp = ACH.list.filter((a) => !PROFILE.unlocked(a.id)).sort((a, b) => ACH.progress(b) - ACH.progress(a)).slice(0, 2);
    if (nextUp.length) {
      ctx.textAlign = "right"; ctx.fillStyle = t.color.accent; ctx.font = UI.font(11, true);
      ctx.fillText("NEXT UP ▸  " + nextUp.map((a) => a.name + "  " + ACH.progressText(a)).join("   ·   "), sfx2 + sw - 22, sy + 24);
    }
    ctx.restore();
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";

    // ---- category filter chips (each shows unlocked / total) ----
    const cats = ["all"].concat(Object.keys(ACH.CATS));
    const chipW = 152, cgap = 8, cx0 = W / 2 - (cats.length * (chipW + cgap) - cgap) / 2;
    cats.forEach((c, i) => {
      const inC = c === "all" ? ACH.list : ACH.list.filter((a) => a.cat === c);
      const u = inC.filter((a) => PROFILE.unlocked(a.id)).length;
      const label = (c === "all" ? "ALL" : ACH.CATS[c].name.toUpperCase()) + "  " + u + "/" + inC.length;
      uiButtons.push({ x: cx0 + i * (chipW + cgap), y: 328, w: chipW, h: 34, chip: true, size: 10,
        label, sel: achFilter === c, action: () => { achFilter = c; listScroll = 0; } });
    });

    // ---- the grid (2 columns, scrollable) ----
    const list = achFilter === "all" ? ACH.list : ACH.list.filter((a) => a.cat === achFilter);
    const colWd = 552, rowH = 124, top = 382, fx = W / 2 - colWd - 12, viewH = H - top - 130;   // clip stops clear of BACK
    const rows = Math.ceil(list.length / 2);
    const maxScroll = Math.max(0, rows * rowH - viewH);
    listScroll = clamp(listScroll, 0, maxScroll);
    ctx.save(); ctx.beginPath(); ctx.rect(0, top - 10, W, viewH + 18); ctx.clip();
    list.forEach((a, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = fx + col * (colWd + 24), y = top + row * rowH - listScroll;
      if (y < top - rowH || y > top + viewH) return;
      const ch = rowH - 14, cat = ACH.CATS[a.cat] || {}, rar = ACH.RARITY[a.rarity] || ACH.RARITY.common;
      const unlocked = PROFILE.unlocked(a.id), prog = ACH.progress(a);
      // card body: locked = a dashed "unfilled socket"; unlocked = rarity-edged
      // card with a wash (+ a slow gold shimmer on legendaries)
      if (!unlocked) UI.card(ctx, x, y, colWd, ch, false, { dashed: true });
      else {
        UI.card(ctx, x, y, colWd, ch, false,
          { edge: rar.color, shimmer: a.rarity === "legendary" ? (uiT * 0.35) % 1 : null });
        ctx.globalAlpha = 0.07; ctx.fillStyle = rar.color; ctx.fillRect(x, y, colWd, ch); ctx.globalAlpha = 1;
        UI.spine(ctx, x, y, ch, rar.color);   // full-height rarity ribbon
      }
      // the SEAL (left): filled rarity diamond with the category mark; a grey
      // outline diamond while the feat is still locked
      const bx = x + 16, by = y + 22, bs = 58;
      UI.seal(ctx, bx + bs / 2, by + bs / 2, 24, rar.color, cat.icon || "★", !unlocked);
      // name + rarity tag + description — DARK text on the light card; locked reads muted
      const tx = bx + bs + 16;
      ctx.fillStyle = unlocked ? UI.ink : "rgba(90,92,108,0.7)"; ctx.font = UI.font(t.type.lead, true);
      ctx.fillText(a.name, tx, y + 34);
      UI.tag(ctx, rar.name, tx, y + 52, unlocked ? rar.color : "rgba(120,124,140,0.85)", "left", t.type.micro);
      ctx.fillStyle = unlocked ? "rgba(40,42,54,0.82)" : "rgba(110,112,126,0.6)"; ctx.font = UI.font(t.type.micro, false);
      ctx.fillText(a.desc.length > 52 ? a.desc.slice(0, 51) + "…" : a.desc, tx, y + 70);
      // progress bar + count (or "UNLOCKED")
      const pbX = tx, pbY = y + 86, pbW = colWd - (tx - x) - 96;
      ctx.globalAlpha = 0.16; ctx.fillStyle = UI.ink; ctx.fillRect(pbX, pbY, pbW, 5); ctx.globalAlpha = 1;
      ctx.fillStyle = unlocked ? rar.color : t.color.accent; ctx.fillRect(pbX, pbY, pbW * prog, 5);
      ctx.fillStyle = unlocked ? rar.color : "rgba(90,92,108,0.9)"; ctx.font = UI.font(10, true); ctx.textAlign = "left";
      ctx.fillText(unlocked ? "UNLOCKED" : ACH.progressText(a), pbX, pbY + 16);
      // rewards (right)
      ctx.textAlign = "right";
      ctx.font = UI.font(11, true);
      ctx.fillStyle = unlocked ? "#13c4d6" : "rgba(120,150,160,0.5)";
      ctx.fillText("◆ " + ACH.shardsFor(a) + " SHARDS", x + colWd - 16, y + 34);
      ctx.fillStyle = unlocked ? t.color.accent : "rgba(220,120,120,0.4)";
      ctx.fillText("◆ " + ACH.coinsFor(a) + " COINS", x + colWd - 16, y + 50);
      if (unlocked) {
        ctx.fillStyle = rar.color;
        ctx.font = UI.font(10, true);
        ctx.fillText("EARNED", x + colWd - 16, y + 66);
      }
      ctx.textAlign = "left";
    });
    ctx.restore();
    if (maxScroll > 0) UI.scrollHint(ctx, W / 2, top + viewH + 18, listScroll > 0, listScroll < maxScroll);
    addBack();
  }

  // the LEADERBOARDS tab: pick a mode + difficulty, see the world's best runs (or a prompt
  // to sign in / your local bests when there's no cloud). Scores are fetched async + cached.
  // ---- THE LEADERBOARDS hub: the competitive board + the replay theatre, one roof.
  // (REPLAYS folded in here as a tab — it's the watch-other-people's-runs surface,
  // the natural neighbour of the ranked board.)
  const LB_TABS = [["global", "GLOBAL"], ["feed", "FEED"]];
  function renderLeaderboards() {
    const t = UI.t;
    UI.title(ctx, "LEADERBOARDS", W / 2, 92, t.type.h1);
    ctx.fillStyle = SCREEN_HUES.leaderboards; ctx.globalAlpha = eIn; ctx.fillRect(W / 2 - 65 * eIn, 108, 130 * eIn, 3); ctx.globalAlpha = 1;
    UI.tabs(ctx, "lb", LB_TABS.map((x) => x[1]), Math.max(0, LB_TABS.findIndex((x) => x[0] === lbTab)), 124, (b) => {
      const i = b._tab;
      b.action = () => { if (LB_TABS[i][0] !== lbTab) { lbTab = LB_TABS[i][0]; listScroll = 0; replayMsg = ""; } };
      uiButtons.push(b);
    });
    if (lbTab === "feed") lbTabFeed();
    else lbTabGlobal();
    addBack();
  }

  function lbTabGlobal() {
    const t = UI.t;
    const cloud = Cloud.hasLeaderboards();
    UI.text(ctx, cloud ? "the world's finest runs" : "compete globally with an account", W / 2, 202, t.type.caption, "center", t.alpha.muted);
    // the competitive modes only (no training / debug)
    const modes = CONFIG.modes.filter((m) => !m.training && !m.debug);
    if (!lbMode || !modes.some((m) => m.id === lbMode)) lbMode = modes[0].id;
    // mode chips
    const mw = 190, mgap = 8, mx0 = W / 2 - (modes.length * (mw + mgap) - mgap) / 2;
    modes.forEach((m, i) => uiButtons.push({ x: mx0 + i * (mw + mgap), y: 224, w: mw, h: 34, chip: true, size: 11,
      label: m.label.toUpperCase(), sel: lbMode === m.id, action: () => { lbMode = m.id; } }));
    // difficulty chips
    const diffs = CONFIG.difficulties, dw = 132, dgap = 8, dx0 = W / 2 - (diffs.length * (dw + dgap) - dgap) / 2;
    diffs.forEach((d, i) => uiButtons.push({ x: dx0 + i * (dw + dgap), y: 266, w: dw, h: 32, chip: true, size: 10,
      label: d.label.toUpperCase(), sel: lbDiff === d.id, action: () => { lbDiff = d.id; } }));

    // fetch when the board changes (cached in lbData for the current key)
    const key = lbMode + "_" + lbDiff;
    if (cloud && key !== lbKey) {
      lbKey = key; lbData = null; lbLoading = true;
      Cloud.topScores(lbMode, lbDiff, 25).then((rows) => { if (lbKey === key) { lbData = rows || []; lbLoading = false; } });
    }

    const listX = W / 2 - 460, listW = 920, top = 316;
    const watchReplay = (rid) => { lbGhostMsg = "loading replay…"; Cloud.loadReplay(rid).then((rec) => { lbGhostMsg = ""; if (!enterReplay(rec, "leaderboards")) lbGhostMsg = "couldn't load that replay"; }); };

    if (!cloud) {
      const cy = UI.emptyState(ctx, "☰", "Global leaderboards need an account — your runs are waiting to count.", W / 2, top + 140);
      uiButtons.push({ x: W / 2 - 160, y: cy, w: 320, h: 46, size: 14, label: "SIGN IN VIA PROFILE",
        action: () => { state = "profile"; profileTab = "bests"; listScroll = 0; } });
    } else if (lbLoading && !lbData) {
      UI.text(ctx, "Loading the ranks…", W / 2, top + 150, t.type.body, "center", t.alpha.soft);
    } else if (!lbData || !lbData.length) {
      UI.emptyState(ctx, "☰", "No runs recorded on this board yet — set the first.", W / 2, top + 140);
    } else {
      const myId = Cloud.user ? Cloud.user.id : null;
      // ---- THE PODIUM: the top three, gold / silver / bronze ----
      const medals = ["#e0a326", "#c9ccd6", "#cd7f32"];
      const pod = [
        { r: lbData[0], x: W / 2 - 130, y: top, w: 260, h: 132, num: 52 },
        { r: lbData[1], x: W / 2 - 420, y: top + 18, w: 260, h: 114, num: 40 },
        { r: lbData[2], x: W / 2 + 160, y: top + 28, w: 260, h: 104, num: 40 },
      ];
      pod.forEach((p, i) => {
        if (!p.r) return;
        const mine = myId && p.r.uid === myId;
        UI.card(ctx, p.x, p.y, p.w, p.h, false, { edge: medals[i] });
        ctx.globalAlpha = 0.08; ctx.fillStyle = medals[i]; ctx.fillRect(p.x, p.y, p.w, p.h); ctx.globalAlpha = 1;
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        ctx.fillStyle = medals[i]; ctx.font = UI.font(p.num, true);
        ctx.fillText("" + (i + 1), p.x + 18, p.y + p.h / 2 + p.num * 0.36);
        const nx = p.x + 24 + ctx.measureText("" + (i + 1)).width + 14;
        ctx.fillStyle = mine ? t.color.accent : UI.ink; ctx.font = UI.font(t.type.body, true);
        ctx.fillText((p.r.name || "Player").slice(0, 14) + (mine ? " (you)" : ""), nx, p.y + p.h / 2 - 8);
        ctx.fillStyle = UI.ink; ctx.globalAlpha = 0.65; ctx.font = UI.font(t.type.micro, false);
        ctx.fillText("wave " + (p.r.wave || 0) + " · " + (p.r.score || 0).toLocaleString() + " pts", nx, p.y + p.h / 2 + 12);
        ctx.globalAlpha = 1;
        if (p.r.replayId) uiButtons.push({ x: p.x + p.w - 58, y: p.y + p.h - 40, w: 48, h: 30, size: 11, label: "▶",
          action: () => watchReplay(p.r.replayId) });
      });
      // legacy: boards whose rows predate linked replays still get the #1 ghost
      if (!lbData.some((r) => r.replayId)) {
        uiButtons.push({ x: W / 2 - 130, y: top + 138, w: 260, h: 28, size: 11, label: lbGhostMsg || "▶  WATCH THE #1 RUN",
          action: () => { lbGhostMsg = "loading replay…"; Cloud.loadGhost(lbMode, lbDiff).then((g) => { lbGhostMsg = ""; if (!enterReplay(g, "leaderboards")) lbGhostMsg = "no replay yet"; }); } });
      } else if (lbGhostMsg) UI.text(ctx, lbGhostMsg, W / 2, top + 152, t.type.micro, "center", t.alpha.muted);

      // ---- the table: ranks 4+ ----
      const thY = top + 176;
      ctx.save(); ctx.textAlign = "left"; ctx.fillStyle = UI.ink; ctx.font = UI.font(t.type.micro, true); ctx.globalAlpha = 0.6;
      ctx.fillText("#", listX + 14, thY); ctx.fillText("PLAYER", listX + 70, thY);
      ctx.textAlign = "right"; ctx.fillText("WAVE", listX + listW - 320, thY); ctx.fillText("TIME", listX + listW - 180, thY); ctx.fillText("SCORE", listX + listW - 20, thY);
      ctx.restore(); ctx.textAlign = "left";
      UI.divider(ctx, listX, thY + 8, listW, 0.12);
      let y = thY + 32;
      lbData.slice(3, 10).forEach((r, i) => {
        const mine = myId && r.uid === myId, rank = i + 4;
        if (mine) { ctx.save(); ctx.globalAlpha = 0.1; ctx.fillStyle = t.color.accent; ctx.fillRect(listX, y - 20, listW, 30); ctx.restore(); }
        ctx.textAlign = "left"; ctx.font = UI.font(t.type.label, true);
        ctx.fillStyle = UI.ink; ctx.fillText(rank, listX + 14, y);
        ctx.fillStyle = mine ? t.color.accent : UI.ink; ctx.font = UI.font(t.type.label, mine);
        ctx.fillText((r.name || "Player").slice(0, 22) + (mine ? "  (you)" : ""), listX + 70, y);
        if (r.replayId) {
          const rid = r.replayId;
          uiButtons.push({ x: listX + listW - 470, y: y - 18, w: 54, h: 26, size: 11, label: "▶", action: () => watchReplay(rid) });
        }
        ctx.textAlign = "right"; ctx.fillStyle = UI.ink; ctx.font = UI.font(t.type.label, false);
        ctx.fillText("" + (r.wave || 0), listX + listW - 320, y);
        ctx.fillText(fmtTime(r.time || 0), listX + listW - 180, y);
        ctx.font = UI.font(t.type.label, true); ctx.fillText("" + (r.score || 0), listX + listW - 20, y);
        UI.divider(ctx, listX, y + 8, listW, 0.06);
        y += 34;
      });
      ctx.textAlign = "left";
      // ---- YOUR RANK, pinned: where you stand even when you're off-screen ----
      const myIdx = myId ? lbData.findIndex((r) => r.uid === myId) : -1;
      if (myId && myIdx >= 10) {
        const r = lbData[myIdx];
        ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = t.color.accent; ctx.fillRect(listX, y - 18, listW, 30); ctx.restore();
        UI.tag(ctx, "#" + (myIdx + 1) + "  YOU", listX + 14, y + 2, t.color.accent, "left", t.type.label);
        UI.text(ctx, "wave " + (r.wave || 0) + "   ·   " + fmtTime(r.time || 0) + "   ·   " + (r.score || 0) + " pts", listX + listW - 20, y + 2, t.type.label, "right", t.alpha.soft);
      } else if (myId && myIdx === -1) {
        const b = getBest(lbMode, lbDiff);
        UI.text(ctx, (b.wave || b.score) ? "unranked here — your local best: wave " + b.wave + " · " + b.score + " pts" : "unranked here — no local record yet",
          W / 2, y + 4, t.type.micro, "center", t.alpha.muted);
      }
    }
  }

  // ---- shared replay-row pieces (used by the Leaderboards FEED tab and the
  // Profile REPLAYS vault) ----
  function drawReplayThumb(x, y, data) {   // 128x72 thumbnail (or a blank slate)
    ctx.save(); ctx.fillStyle = "#0e1017"; ctx.globalAlpha = 0.15; ctx.fillRect(x, y, 128, 72); ctx.globalAlpha = 1;
    if (data) {
      let img = replayThumbs[data];
      if (!img) { img = replayThumbs[data] = new Image(); img.src = data; }
      if (img.complete && img.naturalWidth) ctx.drawImage(img, x, y, 128, 72);
    }
    ctx.strokeStyle = UI.ink; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.strokeRect(x, y, 128, 72); ctx.restore();
  }
  function replayRowCard(listX, listW, y, sum, thumb, spineColor) {
    const t = UI.t, rowH = 96;
    UI.card(ctx, listX, y, listW, rowH - 12, false);
    if (spineColor) UI.spine(ctx, listX, y, rowH - 12, spineColor);
    drawReplayThumb(listX + 12, y + 6, thumb);
    const modeLabel = (CONFIG.modes.find((m) => m.id === sum.mode) || {}).label || sum.mode || "?";
    ctx.textAlign = "left"; ctx.fillStyle = UI.ink; ctx.font = UI.font(t.type.lead, true);
    ctx.fillText((sum.name || "You") + "   —   " + modeLabel + " · " + (sum.diff || ""), listX + 156, y + 30);
    ctx.font = UI.font(t.type.caption, false); ctx.globalAlpha = 0.75;
    ctx.fillText("wave " + (sum.wave || 0) + "   ·   " + (sum.score || 0) + " pts" + (sum.won ? "   ·   ★ victory" : ""), listX + 156, y + 54);
    ctx.globalAlpha = 1;
  }

  // ---- the FEED tab (Leaderboards hub): the world's published runs ----
  // NOTE: future social/feed work (reactions, view counts, broadcast, filters)
  // belongs HERE — the menu is capped at six rails; grow the hubs, not the rail.
  // (Your own recordings live in PROFILE ▸ REPLAYS.)
  function lbTabFeed() {
    const t = UI.t;
    UI.text(ctx, "published runs from every blade — yours share from PROFILE ▸ REPLAYS", W / 2, 202, t.type.caption, "center", t.alpha.muted);
    if (replayMsg) UI.text(ctx, replayMsg, W / 2, 232, t.type.caption, "center", t.alpha.muted);
    const listX = W / 2 - 560, listW = 1120, top = 254, rowH = 96, viewH = H - top - 110;
    if (!Cloud.hasLeaderboards()) {
      const cy = UI.emptyState(ctx, "▶", "The global feed needs an account.", W / 2, top + 150);
      uiButtons.push({ x: W / 2 - 160, y: cy, w: 320, h: 46, size: 14, label: "SIGN IN VIA PROFILE",
        action: () => { state = "profile"; profileTab = "bests"; listScroll = 0; } });
      return;
    }
    if (replayFeedData === null && !replayFeedLoading) {
      replayFeedLoading = true;
      Cloud.replayFeed(20).then((rows) => { replayFeedData = rows || []; replayFeedLoading = false; });
    }
    if (replayFeedLoading && !replayFeedData) UI.text(ctx, "Loading the feed…", W / 2, top + 120, t.type.body, "center", t.alpha.soft);
    else if (!replayFeedData || !replayFeedData.length) UI.emptyState(ctx, "▶", "Nothing published yet — be the first.", W / 2, top + 150);
    else {
      const rows = replayFeedData;
      const maxScroll = Math.max(0, rows.length * rowH - viewH);
      listScroll = clamp(listScroll, 0, maxScroll);
      ctx.save(); ctx.beginPath(); ctx.rect(0, top - 8, W, viewH + 16); ctx.clip();
      rows.forEach((r, i) => {
        const y = top + i * rowH - listScroll;
        if (y + rowH < top - 8 || y > top + viewH) return;
        replayRowCard(listX, listW, y, r, r.thumb, r.lb ? SCREEN_HUES.leaderboards : UI.t.color.accent);
        ctx.textAlign = "left"; ctx.fillStyle = UI.ink; ctx.globalAlpha = 0.5; ctx.font = UI.font(11, false);
        ctx.fillText(new Date(r.createdAt || 0).toLocaleDateString() + (r.lb ? "   ·   LEADERBOARD RUN" : ""), listX + 156, y + 72); ctx.globalAlpha = 1;
        uiButtons.push({ x: listX + listW - 140, y: y + 20, w: 120, h: 40, size: 12, label: "▶  WATCH",
          action: () => { replayMsg = "loading replay…"; Cloud.loadReplay(r.shareId).then((rec) => { replayMsg = ""; if (!enterReplay(rec, "leaderboards")) replayMsg = "couldn't load that replay"; }); } });
      });
      ctx.restore();
      if (maxScroll > 0) UI.scrollHint(ctx, W / 2, top + viewH + 20, listScroll > 0, listScroll < maxScroll);
    }
  }

  // ---- the REPLAYS tab (Profile hub): MY VAULT — your own recorded runs ----
  function profileTabReplays() {
    const t = UI.t;
    if (replayMsg) UI.text(ctx, replayMsg, W / 2, 306, t.type.caption, "center", t.alpha.muted);
    const listX = W / 2 - 560, listW = 1120, top = 322, rowH = 96, viewH = H - top - 110;
    const idx = VAULT.index();
    if (!idx.length) {
      const cy = UI.emptyState(ctx, "▶", "No runs recorded yet — every real run lands here automatically.", W / 2, top + 140);
      uiButtons.push({ x: W / 2 - 130, y: cy, w: 260, h: 46, size: 14, label: "PLAY A RUN",
        action: () => { state = "setup"; } });
      return;
    }
    const maxScroll = Math.max(0, idx.length * rowH - viewH);
    listScroll = clamp(listScroll, 0, maxScroll);
    ctx.save(); ctx.beginPath(); ctx.rect(0, top - 8, W, viewH + 16); ctx.clip();
    idx.forEach((e, i) => {
      const y = top + i * rowH - listScroll;
      if (y + rowH < top - 8 || y > top + viewH) return;
      replayRowCard(listX, listW, y, e.sum || {}, e.sum && e.sum.thumb, e.pin ? SCREEN_HUES.leaderboards : null);
      // date + pin state
      ctx.textAlign = "left"; ctx.fillStyle = UI.ink; ctx.globalAlpha = 0.5; ctx.font = UI.font(11, false);
      ctx.fillText(new Date(e.ts).toLocaleDateString() + (e.shareId ? "   ·   PUBLISHED" : ""), listX + 156, y + 72); ctx.globalAlpha = 1;
      // actions
      const b = (x, w, label, sel, action) => uiButtons.push({ x, y: y + 20, w, h: 40, size: 12, label, sel, action });
      b(listX + listW - 392, 110, "▶  WATCH", false, () => { const rec = VAULT.get(e.id); if (rec) enterReplay(rec, "profile"); else replayMsg = "couldn't load that recording"; });
      b(listX + listW - 274, 78, e.pin ? "★" : "PIN", e.pin, () => { if (!VAULT.pin(e.id, !e.pin)) replayMsg = "pin limit reached (10)"; });
      b(listX + listW - 188, 96, e.shareId ? "SHARED" : "SHARE", !!e.shareId, () => {
        if (e.shareId || !Cloud.hasLeaderboards()) { replayMsg = e.shareId ? "already on the global feed" : "sharing needs the online layer"; return; }
        replayMsg = "publishing…";
        const rec = VAULT.get(e.id);
        Cloud.publishReplay(rec, null).then((sid) => { if (sid) { VAULT.setShareId(e.id, sid); replayMsg = "published to the global feed ✓"; } else replayMsg = "publish failed — try again"; });
      });
      b(listX + listW - 84, 64, "✕", false, () => { VAULT.remove(e.id); });
    });
    ctx.restore();
    if (maxScroll > 0) UI.scrollHint(ctx, W / 2, top + viewH + 20, listScroll > 0, listScroll < maxScroll);
  }

  // ---- GHOST REPLAY 2.0: reconstruct the run — right biome, real enemies, real transport ----
  function enterReplay(data, from) {
    if (!data || !GHOST.begin(data)) return false;
    replayCtx = { data, from: from || "menu", stage: -1, platforms: [], puppets: {}, info: false };
    state = "replay"; document.exitPointerLock();
    return true;
  }
  function exitReplay() { GHOST.end(); const f = replayCtx ? replayCtx.from : "menu"; replayCtx = null; state = f; }

  // a draw-only stand-in built from the recorded spawn info: the real entity class
  // (bestiary-style) so it looks pixel-identical, but its update() is never called.
  function puppetFor(sp) {
    try {
      let e;
      if (sp.k === "boss") { e = bossById(sp.b || "warden"); }
      else {
        switch (sp.k) {
          case "ranged": e = new Ranged(0, 0); break;
          case "flyer": e = new Flyer(0, 200); break;
          case "bomber": e = new Bomber(0, 0); break;
          case "armored": e = new Armored(0, 0); break;
          case "priest": case "herald": case "mender": case "anchor": e = new Support(0, 0, sp.k); break;
          case "wraith": e = new Wraith(0, 220); break;
          case "chimera": e = new Chimera(0, 0); break;
          default: e = new Charger(0, 0);
        }
        if (sp.vn && VARIANTS[e.kind]) { const v = VARIANTS[e.kind].find((x) => x.name === sp.vn); if (v) try { applyVariant(e, v); } catch (er) {} }
      }
      e.spawnT = 0; e.hpDisplay = e.hp;
      return e;
    } catch (e) { return null; }
  }

  function renderReplay() {
    if (!replayCtx) { state = "menu"; return; }
    const t = UI.t, d = replayCtx.data, cyan = CONFIG.colors.perfect;
    GHOST.update(lastUiDt);
    // biome AT TIME t (fixes the frozen-backdrop bug) — rebuild platforms on change
    const si = ((GHOST.stageAt() || 0) % STAGES.length + STAGES.length) % STAGES.length;
    if (si !== replayCtx.stage) { replayCtx.stage = si; replayCtx.platforms = stagePlatforms(si); }
    const stage = stageAt(si);
    const pose = GHOST.pose();
    THEME.set(stage.bg); UI.ink = THEME.ink;
    const sr = screenRect();
    ctx.fillStyle = stage.bg; ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
    Backdrop.draw(ctx, stage, uiT, pose ? pose.x : W / 2);
    for (const p of replayCtx.platforms) Backdrop.platform(ctx, p, stage, !!p.floor);
    // ---- recorded FX beats: deaths burst, parries ring (skipped silently on seek) ----
    const crossed = GHOST.crossed();
    for (const ev of crossed.events) {
      if (ev.k === "parry") { FX.ring(ev.x, ev.y, 10, cyan); }
      else if (ev.k === "superslam" || ev.k === "slam") { FX.ring(ev.x, ev.y, 12, CONFIG.colors.slam); }
      else if (ev.k === "bossKill") { FX.explode(ev.x, ev.y, cyan, 1.6); }
      else if (ev.k === "revive") { FX.ring(ev.x, ev.y, 16, cyan); }
    }
    for (const de of crossed.deaths) {
      const sp = GHOST.spawnInfo(de.id), pu = sp && replayCtx.puppets[de.id];
      if (pu) FX.death(pu.x, pu.y, 8, pu.color);
      delete replayCtx.puppets[de.id];
    }
    FX.update(lastUiDt);
    // ---- enemy puppets at time t ----
    const foes = GHOST.enemiesAt();
    ctx.save(); ctx.globalAlpha = 0.9;
    for (const f of foes) {
      let pu = replayCtx.puppets[f.id];
      if (pu === undefined) { const sp = GHOST.spawnInfo(f.id); pu = replayCtx.puppets[f.id] = sp ? puppetFor(sp) : null; }
      if (!pu) continue;
      pu.x = f.x; pu.y = f.y;
      try { pu.draw(ctx, pose || player); }
      catch (e) { ctx.fillStyle = pu.color || "#888"; ctx.fillRect(f.x - 14, f.y - 18, 28, 36); }
    }
    ctx.restore();
    FX.draw(ctx);
    // ---- the ghost hero + blade ----
    if (pose) {
      ctx.save(); ctx.globalAlpha = 0.55;
      ctx.fillStyle = THEME.ink; ctx.fillRect(pose.x - 13, pose.y - 24, 26, 48);
      ctx.fillStyle = cyan; ctx.fillRect(pose.x + pose.face * 4 - 3, pose.y - 12, 7, 6);
      ctx.globalAlpha = 0.6; ctx.strokeStyle = cyan; ctx.lineWidth = 4; ctx.lineCap = "round";
      if (!GFX.low) { ctx.shadowColor = cyan; ctx.shadowBlur = 12; }
      ctx.beginPath(); ctx.moveTo(pose.x, pose.y - 6); ctx.lineTo(pose.bx, pose.by); ctx.stroke();
      ctx.shadowBlur = 0; ctx.restore();
    }
    Backdrop.post(ctx, stage);

    // ---- top bar: identity + live wave ----
    const mode = (CONFIG.modes.find((m) => m.id === d.mode) || {}).label || d.mode;
    ctx.save();
    ctx.globalAlpha = 0.85; ctx.fillStyle = "#0e1017"; ctx.fillRect(sr.x, sr.y, sr.w, 54 + SAFE.t); ctx.globalAlpha = 1;
    ctx.fillStyle = cyan; ctx.fillRect(sr.x, sr.y, sr.w, 3);
    ctx.textAlign = "left"; ctx.fillStyle = "#f1eff9"; ctx.font = UI.font(t.type.lead, true);
    ctx.fillText("▶ REPLAY", 40 + SAFE.l, 36 + SAFE.t);
    ctx.fillStyle = "#c9ccd6"; ctx.font = UI.font(t.type.body, false);
    ctx.fillText((d.name || "Player") + "   ·   " + mode + "   ·   wave " + (d.wave || 0) + "   ·   " + (d.score || 0) + " pts" + (d.won ? "   ·   ★ VICTORY" : ""), 200 + SAFE.l, 36 + SAFE.t);
    ctx.textAlign = "right"; ctx.fillStyle = cyan; ctx.font = UI.font(t.type.label, true);
    ctx.fillText("WAVE " + GHOST.waveAt(), W - 36 - SAFE.r, 36 + SAFE.t);
    ctx.restore();

    // ---- transport bar (bottom): scrub + chapters + controls ----
    const p = GHOST.play, dur = GHOST.duration();
    const barY = H - 96 - SAFE.b, bx = 220 + SAFE.l, bw = W - 440 - SAFE.l - SAFE.r;
    ctx.save();
    ctx.globalAlpha = 0.85; ctx.fillStyle = "#0e1017"; ctx.fillRect(sr.x, barY - 18, sr.w, H - (barY - 18) + Math.max(0, -sr.y)); ctx.globalAlpha = 1;
    // scrubber (click to seek — consumed here, before handleUI)
    ctx.globalAlpha = 0.25; ctx.fillStyle = "#f1eff9"; ctx.fillRect(bx, barY, bw, 5); ctx.globalAlpha = 1;
    ctx.fillStyle = cyan; ctx.fillRect(bx, barY, bw * GHOST.progress(), 5);
    for (const ch of GHOST.chapters()) {   // chapter ticks (boss = crimson)
      const cx = bx + bw * (ch.t / Math.max(dur, 0.001));
      ctx.fillStyle = ch.boss ? CONFIG.colors.charger : "#f1eff9"; ctx.globalAlpha = ch.boss ? 0.95 : 0.55;
      ctx.fillRect(cx - 1, barY - 4, 2, 13);
    }
    ctx.globalAlpha = 1;
    // playhead knob
    const kx = bx + bw * GHOST.progress();
    ctx.fillStyle = "#f1eff9"; ctx.beginPath(); ctx.arc(kx, barY + 2.5, 7, 0, 6.2832); ctx.fill();
    // time readout
    ctx.textAlign = "right"; ctx.fillStyle = "#c9ccd6"; ctx.font = UI.font(12, true);
    ctx.fillText(fmtTime(p ? p.t : 0) + " / " + fmtTime(dur), bx + bw, barY - 10);
    ctx.restore(); ctx.textAlign = "left";
    if (Input.clicked && Input.clickY > barY - 22 && Input.clickY < barY + 26 && Input.clickX >= bx - 10 && Input.clickX <= bx + bw + 10) {
      const c = Input.takeClick();
      GHOST.seek(((c.x - bx) / bw) * dur);
    }
    // control buttons
    const cy2 = H - 66 - SAFE.b, bh2 = 44;
    const btn = (x, w, label, action) => uiButtons.push({ x, y: cy2, w, h: bh2, size: 13, label, action });
    btn(220 + SAFE.l, 64, "|◀", () => GHOST.jumpChapter(-1));
    btn(292 + SAFE.l, 96, p && p.playing ? "❚❚" : "▶", () => GHOST.toggle());
    btn(396 + SAFE.l, 64, "▶|", () => GHOST.jumpChapter(1));
    btn(468 + SAFE.l, 76, (p ? p.speed : 1) + "×", () => GHOST.cycleSpeed());
    btn(552 + SAFE.l, 84, "↺", () => { GHOST.seek(0); if (p) p.playing = true; });
    btn(W - 420 - SAFE.r, 90, replayCtx.info ? "HIDE" : "INFO", () => { replayCtx.info = !replayCtx.info; });
    uiButtons.push({ x: W - 320 - SAFE.r, y: cy2, w: 200, h: bh2, size: 13, label: "‹  BACK", action: exitReplay });
    // keyboard transport
    if (Input.pressed.has("Space")) GHOST.toggle();
    if (Input.pressed.has("ArrowLeft")) GHOST.seek((p ? p.t : 0) - 5);
    if (Input.pressed.has("ArrowRight")) GHOST.seek((p ? p.t : 0) + 5);

    // ---- INFO overlay: run summary + build ----
    if (replayCtx.info) drawReplayInfo(d);
  }

  // the INFO panel: summary numbers + the recorded final loadout
  function drawReplayInfo(d) {
    const t = UI.t, px = W - 470 - SAFE.r, py = 74 + SAFE.t, pw = 440, ph = 560;
    ctx.save();
    ctx.globalAlpha = 0.92; ctx.fillStyle = "#0e1017"; ctx.fillRect(px, py, pw, ph);
    ctx.globalAlpha = 0.8; ctx.strokeStyle = CONFIG.colors.perfect; ctx.lineWidth = 1.5; ctx.strokeRect(px, py, pw, ph);
    ctx.globalAlpha = 1; ctx.fillStyle = CONFIG.colors.perfect; ctx.fillRect(px, py, 4, ph);
    ctx.textAlign = "left"; ctx.fillStyle = "#f1eff9"; ctx.font = UI.font(t.type.lead, true);
    ctx.fillText("RUN SUMMARY", px + 20, py + 32);
    const row = (label, val, y) => {
      ctx.fillStyle = "#9fa3b4"; ctx.font = UI.font(12, false); ctx.textAlign = "left"; ctx.fillText(label, px + 20, y);
      ctx.fillStyle = "#f1eff9"; ctx.font = UI.font(13, true); ctx.textAlign = "right"; ctx.fillText("" + val, px + pw - 20, y);
    };
    let y = py + 60;
    row("PLAYER", d.name || "Player", y); y += 26;
    row("RESULT", d.won ? "VICTORY" : "wave " + (d.wave || 0), y); y += 26;
    row("SCORE", d.score || 0, y); y += 26;
    row("KILLS", d.kills != null ? d.kills : "—", y); y += 26;
    row("PEAK MULTIPLIER", "×" + (d.peak || 1), y); y += 26;
    row("TIME", fmtTime(d.time || GHOST.duration()), y); y += 34;
    ctx.textAlign = "left"; ctx.fillStyle = CONFIG.colors.perfect; ctx.font = UI.font(t.type.micro, true);
    ctx.fillText("FINAL LOADOUT", px + 20, y); y += 14;
    const kit = d.loadout || [];
    if (!kit.length) { ctx.fillStyle = "#9fa3b4"; ctx.font = UI.font(12, false); ctx.fillText("(not recorded)", px + 20, y + 18); }
    for (const it of kit.slice(0, 12)) {
      const u = UPGRADES.find((x) => x.id === it.id); if (!u) continue;
      const cat = ABIL_CATS[u.cat] || ABIL_CATS.utility;
      ctx.fillStyle = u.tiers ? SPECIAL_COLOR : cat.color; ctx.fillRect(px + 20, y + 8, 4, 22);
      ctx.fillStyle = "#f1eff9"; ctx.font = UI.font(13, true); ctx.textAlign = "left";
      ctx.fillText(u.name, px + 34, y + 24);
      ctx.fillStyle = "#9fa3b4"; ctx.font = UI.font(11, false); ctx.textAlign = "right";
      ctx.fillText(u.tiers ? "TIER " + (it.tier || 1) : (u.unique ? "UNIQUE" : "×" + (it.n || 1)), px + pw - 20, y + 24);
      y += 34;
      if (y > py + ph - 30) break;
    }
    ctx.restore(); ctx.textAlign = "left";
  }

  // one aligned grid for every settings row, shared by the Settings tab and the pause
  // panel. The control block is a FIXED width right-anchored at rx (no more ragged
  // columns): steppers put the value dead-centre between the − / + buttons, and
  // toggles/cycles span the whole block. Returns the y below the last row.
  function drawSettingsRows(fx, rx, y0, compact) {
    const t = UI.t;
    const rowH = compact ? 50 : 52, btnW = compact ? 44 : 54, btnH = compact ? 36 : 42;
    const block = compact ? 196 : 252, lo = rx - block, labelSize = compact ? t.type.body : t.type.lead;
    let y = y0;
    // full mode: a real section label + hairline that RESERVES its space (no more
    // labels colliding with row dividers); compact (pause) skips sections entirely
    const section = (name) => { if (compact) return; y = UI.sectionLabel(ctx, name, fx, y + 16, rx - fx) + 2; };
    const row = (label, drawControl) => {
      const cy = y + rowH / 2;
      UI.text(ctx, label, fx, cy + 6, labelSize);
      drawControl(cy);
      UI.divider(ctx, fx, y + rowH, rx - fx, 0.08);
      y += rowH + (compact ? 4 : 6);
    };
    const stepper = (label, valStr, dec, inc) => row(label, (cy) => {
      uiButtons.push({ x: lo, y: cy - btnH / 2, w: btnW, h: btnH, label: "−", action: dec });
      uiButtons.push({ x: rx - btnW, y: cy - btnH / 2, w: btnW, h: btnH, label: "+", action: inc });
      UI.text(ctx, valStr, (lo + rx) / 2, cy + 6, compact ? t.type.body : t.type.lead, "center");
    });
    const wide = (label, lab, sel, action) => row(label, (cy) => {
      uiButtons.push({ x: lo, y: cy - btnH / 2, w: block, h: btnH, size: compact ? 14 : 16, label: lab, sel, action });
    });
    // boolean rows use the real switch (track + sliding knob)
    const toggle = (label, on, action) => row(label, (cy) => {
      const box = { x: lo, y: cy - btnH / 2, w: block, h: btnH };
      uiButtons.push(Object.assign({ label: "", _hideBox: true, action }, box));
      UI.toggle(ctx, box, on);
    });
    const save = () => { applySettings(); saveSettings(); };
    section("AUDIO");
    stepper("Volume", Math.round(settings.vol * 100) + "%",
      () => { settings.vol = clamp(+(settings.vol - 0.1).toFixed(2), 0, 1); save(); },
      () => { settings.vol = clamp(+(settings.vol + 0.1).toFixed(2), 0, 1); save(); });
    toggle("Music", settings.music,
      () => { settings.music = !settings.music; save(); });
    section("FEEL");
    stepper("Mouse sensitivity", settings.sens.toFixed(2),
      () => { settings.sens = clamp(+(settings.sens - 0.1).toFixed(2), 0.2, 3); save(); },
      () => { settings.sens = clamp(+(settings.sens + 0.1).toFixed(2), 0.2, 3); save(); });
    stepper("Screen shake", Math.round(settings.shake * 100) + "%",
      () => { settings.shake = clamp(+(settings.shake - 0.25).toFixed(2), 0, 2); save(); },
      () => { settings.shake = clamp(+(settings.shake + 0.25).toFixed(2), 0, 2); save(); });
    section("VIDEO");
    wide("Effects", settings.gfx === "auto" ? ("AUTO (" + (GFX.low ? "LOW" : "HIGH") + ")") : (settings.gfx === "low" ? "LOW" : "HIGH"), false,
      () => { settings.gfx = settings.gfx === "auto" ? "high" : (settings.gfx === "high" ? "low" : "auto"); save(); });
    section("INPUT");
    // touch vs desktop — AUTO detects; 2-in-1 laptops and tablets can force either
    wide("Controls", settings.controls === "auto" ? ("AUTO (" + (Input.touchActive() ? "TOUCH" : "DESKTOP") + ")") : settings.controls.toUpperCase(), false,
      () => { settings.controls = settings.controls === "auto" ? "touch" : (settings.controls === "touch" ? "desktop" : "auto"); save(); });
    // how the right thumb drives the blade: radial stick (flicks = fast cuts) or mouse-like drag
    if (Input.touchActive()) wide("Touch aim", (settings.touchAim || "stick") === "stick" ? "STICK (RADIAL)" : "DRAG (RELATIVE)", false,
      () => { settings.touchAim = (settings.touchAim || "stick") === "stick" ? "drag" : "stick"; save(); });
    // (the ACCOUNT card moved to THE PROFILE hub — identity lives there now)
    return y;
  }

  function drawAccessibilityRows(fx, rx, y0) {
    const t = UI.t, m = t.metric, rowH = m.settingsRowH, btnW = m.settingsStepperW;
    const btnH = m.settingsControlH, block = m.settingsControlW, lo = rx - block;
    let y = UI.sectionLabel(ctx, "ACCESSIBILITY", fx, y0 + t.space.md, rx - fx);
    const row = (label, drawControl) => {
      const cy = y + rowH / 2; UI.text(ctx, label, fx, cy + t.space.xs, t.type.lead); drawControl(cy);
      UI.divider(ctx, fx, y + rowH, rx - fx); y += rowH;
    };
    const save = () => { applySettings(); saveSettings(); };
    row("Flash intensity", (cy) => {
      uiButtons.push({ x: lo, y: cy - btnH / 2, w: btnW, h: btnH, label: "−", action: () => { settings.flash = clamp(+((settings.flash == null ? 1 : settings.flash) - 0.25).toFixed(2), 0, 1); save(); } });
      uiButtons.push({ x: rx - btnW, y: cy - btnH / 2, w: btnW, h: btnH, label: "+", action: () => { settings.flash = clamp(+((settings.flash == null ? 1 : settings.flash) + 0.25).toFixed(2), 0, 1); save(); } });
      UI.text(ctx, Math.round((settings.flash == null ? 1 : settings.flash) * 100) + "%", (lo + rx) / 2, cy + t.space.xs, t.type.lead, "center");
    });
    row("Story scenes", (cy) => {
      uiButtons.push({ x: lo, y: cy - btnH / 2, w: block, h: btnH, size: t.type.caption,
        label: (settings.cinematics || "full").toUpperCase(),
        action: () => { settings.cinematics = settings.cinematics === "brief" ? "full" : "brief"; save(); } });
    });
    const toggle = (label, on, action) => row(label, (cy) => {
      const box = { x: lo, y: cy - btnH / 2, w: block, h: btnH };
      uiButtons.push(Object.assign({ label: "", _hideBox: true, action }, box)); UI.toggle(ctx, box, on);
    });
    toggle("Reduced camera motion", !!settings.reducedMotion, () => { settings.reducedMotion = !settings.reducedMotion; save(); });
    toggle("High-contrast tells", !!settings.highContrast, () => { settings.highContrast = !settings.highContrast; save(); });
    UI.tag(ctx, "COMBAT TIMING IS UNCHANGED", fx, y + t.space.md, t.color.muted, "left", t.type.micro);
    return y + t.space.lg + t.space.sm;
  }

  let renameContext = null, renamePrompted = false;
  function beginRenameFlow(isFirstRun) {
    if (typeof Cloud === "undefined" || !Cloud.loggedIn()) return;
    document.exitPointerLock();
    Input.textEntryMode = true;
    const input = document.getElementById("nameInput");
    input.value = PROFILE.username() || "";
    input.style.display = "block";
    input.style.color = "#eafcff";
    positionNameInput();
    setTimeout(() => { input.focus(); }, 50);
    renameContext = { error: "", isFirstRun };
    const prevState = state;
    state = "rename";
    renameContext.prevState = prevState === "rename" ? "profile" : prevState;   // identity lives in THE PROFILE now
    
    input.onkeydown = (e) => {
      if (e.key === "Enter") submitRename();
      if (e.key === "Escape") cancelRename();
    };
  }

  function submitRename() {
    const input = document.getElementById("nameInput");
    const name = input.value.trim();
    if (name.length < 3 || name.length > 16) {
      renameContext.error = "Must be 3-16 characters";
      return;
    }
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) {
      renameContext.error = "Letters, numbers, spaces, _, - only";
      return;
    }
    // Hardcoded profanity pass (basic example for V1)
    const badwords = ["fuck", "shit", "bitch", "nigg", "asshole", "cunt", "faggot", "dick"];
    const lowerName = name.toLowerCase();
    if (badwords.some(w => lowerName.includes(w))) {
      renameContext.error = "Name contains restricted words";
      return;
    }
    // Cooldown check (7 days between changes) — first-ever set is always allowed
    if (PROFILE.usernameSetAt() && !Cloud.canRename()) {
      renameContext.error = "You can only change your name once every 7 days.";
      return;
    }

    // Valid!
    Cloud.setCustomUsername(name);
    closeRename();
  }

  function cancelRename() {
    closeRename();
  }

  function closeRename() {
    const input = document.getElementById("nameInput");
    input.style.display = "none";
    input.blur();
    input.onkeydown = null;
    Input.textEntryMode = false;
    state = renameContext.prevState || "settings";
    renameContext = null;
  }

  // the name-entry box geometry (shared by the DOM <input> overlay + the drawn frame)
  const NAMEBOX = { w: 380, h: 56, get x() { return W / 2 - this.w / 2; }, get y() { return H / 2 - 8; } };
  function positionNameInput() {
    const input = document.getElementById("nameInput"); if (!input) return;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / (W + OVERSCAN.x * 2);
    input.style.left = (rect.left + (NAMEBOX.x + OVERSCAN.x) * scale) + "px";
    input.style.top = (rect.top + (NAMEBOX.y + OVERSCAN.y) * scale) + "px";
    input.style.width = (NAMEBOX.w * scale) + "px";
    input.style.height = (NAMEBOX.h * scale) + "px";
    input.style.fontSize = (26 * scale) + "px";
  }

  function renderRename() {
    const t = UI.t, cx = W / 2, cy = H / 2, sr = screenRect();
    positionNameInput();   // keep the DOM input glued to the box across resize / fullscreen
    // full dim
    ctx.fillStyle = "rgba(8,9,14,0.9)"; ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
    // modal card
    const cw = 560, ch = 320, cardX = cx - cw / 2, cardY = cy - ch / 2 - 10;
    ctx.fillStyle = "#0e1017"; ctx.fillRect(cardX, cardY, cw, ch);
    ctx.strokeStyle = t.color.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.9; ctx.strokeRect(cardX, cardY, cw, ch); ctx.globalAlpha = 1;
    ctx.fillStyle = t.color.accent; ctx.fillRect(cardX, cardY, cw, 4);   // accent header strip
    // title + subtitle
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f1eff9"; ctx.font = UI.font(t.type.h2, true);
    ctx.fillText(renameContext && renameContext.isFirstRun ? "CHOOSE YOUR NAME" : "CHANGE NAME", cx, cardY + 56);
    ctx.fillStyle = "#9fa3b4"; ctx.font = UI.font(t.type.caption, false);
    ctx.fillText("how you appear on leaderboards & replays", cx, cardY + 82);
    // input frame (the DOM <input> sits exactly on top)
    const err = renameContext && renameContext.error;
    ctx.fillStyle = "#05060a"; ctx.fillRect(NAMEBOX.x, NAMEBOX.y, NAMEBOX.w, NAMEBOX.h);
    ctx.strokeStyle = err ? "#e2503b" : t.color.accent; ctx.lineWidth = 2; ctx.strokeRect(NAMEBOX.x, NAMEBOX.y, NAMEBOX.w, NAMEBOX.h);
    // live char counter + rule/error line under the box
    const len = ((document.getElementById("nameInput") || {}).value || "").trim().length;
    ctx.textAlign = "right"; ctx.font = UI.font(11, true);
    ctx.fillStyle = (len > 16 || (len > 0 && len < 3)) ? "#e2503b" : "#6a6f80";
    ctx.fillText(len + " / 16", NAMEBOX.x + NAMEBOX.w, NAMEBOX.y + NAMEBOX.h + 20);
    ctx.textAlign = "left";
    if (err) { ctx.fillStyle = "#e2503b"; ctx.font = UI.font(t.type.caption, true); ctx.fillText(err, NAMEBOX.x, NAMEBOX.y + NAMEBOX.h + 20); }
    else { ctx.fillStyle = "#6a6f80"; ctx.font = UI.font(11, false); ctx.fillText("3–16 chars · letters, numbers, spaces, _ -", NAMEBOX.x, NAMEBOX.y + NAMEBOX.h + 20); }
    ctx.textAlign = "left";
    // buttons (INFO: rename screen renders its own dark buttons, so light ink)
    UI.ink = "#f1eff9";
    uiButtons.push({ x: cx - 170, y: cardY + ch - 66, w: 160, h: 46, size: 14, label: renameContext && renameContext.isFirstRun ? "SKIP FOR NOW" : "CANCEL", action: cancelRename });
    uiButtons.push({ x: cx + 10, y: cardY + ch - 66, w: 160, h: 46, size: 14, label: "CONFIRM", sel: true, action: submitRename });
  }

  function renderSettings() {
    const t = UI.t, m = t.metric, sh = UI.sheetRect(), fx = sh.x + m.settingsContentInset, rx = sh.x + sh.w - m.settingsContentInset;
    const colW = (rx - fx - m.settingsColumnGap) / 2, leftRx = fx + colW, rightFx = leftRx + m.settingsColumnGap;
    UI.header(ctx, "SETTINGS", "tune sound, feel, and feedback", eIn, SCREEN_HUES.settings);
    const yEnd = Math.max(drawSettingsRows(fx, leftRx, m.settingsTop, false), drawAccessibilityRows(rightFx, rx, m.settingsTop));
    // device line + a door to the full control chart (Codex ▸ Guide)
    UI.tag(ctx, (Input.touchActive() ? "TOUCH" : "DESKTOP") + " · EFFECTS " + (settings.gfx === "auto" ? "AUTO (" + (GFX.low ? "LOW" : "HIGH") + ")" : settings.gfx.toUpperCase()),
      fx, yEnd + 24, t.color.muted, "left", t.type.micro);
    uiButtons.push({ x: rx - 210, y: yEnd + 4, w: 210, h: 34, size: 12, label: "VIEW CONTROLS ▸",
      action: () => { state = "codex"; codexTab = "guide"; listScroll = 0; } });
    // PWA: the install moment (only when the browser says the app is installable)
    if (installPrompt) uiButtons.push({ x: rx - 210, y: yEnd + 46, w: 210, h: 34, size: 12, label: "⤓ INSTALL THE APP",
      action: () => { const p = installPrompt; installPrompt = null; try { p.prompt(); } catch (e) {} } });
    // Legal — a CrazyGames Basic-launch requirement: an in-game mention of Terms &
    // Privacy. Quiet micro links, not fat buttons.
    UI.text(ctx, "By playing you agree to CrazyGames' Terms of Service and Privacy Policy.",
      fx, yEnd + 56, t.type.micro, "left", t.alpha.muted);
    uiButtons.push({ x: fx, y: yEnd + 66, w: 150, h: 26, size: 10, label: "TERMS OF SERVICE",
      action: () => window.open("https://www.crazygames.com/terms-and-conditions", "_blank", "noopener") });
    uiButtons.push({ x: fx + 162, y: yEnd + 66, w: 150, h: 26, size: 10, label: "PRIVACY POLICY",
      action: () => window.open("https://www.crazygames.com/privacy", "_blank", "noopener") });
    // BACK returns to the menu, or to the pause screen when opened mid-run
    uiButtons.push({ x: W / 2 - LAY.backW / 2, y: LAY.backY, w: LAY.backW, h: LAY.backH,
      label: settingsReturn === "paused" ? "‹  BACK TO PAUSE" : "‹  BACK",
      action: () => { const r = settingsReturn; settingsReturn = "menu"; state = r; } });
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
    const t = UI.t, inst = row.inst, b = row.b, rx = x + w;
    // spine + accents wear the enemy's OWN kind colour (bosses stay danger-red)
    const ac = (inst && CONFIG.colors[inst.kind]) || (row.boss ? t.color.danger : t.color.accent);
    UI.panel(ctx, x, y, w, h);
    UI.spine(ctx, x, y, h, ac, 6);
    // your history with this foe: boss pantheon FELLED seal / per-kind tally
    if (row.boss && inst && inst.bossId && PROFILE.stat("kill" + inst.bossId.charAt(0).toUpperCase() + inst.bossId.slice(1))) {
      UI.badge(ctx, "☠ FELLED", x + w - 14, y + h - 14, "#2f9e6b", "right");
    } else if (!row.boss && inst && inst.kind && PROFILE.stat("kill_" + inst.kind)) {
      UI.badge(ctx, "FELLED ×" + PROFILE.stat("kill_" + inst.kind), x + w - 14, y + h - 14, ac, "right");
    }
    // preview (sized for the 150-tall card)
    const bw = 116, bx = x + 16, by = y + (h - 116) / 2;
    ctx.strokeStyle = t.color.disabled; ctx.lineWidth = 1.5; ctx.strokeRect(bx, by, bw, 116);
    drawCreature(inst, bx, by, bw, 116);
    // header line: name + role
    const ix = bx + bw + 20;
    ctx.fillStyle = "#000"; ctx.font = UI.font(t.type.lead, true); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    const nameW = ctx.measureText(b.name).width;
    ctx.fillText(b.name, ix, y + 30);
    UI.tag(ctx, b.role, ix + nameW + 14, y + 30, ac, "left", t.type.micro);
    // stat chips
    const hp = inst ? Math.round(inst.maxHp) : "—", dmg = inst ? Math.round(inst.contactDmg) : "—", spd = inst ? Math.round(inst.speed || 0) : "—";
    let sx = statChip(ix, y + 40, "HP", "" + hp);
    sx = statChip(sx, y + 40, row.boss ? "TOUCH" : "DMG", "" + dmg);
    if (!row.boss) sx = statChip(sx, y + 40, "SPD", "" + spd);
    // description (micro; even a 3-line wrap clears the VARIANTS row below)
    wrapLeft(b.desc, ix, y + 78, rx - ix - 24, 17, t.type.micro, t.alpha.soft);
    // variants line
    if (b.variants && b.variants !== "—") UI.tag(ctx, "VARIANTS:  " + b.variants, ix, y + h - 30, t.color.muted, "left", t.type.micro);
    // bottom line: affix chips (mobs) or a phase note (bosses)
    if (row.boss) {
      UI.tag(ctx, "MULTI-PHASE  —  attacks escalate as its health falls", ix, y + h - 12, t.color.danger, "left", t.type.micro);
    } else if (inst) {
      ctx.font = UI.font(t.type.micro, true); ctx.fillStyle = t.color.muted; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText("CAN ROLL:", ix, y + h - 12);
      let axx = ix + ctx.measureText("CAN ROLL:").width + 12;
      for (const a of AFFIXES.filter((a) => a.appliesTo(inst))) axx = affixChip(axx, y + h - 12, a.id);
    }
  }
  // BESTIARY tab (CODEX): the full enemy index, unchanged draw routine
  function codexTabBestiary() {
    const t = UI.t;
    UI.text(ctx, "every foe — what it does, its stats, and the affixes it can roll", W / 2, 186, t.type.caption, "center", t.alpha.muted);
    const cats = [["all", "ALL"], ["melee", "MELEE"], ["ranged", "RANGED"], ["air", "AIR"], ["support", "SUPPORT"], ["boss", "BOSS"]];
    const cw0 = 120, cg = 8, totalC = cats.length * cw0 + (cats.length - 1) * cg, cx0 = (W - totalC) / 2;
    cats.forEach(([id, label], i) => uiButtons.push({ x: cx0 + i * (cw0 + cg), y: 200, w: cw0, h: 30, label, size: t.type.micro, chip: true, sel: bestiaryFilter === id, action: () => { bestiaryFilter = id; listScroll = 0; } }));
    // 2-column grid of the filtered roster
    const rows = bestiary().all.filter((r) => bestiaryFilter === "all" || r.cat === bestiaryFilter);
    const cols = 2, mx = 210, gap = 24, cardW = (W - mx * 2 - gap) / cols, cardH = 150, stride = cardH + 16, top = 244, vis = 3;   // inside the sheet, clear of BACK
    const gridRows = Math.ceil(rows.length / cols), maxOff = Math.max(0, gridRows - vis);
    const off = clamp(Math.round(listScroll / stride), 0, maxOff);
    for (let r = 0; r < vis; r++) for (let c = 0; c < cols; c++) {
      const idx = (off + r) * cols + c; if (idx >= rows.length) continue;
      drawBestiaryEntry(rows[idx], mx + c * (cardW + gap), top + r * stride, cardW, cardH);
    }
    if (maxOff > 0) UI.scrollHint(ctx, W / 2, top + vis * stride - 14, off > 0, off < maxOff);
    UI.tag(ctx, "affixes: up to 3 per enemy, each ≈ (wave−1)×6% per slot — chaos scales with the wave", W / 2, top + vis * stride + 4, t.color.muted, "center", t.type.micro);
  }

  // a juicy choice card shared by the upgrade draft and the boss tier-up screen.
  // Deals in from below with a stagger; on hover it lifts, scales, and lights its
  // category accent. Hitbox stays at rest while the visual animates.
  // a selectable choice card. Normal drafts stay a large single row (including the
  // Expanded Draft fourth card); large tier-up pools switch to the compact grid.
  // to a compact GRID (rows of 4, last row centred, scrollable past 2 rows) so a tier-up
  // with MANY owned abilities stays organized instead of being cut to 3.
  function choiceCard(i, n, o) {
    const t = UI.t, grid = n > 3 && !o.normalRow;
    const cw = grid ? 300 : (n > 3 ? 300 : 322), ch = grid ? 262 : 384, gap = grid ? 24 : (n > 3 ? 24 : 34);
    let x, y0;
    if (grid) {
      const perRow = 4, row = Math.floor(i / perRow), col = i % perRow;
      const inRow = Math.min(perRow, n - row * perRow);                       // centre the last row
      const rx0 = (W - (cw * inRow + gap * (inRow - 1))) / 2;
      const rows = Math.ceil(n / perRow);
      const scroll = rows > 2 ? listScroll : 0;
      x = rx0 + col * (cw + gap);
      y0 = 196 + row * (ch + 26) - scroll;
      if (y0 + ch < 170 || y0 > H - 40) { uiButtons.push({ x, y: y0, w: cw, h: ch, _hideBox: true, enabled: false, action: o.action }); return; }
    } else {
      const total = cw * n + gap * (n - 1);
      x = (W - total) / 2 + i * (cw + gap);
      y0 = 248;
    }
    const ac = o.accent;
    // compact-mode interior metrics
    const M = grid
      ? { strip: 7, tagY: 34, nameY: 66, divY: 80, pipY: 102, descY0: 128, descYP: 142, descLH: 21, descSize: t.type.label, selY: ch - 30, footY: ch - 14, badge: 0 }
      : { strip: 9, tagY: 44, nameY: 96, divY: 110, pipY: 136, descY0: 154, descYP: 172, descLH: 25, descSize: t.type.body, selY: ch - 46, footY: ch - 24, badge: 30 };
    const hovered = (Input.mouseX >= x && Input.mouseX <= x + cw && Input.mouseY >= y0 && Input.mouseY <= y0 + ch) || i === focus;
    const a = hoverAnim["cc" + i] = lerp(hoverAnim["cc" + i] || 0, hovered ? 1 : 0, clamp(14 * lastUiDt, 0, 1));
    const ce = clamp(ez((enterT - i * 0.06) / 0.34), 0, 1);
    ctx.save();
    ctx.globalAlpha = ce;
    ctx.translate(0, (1 - ce) * 46 - a * 12);                       // deal-in from below + hover lift
    const cx = x + cw / 2, cy = y0 + ch / 2, s = 1 + a * 0.035;
    ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
    UI.card(ctx, x, y0, cw, ch, a > 0.35, { accent: ac });
    ctx.globalAlpha = ce;   // UI.card owns an internal hover wash; restore the deal-in fade for card contents
    UI.accentStrip(ctx, x, y0, cw, ac, M.strip);
    if (M.badge) {   // keybind badge for every large normal-draft card (1–4)
      UI.keyBadge(ctx, x + cw - 46, y0 + 24, M.badge, i + 1, ac);
    }
    UI.tag(ctx, o.tag, x + 22, y0 + M.tagY, o.tagColor || ac, "left", t.type.micro);
    UI.fitTitle(ctx, o.name, cx, y0 + M.nameY, cw - 44, grid ? t.type.lead : t.type.title, t.type.label);
    UI.accentStrip(ctx, cx - 28, y0 + M.divY, 56, ac, 3);
    let descY = y0 + M.descY0;
    if (o.pips) {
      UI.tierPips(ctx, cx, y0 + M.pipY, 3, o.pips.next, ac);
      descY = y0 + M.descYP;
    }
    UI.wrappedText(ctx, o.desc, cx, descY, cw - 52, M.descLH, M.descSize, "center");
    if (o.foot) UI.tag(ctx, o.foot, cx, y0 + M.footY, t.color.muted, "center", t.type.caption);
    const touch = Input.touchActive();
    const selLabel = touch ? (i === focus ? "TAP AGAIN TO CONFIRM  ✓" : "TAP TO READ") : (a > 0.5 ? "▸  SELECT" : (M.badge ? "press  [ " + (i + 1) + " ]" : ""));
    UI.tag(ctx, selLabel, cx, y0 + M.selY, (a > 0.5 || (touch && i === focus)) ? ac : t.color.muted, "center", t.type.micro);
    ctx.restore();
    uiButtons.push({ x, y: y0, w: cw, h: ch, _hideBox: true, confirm: true, action: o.action });
  }

  function renderDraft() {
    const t = UI.t;
    UI.dim(ctx, W, H, 0.84);
    UI.title(ctx, "WAVE " + run.wave + " CLEARED", W / 2, 122, t.type.display);
    UI.accentStrip(ctx, W / 2 - 80, 140, 160, t.color.accent, 3);
    UI.text(ctx, "CHOOSE AN UPGRADE  ·  press 1 / 2 / 3" + (draftChoices.length > 3 ? " / 4" : ""), W / 2, 176, t.type.caption, "center", t.alpha.muted);
    draftChoices.forEach((up, i) => {
      const cat = ABIL_CATS[up.cat] || ABIL_CATS.utility, owned = run.mods.owned[up.id] || 0, bd = abilBadge(up);
      choiceCard(i, draftChoices.length, {
        accent: up.tiers ? SPECIAL_COLOR : cat.color,
        tag: bd.label + "  ·  " + cat.name, tagColor: bd.color,
        name: up.name, desc: draftDescription(up, owned), foot: owned ? "owned ×" + owned : null,
        normalRow: true,
        action: () => chooseUpgrade(i),
      });
    });
    const charges = run.mods.draftRerolls || 0;
    uiButtons.push({ x: W / 2 - 150, y: 680, w: 300, h: UI.t.metric.btnH,
      label: "⟳  REROLL · " + charges + "  [R]", enabled: charges > 0, action: rerollDraft });
  }

  function draftDescription(up, owned) {
    if (up.id !== "fortune") return up.desc;
    const next = Math.min(5, owned + 1);
    const mult = 1 + 0.12 * next + (next >= 3 ? 0.25 : 0) + (next >= 5 ? 0.35 : 0);
    if (next < 3) return "+12% final coins. PROSPERITY unlocks at 3 stacks (×1.61).";
    if (next === 3) return "+12% final coins and unlock PROSPERITY: ×" + mult.toFixed(2) + " total coins.";
    if (next < 5) return "+12% final coins. JACKPOT unlocks at 5 stacks (×2.20).";
    return "+12% final coins and unlock JACKPOT: ×" + mult.toFixed(2) + " total coins.";
  }

  function rerollDraft() {
    if (state !== "draft" || !run.mods.draftRerolls) return;
    run.mods.draftRerolls--;
    run.specialsOffered = Math.max(0, (run.specialsOffered || 0) - draftChoices.filter((u) => u.tiers).length);
    const discarded = draftChoices.map((u) => u.id);
    draftChoices = buildDraft({ excludeIds: discarded });
    enterT = 0; focus = 0;
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
    if (up) { applyUpgrade(up, { player, blade, mods: run.mods }); GHOST.loadoutPick(up.id, run.mods.tier[up.id] || 1, run.wave); GHOST.event("pickup", player.x, player.y); }
    Input.consumeDelta();   // flush any movement built up while the cursor was free
    if (up && run.mods.reservePick && run.mode !== "tutorial" && run.mode !== "playground") {
      reserveChoices = draftChoices.filter((_, idx) => idx !== i);
      if (reserveChoices.length) { state = "reserve"; focus = 0; return; }
    }
    finishDraft();
  }

  function finishDraft() {
    // training modes have NO waves — picking an ability must never start one
    if (run.mode !== "tutorial" && run.mode !== "playground") startNextWave();
    state = "playing";
    requestLock();          // re-capture automatically (we're inside the pick gesture)
  }

  function renderReserve() {
    const t = UI.t;
    UI.dim(ctx, W, H, 0.88);
    UI.title(ctx, "RESERVE A CARD", W / 2, 122, t.type.display);
    UI.accentStrip(ctx, W / 2 - 80, 140, 160, t.color.accent, 3);
    UI.text(ctx, "THIS CARD REPLACES ONE OFFER IN YOUR NEXT NORMAL DRAFT", W / 2, 176, t.type.caption, "center", t.alpha.muted);
    reserveChoices.forEach((up, i) => {
      const cat = ABIL_CATS[up.cat] || ABIL_CATS.utility, owned = run.mods.owned[up.id] || 0, bd = abilBadge(up);
      choiceCard(i, reserveChoices.length, {
        accent: up.tiers ? SPECIAL_COLOR : cat.color,
        tag: "RESERVE · " + bd.label + " · " + cat.name, tagColor: bd.color,
        name: up.name, desc: draftDescription(up, owned), normalRow: true,
        action: () => chooseReserve(i),
      });
    });
    uiButtons.push({ x: W / 2 - 110, y: 680, w: 220, h: UI.t.metric.btnH, label: "SKIP RESERVE", action: () => chooseReserve(-1) });
  }

  function chooseReserve(i) {
    run.reservedUpgrade = i >= 0 ? reserveChoices[i] : null;
    reserveChoices = [];
    Input.consumeDelta();
    finishDraft();
  }

  // boss-kill reward: evolve one owned ability to its next tier
  function renderTierUp() {
    const t = UI.t;
    UI.dim(ctx, W, H, 0.86);
    UI.title(ctx, "THE WAY OPENS", W / 2, 122, t.type.display);
    ctx.fillStyle = t.color.accent; ctx.globalAlpha = clamp(ez(enterT / 0.3), 0, 1); ctx.fillRect(W / 2 - 80, 140, 160, 3); ctx.globalAlpha = 1;
    UI.text(ctx, "THE BOSS FALLS  ·  EVOLVE ANY ABILITY YOU OWN", W / 2, 176, t.type.caption, "center", t.alpha.muted);
    tierChoices.forEach((up, i) => {
      const cat = ABIL_CATS[up.cat] || ABIL_CATS.utility, next = (run.mods.tier[up.id] || 1) + 1;
      choiceCard(i, tierChoices.length, {
        accent: cat.color,
        tag: "EVOLVE → TIER " + next + "  ·  " + cat.name, tagColor: cat.color,
        name: up.name, desc: nextTierDesc(up, run.mods), pips: { next },
        action: () => chooseTierUp(i),
      });
    });
    // past two grid rows, the deck scrolls
    if (tierChoices.length > 8) {
      const rows = Math.ceil(tierChoices.length / 4), maxS = Math.max(0, rows * 288 - 576);
      listScroll = clamp(listScroll, 0, maxS);
      UI.scrollHint(ctx, W / 2, H - 26, listScroll > 0, listScroll < maxS);
    }
  }

  function chooseTierUp(i) {
    const up = tierChoices[i];
    if (up) { tierUp(up.id, { player, blade, mods: run.mods }); GHOST.loadoutPick(up.id, run.mods.tier[up.id] || 1, run.wave); GHOST.event("tierup", player.x, player.y); }
    Input.consumeDelta();
    if (run.mode !== "tutorial" && run.mode !== "playground") startNextWave();
    state = "playing";
    requestLock();
  }

  // ---- shared panels for the pause + defeat screens ----
  // the abilities the player is holding THIS run, specials first then by category
  function ownedAbilities() {
    const list = [];
    for (const u of UPGRADES) if ((run.mods.owned[u.id] || 0) > 0) list.push(u);
    list.sort((a, b) => ((b.tiers ? 1 : 0) - (a.tiers ? 1 : 0)) || (ABIL_CAT_ORDER.indexOf(a.cat) - ABIL_CAT_ORDER.indexOf(b.cat)));
    return list;
  }
  function drawArsenalCard(x, y, w, h, u) {
    const t = UI.t, cat = ABIL_CATS[u.cat] || ABIL_CATS.utility, special = !!u.tiers;
    const tier = run.mods.tier[u.id] || 1, count = run.mods.owned[u.id] || 1;
    UI.card(ctx, x, y, w, h, false);
    UI.accentStrip(ctx, x, y, w, special ? SPECIAL_COLOR : cat.color);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = UI.ink; ctx.font = UI.font(t.type.lead, true);
    ctx.fillText(u.name.length > 26 ? u.name.slice(0, 25) + "…" : u.name, x + 14, y + 26);
    const tag = special ? ("TIER " + tier + " / " + (u.tiers.length + 1)) : (u.unique ? "UNIQUE" : "×" + count);
    UI.tag(ctx, tag, x + w - 14, y + 24, special ? SPECIAL_COLOR : cat.color, "right", t.type.micro);
    const desc = (special && tier > 1) ? u.tiers[tier - 2].desc : u.desc;
    wrapText(desc, x + 14, y + 44, w - 28, 15, t.type.micro, "rgba(40,42,54,0.85)");
  }
  // scrollable "Your Arsenal" — every ability the player holds, with its live description
  function drawArsenalPanel(px, py, pw, ph) {
    const t = UI.t;
    UI.tag(ctx, "YOUR ARSENAL", px, py - 10, t.color.accent, "left", t.type.micro);
    const list = ownedAbilities();
    if (!list.length) { UI.text(ctx, "No abilities yet — they drop between waves.", px + pw / 2, py + 46, t.type.caption, "center", t.alpha.muted); return; }
    const cardH = 64, gap = 8, rowH = cardH + gap;
    const maxScroll = Math.max(0, list.length * rowH - ph);
    arsenalScroll = clamp(arsenalScroll + Input.takeWheel(), 0, maxScroll);
    ctx.save(); ctx.beginPath(); ctx.rect(px, py - 4, pw, ph + 8); ctx.clip();
    list.forEach((u, i) => {
      const y = py + i * rowH - arsenalScroll;
      if (y + cardH < py - 4 || y > py + ph) return;
      drawArsenalCard(px, y, pw, cardH, u);
    });
    ctx.restore();
    if (maxScroll > 0) UI.scrollHint(ctx, px + pw / 2, py + ph + 16, arsenalScroll > 0, arsenalScroll < maxScroll);
  }
  // a labelled progress row (used for both dailies and achievements)
  function drawProgressRow(px, y, pw, label, cur, goal, done, rightTxt, barCol, labelCol) {
    const t = UI.t;
    ctx.textAlign = "left"; ctx.fillStyle = labelCol || UI.ink; ctx.font = UI.font(t.type.caption, !!done);
    ctx.fillText(label.length > 40 ? label.slice(0, 39) + "…" : label, px, y + 12);
    const bw = pw - 66;
    ctx.globalAlpha = 0.15; ctx.fillStyle = UI.ink; ctx.fillRect(px, y + 20, bw, 4); ctx.globalAlpha = 1;
    ctx.fillStyle = barCol; ctx.fillRect(px, y + 20, bw * clamp(goal ? cur / goal : (done ? 1 : 0), 0, 1), 4);
    ctx.textAlign = "right"; ctx.fillStyle = barCol; ctx.font = UI.font(10, true);
    ctx.fillText(rightTxt, px + pw, y + 14); ctx.textAlign = "left";
  }
  // "This Run" — daily challenge progress + achievements earned this run / closest to it
  function drawRunProgressPanel(px, py, pw, ph) {
    const t = UI.t;
    let y = py;
    UI.tag(ctx, "DAILY CHALLENGES", px, y - 10, t.color.accent, "left", t.type.micro);
    DAILY.today().forEach((ch) => {
      const done = DAILY.isDone(ch), prog = DAILY.progress(ch);
      drawProgressRow(px, y, pw, ch.txt(ch.goal), prog, ch.goal, done, done ? "✓ +" + ch.shards : prog + " / " + ch.goal,
        done ? "#2f9e6b" : t.color.accent, done ? "#2f9e6b" : UI.ink);
      y += 38;
    });
    y += 16;
    UI.tag(ctx, "ACHIEVEMENTS", px, y - 10, t.color.accent, "left", t.type.micro);
    // earned this run (diff against the run-start snapshot), then the closest still-locked
    const snap = (run && run._achSnap) || [];
    const earned = Object.keys(PROFILE.data.ach).filter((id) => snap.indexOf(id) === -1).map((id) => ACH.byId(id)).filter(Boolean);
    const locked = ACH.list.filter((a) => !PROFILE.unlocked(a.id)).sort((a, b) => ACH.progress(b) - ACH.progress(a));
    const rows = earned.map((a) => [a, true]).concat(locked.map((a) => [a, false])).slice(0, 5);
    rows.forEach(([a, isEarned]) => {
      const rar = ACH.RARITY[a.rarity] || ACH.RARITY.common;
      drawProgressRow(px, y, pw, (isEarned ? "✓ " : "") + a.name, ACH.progress(a), 1, isEarned,
        isEarned ? "◆ +" + ACH.shardsFor(a) + "  +" + ACH.coinsFor(a) + "c" : ACH.progressText(a), isEarned ? rar.color : "#0f9fb0", isEarned ? rar.color : UI.ink);
      y += 38;
    });
    if (!rows.length) UI.text(ctx, "Keep fighting to make progress.", px + pw / 2, y + 20, t.type.caption, "center", t.alpha.muted);
  }

  // the per-wave run log (defeat screen's middle column) — scrollable
  function drawWaveLogPanel(px, py, pw, ph) {
    const t = UI.t, log = (overInfo && overInfo.log) || [];
    UI.tag(ctx, "RUN LOG", px, py - 10, t.color.accent, "left", t.type.micro);
    ctx.textAlign = "left"; ctx.fillStyle = UI.ink; ctx.font = UI.font(t.type.label, true); ctx.globalAlpha = 0.7;
    ctx.fillText("WAVE", px + 4, py + 12);
    ctx.textAlign = "right";
    ctx.fillText("TIME", px + pw - 250, py + 12); ctx.fillText("KILLS", px + pw - 120, py + 12); ctx.fillText("PEAK", px + pw - 4, py + 12);
    ctx.globalAlpha = 1; ctx.textAlign = "left";
    UI.divider(ctx, px, py + 20, pw, 0.4);
    if (!log.length) { UI.text(ctx, "No waves cleared.", px + pw / 2, py + 60, t.type.caption, "center", t.alpha.muted); return; }
    const rowH = 32, top = py + 40, viewH = ph - 44;
    const maxScroll = Math.max(0, log.length * rowH - viewH);
    arsenalScroll = clamp(arsenalScroll + Input.takeWheel(), 0, maxScroll);
    ctx.save(); ctx.beginPath(); ctx.rect(px, top - 8, pw, viewH + 16); ctx.clip();
    log.forEach((r, i) => {
      const y = top + i * rowH - arsenalScroll;
      if (y < top - rowH || y > top + viewH) return;
      ctx.textAlign = "left"; ctx.fillStyle = r.died ? CONFIG.colors.charger : UI.ink; ctx.font = UI.font(t.type.body, true);
      ctx.fillText((r.died ? "✗ " : "") + r.wave, px + 4, y);
      ctx.textAlign = "right"; ctx.fillStyle = UI.ink; ctx.font = UI.font(t.type.body, false);
      ctx.fillText((r.time || 0).toFixed(1) + "s", px + pw - 250, y);
      ctx.fillText("" + (r.kills || 0), px + pw - 120, y);
      ctx.fillStyle = trickColor(r.peak || 1); ctx.font = UI.font(t.type.body, true);
      ctx.fillText("×" + (r.peak || 1), px + pw - 4, y);
      UI.divider(ctx, px, y + 9, pw, 0.06);
    });
    ctx.restore(); ctx.textAlign = "left";
    if (maxScroll > 0) UI.scrollHint(ctx, px + pw / 2, top + viewH + 16, arsenalScroll > 0, arsenalScroll < maxScroll);
  }

  function renderPaused() {
    const t = UI.t;
    UI.dim(ctx, W, H, 0.86);
    UI.title(ctx, "PAUSED", W / 2, 78, t.type.display);
    if (run) UI.text(ctx, (run.isBossWave ? "BOSS" : "WAVE " + run.wave) + "   ·   " + run.score + " pts   ·   " + fmtTime(run.runTime),
      W / 2, 110, t.type.body, "center", t.alpha.soft);

    // ---- left column: run actions ----
    vmenu([
      { label: "RESUME", action: () => { state = "playing"; requestLock(); } },
      { label: "RESTART", action: () => startRun(run.mode, run.diff) },
      { label: "SETTINGS", action: () => { settingsReturn = "paused"; state = "settings"; } },
      { label: "MAIN MENU", action: () => { state = "confirmquit"; } },
    ], 220, 210, 280, t.metric.btnH, t.metric.btnGap);

    // ---- middle column: the player's arsenal (scrollable) ----
    drawArsenalPanel(400, 210, 640, 600);
    // ---- right column: this run's daily + achievement progress ----
    drawRunProgressPanel(1090, 210, 430, 600);
  }

  function quitRun() {
    // save progress from the last fully-cleared wave, then bail to the menu
    const completed = run.waveLog.length;
    if (completed > 0) { saveBest(run.mode, run.diff, completed, run.score, run.runTime); awardCoins(run.score); }
    if (CINEMA.active) CINEMA.cancel("quit-run"); finale = null;
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
    UI.title(ctx, "DEFEATED", W / 2, 74, t.type.display);
    UI.text(ctx, "wave " + overInfo.wave + "   ·   " + overInfo.score + " pts   ·   " + fmtTime(overInfo.time), W / 2, 106, t.type.lead, "center");
    if (overInfo.isNew) UI.tag(ctx, "★ NEW BEST", W / 2, 130, t.color.accent, "center", t.type.caption);
    else UI.text(ctx, "best: wave " + overInfo.best.wave + " · " + overInfo.best.score + " pts", W / 2, 130, t.type.caption, "center", t.alpha.muted);

    // ---- left column: coins + actions ----
    UI.tag(ctx, "REWARDS", 80, 200, t.color.accent, "left", t.type.micro);
    ctx.textAlign = "left"; ctx.fillStyle = "#0f9fb0"; ctx.font = UI.font(t.type.h2, true);
    ctx.fillText("+" + overInfo.earned, 80, 236);
    ctx.fillStyle = UI.ink; ctx.font = UI.font(t.type.caption, false); ctx.globalAlpha = 0.7;
    ctx.fillText("coins  ·  " + overInfo.coins + " total", 80, 258); ctx.globalAlpha = 1;
    const overMenu = [
      { label: "RETRY", action: () => retryRun() },
      { label: "MAIN MENU", action: () => { state = "menu"; } },
    ];
    if (lastGhost) overMenu.splice(1, 0, { label: "▶  WATCH REPLAY", action: () => enterReplay(lastGhost, "gameover") });
    vmenu(overMenu, 220, 320, 280, t.metric.btnH, t.metric.btnGap);

    // ---- middle column: the per-wave run log (scrollable) ----
    drawWaveLogPanel(400, 210, 640, 600);
    // ---- right column: this run's daily + achievement progress ----
    drawRunProgressPanel(1090, 210, 430, 600);
  }

  // Results are a separate celebration after the playable ending; the epilogue
  // never competes with score, rewards, buttons or the old sealing animation.
  function renderEnding() {
    UI.finalReward(ctx, { amount: clamp(winT / UI.t.motion.finalRewardIn, 0, 1), label: "ADVENTURE COMPLETE",
      title: "THE WORLD, RESTORED", sigil: "◇", color: CONFIG.colors.perfect,
      reward: overInfo.score + " PTS  ·  " + fmtTime(overInfo.time) + (overInfo.isNew ? "  ·  NEW BEST" : ""),
      detail: "+" + overInfo.earned + " COINS  ·  " + overInfo.coins + " TOTAL" });
    if (winT > 0.8) vmenu([
      { label: "DESCEND AGAIN", action: () => startRun("campaign", overInfo.diff || "normal") },
      { label: "MAIN MENU", action: () => { state = "menu"; } },
    ], W / 2, H / 2 + 155, 280, UI.t.metric.btnH, UI.t.metric.btnGap);
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
      b._a = a;   // smooth hover progress for styles that animate internally (ghost)
      // staggered entrance (only while a menu screen is settling in)
      const eb = ez((enterT - i * 0.025) / 0.2);
      ctx.save();
      ctx.globalAlpha = eb;
      // list-style rows (glyph/sub/pips trimmings) DON'T scale on hover — a 4%
      // zoom reads as misalignment inside a stacked column; their hover cue is
      // the accent bar + label slide. Plain buttons keep the little pop.
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const sc = (b.glyph || b.sub || b.pips) ? 1 : 1 + a * 0.04;
      ctx.translate(cx, cy + (1 - eb) * 14); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
      if (b.chip) UI.chip(ctx, b, active);
      else UI.button(ctx, b, active);
      ctx.restore();
      // (no external caret — every button style now carries its own accent bar)
    }
  }

  // unified menu/draft input: mouse hover + click, arrow/WASD nav, Enter/Space, 1/2/3
  function handleUI() {
    if (state === "playing") return;
    listScroll = clamp(listScroll + Input.takeWheel(), 0, 6000);
    const enabled = [];
    uiButtons.forEach((b, i) => { if (b.enabled !== false) enabled.push(i); });
    if (!enabled.length) { Input.takeClick(); return; }

    // mouse hover moves focus; touch gets a hit-slop so fat thumbs land
    const hitPad = Input.touchActive() ? 10 : 0;
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
      if (Input.pressed.has("Digit4")) return chooseUpgrade(3);
      if (Input.pressed.has("KeyR")) return rerollDraft();
    } else if (state === "reserve") {
      if (Input.pressed.has("Digit1")) return chooseReserve(0);
      if (Input.pressed.has("Digit2")) return chooseReserve(1);
      if (Input.pressed.has("Digit3")) return chooseReserve(2);
    }

    // controller B = back out (route to whichever button says BACK on this screen)
    if (Input.padBack) {
      Input.padBack = false;
      const back = uiButtons.find((b) => b.label && b.label.indexOf("BACK") >= 0 && b.enabled !== false);
      if (back) { SFX.ui(); back.action(); return; }
    }

    if (Input.confirmPressed()) { const b = uiButtons[focus]; if (b && b.enabled !== false) { SFX.ui(); b.action(); return; } }

    const c = Input.takeClick();
    if (c) for (let i = 0; i < uiButtons.length; i++) {
      const b = uiButtons[i];
      if (b.enabled === false || !UI.pointIn(b, c.x, c.y, hitPad)) continue;
      // touch two-step: cards marked `confirm` need a second tap (there is no hover on
      // glass — the first tap highlights the card so it can actually be read)
      if (b.confirm && Input.touchActive() && focus !== i) { focus = i; SFX.ui(); break; }
      SFX.ui(); b.action(); break;
    }
  }

  if (PANTHEON_DEBUG) window.__PANTHEON_TEST = Object.freeze({
    startMode(mode) { startRun(mode || "endless", "normal"); },
    openDraft(opts) {
      opts = Object.assign({ expanded: true, rerolls: 2, reserve: true }, opts || {});
      startRun("endless", "normal");
      run.wave = Math.max(1, run.wave); run.waveActive = false; run.spawnQueue.length = 0; enemies = [];
      run.mods.expandedDraft = !!opts.expanded; run.mods.draftRerolls = Math.max(0, opts.rerolls | 0); run.mods.reservePick = !!opts.reserve;
      draftChoices = buildDraft(); state = "draft"; document.exitPointerLock();
    },
    setOptions(opts) { Object.assign(settings, opts || {}); applySettings(); },
    startFinale() {
      startRun("campaign", "normal"); if (CINEMA.active) CINEMA.cancel("debug-final-cut");
      run.wave = STAGES.length * 10; run.score = 12345; run.runTime = 612; run.spawnQueue.length = 0; run.waveActive = false;
      run._victoryPrepared = { isNew: true, earned: 321, coins: META.coins() };
      stageIndex = STAGES.length - 1; currentStage = stageAt(stageIndex); platforms = stagePlatforms(stageIndex);
      enemies = []; projectiles = []; if (GHOST.recording()) GHOST.stopRec({ debugFinale: true });
      startAdventureFinale({ x: W / 2, y: H * 0.40 }, true);
    },
    cut() { return severFinaleAnchor(false); },
    skip() { CINEMA.requestSkip(); },
    advance() { if (CINEMA.active && CINEMA.beat) CINEMA._advance(); },   // debug: step one beat
    pause() { if (state === "playing") state = "paused"; },
    resume() { if (state === "paused") state = "playing"; },
    openSettings() { state = "settings"; settingsReturn = "menu"; },
    auditEffects() {
      const priorLow = GFX.low, result = {};
      FX.reset(); FX.setViewRect({ left: 0, top: 0, right: W, bottom: H }); GFX.low = false;
      for (let i = 0; i < 1000; i++) FX.spark(W * 0.5, H * 0.5, 1, 0, "#fff"); result.high = FX.list.length;
      FX.reset(); GFX.low = true; FX.setViewRect({ left: 0, top: 0, right: W, bottom: H });
      for (let i = 0; i < 1000; i++) FX.spark(W * 0.5, H * 0.5, 1, 0, "#fff"); result.low = FX.list.length;
      const before = FX.list.length;
      for (let i = 0; i < 50; i++) FX.spark(W * 4, H * 4, 1, 0, "#fff");
      result.offscreenAdded = FX.list.length - before; FX.reset(); GFX.low = priorLow; return result;
    },
    state() { return { game: state, cinema: CINEMA.id, beat: CINEMA.beatId, active: CINEMA.active,
      cinemaElapsed: CINEMA.elapsed, touch: Input.touchActive(),
      pad: typeof PAD === "undefined" ? null : { connected: PAD.connected, active: PAD.active,
        movingRight: Input.held.has("KeyD"), aiming: !!Input.stickAim },
      audio: { ready: !!SFX.ctx, running: !!(SFX.ctx && SFX.ctx.state === "running"), filter: !!SFX.musicFilter,
        duck: SFX._musicDuck, voidMix: SFX._voidMix },
      mode: run && run.mode, chapterBrief: chapterFlow && chapterFlow.brief,
      reducedMotion: A11Y.reducedMotion, highContrast: A11Y.highContrast, lowEffects: GFX.low,
      playerHp: player && player.hp, enemyCount: enemies && enemies.length,
      finale: finale && { phase: finale.phase, severed: finale.severed, landed: finale.landed, restoring: !!finale.restoring } }; },
  });

  requestAnimationFrame(frame);
})();

