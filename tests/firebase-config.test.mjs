import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
const firebaseConfig = JSON.parse(await readFile(new URL("../firebase.json", import.meta.url), "utf8"));
const formSource = await readFile(new URL("../components/assessment-workspace.tsx", import.meta.url), "utf8");
const assessmentRepositorySource = await readFile(new URL("../lib/integrations/assessment-repository.ts", import.meta.url), "utf8");
const authGateSource = await readFile(new URL("../components/dashboard-auth-gate.tsx", import.meta.url), "utf8");
const protectedAreaSource = await readFile(new URL("../components/firebase-protected-area.tsx", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../components/admin-workspace.tsx", import.meta.url), "utf8");
const accessRepositorySource = await readFile(new URL("../lib/integrations/access-control-repository.ts", import.meta.url), "utf8");
const firebaseSpaSource = await readFile(new URL("../firebase-spa/main.tsx", import.meta.url), "utf8");
const bootstrapAdminSource = await readFile(new URL("../scripts/bootstrap-admin.mjs", import.meta.url), "utf8");
const dashboardSource = await readFile(new URL("../components/dashboard-workspace.tsx", import.meta.url), "utf8");
const dashboardRepositorySource = await readFile(new URL("../lib/integrations/dashboard-repository.ts", import.meta.url), "utf8");
const resultInsightsSource = await readFile(new URL("../components/result-insights.tsx", import.meta.url), "utf8");
const benchmarkRepositorySource = await readFile(new URL("../lib/integrations/benchmark-repository.ts", import.meta.url), "utf8");
const firebaseHtml = await readFile(new URL("../firebase-spa/index.html", import.meta.url), "utf8");
const firebaseClientSource = await readFile(new URL("../lib/integrations/firebase-client.ts", import.meta.url), "utf8");
const firebaseEnvExample = await readFile(new URL("../.env.firebase.example", import.meta.url), "utf8");
const rubric = JSON.parse(await readFile(new URL("../lib/criteria.generated.json", import.meta.url), "utf8"));

test("Firebase SPA มีภาษาไทย ชื่อระบบ และ root สำหรับ React", () => {
  assert.match(firebaseHtml, /<html lang="th">/);
  assert.match(firebaseHtml, /<title>ระบบประเมินการเดินทางที่ปลอดภัยของเด็กนักเรียน<\/title>/);
  assert.match(firebaseHtml, /<div id="root"><\/div>/);
});

test("Firebase Hosting รองรับ SPA route /dashboard และ /admin", () => {
  assert.equal(firebaseConfig.hosting.public, "firebase-dist");
  assert.deepEqual(firebaseConfig.hosting.rewrites, [{ source: "**", destination: "/index.html" }]);
  assert.match(firebaseSpaSource, /window\.location\.pathname === "\/admin"/);
  assert.match(firebaseSpaSource, /<AdminAuthGate \/>/);
});

test("Firestore ให้เฉพาะผู้มีสิทธิ์อ่าน Dashboard และเปิด public create เท่านั้น", () => {
  assert.match(rules, /function hasDashboardAccess\(\)/);
  assert.match(rules, /function isAdmin\(\)/);
  assert.match(rules, /dashboard_members\/\$\(currentEmail\(\)\)/);
  assert.match(rules, /dashboard_domains\/\$\(currentDomain\(\)\)/);
  assert.match(rules, /allow read: if hasDashboardAccess\(\);/);
  assert.match(rules, /allow create: if submissionId\.size\(\) == 36 && validSubmission\(\);/);
  assert.match(rules, /allow update, delete: if false;/);
  assert.match(rules, /match \/benchmarks\/\{benchmarkId\}[\s\S]*allow read: if true;/);
  assert.doesNotMatch(rules, /allow\s+(read,\s*)?write:\s*if\s+true/);
});

test("Dashboard บังคับ Sign-In และจำกัดข้อมูลผู้ประเมินตามระดับสิทธิ์", () => {
  assert.match(formSource, /ชื่อ–นามสกุลผู้ประเมิน/);
  assert.match(formSource, /ยินยอมให้นำข้อมูลสรุปไปใช้ใน Dashboard ของโครงการ/);
  assert.match(formSource, /เฉพาะผู้ดูแลหรืออีเมลที่ได้รับสิทธิ์เป็นรายบุคคล/);
  assert.match(authGateSource, /FirebaseProtectedArea area="dashboard"/);
  assert.match(protectedAreaSource, /signInWithPopup/);
  assert.match(protectedAreaSource, /signInWithRedirect/);
  assert.match(protectedAreaSource, /signInWithEmailAndPassword/);
  assert.match(protectedAreaSource, /getRedirectResult/);
  assert.match(protectedAreaSource, /browserBlocksOAuthState/);
  assert.match(protectedAreaSource, /Safari หรือ Chrome/);
  assert.match(protectedAreaSource, /GoogleAuthProvider/);
  assert.match(rules, /match \/submission_assessors\/\{submissionId\}/);
  assert.match(rules, /function hasPrivateDashboardAccess\(\)/);
  assert.match(rules, /allow read: if hasPrivateDashboardAccess\(\);/);
  assert.match(rules, /validPrivateAssessor\(submissionId\)/);
  assert.match(rules, /data\.assessorPhone\.size\(\) <= 30/);
  assert.match(rules, /getAfter\(\/databases\/\$\(database\)\/documents\/submissions\/\$\(submissionId\)\)\.data\.createdAt == request\.time/);
});

test("Admin จัดการผู้ดูแล อีเมล โดเมน และบัญชี password ได้", () => {
  assert.match(adminSource, /จัดการผู้มีสิทธิ์ดู Dashboard/);
  assert.match(adminSource, /addAdmin/);
  assert.match(adminSource, /addGoogleMember/);
  assert.match(adminSource, /addAllowedDomain/);
  assert.match(adminSource, /createPasswordMember/);
  assert.match(accessRepositorySource, /dashboard_admins/);
  assert.match(accessRepositorySource, /dashboard_members/);
  assert.match(accessRepositorySource, /dashboard_domains/);
  assert.match(accessRepositorySource, /createUserWithEmailAndPassword/);
  assert.match(accessRepositorySource, /sendEmailVerification/);
  assert.match(accessRepositorySource, /deleteUser\(createdUser\)/);
  assert.match(rules, /request\.auth\.token\.get\('email_verified', false\) == true/);
  assert.match(rules, /allow list: if isAdmin\(\);/);
  assert.match(rules, /email != currentEmail\(\)/);
});

test("มีสคริปต์ bootstrap initial admin ผ่านสิทธิ์ Google Cloud", () => {
  assert.match(bootstrapAdminSource, /gcloud/);
  assert.match(bootstrapAdminSource, /dashboard_admins/);
  assert.match(bootstrapAdminSource, /auth.*print-access-token/s);
  assert.doesNotMatch(bootstrapAdminSource, /service-account.*json/i);
});

test("Google Sign-In ใช้ same-origin auth helper บน Firebase Hosting", () => {
  assert.match(firebaseClientSource, /resolveAuthDomain/);
  assert.match(firebaseClientSource, /currentHost === `\$\{projectId\}\.web\.app`/);
  assert.match(firebaseClientSource, /currentHost === `\$\{projectId\}\.firebaseapp\.com`/);
  assert.match(firebaseEnvExample, /VITE_FIREBASE_AUTH_DOMAIN=tcc-safe-travel\.web\.app/);
});

test("Dashboard ใช้ข้อมูลจริงจาก Firestore และไม่ย้อนกลับไปใช้ข้อมูลสาธิต", () => {
  assert.match(dashboardRepositorySource, /onSnapshot\(/);
  assert.match(dashboardRepositorySource, /collection\(db, "submissions"\)/);
  assert.match(dashboardRepositorySource, /collection\(db, "submission_assessors"\)/);
  assert.doesNotMatch(dashboardRepositorySource, /limit\(500\)/);
  assert.doesNotMatch(dashboardSource, /demoRecords|ข้อมูลสาธิต|โรงเรียนตัวอย่าง/);
  assert.match(dashboardSource, /setRecords\(payload\.records\)/);
  assert.match(dashboardRepositorySource, /if \(snapshot\.empty\)/);
  assert.match(dashboardRepositorySource, /พบผลประเมินบางรายการที่ไม่สามารถนำมาแสดง/);
  assert.match(dashboardSource, /source === "loading"/);
  assert.match(dashboardSource, /source === "live" \? <>/);
  assert.match(dashboardSource, /ยังไม่มีผลประเมิน/);
  assert.doesNotMatch(dashboardSource, /ข้อมูลจาก Firestore|ข้อมูลจริงตามตัวกรอง|ระบบเชื่อมต่อ Firestore/);
  assert.doesNotMatch(protectedAreaSource, /เข้าสู่ระบบแล้ว:/);
  assert.match(dashboardSource, /ไม่สามารถโหลดข้อมูลได้/);
  assert.match(dashboardSource, /ดาวน์โหลดข้อมูลรวม/);
  assert.match(dashboardSource, /เลือกข้อมูลแต่ละส่วน/);
  assert.match(dashboardRepositorySource, /categoryScores: summary\.categories/);
  assert.match(dashboardRepositorySource, /questionResults: summary\.questionResults/);
  assert.match(dashboardSource, /record\.assessorName/);
  assert.match(dashboardSource, /record\.assessorPhone/);
  assert.match(dashboardSource, /includePersonalData: personalDataVisible/);
});

test("หน้าผลลัพธ์เปรียบเทียบกับค่ากลางแบบไม่ระบุตัวบุคคล", () => {
  assert.match(resultInsightsSource, /คะแนนแยกตามหมวด/);
  assert.match(resultInsightsSource, /ค่ากลางของกลุ่ม/);
  assert.match(resultInsightsSource, /น้อยกว่า 10 รายการ/);
  assert.match(benchmarkRepositorySource, /collection\(db, "benchmarks"\)/);
  assert.match(benchmarkRepositorySource, /buildBenchmarkSnapshots/);
  assert.match(adminSource, /อัปเดตข้อมูลเปรียบเทียบ/);
  assert.match(rules, /มีเฉพาะค่ากลางของกลุ่มอย่างน้อย 10 ราย/);
  assert.match(rules, /function validBenchmark\(\)/);
  assert.match(rules, /data\.sampleSize >= 10/);
  assert.match(rules, /allow create, update: if isAdmin\(\) && validBenchmark\(\);/);
});

test("ผู้ประเมินสาธารณะบันทึกผลแบบ atomic โดยไม่ต้องมีสิทธิ์อ่าน Firestore", () => {
  assert.match(assessmentRepositorySource, /writeBatch/);
  assert.match(assessmentRepositorySource, /await batch\.commit\(\)/);
  assert.doesNotMatch(assessmentRepositorySource, /transaction\.get\(/);
  assert.match(assessmentRepositorySource, /firestoreWriteError/);
  assert.match(assessmentRepositorySource, /เชื่อมต่อ Firestore ไม่สำเร็จ/);
  assert.match(rules, /allow create: if submissionId\.size\(\) == 36 && validSubmission\(\);/);
  assert.match(rules, /allow update, delete: if false;/);
  const publicWriteStart = assessmentRepositorySource.indexOf("batch.set(documentRef");
  const privateWriteStart = assessmentRepositorySource.indexOf("batch.set(assessorDocumentRef");
  const publicWrite = assessmentRepositorySource.slice(publicWriteStart, privateWriteStart);
  const privateWrite = assessmentRepositorySource.slice(privateWriteStart);
  assert.doesNotMatch(publicWrite, /respondentRole:|position:/);
  assert.match(privateWrite, /schemaVersion: 3/);
  assert.match(privateWrite, /respondentRole: payload\.respondentRole/);
  assert.match(privateWrite, /position: payload\.position/);
  assert.match(rules, /function validSubmissionV2\(\)/);
  assert.match(rules, /function validPrivateAssessorV3\(submissionId\)/);
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
