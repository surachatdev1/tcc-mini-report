import { eq } from "drizzle-orm";
import { assessments } from "@/db/schema";
import { getDb } from "@/db";
import { agencyTypes, getTopic, provinces, respondentRoles, rubricVersion, type AgencyType, type Score, type TopicId } from "@/lib/assessment-data";
import { calculateScore, type Answer } from "@/lib/scoring";

type Incoming = { idempotencyKey?: string; institution?: string; province?: string; assessorName?: string; assessorPhone?: string; respondentRole?: string; position?: string; assessmentDate?: string; topicId?: TopicId; agencyType?: AgencyType; answers?: Record<string, Answer>; publicConsent?: boolean };

function rowToRecord(row: typeof assessments.$inferSelect) {
  const topicId = row.topicId as TopicId;
  const agencyType = row.agencyType as AgencyType | null;
  const topic = getTopic(topicId, agencyType ?? "road-safety");
  const answers = JSON.parse(row.answersJson) as Record<string, Answer>;
  // คำนวณผลซ้ำจากคำตอบดิบ เพื่อให้ผลรายข้อและสูตรใช้ rubric เวอร์ชันเดียวกับหน้าเว็บเสมอ
  const summary = calculateScore(answers, topic);
  return { id: row.id, institution: row.institution, province: row.province,
    assessorName: row.assessorName, assessorPhone: "", respondentRole: row.respondentRole, position: row.position,
    assessmentDate: row.assessmentDate, topicId,
    topicLabel: row.topicLabel, agencyType, score: summary.percent,
    grade: summary.grade, categoryScores: summary.categories, questionResults: summary.questionResults,
    recommendations: summary.recommendations, verificationStatus: row.verificationStatus, createdAt: row.createdAt };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Incoming;
    const topicIds: TopicId[] = ["bus", "trip", "moto", "agency"];
    if (!payload.idempotencyKey || !payload.institution?.trim() || (payload.assessorName?.trim().length ?? 0) < 2 || !payload.assessmentDate || !payload.topicId || !payload.answers || payload.publicConsent !== true)
      return Response.json({ error: "กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบก่อนส่งแบบประเมิน" }, { status: 400 });
    if (!provinces.includes(payload.province ?? "") || !respondentRoles.includes(payload.respondentRole ?? "") || !topicIds.includes(payload.topicId))
      return Response.json({ error: "จังหวัด บทบาท หรือประเภทการประเมินไม่ถูกต้อง" }, { status: 400 });
    if (payload.topicId === "agency" && !agencyTypes.some((item) => item.id === payload.agencyType))
      return Response.json({ error: "กรุณาเลือกประเภทหน่วยงาน" }, { status: 400 });

    const topic = getTopic(payload.topicId, payload.agencyType);
    const sanitizedAnswers: Record<string, Answer> = {};
    for (const question of topic.questions) {
      const answer = payload.answers[question.id];
      if (![0, 1, 2, 3].includes(answer?.score as Score))
        return Response.json({ error: `กรุณาเลือกคะแนนข้อ ${question.number}` }, { status: 400 });
      const explanation = (answer.explanation ?? "").trim().slice(0, 500);
      if (!explanation)
        return Response.json({ error: `กรุณาระบุเหตุผลหรือข้อมูลประกอบข้อ ${question.number}` }, { status: 400 });
      sanitizedAnswers[question.id] = { score: answer.score, explanation };
    }
    // คำนวณซ้ำฝั่งเซิร์ฟเวอร์เสมอ ไม่เชื่อคะแนนจากเบราว์เซอร์
    const summary = calculateScore(sanitizedAnswers, topic);
    const db = await getDb();
    const existing = await db.select().from(assessments).where(eq(assessments.idempotencyKey, payload.idempotencyKey)).limit(1);
    if (existing[0]) return Response.json({ assessment: rowToRecord(existing[0]) });
    const [created] = await db.insert(assessments).values({
      id: crypto.randomUUID(), idempotencyKey: payload.idempotencyKey, institution: payload.institution.trim().slice(0, 180),
      // ฐานข้อมูลฝั่งเซิร์ฟเวอร์เก็บชื่อเพื่ออ้างอิง แต่ API Dashboard ไม่เลือกหรือส่งชื่อออกสู่สาธารณะ
      province: payload.province!, assessorName: payload.assessorName.trim().slice(0, 120), respondentRole: payload.respondentRole!,
      position: payload.position?.trim().slice(0, 120) ?? "", assessmentDate: payload.assessmentDate,
      topicId: payload.topicId, topicLabel: topic.id === "agency" ? `${topic.label} — ${topic.detail}` : topic.label,
      agencyType: payload.topicId === "agency" ? payload.agencyType : null, rubricVersion,
      answersJson: JSON.stringify(sanitizedAnswers), categoryScoresJson: JSON.stringify(summary.categories),
      recommendationsJson: JSON.stringify(summary.recommendations), scoreBasisPoints: Math.round(summary.percent * 100), grade: summary.grade,
    }).returning();
    return Response.json({ assessment: rowToRecord(created) }, { status: 201 });
  } catch { return Response.json({ error: "ขออภัย ขณะนี้ยังไม่สามารถส่งแบบประเมินได้ กรุณาลองใหม่อีกครั้ง" }, { status: 500 }); }
}
