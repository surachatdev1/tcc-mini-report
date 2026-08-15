import { loadEnv } from "vite";

const env = loadEnv("production", process.cwd(), "");
const required = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
];

const invalid = required.filter((key) => {
  const value = env[key]?.trim();
  return !value || value.includes("replace-with") || value.includes("your-project");
});

if (env.VITE_DATA_PROVIDER !== "firestore") invalid.unshift("VITE_DATA_PROVIDER=firestore");
if (env.VITE_FIREBASE_USE_EMULATORS === "true") invalid.push("VITE_FIREBASE_USE_EMULATORS=false");

if (invalid.length) {
  console.error(`Firebase production environment is incomplete: ${[...new Set(invalid)].join(", ")}`);
  console.error("Copy .env.firebase.example to .env.local, replace placeholders, and disable emulator mode.");
  process.exit(1);
}

if (!env.VITE_FIREBASE_APPCHECK_SITE_KEY?.trim()) {
  console.warn("Firebase App Check is not configured. This is acceptable for the first test deployment, but enable it before public launch.");
}

console.log("Firebase production environment is ready.");
