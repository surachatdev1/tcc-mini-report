import assert from "node:assert/strict";
import test from "node:test";
import { calculateScore, gradeFromPercent } from "../lib/scoring.ts";
import type { Topic } from "../lib/assessment-data.ts";

const scoreOptions: Topic["questions"][number]["options"] = [
  { value: 0, label: "ยังประเมินไม่ได้", description: "ยังไม่มีข้อมูล" },
  { value: 1, label: "ขั้นพื้นฐาน", description: "ดำเนินการขั้นต่ำ" },
  { value: 2, label: "ขั้นมาตรฐาน", description: "ดำเนินการตามมาตรฐาน" },
  { value: 3, label: "ขั้นยกระดับ", description: "ติดตามและพัฒนาต่อเนื่อง" },
];

const topic: Topic = {
  id: "bus",
  label: "ชุดทดสอบ",
  shortLabel: "ทดสอบ",
  detail: "ทดสอบสูตรน้ำหนัก",
  audience: "test",
  group: "school",
  categories: [
    { id: "driver", label: "คนขับ", weight: 35 },
    { id: "vehicle", label: "รถ", weight: 35 },
    { id: "management", label: "จัดการ", weight: 30 },
  ],
  questions: [
    { id: "d1", number: "1.1", categoryId: "driver", title: "d1", evidence: "e", improvement: "i", options: scoreOptions },
    { id: "d2", number: "1.2", categoryId: "driver", title: "d2", evidence: "e", improvement: "i", options: scoreOptions },
    { id: "v1", number: "2.1", categoryId: "vehicle", title: "v1", evidence: "e", improvement: "i", options: scoreOptions },
    { id: "m1", number: "3.1", categoryId: "management", title: "m1", evidence: "e", improvement: "i", options: scoreOptions },
  ],
};

function answers(score: 0 | 1 | 2 | 3) {
  return Object.fromEntries(topic.questions.map((question) => [question.id, { score, explanation: "เหตุผลประกอบการทดสอบ" }]));
}

test("เกณฑ์ระดับผลตรงตามร่าง", () => {
  assert.equal(gradeFromPercent(85), "A");
  assert.equal(gradeFromPercent(84.999), "B");
  assert.equal(gradeFromPercent(70), "B");
  assert.equal(gradeFromPercent(69.999), "C");
  assert.equal(gradeFromPercent(50), "C");
  assert.equal(gradeFromPercent(49.999), "D");
});

test("คะแนนเท่ากันทุกข้อแปลงเป็นร้อยละจากฐาน 3", () => {
  assert.equal(calculateScore(answers(3), topic).percent, 100);
  assert.ok(Math.abs(calculateScore(answers(2), topic).percent - 66.6666666667) < 0.000001);
  assert.ok(Math.abs(calculateScore(answers(1), topic).percent - 33.3333333333) < 0.000001);
  assert.equal(calculateScore(answers(0), topic).percent, 0);
});

test("คิดค่าเฉลี่ยภายในหมวดก่อนคูณน้ำหนัก และนับคะแนน 0 ในฐานคำนวณ", () => {
  const result = calculateScore({
    d1: { score: 3, explanation: "ครบ" },
    d2: { score: 3, explanation: "ครบ" },
    v1: { score: 0, explanation: "ไม่มีข้อมูล" },
    m1: { score: 0, explanation: "ไม่มีข้อมูล" },
  }, topic);
  assert.equal(result.percent, 35);
  assert.equal(result.grade, "D");
  assert.equal(result.complete, true);
  assert.equal(result.categories.reduce((sum, category) => sum + category.contribution, 0), result.percent);
  assert.equal(result.questionResults.find((item) => item.id === "d1")?.contribution, 17.5);
  assert.equal(result.questionResults.find((item) => item.id === "d2")?.contribution, 17.5);
});

test("แสดงผลและคำแนะนำแยกรายข้อเฉพาะคะแนนที่ยังไม่ถึงขั้นมาตรฐาน", () => {
  const result = calculateScore({
    d1: { score: 0, explanation: "ไม่มีข้อมูล" },
    d2: { score: 1, explanation: "เริ่มดำเนินการ" },
    v1: { score: 2, explanation: "ได้มาตรฐาน" },
    m1: { score: 3, explanation: "ยกระดับแล้ว" },
  }, topic);
  assert.equal(result.questionResults.length, 4);
  assert.equal(result.questionResults.filter((item) => item.requiresImprovement).length, 2);
  assert.match(result.questionResults[0].recommendation ?? "", /รวบรวมข้อมูลหรือหลักฐาน/);
  assert.match(result.questionResults[1].recommendation ?? "", /ยกระดับสู่ขั้นมาตรฐาน/);
  assert.equal(result.questionResults[2].recommendation, null);
  assert.equal(result.questionResults[3].recommendation, null);
  assert.equal(result.recommendations.length, 2);
});

test("ยังไม่ออกรับรองระดับเมื่อคำตอบไม่ครบ", () => {
  const result = calculateScore({ d1: { score: 3, explanation: "ครบ" } }, topic);
  assert.equal(result.complete, false);
  assert.equal(result.grade, "-");
  assert.equal(result.percent, 17.5);
  assert.equal(result.categories.find((category) => category.id === "driver")?.percent, 50);
});
