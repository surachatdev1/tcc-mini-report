import test from "node:test";
import assert from "node:assert/strict";
import { overviewSummary, overviewCategories, overviewGaps, overviewSchools, overviewYear, gradeDistribution } from "../lib/dashboard-overview.ts";
import type { DashboardRecord } from "../lib/integrations/dashboard-repository.ts";

function record(values: Partial<DashboardRecord> = {}): DashboardRecord {
  return { id: "r1", institution: "โรงเรียนทดสอบ", province: "เชียงใหม่", assessorName: "", assessorPhone: "", respondentRole: "", position: "",
    assessmentDate: "2026-10-12", topicId: "bus", topicLabel: "รถรับส่ง", agencyType: null, score: 60, grade: "C", createdAt: "2026-10-12T00:00:00Z",
    lowQuestions: [], categoryScores: [], questionResults: [], ...values };
}
test("school count deduplicates names within province, separates agencies and keeps every assessment", () => {
  const summary = overviewSummary([record(), record({ id: "r2", institution: "ทดสอบ" }), record({ id: "r3", province: "ลำปาง" }), record({ id: "r4", topicId: "agency" })]);
  assert.equal(summary.schools, 2); assert.equal(summary.agencies, 1); assert.equal(summary.assessments, 4); assert.equal(summary.provinces, 2);
});
test("grade chart counts assessments and sums to 100 percent", () => {
  const groups = gradeDistribution([record({ grade: "A" }), record({ grade: "B" }), record({ grade: "D" }), record({ grade: "D" })]);
  assert.deepEqual(groups.map(g => g.count), [1, 1, 0, 2]);
  assert.equal(groups.reduce((sum, g) => sum + g.percent, 0), 100);
});
test("empty data has no invented score, category or gap", () => {
  assert.equal(overviewSummary([]).average, null); assert.equal(overviewSummary([]).schools, 0);
  assert.deepEqual(overviewCategories([]), []); assert.deepEqual(overviewGaps([]), []);
  assert.ok(gradeDistribution([]).every(g => g.percent === 0));
});
test("category averages keep different rubrics apart even when category ids match", () => {
  const category = { id: "driver", label: "คนขับ", weight: 35, contribution: 0, percent: 50 };
  const categories = overviewCategories([record({ categoryScores: [category] }), record({ categoryScores: [{ ...category, percent: 100 }] }), record({ topicId: "trip", categoryScores: [category] })]);
  assert.equal(categories.length, 2); assert.equal(categories[0].average, 75); assert.equal(categories[0].count, 2); assert.equal(categories[1].average, 50);
});
test("gap percentages use only assessments containing that question", () => {
  const question = { id: "q1", title: "ทดสอบ", requiresImprovement: true } as DashboardRecord["questionResults"][number];
  const gaps = overviewGaps([record({ questionResults: [question] }), record({ questionResults: [{ ...question, requiresImprovement: false }] }), record({ topicId: "moto" })]);
  assert.equal(gaps[0].count, 1); assert.equal(gaps[0].eligible, 2); assert.equal(gaps[0].percent, 50);
});
test("school table combines multiple assessment topics and excludes agency records", () => {
  const schools = overviewSchools([record(), record({ topicId: "trip", score: 80 }), record({ topicId: "agency" })]);
  assert.equal(schools.length, 1); assert.equal(schools[0].average, 70); assert.equal(schools[0].count, 2); assert.deepEqual([...schools[0].topics], ["bus", "trip"]);
});
test("year follows assessment date, falling back to the Bangkok date only when missing", () => {
  assert.equal(overviewYear(record()), "2026");
  assert.equal(overviewYear(record({ assessmentDate: "", createdAt: "2025-12-31T18:00:00Z" })), "2026");
  assert.equal(overviewYear(record({ assessmentDate: "", createdAt: "invalid" })), "");
});
