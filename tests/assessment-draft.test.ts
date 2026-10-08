import assert from "node:assert/strict";
import test from "node:test";
import { createDraftStore, DRAFT_KEY, type SavedDraft } from "../lib/integrations/assessment-draft.ts";

const id = "5a2f980c-22ca-4471-9764-64dca4930cbe";
const draft: SavedDraft = {
  institution: "โรงเรียนทดสอบ", province: "เชียงใหม่", assessorName: "ผู้ทดสอบ",
  assessorPhone: "", respondentRole: "ครู / ผู้รับผิดชอบความปลอดภัย", position: "",
  assessmentDate: "2026-10-08", topicId: "bus", agencyType: "road-safety",
  answers: { "bus-driver-1": { score: 2, explanation: "ทดสอบ" } }, publicConsent: true,
  idempotencyKey: id, submissionAttempted: true,
};
function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  return { values, storage, store: createDraftStore(() => storage) };
}

test("refresh restores the same submission key, attempt status, and answers", () => {
  const { storage, store } = fixture();
  store.save(draft);
  const reloaded = createDraftStore(() => storage);
  assert.deepEqual(reloaded.load(), draft);
});
test("legacy drafts remain readable and explanation-only answers are preserved", () => {
  const { store } = fixture();
  const legacy = { ...draft, idempotencyKey: undefined, submissionAttempted: undefined,
    answers: { "bus-driver-1": { explanation: "ยังไม่เลือกคะแนน" } } };
  store.save(legacy);
  assert.equal(store.load()?.answers["bus-driver-1"].explanation, "ยังไม่เลือกคะแนน");
  assert.equal(store.load()?.idempotencyKey, undefined);
});
test("confirmed submission removes PII and cannot restore as an unsent draft", () => {
  const { values, store } = fixture();
  store.save(draft);
  assert.equal(store.complete(id), true);
  assert.equal(store.load(), null);
  assert.deepEqual(JSON.parse(values.get(DRAFT_KEY)!), { completed: true, idempotencyKey: id });
});
test("cleanup failure never throws and retains the original key for recovery", () => {
  const { storage, store } = fixture();
  store.save(draft);
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.equal(store.complete(id), false);
  assert.equal(store.load()?.idempotencyKey, id);
});
test("blocked storage is a recoverable error, not an empty draft or successful save", () => {
  const store = createDraftStore(() => { throw new Error("SecurityError"); });
  assert.throws(() => store.load(), /SecurityError/);
  assert.throws(() => store.save(draft), /SecurityError/);
  assert.equal(store.complete(id), false);
});
test("completion in another tab does not erase a newer assessment draft", () => {
  const { store } = fixture();
  const nextId = "12af980c-22ca-4471-9764-64dca4930cbe";
  store.save({ ...draft, idempotencyKey: nextId });
  assert.equal(store.complete(id), true);
  assert.equal(store.load()?.idempotencyKey, nextId);
});
test("corrupt drafts cannot silently replace an uncertain submission with a new key", () => {
  const { values, store } = fixture();
  for (const invalid of ["{", "null", JSON.stringify({ ...draft, idempotencyKey: undefined }),
    JSON.stringify({ ...draft, answers: { x: null } }), JSON.stringify({ ...draft, topicId: "unknown" })]) {
    values.set(DRAFT_KEY, invalid);
    assert.throws(() => store.load());
  }
});
test("starting a new assessment after success keeps a new independent key", () => {
  const { store } = fixture();
  store.save(draft);
  store.complete(id);
  const nextId = "12af980c-22ca-4471-9764-64dca4930cbe";
  store.save({ ...draft, idempotencyKey: nextId, submissionAttempted: false, answers: {} });
  assert.equal(store.load()?.idempotencyKey, nextId);
  assert.equal(store.load()?.submissionAttempted, false);
  assert.deepEqual(store.load()?.answers, {});
});
