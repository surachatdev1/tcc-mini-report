import { isAdminEmail } from "@/lib/access-roles";
import {
  dashboardRepository,
  type DashboardRecord,
} from "@/lib/integrations/dashboard-repository";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/integrations/firebase-client";

export type AssessmentSubmission = DashboardRecord;

export async function subscribeAssessmentSubmissions(
  onValue: (submissions: AssessmentSubmission[]) => void,
  onError: (error: unknown) => void,
) {
  return dashboardRepository.subscribe((result) => {
    if (result.source === "unavailable") {
      onError(new Error(result.error || "ไม่สามารถโหลดรายการแบบประเมินได้"));
      return;
    }
    onValue(result.records);
  });
}

async function requireAdminDatabase() {
  const auth = await getFirebaseAuth();
  const email = auth?.currentUser?.email?.trim().toLowerCase() ?? "";
  if (!email || !isAdminEmail(email)) {
    throw new Error("บัญชีนี้ไม่มีสิทธิ์ลบแบบประเมิน");
  }

  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อข้อมูลแบบประเมินได้");
  return db;
}

function requireSubmissionId(id: string) {
  if (!/^[A-Za-z0-9-]{1,120}$/.test(id)) {
    throw new Error("ไม่สามารถระบุแบบประเมินที่ต้องการลบได้");
  }
}

async function clearPublishedBenchmarks(db: NonNullable<Awaited<ReturnType<typeof getFirebaseDb>>>) {
  const { collection, getDocs, writeBatch } = await import("firebase/firestore");
  const benchmarkSnapshot = await getDocs(collection(db, "benchmarks"));
  for (let offset = 0; offset < benchmarkSnapshot.docs.length; offset += 400) {
    const batch = writeBatch(db);
    for (const benchmark of benchmarkSnapshot.docs.slice(offset, offset + 400)) {
      batch.delete(benchmark.ref);
    }
    await batch.commit();
  }
}

export async function deleteAssessmentSubmission(submission: AssessmentSubmission) {
  requireSubmissionId(submission.id);
  const db = await requireAdminDatabase();
  const { doc, writeBatch } = await import("firebase/firestore");
  const batch = writeBatch(db);

  // ผลประเมินและข้อมูลผู้ประเมินใช้ document id เดียวกัน จึงลบคู่กันใน atomic batch
  batch.delete(doc(db, "submissions", submission.id));
  batch.delete(doc(db, "submission_assessors", submission.id));
  await batch.commit();
  // ค่ากลางเดิมอาจไม่ตรงหลังลบข้อมูล จึงล้างและให้ Admin สร้างใหม่จาก Dashboard
  await clearPublishedBenchmarks(db);
}

export async function deleteAllAssessmentSubmissions(submissions: AssessmentSubmission[]) {
  if (!submissions.length) return;
  submissions.forEach((submission) => requireSubmissionId(submission.id));
  const db = await requireAdminDatabase();
  const { doc, writeBatch } = await import("firebase/firestore");

  // หนึ่งแบบประเมินใช้ 2 delete operations จึงแบ่งครั้งละ 200 ชุด ต่ำกว่าขีดจำกัด 500 operations
  for (let offset = 0; offset < submissions.length; offset += 200) {
    const batch = writeBatch(db);
    for (const submission of submissions.slice(offset, offset + 200)) {
      batch.delete(doc(db, "submissions", submission.id));
      batch.delete(doc(db, "submission_assessors", submission.id));
    }
    await batch.commit();
  }
  await clearPublishedBenchmarks(db);
}
