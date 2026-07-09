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
  _set(user, status, silent) { this.user = user; this.status = status; if (!silent) this._emit(); },

  loggedIn() { return this.status === "signedin"; },
  displayName() { 
    if (this.provider === CrazyProvider) return this.user ? this.user.name : "Guest";
    if (this.user && this.user.customUsername) return this.user.customUsername;
    return "Player"; 
  },
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
  async setCustomUsername(name) {
    if (!this.user || !this.provider) return;
    this.user.customUsername = name;
    this.user.usernameSetAt = Date.now();
    this._emit();
    await this.push();
  },

  async sync() {
    if (!this.provider || !this.provider.load) return;
    try {
      const remote = await this.provider.load(this);
      if (remote) {
        if (remote.username && this.user) {
          this.user.customUsername = remote.username;
          this.user.usernameSetAt = remote.usernameSetAt || 0;
        }
        if (remote.profile) PROFILE.merge(remote.profile);
        if (remote.meta && META.merge) META.merge(remote.meta);
        PROFILE.save(); if (META.save) META.save();
      }
      this._emit();
      await this.push();
    } catch (e) {}
  },
  async push() {
    if (!this.provider || !this.provider.save) return;
    const payload = { profile: PROFILE.data, meta: META.data };
    if (this.user && this.user.customUsername) {
      payload.username = this.user.customUsername;
      payload.usernameSetAt = this.user.usernameSetAt || 0;
    }
    try { await this.provider.save(this, payload); } catch (e) {}
  },

  // ---- the SHARED layer (leaderboards / replays / telemetry) rides the Replay Passport
  // on EVERY build — the account provider above only owns identity + save-state. This is
  // what lights leaderboards and replays up on CrazyGames too (see Passport below).
  hasLeaderboards() { return !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey); },
  async submitScore(mode, diff, entry) {
    entry.name = this.displayName();
    try { return await Passport.submitScore(mode, diff, entry); } catch (e) { return false; }
  },
  async topScores(mode, diff, n) {
    try { return await Passport.topScores(mode, diff, n); } catch (e) { return null; }
  },
  logEvent(name, data) { try { Passport.logEvent(name, data || {}); } catch (e) {} },

  // ---- replays: publish to the shared feed / load / browse / leaderboard-link ----
  async publishReplay(recording, summary, fixedIdPrefix) {
    try { return await Passport.publishReplay(recording, summary, fixedIdPrefix); } catch (e) { return null; }
  },
  async loadReplay(shareId) { try { return await Passport.loadReplay(shareId); } catch (e) { return null; } },
  async replayFeed(n) { try { return await Passport.feed(n); } catch (e) { return null; } },
  async linkReplay(mode, diff, shareId) { try { return await Passport.linkReplay(mode, diff, shareId); } catch (e) { return false; } },

  // ---- legacy per-board best ghost (superseded by replays/{shareId}; kept for old data) ----
  async submitGhost(mode, diff, data) { return false; },
  async loadGhost(mode, diff) {
    const s = await Passport.ready(); if (!s) return null;
    try { const doc = await Passport._race(s.db.collection("ghosts").doc(mode + "_" + diff).get(), 9000); return doc.exists ? doc.data() : null; }
    catch (e) { return null; }
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
      this.app = this.app || window.firebase.initializeApp(window.FIREBASE_CONFIG);   // Passport may have initialized first
      this.auth = window.firebase.auth();
      this.db = window.firebase.firestore();
      // auto-detect long-polling: Firestore's default WebChannel streaming is blocked by
      // some proxies / embedded webviews (incl. the CrazyGames iframe); this falls back
      // to long-polling automatically so reads/writes still work everywhere.
      try { this.db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) {}
      this._initRemoteConfig();   // live balance knobs (non-blocking; defaults to no change)
      let firstLoad = true;
      this.auth.onAuthStateChanged(async (u) => {
        if (firstLoad) {
          firstLoad = false;
          if (!u) {
            await this.auth.signInAnonymously();
            return;
          }
        }
        if (!u) return;
        this.uid = u.uid;
        const guest = u.isAnonymous;
        let existingName = (C.user && C.user.id === u.uid) ? C.user.customUsername : undefined;
        let existingSetAt = (C.user && C.user.id === u.uid) ? C.user.usernameSetAt : undefined;
        C._set({ 
            id: u.uid, 
            name: u.displayName || (guest ? "Guest" : "Player"), 
            avatar: u.photoURL, 
            guest,
            customUsername: existingName,
            usernameSetAt: existingSetAt
        }, guest ? "guest" : "signedin", true);
        await Cloud.sync();
      });
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
      let existingName = (C.user && C.user.id === u.uid) ? C.user.customUsername : undefined;
      let existingSetAt = (C.user && C.user.id === u.uid) ? C.user.usernameSetAt : undefined;
      C._set({ 
          id: u.uid, 
          name: u.displayName || "Player", 
          avatar: u.photoURL, 
          guest: false,
          customUsername: existingName,
          usernameSetAt: existingSetAt
      }, "signedin", true);
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

// ---- the Replay Passport: a silent identity for the SHARED layer, on EVERY build ----
// The Account provider above answers "who is this player" (CG login on CG, Google/anon on
// standalone) and owns save-state. The Passport answers a different question — "may this
// client write into the shared commons (leaderboards, replays)?" — by quietly ensuring a
// Firebase session on every build, CG included. It shows NO UI ever (CG's rule is about
// visible conflicting login prompts, not background authorization), reuses the account
// session when FirebaseProvider owns one, and signs in anonymously otherwise.
const Passport = {
  _p: null,
  ready() { if (!this._p) this._p = this._init(); return this._p; },
  async _init() {
    try {
      if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey) return null;
      if (!(await FirebaseProvider._ensureSdk())) return null;
      if (!FirebaseProvider.app) {   // CG build: the account provider never initialized Firebase — do it here, invisibly
        FirebaseProvider.app = window.firebase.initializeApp(window.FIREBASE_CONFIG);
        FirebaseProvider.auth = window.firebase.auth();
        FirebaseProvider.db = window.firebase.firestore();
        try { FirebaseProvider.db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) {}
      }
      const auth = FirebaseProvider.auth;
      if (!auth.currentUser) {
        // give a restored session a beat to surface, then mint an anonymous one
        await new Promise((res) => { const un = auth.onAuthStateChanged(() => { un(); res(); }); setTimeout(res, 2500); });
        if (!auth.currentUser) await auth.signInAnonymously();
      }
      return auth.currentUser ? { db: FirebaseProvider.db, uid: auth.currentUser.uid } : null;
    } catch (e) { return null; }
  },
  _race(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms || 9000))]); },

  // leaderboards (identical shape to the old provider methods, now build-agnostic)
  async submitScore(mode, diff, entry) {
    const s = await this.ready(); if (!s) return false;
    const ref = s.db.collection("leaderboards").doc(mode + "_" + diff).collection("scores").doc(s.uid);
    try {
      const cur = await this._race(ref.get(), 9000);
      if (cur.exists && (cur.data().score || 0) >= entry.score) return false;   // only improve
      await this._race(ref.set({ name: entry.name || "Player", score: entry.score | 0, wave: entry.wave | 0, time: Math.round(entry.time || 0), uid: s.uid, ts: Date.now() }, { merge: true }), 9000);
      return true;
    } catch (e) { return false; }
  },
  async topScores(mode, diff, n) {
    const s = await this.ready(); if (!s) return null;
    try {
      const snap = await this._race(s.db.collection("leaderboards").doc(mode + "_" + diff).collection("scores").orderBy("score", "desc").limit(n || 25).get(), 9000);
      return snap.docs.map((d) => d.data());
    } catch (e) { return null; }
  },
  logEvent(name, data) {
    this.ready().then((s) => { if (s) try { s.db.collection("telemetry").add(Object.assign({ event: name, uid: s.uid, ts: Date.now() }, data)); } catch (e) {} });
  },

  // ---- replays: RunSummary doc + the recording as chunked strings underneath ----
  // fixedIdPrefix (e.g. "lb_endless_normal") makes the doc self-replacing per player, so
  // leaderboard-linked replays overwrite themselves and never need cleanup.
  async publishReplay(recording, summary, fixedIdPrefix) {
    const s = await this.ready(); if (!s || !recording) return null;
    try {
      const shareId = fixedIdPrefix ? (fixedIdPrefix + "_" + s.uid) : ("r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
      const json = JSON.stringify(recording);
      if (json.length > 3e6) return null;   // sanity: never upload something enormous
      const CHUNK = 500000, chunks = [];
      for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));
      const sum = Object.assign({}, summary || {}, {
        ownerUid: s.uid, createdAt: Date.now(), chunkCount: chunks.length,
        mode: recording.mode, diff: recording.diff, wave: recording.wave || 0, score: recording.score || 0,
        time: recording.time || 0, won: !!recording.won, kills: recording.kills || 0, peak: recording.peak || 1,
        name: recording.name || "Player", thumb: recording.thumb || null, lb: !!fixedIdPrefix,
      });
      const ref = s.db.collection("replays").doc(shareId);
      await this._race(ref.set(sum), 12000);
      for (let i = 0; i < chunks.length; i++) await this._race(ref.collection("chunks").doc("" + i).set({ d: chunks[i] }), 15000);
      return shareId;
    } catch (e) { return null; }
  },
  async loadReplay(shareId) {
    const s = await this.ready(); if (!s || !shareId) return null;
    try {
      const ref = s.db.collection("replays").doc(shareId);
      const doc = await this._race(ref.get(), 9000); if (!doc.exists) return null;
      const sum = doc.data(), n = sum.chunkCount || 1;
      let json = "";
      for (let i = 0; i < n; i++) { const c = await this._race(ref.collection("chunks").doc("" + i).get(), 12000); if (c.exists) json += c.data().d; }
      const rec = JSON.parse(json);
      rec.name = sum.name; rec.won = sum.won;   // the summary is authoritative for the card fields
      return rec;
    } catch (e) { return null; }
  },
  // the global feed: most recent published runs (summaries only — light)
  async feed(n) {
    const s = await this.ready(); if (!s) return null;
    try {
      const snap = await this._race(s.db.collection("replays").orderBy("createdAt", "desc").limit(n || 20).get(), 9000);
      return snap.docs.map((d) => Object.assign({ shareId: d.id }, d.data()));
    } catch (e) { return null; }
  },
  // attach a published replay to the player's leaderboard row
  async linkReplay(mode, diff, shareId) {
    const s = await this.ready(); if (!s) return false;
    try { await this._race(s.db.collection("leaderboards").doc(mode + "_" + diff).collection("scores").doc(s.uid).set({ replayId: shareId }, { merge: true }), 9000); return true; }
    catch (e) { return false; }
  },
};
