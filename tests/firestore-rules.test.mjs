import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, setLogLevel, terminate, writeBatch } from "firebase/firestore";

// Never run these writes against a real project.
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!endpoint || !/^127\.0\.0\.1:\d+$/.test(endpoint)) {
  throw new Error("Set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 before running Rules tests.");
}
const db = getFirestore(initializeApp({ projectId: "demo-tcc-diagnostics", apiKey: "demo", appId: "demo" }));
connectFirestoreEmulator(db, "127.0.0.1", Number(endpoint.split(":")[1]));
setLogLevel("silent");
after(() => terminate(db));
const criteria = JSON.parse(readFileSync(new URL("../lib/criteria.generated.json", import.meta.url)));
const topics = [
  ...Object.values(criteria.schoolTopics).map(topic => ({ topic, agencyType: null })),
  ...Object.entries(criteria.agencyTopics).map(([agencyType, topic]) => ({ topic, agencyType })),
];

function fixture({ topic, agencyType }, legacy = 0) {
  const id = crypto.randomUUID();
  const role = agencyType ? "เจ้าหน้าที่ผู้ประเมิน" : "ครู / ผู้รับผิดชอบความปลอดภัย";
  const submission = {
    schemaVersion: legacy ? 1 : 2, publicConsent: true,
    institution: "สถานศึกษาทดสอบ", province: "ลำปาง", assessmentDate: "2026-09-23",
    topicId: topic.id, topicLabel: agencyType ? `${topic.label} — ${topic.detail}` : topic.label,
    agencyType, rubricVersion: criteria.rubricVersion,
    answers: Object.fromEntries(topic.questions.map((q, i) => [q.id, { score: i % 4, explanation: "ข้อมูลจำลอง" }])),
    verificationStatus: "self_reported", createdAt: serverTimestamp(),
  };
  const assessor = {
    schemaVersion: legacy || 3, submissionId: id, assessorName: "ผู้ทดสอบ",
    createdAt: serverTimestamp(),
  };
  if (legacy) Object.assign(submission, { respondentRole: role, position: "" });
  if (legacy !== 1) assessor.assessorPhone = "";
  if (!legacy) Object.assign(assessor, { respondentRole: role, position: "" });
  return { id, submission, assessor };
}

function commit({ id, submission, assessor }) {
  const batch = writeBatch(db);
  batch.set(doc(db, "submissions", id), submission);
  if (assessor) batch.set(doc(db, "submission_assessors", id), assessor);
  return batch.commit();
}

for (const entry of topics) {
  for (const legacy of [0, 1, 2]) {
    test(`allows ${entry.agencyType || entry.topic.id}, schema ${legacy || "current"}`, async () => {
      await commit(fixture(entry, legacy));
    });
  }
}

const largest = topics.find(entry => entry.topic.id === "trip");
const invalidAnswers = [
  ["missing score", answer => { delete answer.score; }],
  ["missing explanation", answer => { delete answer.explanation; }],
  ["extra field", answer => { answer.extra = true; }],
  ["negative score", answer => { answer.score = -1; }],
  ["score above maximum", answer => { answer.score = 4; }],
  ["fractional score", answer => { answer.score = 1.5; }],
  ["string score", answer => { answer.score = "3"; }],
  ["empty explanation", answer => { answer.explanation = ""; }],
  ["oversized explanation", answer => { answer.explanation = "ก".repeat(501); }],
  ["non-string explanation", answer => { answer.explanation = 123; }],
];
for (const [name, mutate] of invalidAnswers) {
  test(`rejects ${name}`, async () => {
    const input = fixture(largest);
    mutate(Object.values(input.submission.answers).at(-1));
    await assert.rejects(commit(input), { code: "permission-denied" });
  });
}
test("rejects malformed answer and missing or extra questions", async () => {
  for (const type of ["null", "missing", "extra"]) {
    const input = fixture(largest);
    const key = Object.keys(input.submission.answers).at(-1);
    if (type === "null") input.submission.answers[key] = null;
    if (type === "missing") delete input.submission.answers[key];
    if (type === "extra") input.submission.answers.extra = { score: 1, explanation: "test" };
    await assert.rejects(commit(input), { code: "permission-denied" });
  }
});
test("allows boundary values and has no assessment closing date", async () => {
  const input = fixture(largest);
  input.submission.assessmentDate = "2027-01-01";
  for (const answer of Object.values(input.submission.answers)) answer.explanation = "ก".repeat(500);
  await commit(input);
});
test("denies public reads, overwrites, deletes, and orphan assessor records", async () => {
  const input = fixture(largest);
  await commit(input);
  await assert.rejects(getDoc(doc(db, "submissions", input.id)), { code: "permission-denied" });
  await assert.rejects(getDoc(doc(db, "submission_assessors", input.id)), { code: "permission-denied" });
  await assert.rejects(commit(input), { code: "permission-denied" });
  const deletion = writeBatch(db);
  deletion.delete(doc(db, "submissions", input.id));
  await assert.rejects(deletion.commit(), { code: "permission-denied" });
  const orphan = fixture(largest);
  const batch = writeBatch(db);
  batch.set(doc(db, "submission_assessors", orphan.id), orphan.assessor);
  await assert.rejects(batch.commit(), { code: "permission-denied" });
});
