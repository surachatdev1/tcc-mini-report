import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { assessments } from "@/db/schema";
import { getTopic, type AgencyType, type TopicId } from "@/lib/assessment-data";
import { calculateScore, type Answer } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.select().from(assessments).orderBy(desc(assessments.createdAt)).limit(500);

    // เดโม Sites ส่งเฉพาะข้อมูลที่ Dashboard ต้องใช้ ไม่ส่งชื่อบุคคลหรือคำอธิบายรายข้อออกไป
    // Firebase production ใช้ collection สาธารณะตาม consent และ App Check โดยไม่มีหน้า login
    const records = rows.map((row) => {
      const topicId = row.topicId as TopicId;
      const agencyType = (row.agencyType ?? "road-safety") as AgencyType;
      const topic = getTopic(topicId, agencyType);
      const answers = JSON.parse(row.answersJson) as Record<string, Answer>;
      // คำนวณใหม่จากคำตอบดิบ ไม่ใช้คะแนนรวมที่บันทึกไว้ เพื่อให้ Dashboard ใช้สูตรเดียวกับหน้าผลลัพธ์
      const summary = calculateScore(answers, topic);
      const lowQuestions = summary.questionResults
        .filter((question) => question.requiresImprovement)
        .map((question) => ({
          id: question.id,
          number: question.number,
          title: question.title,
          score: question.score ?? 0,
        }));

      return {
        id: row.id,
        institution: row.institution,
        province: row.province,
        topicId,
        topicLabel: row.topicLabel,
        agencyType: row.agencyType,
        score: summary.percent,
        grade: summary.grade,
        createdAt: row.createdAt,
        lowQuestions,
      };
    });

    return Response.json({ source: records.length ? "live" : "empty", records });
  } catch (error) {
    // Agent preview ไม่มี D1 binding จึงคืนสถานะให้หน้าจอใช้ชุดข้อมูลสาธิตแทน
    return Response.json({
      source: "unavailable",
      records: [],
      error: error instanceof Error ? error.message : "อ่านข้อมูลสรุปไม่สำเร็จ",
    });
  }
}
