import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicOverviewCells, defaultOverviewFilters, isPublicOverviewCell, selectPublicOverview } from "../lib/public-overview.ts";
import type { DashboardRecord } from "../lib/integrations/dashboard-repository.ts";
function record(values: Partial<DashboardRecord> = {}): DashboardRecord {
  return { id: "private-id", institution: "โรงเรียนทดสอบ", province: "เชียงใหม่", assessorName: "ห้ามเผยแพร่ชื่อ", assessorPhone: "ห้ามเผยแพร่เบอร์", respondentRole: "ห้ามเผยแพร่บทบาท", position: "ห้ามเผยแพร่ตำแหน่ง", assessmentDate: "2026-10-12", topicId: "bus", topicLabel: "รถรับส่ง", agencyType: null, score: 60, grade: "C", createdAt: "2026-10-12T00:00:00Z", lowQuestions: [], categoryScores: [{ id: "driver", label: "ห้ามเผยแพร่ข้อความอิสระ", weight: 35, contribution: 0, percent: 60 }], questionResults: [{ id: "q1", title: "ห้ามเผยแพร่ข้อความอิสระ", explanation: "ห้ามเผยแพร่คำตอบ", requiresImprovement: true }] as DashboardRecord["questionResults"], ...values };
}
const affiliation = () => "obec" as const;
test("published payload contains numeric aggregates and controlled dimensions only", () => {
  const cells = buildPublicOverviewCells([record()], affiliation);
  const json = JSON.stringify(cells);
  for (const secret of ["private-id", "โรงเรียนทดสอบ", "ห้ามเผยแพร่", "assessorName", "explanation", "respondentRole"]) assert.ok(!json.includes(secret), secret);
  assert.ok(cells.every(isPublicOverviewCell));
});
test("all-topic school counts deduplicate multiple assessments, grades and years", () => {
  const cells = buildPublicOverviewCells([record(), record({ topicId: "trip", grade: "A" }), record({ assessmentDate: "2025-01-01" }), record({ topicId: "agency", institution: "สำนักงาน" })], affiliation);
  const all = selectPublicOverview(cells, defaultOverviewFilters).summary;
  assert.equal(all.schools, 1); assert.equal(all.agencies, 1); assert.equal(all.assessments, 4);
  assert.deepEqual(all.grades, { A: 1, B: 0, C: 3, D: 0 });
  assert.equal(selectPublicOverview(cells, { ...defaultOverviewFilters, year: "2025" }).summary.assessments, 1);
});
test("year, province, affiliation, topic and grade compose without double counting", () => {
  const rows = [record({ grade: "A" }), record({ topicId: "trip", grade: "A" }), record({ province: "ลำปาง", grade: "A" }), record({ institution: "เอกชน", grade: "A" }), record({ assessmentDate: "2025-01-01", grade: "A" })];
  const cells = buildPublicOverviewCells(rows, r => r.institution === "เอกชน" ? "private" : "obec");
  const result = selectPublicOverview(cells, { year: "2026", province: "เชียงใหม่", affiliation: "obec", topic: "bus", grade: "A" });
  assert.equal(result.summary.assessments, 1); assert.equal(result.summary.schools, 1);
  assert.equal(result.topics.bus.assessments, 1); assert.equal(result.provinces["ลำปาง"].schools, 1);
  assert.equal(result.topics.trip, undefined);
});
test("domain grouping weights categories within each assessment before averaging", () => {
  const a = { id: "school", label: "แผน", weight: 25, contribution: 0, percent: 100 };
  const b = { id: "support", label: "สนับสนุน", weight: 15, contribution: 0, percent: 0 };
  const cells = buildPublicOverviewCells([record({ topicId: "trip", categoryScores: [a, b] }), record({ topicId: "trip", categoryScores: [{ ...a, percent: 0 }, b] })], affiliation);
  const metric = selectPublicOverview(cells, defaultOverviewFilters).summary.domains.management;
  assert.equal(metric.count, 2); assert.equal(metric.sum / metric.count, 31.25);
});
test("question gap denominators include only applicable assessments", () => {
  const cells = buildPublicOverviewCells([record(), record({ questionResults: [] }), record({ questionResults: [{ ...record().questionResults[0], requiresImprovement: false }] })], affiliation);
  assert.deepEqual(selectPublicOverview(cells, defaultOverviewFilters).summary.gaps["bus::q1"], { count: 1, eligible: 2 });
});
test("empty filter results have no made-up metrics or NaN", () => {
  const cells = buildPublicOverviewCells([record()], affiliation);
  const result = selectPublicOverview(cells, { ...defaultOverviewFilters, grade: "D" });
  assert.equal(result.summary.assessments, 0); assert.deepEqual(result.summary.domains, {});
  assert.deepEqual(buildPublicOverviewCells([], affiliation), []);
});
test("400 participants at 20 schools retain 400 assessments and 20 unique schools", () => {
  const cells = buildPublicOverviewCells(Array.from({ length: 400 }, (_, i) => record({ id: String(i), institution: `โรงเรียน ${i % 20}`, topicId: i % 2 ? "trip" : "bus" })), affiliation);
  const result = selectPublicOverview(cells, defaultOverviewFilters);
  assert.equal(result.summary.schools, 20); assert.equal(result.summary.assessments, 400);
  assert.equal(result.topics.bus.assessments + result.topics.trip.assessments, 400);
  assert.ok(cells.every(cell => Buffer.byteLength(JSON.stringify(cell)) < 900000));
});
test("invalid published metrics are rejected instead of silently displayed", () => {
  const [valid] = buildPublicOverviewCells([record()], affiliation);
  const broken = structuredClone(valid); broken.scopes.all_all.grades.A = 100;
  assert.equal(isPublicOverviewCell(broken), false);
  const invalidScore = structuredClone(valid); invalidScore.scopes.all_all.scoreSum = 101;
  assert.equal(isPublicOverviewCell(invalidScore), false);
});
