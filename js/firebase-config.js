// ------- Firebase configuration (standalone / Vercel build ONLY) -------
// PASTE YOUR OWN KEYS to switch the standalone build from local-only saves to real
// accounts + Firestore-synced progress + cloud leaderboards. Get these from the
// Firebase console: Project settings -> General -> "Your apps" -> SDK setup & config.
//
// Leave it as null (below) and the game stays fully playable offline (LocalProvider),
// so nothing breaks before you configure it.
//
// NOTE: this file is intentionally NOT bundled into the CrazyGames upload — on
// CrazyGames the game uses "Log in with CrazyGames" only. Even if present, Firebase
// is never selected on the CG build (Cloud.init picks CrazyProvider there).
//
// Example once filled in:
//   window.FIREBASE_CONFIG = {
//     apiKey: "AIza...",
//     authDomain: "your-project.firebaseapp.com",
//     projectId: "your-project",
//     storageBucket: "your-project.appspot.com",
//     messagingSenderId: "1234567890",
//     appId: "1:1234567890:web:abcdef",
//   };

window.FIREBASE_CONFIG = null;
