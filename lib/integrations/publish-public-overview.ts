import { buildPublicOverviewCells } from "../public-overview";
import { affiliationIndex, recordAffiliation } from "../dashboard-filters";
import { getSchoolsByProvince } from "../school-directory";
import { isAdminEmail } from "../access-roles";
import { firestoreRecord, type DashboardRecord } from "./dashboard-repository";
import { getFirebaseAuth, getFirebaseDb } from "./firebase-client";

async function buildAndPublishPublicOverview() {
  const auth = await getFirebaseAuth();
  if (!auth?.currentUser?.emailVerified || !isAdminEmail(auth.currentUser.email ?? "")) throw new Error("บัญชีนี้ไม่มีสิทธิ์เผยแพร่ภาพรวม");
  const db = await getFirebaseDb(); if (!db) throw new Error("เชื่อมต่อข้อมูลไม่สำเร็จ");
  const { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, writeBatch } = await import("firebase/firestore");
  const control = doc(db, "overview_publication", "state");
  const revisionBefore = (await getDoc(control)).data()?.revision ?? null;
  const submissions = await getDocs(collection(db, "submissions"));
  const records = submissions.docs.map(row => firestoreRecord(row.id, row.data())).filter((row): row is DashboardRecord => row !== null);
  if (records.length !== submissions.size) throw new Error("มีผลประเมินที่อ่านไม่ได้ กรุณาตรวจสอบก่อนเผยแพร่ เพื่อไม่ให้ยอดสรุปคลาดเคลื่อน");
  const provinces = [...new Set(records.filter(r => r.topicId !== "agency").map(r => r.province))];
  const directories = Object.fromEntries(await Promise.all(provinces.map(async p => [p, affiliationIndex(await getSchoolsByProvince(p))])));
  const cells = buildPublicOverviewCells(records, record => recordAffiliation(record, directories));
  const version = crypto.randomUUID();
  for (let offset = 0; offset < cells.length; offset += 100) {
    const batch = writeBatch(db);
    cells.slice(offset, offset + 100).forEach((cell, i) => batch.set(doc(db, "public_overview_versions", version, "cells", String(offset + i)), cell));
    await batch.commit();
  }
  // Only flip the pointer once every cell exists. A concurrent deletion or
  // publication invalidates this attempt, preserving a consistent public view.
  await runTransaction(db, async tx => {
    const revision = (await tx.get(control)).data()?.revision ?? null;
    if (revision !== revisionBefore) throw new Error("ข้อมูลเปลี่ยนระหว่างเผยแพร่ กรุณากดอัปเดตภาพรวมอีกครั้ง");
    tx.set(doc(db, "public_overview", "current"), { schemaVersion: 2, version, years: [...new Set(cells.map(c => c.year).filter(y => /^\d{4}$/.test(y)))].sort().reverse(), updatedAt: serverTimestamp() });
    tx.set(control, { revision: version });
  });
  return { assessments: records.length, cells: cells.length };
}

// A manual refresh and automatic initialization in the same tab share one write.
let publication: Promise<{ assessments: number; cells: number }> | null = null;
export function publishPublicOverview() {
  if (!publication) publication = buildAndPublishPublicOverview().finally(() => { publication = null; });
  return publication;
}

let freshnessCheck: Promise<{ assessments: number; cells: number } | null> | null = null;
async function refreshFromSavedAssessments() {
  const auth = await getFirebaseAuth();
  if (!auth?.currentUser?.emailVerified || !isAdminEmail(auth.currentUser.email ?? "")) throw new Error("บัญชีนี้ไม่มีสิทธิ์เผยแพร่ภาพรวม");
  const db = await getFirebaseDb(); if (!db) throw new Error("เชื่อมต่อข้อมูลไม่สำเร็จ");
  const { collection, doc, getDoc, getDocs, limit, orderBy, query } = await import("firebase/firestore");
  const manifest = await getDoc(doc(db, "public_overview", "current"));
  const publishedAt = manifest.data()?.updatedAt?.toMillis?.() ?? 0;
  if (manifest.exists() && manifest.data()?.schemaVersion === 2 && publishedAt > 0) {
    const latest = await getDocs(query(collection(db, "submissions"), orderBy("createdAt", "desc"), limit(1)));
    const savedAt = latest.docs[0]?.data().createdAt?.toMillis?.() ?? 0;
    if (savedAt <= publishedAt) return null;
  }
  // Uses the exact same source and decoder as the staff search dashboard.
  return publishPublicOverview();
}

/** Refresh when an admin opens a protected page; anonymous visitors never read submissions. */
export function ensurePublicOverviewFresh() {
  if (!freshnessCheck) freshnessCheck = refreshFromSavedAssessments().finally(() => { freshnessCheck = null; });
  return freshnessCheck;
}
