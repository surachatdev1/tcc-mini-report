import {
  getTopic,
  rubricVersion,
  type AgencyType,
  type Score,
  type TopicId,
} from "../assessment-data";
import { calculateScore, type Answer, type CategoryScore, type QuestionResult } from "../scoring";
import { getFirebaseDb, shouldUseFirestore } from "./firebase-client";

export type DraftPayload = {
  institution: string;
  province: string;
  assessorName: string;
  respondentRole: string;
  position: string;
  assessmentDate: string;
  topicId: TopicId;
  agencyType: AgencyType;
  answers: Record<string, Answer>;
  publicConsent: boolean;
};

export type SubmissionInput = DraftPayload & { idempotencyKey: string };

export type AssessmentRecord = {
  id: string;
  institution: string;
  province: string;
  assessorName: string;
  respondentRole: string;
  assessmentDate: string;
  topicId: TopicId;
  topicLabel: string;
  agencyType: AgencyType | null;
  score: number;
  grade: "A" | "B" | "C" | "D";
  categoryScores: CategoryScore[];
  questionResults: QuestionResult[];
  recommendations: string[];
  verificationStatus: "self_reported" | "verified";
  createdAt: string;
};

export interface AssessmentRepository {
  saveDraft(payload: DraftPayload): Promise<void>;
  loadDraft(): Promise<DraftPayload | null>;
  submit(payload: SubmissionInput): Promise<AssessmentRecord>;
}

const DRAFT_KEY = "tcc-assessment-draft-v5";

function sanitizeAnswers(payload: SubmissionInput) {
  const topic = getTopic(payload.topicId, payload.agencyType);
  const sanitized: Record<string, Answer> = {};

  for (const question of topic.questions) {
    const answer = payload.answers[question.id];
    if (![0, 1, 2, 3].includes(answer?.score as Score)) {
      throw new Error(`กรุณาเลือกคะแนนข้อ ${question.number}`);
    }

    const explanation = (answer.explanation ?? "").trim().slice(0, 500);
    // ข้อมูลประกอบเป็น optional แต่ยังตัดความยาวเพื่อคุมขนาดเอกสาร Firestore
    sanitized[question.id] = { score: answer.score, explanation };
  }

  return { topic, answers: sanitized };
}

async function submitToFirestore(payload: SubmissionInput): Promise<AssessmentRecord> {
  if (!payload.publicConsent) {
    throw new Error("กรุณายืนยันการเผยแพร่ข้อมูลสรุปก่อนบันทึกผล");
  }

  const { doc, runTransaction, serverTimestamp } = await import("firebase/firestore");
  const db = await getFirebaseDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase สำหรับเว็บไซต์นี้");

  const { topic, answers } = sanitizeAnswers(payload);
  const summary = calculateScore(answers, topic);
  const documentRef = doc(db, "submissions", payload.idempotencyKey);
  const assessorDocumentRef = doc(db, "submission_assessors", payload.idempotencyKey);
  const assessorName = payload.assessorName.trim().slice(0, 120);
  if (assessorName.length < 2) throw new Error("กรุณาระบุชื่อผู้ประเมิน");
  let createdAt = new Date().toISOString();

  // Transaction ทำให้การกดซ้ำด้วยรหัสเดิมสร้างเอกสารเพียงครั้งเดียว
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(documentRef);
    if (existing.exists()) {
      const value = existing.data().createdAt;
      if (value && typeof value.toDate === "function") createdAt = value.toDate().toISOString();
      return;
    }

    // เอกสารสาธารณะไม่เก็บชื่อบุคคลหรือคะแนนรวม: Dashboard คำนวณใหม่จากคำตอบดิบตาม rubricVersion
    transaction.set(documentRef, {
      schemaVersion: 1,
      publicConsent: true,
      institution: payload.institution.trim().slice(0, 180),
      province: payload.province,
      respondentRole: payload.respondentRole,
      position: payload.position.trim().slice(0, 120),
      assessmentDate: payload.assessmentDate,
      topicId: payload.topicId,
      topicLabel: topic.id === "agency" ? `${topic.label} — ${topic.detail}` : topic.label,
      agencyType: payload.topicId === "agency" ? payload.agencyType : null,
      rubricVersion,
      answers,
      verificationStatus: "self_reported",
      createdAt: serverTimestamp(),
    });

    // ชื่อผู้ประเมินแยกไว้ใน collection ที่ Firestore Rules ไม่เปิดให้อ่านจาก client
    // เพื่อให้ข้อมูลสรุปสาธารณะไม่เปิดเผยตัวบุคคล แต่ผู้ดูแลยังอ้างอิงภายหลังผ่าน Admin SDK ได้
    transaction.set(assessorDocumentRef, {
      schemaVersion: 1,
      submissionId: payload.idempotencyKey,
      assessorName,
      createdAt: serverTimestamp(),
    });
  });

  window.localStorage.removeItem(DRAFT_KEY);
  return {
    id: payload.idempotencyKey,
    institution: payload.institution.trim(),
    province: payload.province,
    assessorName,
    respondentRole: payload.respondentRole,
    assessmentDate: payload.assessmentDate,
    topicId: payload.topicId,
    topicLabel: topic.id === "agency" ? `${topic.label} — ${topic.detail}` : topic.label,
    agencyType: payload.topicId === "agency" ? payload.agencyType : null,
    score: summary.percent,
    grade: summary.grade as "A" | "B" | "C" | "D",
    categoryScores: summary.categories,
    questionResults: summary.questionResults,
    recommendations: summary.recommendations,
    verificationStatus: "self_reported",
    createdAt,
  };
}

// ร่างเป็นข้อมูลชั่วคราวจึงเก็บในเครื่อง ส่วนผลยืนยันส่งไปยัง provider ที่กำหนด
export const assessmentRepository: AssessmentRepository = {
  async saveDraft(payload) {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  },
  async loadDraft() {
    const saved = window.localStorage.getItem(DRAFT_KEY);
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved) as Partial<DraftPayload>;
      return { ...parsed, publicConsent: parsed.publicConsent === true } as DraftPayload;
    } catch {
      return null;
    }
  },
  async submit(payload) {
    if (shouldUseFirestore()) return submitToFirestore(payload);

    const response = await fetch("/api/assessments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json() as { assessment?: AssessmentRecord; error?: string };
    if (!response.ok || !data.assessment) {
      throw new Error(data.error || "บันทึกผลไม่สำเร็จ");
    }
    window.localStorage.removeItem(DRAFT_KEY);
    return data.assessment;
  },
};

// เดโม Sites ใช้ API เดิม ส่วน Firebase build เลือก Firestore ผ่าน VITE_DATA_PROVIDER=firestore
