import {
  agencyTypes,
  getTopic,
  provinces,
  type AgencyType,
  type Score,
  type TopicId,
} from "../assessment-data";
import { calculateScore, type Answer } from "../scoring";
import { getFirebaseDb, shouldUseFirestore } from "./firebase-client";

export type DashboardGrade = "A" | "B" | "C" | "D";
export type LowQuestion = { id: string; number: string; title: string; score: number };
export type DashboardRecord = {
  id: string;
  institution: string;
  province: string;
  topicId: TopicId;
  topicLabel: string;
  agencyType: string | null;
  score: number;
  grade: DashboardGrade;
  createdAt: string;
  lowQuestions: LowQuestion[];
};

export type DashboardResult = {
  source: "live" | "empty" | "unavailable";
  records: DashboardRecord[];
  error?: string;
};

export type DashboardListener = (result: DashboardResult) => void;

function isTopicId(value: unknown): value is TopicId {
  return ["bus", "trip", "moto", "agency"].includes(value as TopicId);
}

function isAgencyType(value: unknown): value is AgencyType {
  return agencyTypes.some((item) => item.id === value);
}

function toIsoDate(value: unknown) {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

function firestoreRecord(id: string, raw: Record<string, unknown>): DashboardRecord | null {
  if (raw.publicConsent !== true || typeof raw.institution !== "string") return null;
  if (!provinces.includes(raw.province as string) || !isTopicId(raw.topicId)) return null;

  const agencyType = raw.topicId === "agency" && isAgencyType(raw.agencyType)
    ? raw.agencyType
    : "road-safety";
  const topic = getTopic(raw.topicId, agencyType);
  if (!raw.answers || typeof raw.answers !== "object" || Array.isArray(raw.answers)) return null;

  const sourceAnswers = raw.answers as Record<string, unknown>;
  const answers: Record<string, Answer> = {};
  for (const question of topic.questions) {
    const value = sourceAnswers[question.id];
    if (!value || typeof value !== "object") return null;
    const answer = value as { score?: unknown; explanation?: unknown };
    if (![0, 1, 2, 3].includes(answer.score as Score)) return null;
    answers[question.id] = {
      score: answer.score as Score,
      explanation: typeof answer.explanation === "string" ? answer.explanation.slice(0, 500) : "",
    };
  }

  // ไม่เชื่อ score/grade จากเอกสารสาธารณะ คำนวณซ้ำด้วยเกณฑ์เวอร์ชันในโค้ด
  const summary = calculateScore(answers, topic);
  if (!summary.complete || summary.grade === "-") return null;
  return {
    id,
    institution: raw.institution.trim().slice(0, 180),
    province: raw.province as string,
    topicId: raw.topicId,
    topicLabel: topic.id === "agency" ? `${topic.label} — ${topic.detail}` : topic.label,
    agencyType: raw.topicId === "agency" ? agencyType : null,
    score: summary.percent,
    grade: summary.grade,
    createdAt: toIsoDate(raw.createdAt),
    lowQuestions: summary.questionResults
      .filter((question) => question.requiresImprovement)
      .map((question) => ({
        id: question.id,
        number: question.number,
        title: question.title,
        score: question.score ?? 0,
      })),
  };
}

async function subscribeToFirestore(listener: DashboardListener): Promise<() => void> {
  const { collection, onSnapshot, orderBy, query } = await import("firebase/firestore");
  const db = await getFirebaseDb();
  if (!db) {
    listener({
      source: "unavailable",
      records: [],
      error: "ยังไม่ได้ตั้งค่าการเชื่อมต่อ Firebase สำหรับ Dashboard",
    });
    return () => undefined;
  }

  // รุ่นนำร่องอ่านผลที่ยืนยันทั้งหมดเพื่อให้ KPI ตรงกับข้อมูลจริง และ subscribe เพื่ออัปเดตหน้าจอเมื่อมีผลใหม่
  // เมื่อข้อมูลมีหลักหมื่นรายการ ควรย้ายการรวมผลไปยัง aggregate collection ที่เขียนด้วย trusted backend
  const submissionsQuery = query(
    collection(db, "submissions"),
    orderBy("createdAt", "desc"),
  );

  return onSnapshot(
    submissionsQuery,
    (snapshot) => {
      const records = snapshot.docs
        .map((document) => firestoreRecord(document.id, document.data()))
        .filter((record): record is DashboardRecord => record !== null);
      listener({ source: records.length ? "live" : "empty", records });
    },
    () => listener({
      source: "unavailable",
      records: [],
      error: "ไม่สามารถอ่านข้อมูลจาก Firestore ได้ กรุณาตรวจสิทธิ์เข้าสู่ระบบแล้วลองใหม่",
    }),
  );
}

export const dashboardRepository = {
  async subscribe(listener: DashboardListener): Promise<() => void> {
    try {
      if (shouldUseFirestore()) return await subscribeToFirestore(listener);
      const response = await fetch("/api/dashboard");
      if (!response.ok) {
        listener({ source: "unavailable", records: [], error: "อ่านข้อมูล Dashboard ไม่สำเร็จ" });
        return () => undefined;
      }
      listener(await response.json() as DashboardResult);
    } catch {
      listener({ source: "unavailable", records: [], error: "เชื่อมต่อแหล่งข้อมูล Dashboard ไม่สำเร็จ" });
    }
    return () => undefined;
  },
};
