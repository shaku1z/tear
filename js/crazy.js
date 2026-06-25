// ------- CrazyGames SDK wrapper -------
// Env-gated: every method is a safe no-op unless the game is actually running on
// CrazyGames (SDK.environment === "crazygames" | "local"). So the standalone build
// (Vercel / itch / local) behaves exactly as before — nothing here ever runs there.
// Docs: https://docs.crazygames.com/sdk/intro/  (v3)
const CG = {
  // `on`   — SDK initialised (env "crazygames" OR "local"); enables harmless lifecycle
  //          signals + cloud-save plumbing. Safe everywhere.
  // `live` — actually embedded on CrazyGames (env "crazygames"). The ONLY gate for ADS,
  //          so the standalone build (Vercel/itch/local) — where env is "local" — never
  //          shows an ad and behaves exactly as before.
  ready: false, on: false, live: false, env: "disabled", _lastAd: -1e9,
  _suspend() {}, _resume() {},   // game registers these (pause + mute audio during ads)

  async init() {
    try {
      if (window.CrazyGames && window.CrazyGames.SDK) {
        await window.CrazyGames.SDK.init();
        this.env = window.CrazyGames.SDK.environment || "disabled";
        this.on = this.env === "crazygames" || this.env === "local";
        this.live = this.env === "crazygames";
        this.ready = true;
        if (this.live) { const fs = document.getElementById("fs"); if (fs) fs.style.display = "none"; }  // CG provides its own fullscreen
      }
    } catch (e) { this.on = false; this.live = false; }
    return this.on;
  },

  _game() { return window.CrazyGames.SDK.game; },
  loadingStart() { if (this.on) try { this._game().loadingStart(); } catch (e) {} },
  loadingStop()  { if (this.on) try { this._game().loadingStop(); } catch (e) {} },
  gameplayStart() { if (this.on) try { this._game().gameplayStart(); } catch (e) {} },
  gameplayStop()  { if (this.on) try { this._game().gameplayStop(); } catch (e) {} },
  happytime()     { if (this.on) try { this._game().happytime(); } catch (e) {} },

  setHooks(suspend, resume) { this._suspend = suspend; this._resume = resume; },
  adsAvailable() { return this.live; },

  // a midgame ad at a deliberate break (e.g. a Retry). `onDone` ALWAYS runs (success or error).
  midgame(onDone) {
    const finish = () => { this._resume(); if (onDone) onDone(); };
    if (!this.live || performance.now() - this._lastAd < 45000) { if (onDone) onDone(); return; }   // be polite about frequency
    this._lastAd = performance.now(); this._suspend();
    let fired = false; const once = () => { if (fired) return; fired = true; finish(); };
    try { window.CrazyGames.SDK.ad.requestAd("midgame", { adStarted() {}, adFinished: once, adError: once }); }
    catch (e) { once(); }
  },

  // a rewarded ad: `onReward` only fires if watched to completion; `onDone(success)` always fires.
  rewarded(onReward, onDone) {
    if (!this.live) { if (onDone) onDone(false); return; }
    this._suspend();
    let fired = false;
    const ok = () => { if (fired) return; fired = true; this._resume(); if (onReward) onReward(); if (onDone) onDone(true); };
    const no = () => { if (fired) return; fired = true; this._resume(); if (onDone) onDone(false); };
    try { window.CrazyGames.SDK.ad.requestAd("rewarded", { adStarted() {}, adFinished: ok, adError: no }); }
    catch (e) { no(); }
  },

  // persistence: CrazyGames cloud save (SDK.data) when on-platform, else localStorage.
  // Writes mirror to localStorage too, so a player who later plays standalone keeps progress.
  store: {
    get(k) {
      try { if (CG.live && window.CrazyGames.SDK.data) { const v = window.CrazyGames.SDK.data.getItem(k); if (v != null) return v; } } catch (e) {}
      try { return localStorage.getItem(k); } catch (e) { return null; }
    },
    set(k, v) {
      try { if (CG.live && window.CrazyGames.SDK.data) window.CrazyGames.SDK.data.setItem(k, v); } catch (e) {}
      try { localStorage.setItem(k, v); } catch (e) {}
    },
  },
};
