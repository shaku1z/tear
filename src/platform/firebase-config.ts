/** Public Firebase client routing data. Authorization remains in Auth and Firestore rules. */
export const FIREBASE_CONFIG = Object.freeze({
  apiKey: "AIzaSyC2icGmNx0fwTWHWs1KwFVGWl125qp-FBE",
  authDomain: "tear-682cf.firebaseapp.com",
  projectId: "tear-682cf",
  storageBucket: "tear-682cf.firebasestorage.app",
  messagingSenderId: "545513135103",
  appId: "1:545513135103:web:bb60bdbd129a7e53f0e5ca",
  measurementId: "G-V83ZJV3HQ1",
});

export type FirebaseClientConfig = typeof FIREBASE_CONFIG;
