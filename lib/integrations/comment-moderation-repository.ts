import { isAdminEmail } from "@/lib/access-roles";
import { dashboardRepository } from "@/lib/integrations/dashboard-repository";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/integrations/firebase-client";

export type AssessmentComment = {
  id: string;
  submissionId: string;
  questionId: string;
  questionNumber: string;
  questionTitle: string;
  text: string;
  institution: string;
  province: string;
  topicLabel: string;
  assessmentDate: string;
  createdAt: string;
};

export async function subscribeAssessmentComments(
  onValue: (comments: AssessmentComment[]) => void,
  onError: (error: unknown) => void,
) {
  return dashboardRepository.subscribe((result) => {
    if (result.source === "unavailable") {
      onError(new Error(result.error || "ไม่สามารถโหลดรายการความคิดเห็นได้"));
      return;
    }

    const comments = result.records.flatMap((record) => record.questionResults
      .filter((question) => question.explanation.trim().length > 0)
      .map((question) => ({
        id: `${record.id}:${question.id}`,
        submissionId: record.id,
        questionId: question.id,
        questionNumber: question.number,
        questionTitle: question.title,
        text: question.explanation,
        institution: record.institution,
        province: record.province,
        topicLabel: record.topicLabel,
        assessmentDate: record.assessmentDate,
        createdAt: record.createdAt,
      })))
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));

    onValue(comments);
  });
}

async function requireAdminDatabase() {
  const auth = await getFirebaseAuth();
  const email = auth?.currentUser?.email?.trim().toLowerCase() ?? "";
  if (!email || !isAdminEmail(email)) {
    throw new Error("บัญชีนี้ไม่มีสิทธิ์จัดการความคิดเห็น");
  }

  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อข้อมูลความคิดเห็นได้");
  return db;
}

function validateDocumentPath(comment: AssessmentComment) {
  if (!/^[A-Za-z0-9-]{1,120}$/.test(comment.submissionId) || !/^[A-Za-z0-9-]{1,120}$/.test(comment.questionId)) {
    throw new Error("ไม่สามารถระบุความคิดเห็นที่ต้องการลบได้");
  }
}

export async function deleteAssessmentComment(comment: AssessmentComment) {
  validateDocumentPath(comment);
  const db = await requireAdminDatabase();
  const { doc, updateDoc } = await import("firebase/firestore");

  // ลบเฉพาะข้อความประกอบ คะแนนและข้อมูลผลประเมินส่วนอื่นยังคงเดิม
  await updateDoc(doc(db, "submissions", comment.submissionId), {
    [`answers.${comment.questionId}.explanation`]: "",
  });
}

export async function deleteAllAssessmentComments(comments: AssessmentComment[]) {
  if (!comments.length) return;
  comments.forEach(validateDocumentPath);

  const db = await requireAdminDatabase();
  const { doc, writeBatch } = await import("firebase/firestore");
  const commentsBySubmission = new Map<string, AssessmentComment[]>();

  for (const comment of comments) {
    const current = commentsBySubmission.get(comment.submissionId) ?? [];
    current.push(comment);
    commentsBySubmission.set(comment.submissionId, current);
  }

  const submissions = [...commentsBySubmission.entries()];
  // Firestore จำกัด batch ไว้ที่ 500 operations จึงแบ่งเผื่อไว้ครั้งละ 400 เอกสาร
  for (let offset = 0; offset < submissions.length; offset += 400) {
    const batch = writeBatch(db);
    for (const [submissionId, submissionComments] of submissions.slice(offset, offset + 400)) {
      const updates = Object.fromEntries(
        submissionComments.map((comment) => [`answers.${comment.questionId}.explanation`, ""]),
      );
      batch.update(doc(db, "submissions", submissionId), updates);
    }
    await batch.commit();
  }
}
