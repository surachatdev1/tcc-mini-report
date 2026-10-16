import assert from "node:assert/strict";
import { after, test } from "node:test";
import { initializeApp } from "firebase/app";
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, query, serverTimestamp, setDoc, setLogLevel, terminate, where } from "firebase/firestore";
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!endpoint || !/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Rules tests require the local Firestore emulator");
const port = Number(endpoint.split(":")[1]);
function database(name, token) { const db = getFirestore(initializeApp({ projectId: "demo-tcc-diagnostics", apiKey: "demo", appId: "demo" }, name)); connectFirestoreEmulator(db, "127.0.0.1", port, token ? { mockUserToken: token } : {}); return db; }
const admin = database("overview-admin", { sub: "admin", email: "surachat.dev1@gmail.com", email_verified: true });
const guest = database("overview-guest");
const viewer = database("overview-viewer", { sub: "viewer", email: "viewer@example.com", email_verified: true });
setLogLevel("silent");
after(async () => { await Promise.all([admin, guest, viewer].map(terminate)); });
const cell = { year: "all", province: "เชียงใหม่", affiliation: "obec", scopes: {} };
const current = doc(admin, "public_overview", "current");
test("only an admin can create a draft; guests cannot read it until published", async () => {
  const version = crypto.randomUUID(); const path = `public_overview_versions/${version}/cells/0`;
  await assert.rejects(setDoc(doc(guest, path), cell), { code: "permission-denied" });
  await assert.rejects(setDoc(doc(viewer, path), cell), { code: "permission-denied" });
  await setDoc(doc(admin, path), cell);
  await assert.rejects(getDoc(doc(guest, path)), { code: "permission-denied" });
  await setDoc(current, { schemaVersion: 1, version, years: ["2026"], updatedAt: serverTimestamp() });
  assert.ok((await getDoc(doc(guest, path))).exists());
  assert.equal((await getDocs(query(collection(guest, `public_overview_versions/${version}/cells`), where("year", "==", "all")))).size, 1);
  await assert.rejects(setDoc(doc(admin, path), cell), { code: "permission-denied" });
  await deleteDoc(current);
  await assert.rejects(getDoc(doc(guest, path)), { code: "permission-denied" });
});
test("publication metadata and cells reject contact fields, and visitors cannot publish", async () => {
  const version = crypto.randomUUID();
  const manifest = { schemaVersion: 1, version, years: [], updatedAt: serverTimestamp() };
  await assert.rejects(setDoc(doc(guest, "public_overview", "current"), manifest), { code: "permission-denied" });
  await assert.rejects(setDoc(current, { ...manifest, assessorName: "private" }), { code: "permission-denied" });
  await assert.rejects(setDoc(doc(admin, `public_overview_versions/${version}/cells/0`), { ...cell, assessorPhone: "private" }), { code: "permission-denied" });
  await assert.rejects(getDoc(doc(guest, "submissions", crypto.randomUUID())), { code: "permission-denied" });
  await assert.rejects(getDoc(doc(guest, "submission_assessors", crypto.randomUUID())), { code: "permission-denied" });
  await assert.rejects(getDoc(doc(guest, "overview_publication", "state")), { code: "permission-denied" });
});

test("schema 2 publishes school/date dimensions without opening private records", async () => {
  const version = crypto.randomUUID();
  const detailed = { ...cell, institutionKey: "school:เชียงใหม่:ทดสอบ", institution: "โรงเรียนทดสอบ", assessmentDate: "2026-10-16" };
  const path = `public_overview_versions/${version}/cells/0`;
  await setDoc(doc(admin, path), detailed);
  await setDoc(current, { schemaVersion: 2, version, years: ["2026"], updatedAt: serverTimestamp() });
  assert.deepEqual((await getDoc(doc(guest, path))).data(), detailed);
  await assert.rejects(setDoc(doc(admin, path), detailed), { code: "permission-denied" });
  for (const [index, invalid] of [
    { ...cell, institution: "partial" },
    { ...detailed, assessmentDate: "16/10/2026" },
    { ...detailed, institutionKey: "private-record-id" },
    { ...detailed, assessorName: "private" },
    { ...detailed, answers: [] },
  ].entries()) await assert.rejects(setDoc(doc(admin, `public_overview_versions/${version}/cells/bad-${index}`), invalid), { code: "permission-denied" });
  await assert.rejects(getDocs(collection(guest, "submissions")), { code: "permission-denied" });
  await deleteDoc(current);
});
