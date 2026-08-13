import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Browser-side Firebase.
 *
 * These NEXT_PUBLIC_ values are compiled into the client bundle and are meant
 * to be public — they identify the project, they do not grant access to it.
 * Access is decided by the custom-token role claim minted in /api/login and
 * enforced by the Firestore rules in firestore.rules.
 *
 * Each `process.env.NEXT_PUBLIC_*` is written out in full on purpose: Next
 * inlines these at build time by literal match, so `process.env[name]` would
 * silently come back undefined in the browser.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True when every client env var is present. Drives the setup notice on the login screen. */
export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;

function getFirebaseApp(): FirebaseApp {
  if (!firebaseConfigured) {
    throw new Error(
      "Firebase is not configured. Add the NEXT_PUBLIC_FIREBASE_* environment variables.",
    );
  }
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

/**
 * Auth, pinned to local persistence.
 *
 * Local persistence is the whole reason the closer never re-enters a key
 * mid-wave: the refresh token survives reloads, backgrounding, and the phone
 * locking. `setPersistence` returns a promise we deliberately do not await —
 * Firebase queues auth calls behind it internally.
 */
export function getClientAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
    void setPersistence(authInstance, browserLocalPersistence);
  }
  return authInstance;
}

export function getDb(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(getFirebaseApp());
  }
  return dbInstance;
}
