// ------- Cloud: pluggable accounts + synced progress -------
// One façade, three providers chosen by environment so each build behaves correctly:
//   • CrazyGames build  -> CrazyProvider  (ONLY "Login with CrazyGames"; never auto-prompted;
//                          the CG Data module already mirrors the save to their cloud)
//   • Standalone build  -> FirebaseProvider if window.FIREBASE_CONFIG is present, else Local
//   • Everywhere else   -> LocalProvider   (offline; localStorage via CG.store)
// The CrazyGames upload therefore never contains a Google/Apple/email login (satisfying the
// platform's "remove conflicting UI" rule), and Firebase stays dormant until you paste keys.
//
// Progress model: PROFILE + META already persist locally. Cloud adds identity + a MERGE-based
// sync (take the better of local vs remote), so signing in never destroys guest progress.
const Cloud = {
  provider: null,
  user: null,           // { id, name, avatar, guest }
  status: "local",      // "local" | "guest" | "signedin"
  ready: false,
  _listeners: [],

  async init() {
    try {
      if (typeof CG !== "undefined" && CG.live) this.provider = CrazyProvider;
      else if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) this.provider = FirebaseProvider;
      else this.provider = LocalProvider;
      await this.provider.init(this);
    } catch (e) { this.provider = LocalProvider; try { await LocalProvider.init(this); } catch (e2) {} }
    this.ready = true;
    this._emit();
    return this.status;
  },

  onChange(fn) { this._listeners.push(fn); },
  _emit() { for (const f of this._listeners) { try { f(this.user, this.status); } catch (e) {} } },
  _set(user, status) { this.user = user; this.status = status; this._emit(); },

  loggedIn() { return this.status === "signedin"; },
  displayName() { return this.user ? this.user.name : "Guest"; },
  canSignIn() { return this.provider && !!this.provider.signIn && this.status !== "signedin"; },
  // label for the account button — provider decides the wording (CG vs Google)
  signInLabel() { return (this.provider && this.provider.signInLabel) || "Sign In"; },

  // USER-INITIATED ONLY (a button press) — never call this automatically
  async signIn() {
    if (!this.provider || !this.provider.signIn) return false;
    try { 
      const ok = await this.provider.signIn(this); 
      if (ok && ok.status === 'needsRetry') {
        this.authRetryPrompt = true;
        return ok;
      }
      this.authRetryPrompt = false;
      if (ok === true) await this.sync(); 
      return ok; 
    }
    catch (e) { 
      console.error('[Cloud.signIn] error:', e);
      return false; 
    }
  },
  async signOut() { if (this.provider && this.provider.signOut) { try { await this.provider.signOut(this); } catch (e) {} } },

  // merge remote <-> local, then persist both ways so progress follows the account
  async sync() {
    if (!this.provider || !this.provider.load) return;
    try {
      const remote = await this.provider.load(this);
      if (remote) {
        if (remote.profile) PROFILE.merge(remote.profile);
        if (remote.meta && META.merge) META.merge(remote.meta);
        PROFILE.save(); if (META.save) META.save();
      }
      await this.push();
    } catch (e) {}
  },
  async push() {
    if (!this.provider || !this.provider.save) return;
    try { await this.provider.save(this, { profile: PROFILE.data, meta: META.data }); } catch (e) {}
  },

  // ---- leaderboards (delegates to the provider; null => the UI shows local bests) ----
  hasLeaderboards() { return !!(this.provider && this.provider.submitScore); },
  async submitScore(mode, diff, entry) {
    if (!this.provider || !this.provider.submitScore) return false;
    entry.name = this.displayName();
    try { return await this.provider.submitScore(this, mode, diff, entry); } catch (e) { return false; }
  },
  async topScores(mode, diff, n) {
    if (!this.provider || !this.provider.topScores) return null;
    try { return await this.provider.topScores(this, mode, diff, n); } catch (e) { return null; }
  },

  // ---- telemetry: fire-and-forget balancing events (drop-off waves, momentum, deaths) ----
  logEvent(name, data) {
    if (!this.provider || !this.provider.logEvent) return;
    try { this.provider.logEvent(this, name, data || {}); } catch (e) {}
  },

  // ---- ghost runs: the global top run's replay packet, one per board ----
  async submitGhost(mode, diff, data) {
    if (!this.provider || !this.provider.submitGhost) return false;
    try { return await this.provider.submitGhost(this, mode, diff, data); } catch (e) { return false; }
  },
  async loadGhost(mode, diff) {
    if (!this.provider || !this.provider.loadGhost) return null;
    try { return await this.provider.loadGhost(this, mode, diff); } catch (e) { return null; }
  },
};

// ---- LocalProvider: no account, offline. The always-safe baseline. ----
const LocalProvider = {
  async init(C) { C._set({ id: "local", name: "Guest", guest: true }, "guest"); },
  // no remote store; PROFILE/META already persist to localStorage
};

// ---- CrazyProvider: CrazyGames account. Only CG login; the Data module handles storage. ----
const CrazyProvider = {
  signInLabel: "Log in with CrazyGames",
  _sdkUser() { try { return window.CrazyGames.SDK.user; } catch (e) { return null; } },
  async init(C) {
    const u = this._sdkUser();
    if (!u) { C._set({ id: "cg", name: "Guest", guest: true }, "guest"); return; }
    try {
      const user = await u.getUser();
      if (user) C._set({ id: user.__dangerousUserId, name: user.username, avatar: user.profilePictureUrl, guest: false }, "signedin");
      else C._set({ id: "cg", name: "Guest", guest: true }, "guest");
    } catch (e) { C._set({ id: "cg", name: "Guest", guest: true }, "guest"); }
    // a guest logging in mid-session -> follow the logged-in flow (CG syncs the save for us)
    try {
      u.addAuthListener(async (newUser) => {
        if (newUser) { C._set({ id: newUser.__dangerousUserId, name: newUser.username, avatar: newUser.profilePictureUrl, guest: false }, "signedin"); await Cloud.sync(); }
      });
    } catch (e) {}
  },
  async signIn(C) {
    const u = this._sdkUser(); if (!u) return false;
    try { const user = await u.showAuthPrompt(); if (user) { C._set({ id: user.__dangerousUserId, name: user.username, avatar: user.profilePictureUrl, guest: false }, "signedin"); return true; } }
    catch (e) {}
    return false;
  },
  // storage is the CG Data module (already wired through CG.store) — no extra sync needed
  async load() { return null; },
  async save() {},
};

// ---- FirebaseProvider: standalone accounts + Firestore sync. Dormant until FIREBASE_CONFIG. ----
// Loads the Firebase SDK on demand (only off-CrazyGames), so the CG build never ships it.
// Anonymous auth = guest; Google sign-in on a button; users/{uid} holds the merged profile.
const FirebaseProvider = {
  signInLabel: "Sign in with Google",
  app: null, auth: null, db: null, uid: null,
  async _ensureSdk() {
    if (window.firebase && window.firebase.auth) return true;
    // dynamically pull the compat SDK (kept out of index.html so it never lands in the CG zip)
    const load = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const V = "10.12.2";
    try {
      await load(`https://www.gstatic.com/firebasejs/${V}/firebase-app-compat.js`);
      await load(`https://www.gstatic.com/firebasejs/${V}/firebase-auth-compat.js`);
      await load(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore-compat.js`);
      try { await load(`https://www.gstatic.com/firebasejs/${V}/firebase-remote-config-compat.js`); } catch (e) {}   // optional live tuning
      return !!(window.firebase && window.firebase.auth);
    } catch (e) { return false; }
  },
  async init(C) {
    C._set({ id: "local", name: "Guest", guest: true }, "guest");   // optimistic default while the SDK loads
    if (!(await this._ensureSdk())) return;
    try {
      this.app = window.firebase.initializeApp(window.FIREBASE_CONFIG);
      this.auth = window.firebase.auth();
      this.db = window.firebase.firestore();
      // auto-detect long-polling: Firestore's default WebChannel streaming is blocked by
      // some proxies / embedded webviews (incl. the CrazyGames iframe); this falls back
      // to long-polling automatically so reads/writes still work everywhere.
      try { this.db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) {}
      this._initRemoteConfig();   // live balance knobs (non-blocking; defaults to no change)
      this.auth.onAuthStateChanged(async (u) => {
        if (!u) return;
        this.uid = u.uid;
        const guest = u.isAnonymous;
        C._set({ id: u.uid, name: u.displayName || (guest ? "Guest" : "Player"), avatar: u.photoURL, guest }, guest ? "guest" : "signedin");
        await Cloud.sync();
      });
      if (!this.auth.currentUser) await this.auth.signInAnonymously();   // guest identity so progress has a home
    } catch (e) {}
  },
  // Firebase Remote Config -> the REMOTE balance knobs. Non-blocking; on any failure the
  // in-app defaults (all 1.0) stand, so the game is never affected by RC being absent.
  _initRemoteConfig() {
    try {
      if (!window.firebase || !window.firebase.remoteConfig) return;
      const rc = window.firebase.remoteConfig();
      rc.settings = { minimumFetchIntervalMillis: 3600000, fetchTimeoutMillis: 8000 };   // refresh at most hourly
      rc.defaultConfig = { coinMult: 1, enemyHpMult: 1, enemyDensityMult: 1, scoreMult: 1 };
      rc.fetchAndActivate().then(() => {
        for (const k of Object.keys(REMOTE)) { const v = rc.getValue(k).asNumber(); if (isFinite(v) && v > 0) REMOTE[k] = v; }
      }).catch(() => {});
    } catch (e) {}
  },
  async signIn(C) {
    if (!this.auth || !window.firebase) return false;
    try {
      const provider = new window.firebase.auth.GoogleAuthProvider();
      // if currently anonymous, LINK so the guest's progress carries into the Google account
      const cur = this.auth.currentUser;
      let res;
      if (cur && cur.isAnonymous) { 
        if (this._retryMerge) {
          this._retryMerge = false;
          res = await this.auth.signInWithPopup(provider);
        } else {
          try { 
            res = await cur.linkWithPopup(provider); 
          } catch (e) { 
            console.error('[signIn] linkWithPopup failed:', e.code, e.message);
            if (e.code === 'auth/credential-already-in-use') {
              this._retryMerge = true;
              return { status: 'needsRetry', code: e.code };
            }
            return false; 
          }
        }
      }
      else res = await this.auth.signInWithPopup(provider);
      const u = res.user; this.uid = u.uid;
      C._set({ id: u.uid, name: u.displayName || "Player", avatar: u.photoURL, guest: false }, "signedin");
      return true;
    } catch (e) { 
      console.error('[signIn] failed:', e.code, e.message);
      return false; 
    }
  },
  async signOut() { try { if (this.auth) await this.auth.signOut(); } catch (e) {} },
  async load() {
    if (!this.db || !this.uid) return null;
    try { const doc = await this.db.collection("users").doc(this.uid).get(); return doc.exists ? doc.data() : null; }
    catch (e) { return null; }
  },
  async save(C, payload) {
    if (!this.db || !this.uid) return;
    try { await this.db.collection("users").doc(this.uid).set(payload, { merge: true }); } catch (e) {}
  },
  // resolve a promise or bail after ms (Firestore can hang if the DB/rules aren't ready)
  _race(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms || 9000))]); },
  // leaderboards: one doc per player per board (mode_diff), keyed by uid, keep the best
  async submitScore(C, mode, diff, entry) {
    if (!this.db || !this.uid) return false;
    const ref = this.db.collection("leaderboards").doc(mode + "_" + diff).collection("scores").doc(this.uid);
    try {
      const cur = await this._race(ref.get(), 9000);
      if (cur.exists && (cur.data().score || 0) >= entry.score) return false;   // only improve
      await this._race(ref.set({ name: entry.name || "Player", score: entry.score | 0, wave: entry.wave | 0, time: Math.round(entry.time || 0), uid: this.uid, ts: Date.now() }), 9000);
      return true;
    } catch (e) { return false; }
  },
  async topScores(C, mode, diff, n) {
    if (!this.db) return null;
    try {
      const snap = await this._race(this.db.collection("leaderboards").doc(mode + "_" + diff).collection("scores").orderBy("score", "desc").limit(n || 25).get(), 9000);
      return snap.docs.map((d) => d.data());
    } catch (e) { return null; }
  },
  // telemetry: an append-only event doc (developer reads these in the console for balancing)
  logEvent(C, name, data) {
    if (!this.db) return;
    try { this.db.collection("telemetry").add(Object.assign({ event: name, uid: this.uid || null, ts: Date.now() }, data)); } catch (e) {}
  },
  // ghosts: one doc per board holding the current GLOBAL top run's replay packet
  async submitGhost(C, mode, diff, data) {
    if (!this.db || !this.uid) return false;
    const ref = this.db.collection("ghosts").doc(mode + "_" + diff);
    try {
      const cur = await this._race(ref.get(), 9000);
      if (cur.exists && (cur.data().score || 0) >= (data.score || 0)) return false;   // keep only the best run's ghost
      await this._race(ref.set(data), 9000);
      return true;
    } catch (e) { return false; }
  },
  async loadGhost(C, mode, diff) {
    if (!this.db) return null;
    try { const doc = await this._race(this.db.collection("ghosts").doc(mode + "_" + diff).get(), 9000); return doc.exists ? doc.data() : null; }
    catch (e) { return null; }
  },
};
