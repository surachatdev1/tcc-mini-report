import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

type FirebaseEnvironment = {
  VITE_DATA_PROVIDER?: string;
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_APPCHECK_SITE_KEY?: string;
  VITE_FIREBASE_USE_EMULATORS?: string;
};

function environment(): FirebaseEnvironment {
  return (import.meta as ImportMeta & { env?: FirebaseEnvironment }).env ?? {};
}

function resolveAuthDomain(env: FirebaseEnvironment) {
  const configuredDomain = env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  if (typeof window === "undefined" || !projectId) return configuredDomain;

  // On Firebase Hosting, keep the OAuth helper on the same origin. This avoids
  // third-party storage restrictions used by Safari, Firefox, and modern Chrome.
  const currentHost = window.location.hostname;
  if (currentHost === `${projectId}.web.app` || currentHost === `${projectId}.firebaseapp.com`) {
    return currentHost;
  }
  return configuredDomain;
}

export function getFirebaseClientOptions(): FirebaseOptions | null {
  const env = environment();
  const required = [
    env.VITE_FIREBASE_API_KEY,
    env.VITE_FIREBASE_AUTH_DOMAIN,
    env.VITE_FIREBASE_PROJECT_ID,
    env.VITE_FIREBASE_APP_ID,
  ];
  if (required.some((value) => !value)) return null;

  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: resolveAuthDomain(env),
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
}

export function shouldUseFirestore() {
  return environment().VITE_DATA_PROVIDER === "firestore";
}

let firestorePromise: Promise<Firestore | null> | null = null;
let firebaseAppPromise: Promise<FirebaseApp | null> | null = null;
let authPromise: Promise<Auth | null> | null = null;

async function getFirebaseApp(): Promise<FirebaseApp | null> {
  if (typeof window === "undefined" || !shouldUseFirestore()) return null;
  if (firebaseAppPromise) return firebaseAppPromise;

  firebaseAppPromise = (async () => {
    const env = environment();
    const options = getFirebaseClientOptions();
    if (!options) return null;

    const { getApps, initializeApp } = await import("firebase/app");
    const app = getApps()[0] ?? initializeApp(options);

    // App Check ทำงานเบื้องหลังโดยไม่แสดง captcha และเริ่มก่อนเรียก Firebase services
    if (env.VITE_FIREBASE_APPCHECK_SITE_KEY && env.VITE_FIREBASE_USE_EMULATORS !== "true") {
      const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import("firebase/app-check");
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(env.VITE_FIREBASE_APPCHECK_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      });
    }

    return app;
  })();

  return firebaseAppPromise;
}

export async function getFirebaseDb(): Promise<Firestore | null> {
  if (typeof window === "undefined" || !shouldUseFirestore()) return null;
  if (firestorePromise) return firestorePromise;

  firestorePromise = (async () => {
    const env = environment();
    const app = await getFirebaseApp();
    if (!app) return null;

    const { connectFirestoreEmulator, getFirestore } = await import("firebase/firestore");

    const db = getFirestore(app);
    if (env.VITE_FIREBASE_USE_EMULATORS === "true") {
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }
    return db;
  })();

  return firestorePromise;
}

export async function getFirebaseAuth(): Promise<Auth | null> {
  if (typeof window === "undefined" || !shouldUseFirestore()) return null;
  if (authPromise) return authPromise;

  authPromise = (async () => {
    const app = await getFirebaseApp();
    if (!app) return null;

    const { connectAuthEmulator, getAuth } = await import("firebase/auth");
    const auth = getAuth(app);
    if (environment().VITE_FIREBASE_USE_EMULATORS === "true") {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    }
    return auth;
  })();

  return authPromise;
}
