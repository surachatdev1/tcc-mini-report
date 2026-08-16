import { execFileSync } from "node:child_process";

function command(...args) {
  return execFileSync("gcloud", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

const emailArgument = process.argv.find((value) => value.startsWith("--email="));
const projectArgument = process.argv.find((value) => value.startsWith("--project="));
const email = (emailArgument?.slice("--email=".length) ?? "").trim().toLowerCase();
const projectId = (projectArgument?.slice("--project=".length) ?? command("config", "get-value", "project")).trim();

if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) {
  throw new Error("ระบุอีเมลด้วย --email=admin@example.com");
}
if (!projectId || projectId === "(unset)") {
  throw new Error("ไม่พบ Google Cloud project ให้ใช้ --project=tcc-safe-travel");
}

const accessToken = command("auth", "print-access-token");
const documentUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/dashboard_admins/${encodeURIComponent(email)}`;
const response = await fetch(documentUrl, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    fields: {
      schemaVersion: { integerValue: "1" },
      email: { stringValue: email },
      displayName: { stringValue: "Initial administrator" },
      role: { stringValue: "admin" },
      active: { booleanValue: true },
      createdAt: { timestampValue: new Date().toISOString() },
      createdBy: { stringValue: "cloud-shell-bootstrap" },
    },
  }),
});

if (!response.ok) {
  throw new Error(`สร้าง initial admin ไม่สำเร็จ (${response.status}): ${await response.text()}`);
}

console.log(`Initial admin: ${email}`);
console.log(`Project: ${projectId}`);
console.log("เรียบร้อย — บัญชีนี้เข้า /admin ด้วย Google ได้หลัง Deploy rules และ hosting");
