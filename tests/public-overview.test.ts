import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicOverviewCells, defaultOverviewFilters, isPublicOverviewCell, selectPublicOverview, overviewInstitutionOptions, validOverviewDateRange } from "../lib/public-overview.ts";
import { overviewSearchLabel } from "../lib/public-overview-search.ts";
import { createPublicOverviewWorkbook } from "../lib/exports/public-overview-excel.ts";
import { selectOverviewDetail } from "../lib/public-overview-details.ts";
import { publicOverviewError } from "../lib/public-overview-errors.ts";
import { gapShortTitles, overviewGapExportRows, overviewGapStats, rankedOverviewGaps } from "../lib/public-overview-gaps.ts";
import { readFileSync } from "node:fs";
import type { DashboardRecord } from "../lib/integrations/dashboard-repository.ts";
function record(values: Partial<DashboardRecord> = {}): DashboardRecord {
  return { id: "private-id", institution: "โรงเรียนทดสอบ", province: "เชียงใหม่", assessorName: "ห้ามเผยแพร่ชื่อ", assessorPhone: "ห้ามเผยแพร่เบอร์", respondentRole: "ห้ามเผยแพร่บทบาท", position: "ห้ามเผยแพร่ตำแหน่ง", assessmentDate: "2026-10-12", topicId: "bus", topicLabel: "รถรับส่ง", agencyType: null, score: 60, grade: "C", createdAt: "2026-10-12T00:00:00Z", lowQuestions: [], categoryScores: [{ id: "driver", label: "ห้ามเผยแพร่ข้อความอิสระ", weight: 35, contribution: 0, percent: 60 }], questionResults: [{ id: "q1", title: "ห้ามเผยแพร่ข้อความอิสระ", explanation: "ห้ามเผยแพร่คำตอบ", requiresImprovement: true }] as DashboardRecord["questionResults"], ...values };
}
const affiliation = () => "obec" as const;
test("public search dimensions contain institution and date but never assessor or answer data", () => {
  const cells = buildPublicOverviewCells([record()], affiliation);
  const json = JSON.stringify(cells);
  for (const secret of ["private-id", "ห้ามเผยแพร่", "assessorName", "explanation", "respondentRole"]) assert.ok(!json.includes(secret), secret);
  assert.equal(cells[0].institution, "โรงเรียนทดสอบ");
  assert.equal(cells[0].assessmentDate, "2026-10-12");
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
  assert.equal(result.topics.bus.assessments, 1); assert.equal(result.provinces["ลำปาง"], undefined);
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

test("gap counts explain 35 of 49 as below standard, with 14 meeting standard", () => {
  assert.deepEqual(overviewGapStats({ count: 35, eligible: 49 }), { belowShare: 35 / 49 * 100, belowPercent: 71, meetsCount: 14, meetsPercent: 29 });
  assert.deepEqual(overviewGapStats({ count: 0, eligible: 4 }), { belowShare: 0, belowPercent: 0, meetsCount: 4, meetsPercent: 100 });
  assert.deepEqual(overviewGapStats({ count: 4, eligible: 4 }), { belowShare: 100, belowPercent: 100, meetsCount: 0, meetsPercent: 0 });
  assert.deepEqual(overviewGapStats({ count: 0, eligible: 0 }), { belowShare: 0, belowPercent: null, meetsCount: 0, meetsPercent: null });
  const rounded = overviewGapStats({ count: 1, eligible: 8 });
  assert.equal(rounded.belowPercent, 13); assert.equal(rounded.meetsPercent, 87);
});

test("gap ranking uses counts rather than percentage and exports each question's denominator", () => {
  const entries = rankedOverviewGaps({ smaller: { count: 4, eligible: 4 }, larger: { count: 35, eligible: 49 }, none: { count: 0, eligible: 50 }, empty: { count: 0, eligible: 0 } });
  assert.deepEqual(entries.map(([key]) => key), ["larger", "smaller"]);
  const rows = overviewGapExportRows(entries, { larger: { title: "เกณฑ์ต้นฉบับ", shortTitle: "ชื่อย่อ", topic: "รถรับส่ง" } });
  assert.deepEqual(rows, [["เกณฑ์ต้นฉบับ", "รถรับส่ง", 49, 35, 71, 14, 29], ["smaller", "", 4, 4, 100, 0, 0]]);
});

test("short labels cover the current school and agency rubric without changing original text", () => {
  const criteria = JSON.parse(readFileSync(new URL("../lib/criteria.generated.json", import.meta.url), "utf8"));
  const questions = [...Object.values(criteria.schoolTopics), ...Object.values(criteria.agencyTopics)].flatMap(topic => (topic as { questions: { id: string; title: string }[] }).questions);
  assert.deepEqual(Object.keys(gapShortTitles).sort(), questions.map(q => q.id).sort());
  for (const question of questions) assert.ok(gapShortTitles[question.id].length <= question.title.length, question.id);
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

test("detail rows respect the searched province instead of leaking the map context", () => {
  const cells = buildPublicOverviewCells([record(), record({ province: "ลำปาง" })], affiliation);
  const detail = selectOverviewDetail(cells, { ...defaultOverviewFilters, province: "เชียงใหม่" }, { title: "รายละเอียด" });
  assert.equal(detail.summary.assessments, 1);
  assert.deepEqual(detail.rows.map(([province]) => province), ["เชียงใหม่"]);
});
test("province and grade drill-down preserve year, affiliation and topic filters", () => {
  const cells = buildPublicOverviewCells([record({ grade: "A" }), record({ grade: "D" }), record({ topicId: "trip", grade: "A" }), record({ province: "ลำปาง", grade: "A" }), record({ assessmentDate: "2025-01-01", grade: "A" })], affiliation);
  const detail = selectOverviewDetail(cells, { ...defaultOverviewFilters, year: "2026", topic: "bus", affiliation: "obec" }, { title: "รายละเอียด", grade: "A", province: "เชียงใหม่" });
  assert.equal(detail.summary.assessments, 1);
  assert.equal(detail.filters.year, "2026");
  assert.equal(detail.filters.affiliation, "obec");
  assert.equal(detail.topics.trip, undefined);
});
test("category drill-down excludes provinces that have no applicable category", () => {
  const cells = buildPublicOverviewCells([record(), record({ province: "ลำปาง", categoryScores: [] })], affiliation);
  const detail = selectOverviewDetail(cells, defaultOverviewFilters, { title: "คนขับ", metric: { field: "domains", id: "driver", description: "" } });
  assert.deepEqual(detail.rows.map(([province]) => province), ["เชียงใหม่"]);
  assert.equal(detail.summary.domains.driver.count, 1);
});
test("load errors distinguish denied public access from offline failures", () => {
  assert.match(publicOverviewError({ code: "permission-denied" }), /สิทธิ์อ่านข้อมูลสรุปสาธารณะ/);
  assert.match(publicOverviewError({ code: "unavailable" }), /อินเทอร์เน็ต/);
  assert.match(publicOverviewError(new Error("private implementation detail")), /กรุณาลองใหม่/);
  assert.ok(!publicOverviewError(new Error("private implementation detail")).includes("private"));
});

test("school/date search composes with province, type, year, affiliation and grade, including both boundary days", () => {
  const rows = [
    record({ assessmentDate: "2026-10-10", score: 40 }),
    record({ assessmentDate: "2026-10-12", score: 60 }),
    record({ assessmentDate: "2026-10-13" }),
    record({ assessmentDate: "2026-10-09" }),
    record({ institution: "โรงเรียนอื่น" }),
    record({ province: "ลำปาง" }),
    record({ topicId: "trip" }),
    record({ grade: "A" }),
    record({ assessmentDate: "2025-10-10" }),
  ];
  const cells = buildPublicOverviewCells(rows, affiliation);
  const filters = { ...defaultOverviewFilters, year: "2026", province: "เชียงใหม่", institution: cells[0].institutionKey, topic: "bus" as const, grade: "C" as const, affiliation: "obec" as const, dateFrom: "2026-10-10", dateTo: "2026-10-12" };
  const view = selectPublicOverview(cells, filters);
  assert.equal(view.summary.assessments, 2);
  assert.equal(view.summary.schools, 1);
  assert.equal(view.summary.scoreSum, 100);
  assert.deepEqual(Object.keys(view.provinces), ["เชียงใหม่"]);
  assert.deepEqual(Object.keys(view.topics), ["bus"]);
  assert.deepEqual(view.summary.grades, { A: 0, B: 0, C: 2, D: 0 });
  const detail = selectOverviewDetail(cells, filters, { title: "รายละเอียด", grade: "C" });
  assert.deepEqual(detail.summary, view.summary);
  assert.equal(selectPublicOverview(cells, { ...filters, affiliation: "private" }).summary.assessments, 0);
  assert.equal(selectPublicOverview(cells, { ...filters, dateTo: "" }).summary.assessments, 3);
  assert.equal(selectPublicOverview(cells, { ...filters, dateFrom: "" }).summary.assessments, 3);
  assert.equal(selectPublicOverview(cells, { ...filters, dateFrom: "2026-10-13" }).summary.assessments, 0);
  assert.equal(validOverviewDateRange({ ...filters, dateFrom: "2026-10-13" }), false);
  assert.equal(overviewInstitutionOptions(cells, "เชียงใหม่").length, 2);
  assert.equal(overviewInstitutionOptions(cells, "ลำปาง").length, 1);
});

test("date fallback uses Bangkok's day and unknown dates cannot enter a bounded search", () => {
  const cells = buildPublicOverviewCells([
    record({ assessmentDate: "", createdAt: "2026-10-11T18:00:00Z" }),
    record({ assessmentDate: "", createdAt: "invalid" }),
  ], affiliation);
  assert.equal(selectPublicOverview(cells, { ...defaultOverviewFilters, dateFrom: "2026-10-12", dateTo: "2026-10-12" }).summary.assessments, 1);
  assert.equal(selectPublicOverview(cells, defaultOverviewFilters).summary.assessments, 2);
});

test("old published cells remain usable and partial new search dimensions are rejected", () => {
  const [detailed] = buildPublicOverviewCells([record()], affiliation);
  const legacy = { year: detailed.year, province: detailed.province, affiliation: detailed.affiliation, scopes: detailed.scopes };
  assert.equal(isPublicOverviewCell(legacy), true);
  assert.equal(selectPublicOverview([legacy], defaultOverviewFilters).summary.assessments, 1);
  assert.equal(isPublicOverviewCell({ ...legacy, institution: "missing key and date" }), false);
  assert.equal(isPublicOverviewCell({ ...detailed, assessmentDate: "12/10/2026" }), false);
});

test("every Excel sheet uses the exact applied result, and a captured workbook cannot switch to another query", () => {
  const cells = buildPublicOverviewCells([
    ...Array.from({ length: 7 }, (_, i) => record({ institution: `โรงเรียน ${i % 2}`, assessmentDate: "2026-10-12" })),
    ...Array.from({ length: 16 }, () => record({ province: "ลำปาง", assessmentDate: "2026-10-13", score: 90, grade: "A" })),
  ], affiliation);
  const filters = { ...defaultOverviewFilters, province: "เชียงใหม่", dateFrom: "2026-10-12", dateTo: "2026-10-12" };
  const view = selectPublicOverview(cells, filters);
  const filterLabel = overviewSearchLabel(filters, cells);
  const visibleGaps = rankedOverviewGaps(view.summary.gaps);
  const workbook = createPublicOverviewWorkbook({
    filterLabel, manifest: { schemaVersion: 2, version: "test-snapshot", years: ["2026"], updatedAt: "2026-10-16T00:00:00Z" },
    ...view, stackRows: [{ label: "ทั้งหมด", metrics: view.summary }, { label: "รถรับส่ง", metrics: view.topics.bus }],
    categoryCards: [{ label: "คนขับ", detail: "รถรับส่ง", metric: view.summary.domains.driver }],
    gaps: visibleGaps, questionLabels: { "bus::q1": { title: "คำถาม", shortTitle: "คำถาม", topic: "รถรับส่ง" } },
  });
  const valueOf = (cell: unknown) => cell && typeof cell === "object" && "value" in cell ? cell.value : cell;
  const rows = (name: string) => workbook.sheets.find(s => s.sheet === name)!.data!.map(row => row.map(valueOf));
  assert.equal(workbook.assessmentCount, 7);
  assert.deepEqual(rows("ภาพรวม").slice(-4), [["ผลประเมิน (ชุด)", 7], ["โรงเรียนไม่ซ้ำ (แห่ง)", 2], ["หน่วยงานไม่ซ้ำ (แห่ง)", 0], ["คะแนนเฉลี่ยรวม / 100", 60]]);
  assert.deepEqual(rows("ระดับผล").slice(-4), [["A", 0, 0], ["B", 0, 0], ["C", 7, 100], ["D", 0, 0]]);
  assert.deepEqual(rows("ตามแบบประเมิน").slice(-2), [["ทั้งหมด", 7, 0, 0, 7, 0], ["รถรับส่ง", 7, 0, 0, 7, 0]]);
  assert.deepEqual(rows("รายจังหวัด").slice(4), [["เชียงใหม่", 2, 0, 7, 60, 0, 0, 7, 0]]);
  assert.deepEqual(rows("คะแนนรายหมวด").slice(-1), [["คนขับ", 60, 7, "รถรับส่ง"]]);
  assert.deepEqual(rows("ประเด็นที่แสดง").slice(5), [["คำถาม", "รถรับส่ง", 7, 7, 100, 0, 0]]);
  for (const sheet of workbook.sheets) {
    assert.equal(valueOf(sheet.data![1][0]), filterLabel);
    assert.match(String(valueOf(sheet.data![2][0])), /ผลค้นหา 7 ชุด.*test-snapshot/);
  }
  const captured = JSON.stringify(workbook);
  view.summary.assessments = 999;
  filters.province = "ลำปาง";
  assert.equal(selectPublicOverview(cells, defaultOverviewFilters).summary.assessments, 23);
  assert.equal(JSON.stringify(workbook), captured);
});
