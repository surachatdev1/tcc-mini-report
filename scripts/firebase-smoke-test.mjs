const defaultBaseUrl = "https://tcc-safe-travel.web.app";
const argumentIndex = process.argv.findIndex((value) => value === "--base-url");
const baseUrl = new URL(argumentIndex >= 0 ? process.argv[argumentIndex + 1] : defaultBaseUrl);

async function checkPage(pathname) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url, { redirect: "follow" });
  const body = await response.text();

  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}`);
  if (!response.headers.get("content-type")?.includes("text/html")) {
    throw new Error(`${pathname} did not return HTML`);
  }
  if (!body.includes('<div id="root"></div>')) {
    throw new Error(`${pathname} did not return the Firebase SPA shell`);
  }
  if (response.headers.get("x-content-type-options") !== "nosniff") {
    throw new Error(`${pathname} is missing X-Content-Type-Options`);
  }

  console.log(`PASS ${url} (${response.status})`);
}

async function checkFirebaseConfig() {
  const url = new URL("/__/firebase/init.json", baseUrl);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Firebase init config returned HTTP ${response.status}`);
  const config = await response.json();
  if (config.projectId !== "tcc-safe-travel") {
    throw new Error(`Unexpected Firebase project: ${config.projectId ?? "missing"}`);
  }
  console.log(`PASS ${url} (project ${config.projectId})`);
}

await checkPage("/");
await checkPage("/dashboard");
await checkPage("/dashboard/overview");
await checkPage("/admin");
await checkFirebaseConfig();
// Checking HTML alone misses a hosting-only release with stale Firestore rules.
const manifestUrl = "https://firestore.googleapis.com/v1/projects/tcc-safe-travel/databases/(default)/documents/public_overview/current";
const publicResponse = await fetch(manifestUrl);
if (publicResponse.status === 403 || publicResponse.status === 401) {
  throw new Error("Public overview access denied. Deploy firestore:rules and firestore:indexes for tcc-safe-travel; verify App Check configuration if access is still denied.");
}
if (publicResponse.status === 404) {
  console.warn("Public overview rules allow access, but no summary is published. Sign in as an administrator and click อัปเดตภาพรวมสาธารณะ.");
} else {
  if (!publicResponse.ok) throw new Error(`Public overview returned HTTP ${publicResponse.status}`);
  const manifest = await publicResponse.json();
  const version = manifest.fields?.version?.stringValue;
  if (!version || !/^[a-f0-9-]{36}$/i.test(version)) throw new Error("Invalid public overview version");
  const cellsUrl = `https://firestore.googleapis.com/v1/projects/tcc-safe-travel/databases/(default)/documents/public_overview_versions/${version}/cells?pageSize=1`;
  const cellsResponse = await fetch(cellsUrl);
  if (!cellsResponse.ok) throw new Error(`Published overview cells returned HTTP ${cellsResponse.status}`);
  console.log("PASS anonymous access to public overview manifest and published cells");
}
console.log("Firebase Hosting and public overview smoke test passed.");
