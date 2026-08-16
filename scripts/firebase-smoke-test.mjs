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
await checkPage("/admin");
await checkFirebaseConfig();
console.log("Firebase Hosting smoke test passed.");
