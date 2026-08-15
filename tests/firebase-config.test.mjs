import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
const firebaseConfig = JSON.parse(await readFile(new URL("../firebase.json", import.meta.url), "utf8"));
const formSource = await readFile(new URL("../components/assessment-workspace.tsx", import.meta.url), "utf8");
const authGateSource = await readFile(new URL("../components/dashboard-auth-gate.tsx", import.meta.url), "utf8");
const firebaseHtml = await readFile(new URL("../firebase-spa/index.html", import.meta.url), "utf8");
const rubric = JSON.parse(await readFile(new URL("../lib/criteria.generated.json", import.meta.url), "utf8"));

test("Firebase SPA มีภาษาไทย ชื่อระบบ และ root สำหรับ React", () => {
  assert.match(firebaseHtml, /<html lang="th">/);
  assert.match(firebaseHtml, /<title>ระบบประเมินการเดินทางที่ปลอดภัยของเด็กนักเรียน<\/title>/);
  assert.match(firebaseHtml, /<div id="root"><\/div>/);
});

test("Firebase Hosting รองรับ SPA route /dashboard", () => {
  assert.equal(firebaseConfig.hosting.public, "firebase-dist");
  assert.deepEqual(firebaseConfig.hosting.rewrites, [{ source: "**", destination: "/index.html" }]);
});

test("Firestore ให้ Google user อ่าน Dashboard และเปิด public create เท่านั้น", () => {
  assert.match(rules, /function isGoogleUser\(\)/);
  assert.match(rules, /sign_in_provider == 'google\.com'/);
  assert.match(rules, /allow read: if isGoogleUser\(\);/);
  assert.match(rules, /allow create: if submissionId\.size\(\) == 36 && validSubmission\(\);/);
  assert.match(rules, /allow update, delete: if false;/);
  assert.doesNotMatch(rules, /allow read: if true;/);
  assert.doesNotMatch(rules, /allow\s+(read,\s*)?write:\s*if\s+true/);
});

test("Dashboard บังคับ Google Sign-In และไม่เปิดข้อมูลผู้ประเมิน", () => {
  assert.match(formSource, /ชื่อ–นามสกุลผู้ประเมิน/);
  assert.match(formSource, /ยินยอมให้นำข้อมูลสรุปไปใช้ใน Dashboard ของโครงการ/);
  assert.match(formSource, /ไม่แสดงชื่อผู้ประเมิน/);
  assert.match(authGateSource, /signInWithPopup/);
  assert.match(authGateSource, /GoogleAuthProvider/);
  assert.match(authGateSource, /ไม่ขอสิทธิ์อ่าน Gmail/);
  assert.match(rules, /match \/submission_assessors\/\{submissionId\}/);
  assert.match(rules, /allow read: if false;/);
  assert.match(rules, /validPrivateAssessor\(submissionId\)/);
  assert.match(rules, /getAfter\(\/databases\/\$\(database\)\/documents\/submissions\/\$\(submissionId\)\)\.data\.createdAt == request\.time/);
});

test("Firestore rules รู้จัก question id ทุกข้อในร่างเกณฑ์", () => {
  const topics = [...Object.values(rubric.schoolTopics), ...Object.values(rubric.agencyTopics)];
  for (const topic of topics) {
    for (const question of topic.questions) {
      assert.ok(rules.includes(`'${question.id}'`), question.id);
    }
  }
  assert.match(rules, /validAnswer\(answer\)/);
  assert.match(rules, /answer\.explanation\.size\(\) <= 500/);
  assert.doesNotMatch(rules, /answer\.explanation\.size\(\) >= 10/);
});

test("ข้อมูลประกอบเป็น optional ทั้งในฟอร์มและ Firestore rules", () => {
  assert.match(formSource, /เหตุผลและข้อมูลประกอบ/);
  assert.match(formSource, /ไม่บังคับ/);
  assert.doesNotMatch(formSource, /กรุณาอธิบายอย่างน้อย 10 ตัวอักษร/);
});
