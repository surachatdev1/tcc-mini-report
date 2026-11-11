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

const admin = getFirestore(initializeApp({ projectId: "demo-tcc-diagnostics", apiKey: "demo", appId: "demo" }, "intake-admin"));
connectFirestoreEmulator(admin, "127.0.0.1", Number(endpoint.split(":")[1]), { mockUserToken: { sub: "admin", email: "surachat.dev1@gmail.com", email_verified: true } });
const viewer = getFirestore(initializeApp({ projectId: "demo-tcc-diagnostics", apiKey: "demo", appId: "demo" }, "intake-viewer"));
connectFirestoreEmulator(viewer, "127.0.0.1", Number(endpoint.split(":")[1]), { mockUserToken: { sub: "viewer", email: "viewer@example.com", email_verified: true } });
after(() => Promise.all([terminate(admin), terminate(viewer)]));
const settings = doc(admin, "assessment_settings", "availability");
async function configure(school, agency) {
  const batch = writeBatch(admin);
  batch.set(settings, { schemaVersion: 1, school, agency, updatedBy: "surachat.dev1@gmail.com", updatedAt: serverTimestamp() });
  await batch.commit();
}
const schoolIdentity = { id: "obec-1050130061", code: "1050130061", district: "จอมทอง", subdistrict: "บ้านแปะ", source: "obec" };

test("accepts explicit school identity and rejects malformed or agency identities", async () => {
  const input = fixture(largest);
  input.submission.school = schoolIdentity;
  await commit(input);
  for (const identity of [ { ...schoolIdentity, id: "obec-1050130013" }, { ...schoolIdentity, source: "private" }, { ...schoolIdentity, extra: "PII" }, { ...schoolIdentity, district: "ก".repeat(101) }, { id: schoolIdentity.id } ]) {
    const invalid = fixture(largest); invalid.submission.school = identity;
    await assert.rejects(commit(invalid), { code: "permission-denied" });
  }
  const agency = fixture(topics.find(entry => entry.agencyType)); agency.submission.school = schoolIdentity;
  await assert.rejects(commit(agency), { code: "permission-denied" });
});

test("intake settings are publicly readable but only admins can change their two boolean switches", async () => {
  await configure(true, true);
  assert.equal((await getDoc(doc(db, "assessment_settings", "availability"))).data().school, true);
  for (const client of [db, viewer]) {
    const batch = writeBatch(client);
    batch.set(doc(client, "assessment_settings", "availability"), { schemaVersion: 1, school: false, agency: false, updatedAt: serverTimestamp(), updatedBy: "surachat.dev1@gmail.com" });
    await assert.rejects(batch.commit(), { code: "permission-denied" });
  }
  await assert.rejects(configure("false", true), { code: "permission-denied" });
  const deletion = writeBatch(admin); deletion.delete(settings);
  await assert.rejects(deletion.commit(), { code: "permission-denied" });
});

test("all four intake states enforce both groups, all seven forms and old clients at write time", async () => {
  try {
    for (const [school, agency] of [[true, true], [true, false], [false, true], [false, false]]) {
      await configure(school, agency);
      for (const entry of topics) for (const legacy of [0, 1, 2]) {
        const input = fixture(entry, legacy);
        if (!legacy && !entry.agencyType) input.submission.school = schoolIdentity;
        const allowed = entry.agencyType ? agency : school;
        if (allowed) await commit(input);
        else {
          await assert.rejects(commit(input), { code: "permission-denied" });
          assert.equal((await getDoc(doc(admin, "submissions", input.id))).exists(), false);
          assert.equal((await getDoc(doc(admin, "submission_assessors", input.id))).exists(), false);
        }
      }
    }
    // Existing results remain readable to their authorized readers even with both groups closed.
    await configure(true, true); const saved = fixture(largest); await commit(saved);
    await configure(false, false);
    assert.ok((await getDoc(doc(admin, "submissions", saved.id))).exists());
    assert.ok((await getDoc(doc(admin, "submission_assessors", saved.id))).exists());
  } finally { await configure(true, true); }
});

test("all submission and private fields remain required after reducing repeated rule checks", async () => {
  for (const legacy of [0, 1, 2]) {
    for (const field of Object.keys(fixture(largest, legacy).submission)) {
      const invalid = fixture(largest, legacy); delete invalid.submission[field];
      await assert.rejects(commit(invalid), { code: "permission-denied" }, `submission ${legacy}: ${field}`);
    }
    for (const field of Object.keys(fixture(largest, legacy).assessor)) {
      const invalid = fixture(largest, legacy); delete invalid.assessor[field];
      await assert.rejects(commit(invalid), { code: "permission-denied" }, `assessor ${legacy}: ${field}`);
    }
  }
});
