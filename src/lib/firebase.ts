// FastPath - Firebase initialization.
//
// Firebase *web* config values are public by design (they identify the
// project, not authenticate it) — security is enforced by Firebase Auth and
// Firestore rules, not by hiding these keys. They are read from Vite env vars
// when present, with a fallback to the project's public config so the app runs
// after a fresh clone without a local `.env`.

import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const env = import.meta.env;

const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "AIzaSyC52OOv4wZdTkz7pdi-Bycigk9UKxYDhbY",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "fastpath-a7cd7.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "fastpath-a7cd7",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "fastpath-a7cd7.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "933209726585",
  appId: env.VITE_FIREBASE_APP_ID ?? "1:933209726585:web:2cba81fcc86f5129603ea8",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
