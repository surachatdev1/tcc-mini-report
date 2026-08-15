import type { Score, Topic } from "./assessment-data";

export type Answer = { score?: Score; explanation: string };
export type CategoryScore = {
  id: string;
  label: string;
  weight: number;
  percent: number;
  contribution: number;
};
export type QuestionResult = {
  id: string;
  number: string;
  title: string;
  categoryId: string;
  categoryLabel: string;
  categoryWeight: number;
  score: Score | null;
  level: string;
  selectedDescription: string;
  scorePercent: number;
  maxContribution: number;
  contribution: number;
  requiresImprovement: boolean;
  recommendation: string | null;
};
export type ScoreSummary = {
  answered: number;
  complete: boolean;
  percent: number;
  grade: "A" | "B" | "C" | "D" | "-";
  categories: CategoryScore[];
  questionResults: QuestionResult[];
  recommendations: string[];
};

// คะแนน 2 คือ “ขั้นมาตรฐาน” ตามร่างเกณฑ์ จึงใช้เป็นเส้นอ้างอิงสำหรับระบุข้อที่ควรพัฒนา
// คะแนน 0–1 ไม่ได้หมายถึงการลงโทษ แต่หมายถึงข้อที่ยังไม่ถึงขั้นมาตรฐานและควรมีแผนยกระดับ
export const STANDARD_SCORE_THRESHOLD: Score = 2;

export function gradeFromPercent(percent: number): "A" | "B" | "C" | "D" {
  if (percent >= 85) return "A";
  if (percent >= 70) return "B";
  if (percent >= 50) return "C";
  return "D";
}

export function calculateScore(answers: Record<string, Answer>, topic: Topic): ScoreSummary {
  const complete = topic.questions.every((question) => {
    const answer = answers[question.id];
    // คำอธิบายเป็นข้อมูลประกอบแบบ optional ความครบจึงพิจารณาจากการเลือกคะแนนทุกข้อเท่านั้น
    return answer?.score !== undefined;
  });
  // คิดค่าเฉลี่ยภายในหมวดก่อน แล้วคูณน้ำหนักตามร่างเกณฑ์ เพื่อไม่ให้หมวดที่มีคำถามมากกว่าได้อิทธิพลเกินจริง
  const categories = topic.categories.map((category) => {
    const questions = topic.questions.filter((question) => question.categoryId === category.id);
    const scores = questions.map((question) => answers[question.id]?.score).filter((score): score is Score => score !== undefined);
    // ตัวหารต้องเป็นจำนวนข้อทั้งหมดในหมวดตามสูตรในเอกสาร ไม่ใช่เฉพาะข้อที่ตอบแล้ว
    // จึงไม่ทำให้คะแนนชั่วคราวสูงเกินจริงระหว่างที่ผู้ใช้ยังตอบไม่ครบ
    const percent = questions.length ? (scores.reduce((sum, score) => sum + score, 0) / (questions.length * 3)) * 100 : 0;
    return { ...category, percent, contribution: (percent * category.weight) / 100 };
  });
  const percent = categories.reduce((sum, category) => sum + category.contribution, 0);

  // แตกคะแนนออกเป็นรายข้อเพื่อให้ผู้ประเมินตรวจสอบย้อนกลับได้ว่าแต่ละคำตอบ
  // มีผลต่อคะแนนรวมเท่าใด โดยแบ่งน้ำหนักหมวดให้ทุกข้อในหมวดเท่ากัน
  const questionResults = topic.questions.map((question): QuestionResult => {
    const category = topic.categories.find((item) => item.id === question.categoryId);
    if (!category) throw new Error(`ไม่พบหมวดคะแนนของข้อ ${question.number}`);
    const questionCount = topic.questions.filter((item) => item.categoryId === category.id).length;
    const score = answers[question.id]?.score ?? null;
    const selectedOption = question.options.find((option) => option.value === score);
    const maxContribution = category.weight / questionCount;
    const contribution = score === null ? 0 : (score / 3) * maxContribution;
    const requiresImprovement = score !== null && score < STANDARD_SCORE_THRESHOLD;
    let recommendation: string | null = null;

    if (score === 0) {
      const basicTarget = question.options.find((option) => option.value === 1)?.description;
      recommendation = basicTarget
        ? `รวบรวมข้อมูลหรือหลักฐานให้สามารถประเมินได้ แล้วเริ่มดำเนินการขั้นพื้นฐาน: ${basicTarget}`
        : question.improvement;
    } else if (score === 1) {
      const standardTarget = question.options.find((option) => option.value === 2)?.description;
      recommendation = standardTarget
        ? `ยกระดับสู่ขั้นมาตรฐาน: ${standardTarget}`
        : question.improvement;
    }

    return {
      id: question.id,
      number: question.number,
      title: question.title,
      categoryId: category.id,
      categoryLabel: category.label,
      categoryWeight: category.weight,
      score,
      level: selectedOption?.label ?? "ยังไม่ได้ตอบ",
      selectedDescription: selectedOption?.description ?? "",
      scorePercent: score === null ? 0 : (score / 3) * 100,
      maxContribution,
      contribution,
      requiresImprovement,
      recommendation,
    };
  });

  // แสดงข้อเสนอแนะครบทุกข้อที่ได้ 0–1 ไม่ตัดเหลือเพียงรายการสำคัญบางส่วน
  const recommendations = questionResults
    .filter((result) => result.requiresImprovement && result.recommendation)
    .sort((a, b) => (a.score ?? 3) - (b.score ?? 3))
    .map((result) => `ข้อ ${result.number}: ${result.recommendation}`);
  if (!recommendations.length && complete) recommendations.push("รักษามาตรฐานเดิม ติดตามผลเป็นรอบ และแบ่งปันแนวปฏิบัติที่ตรวจสอบได้ให้หน่วยงานเครือข่าย");
  return {
    answered: topic.questions.filter((question) => answers[question.id]?.score !== undefined).length,
    complete,
    percent,
    grade: complete ? gradeFromPercent(percent) : "-",
    categories,
    questionResults,
    recommendations,
  };
}
