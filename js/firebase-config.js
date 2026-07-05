// ------- Firebase configuration (standalone / Vercel build ONLY) -------
// This game loads plain <script> files sharing one global scope — NOT ES modules — so
// this file must NOT use `import` / `initializeApp` here. It only needs to expose the
// config object on window.FIREBASE_CONFIG; js/cloud.js loads the Firebase SDK on demand
// and initializes it (Auth + Firestore) from these values.
//
// Getting these keys: Firebase console -> Project settings -> General -> "Your apps"
// -> SDK setup & config. (The web API key here is not a secret — access is controlled
// by Firebase Auth + Firestore security rules.)
//
// NOTE: this file is intentionally NOT active on the CrazyGames upload — Cloud.init
// always picks "Log in with CrazyGames" there, never Firebase.

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyC2icGmNx0fwTWHWs1KwFVGWl125qp-FBE",
  authDomain: "tear-682cf.firebaseapp.com",
  projectId: "tear-682cf",
  storageBucket: "tear-682cf.firebasestorage.app",
  messagingSenderId: "545513135103",
  appId: "1:545513135103:web:bb60bdbd129a7e53f0e5ca",
  measurementId: "G-V83ZJV3HQ1",
};
