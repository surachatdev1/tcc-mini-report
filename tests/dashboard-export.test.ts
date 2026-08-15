import assert from "node:assert/strict";
import test from "node:test";
import writeExcelFile from "write-excel-file/node";
import { createDashboardWorkbook } from "../lib/exports/dashboard-excel.ts";
import type { DashboardRecord } from "../lib/integrations/dashboard-repository.ts";

const record: DashboardRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  institution: "=โรงเรียนทดสอบ",
  province: "กรุงเทพมหานคร",
  topicId: "bus",
  topicLabel: "รถรับ–ส่งนักเรียน",
  agencyType: null,
  score: 66.7,
  grade: "C",
  createdAt: "2026-08-15T09:30:00.000Z",
  lowQuestions: [{ id: "bus-driver-1", number: "1.1", title: "ตรวจสอบคุณสมบัติผู้ขับรถ", score: 1 }],
  categoryScores: [{ id: "driver", label: "ผู้ขับรถ", weight: 40, percent: 66.7, contribution: 26.68 }],
  questionResults: [{
    id: "bus-driver-1",
    number: "1.1",
    title: "ตรวจสอบคุณสมบัติผู้ขับรถ",
    categoryId: "driver",
    categoryLabel: "ผู้ขับรถ",
    categoryWeight: 40,
    score: 1,
    level: "เริ่มดำเนินการ",
    selectedDescription: "มีการตรวจสอบบางส่วน",
    scorePercent: 33.33,
    maxContribution: 13.33,
    contribution: 4.44,
    requiresImprovement: true,
    recommendation: "ยกระดับสู่ขั้นมาตรฐาน",
    explanation: "ข้อมูลประกอบสำหรับทดสอบ",
  }],
};

test("Excel ข้อมูลรวมมีทุกส่วนและสร้างเป็นไฟล์ xlsx ได้", async () => {
  const workbook = await createDashboardWorkbook({
    scope: "all",
    records: [record],
    provinceLabel: "ทุกจังหวัด",
    topicLabel: "ทุกแบบประเมิน",
  });

  assert.deepEqual(workbook.sheets.map((sheet) => sheet.sheet), [
    "ภาพรวม",
    "ตามจังหวัด",
    "ตามแบบประเมิน",
    "ระดับผล",
    "ประเด็นเร่งพัฒนา",
    "ผลประเมิน",
    "คะแนนรายหมวด",
    "รายละเอียดรายข้อ",
  ]);
  const assessmentSheet = workbook.sheets.find((sheet) => sheet.sheet === "ผลประเมิน");
  const questionSheet = workbook.sheets.find((sheet) => sheet.sheet === "รายละเอียดรายข้อ");
  assert.equal((assessmentSheet?.data[4][1] as { value?: unknown }).value, "'=โรงเรียนทดสอบ");
  assert.equal((questionSheet?.data[4][15] as { value?: unknown }).value, "ข้อมูลประกอบสำหรับทดสอบ");
  const buffer = await writeExcelFile(workbook.sheets, { fontFamily: "Sarabun", fontSize: 11 }).toBuffer();
  assert.ok(buffer.byteLength > 10_000);
});

test("Excel รายส่วนสร้างเฉพาะ worksheet ที่เลือก", async () => {
  const workbook = await createDashboardWorkbook({
    scope: "provinces",
    records: [record],
    provinceLabel: "กรุงเทพมหานคร",
    topicLabel: "ทุกแบบประเมิน",
  });
  assert.deepEqual(workbook.sheets.map((sheet) => sheet.sheet), ["ตามจังหวัด"]);
  assert.equal((workbook.sheets[0].data[4][2] as { value?: unknown }).value, 1);
});
