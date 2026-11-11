import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { institutionIdentityKey, institutionLabel, isSchoolIdentity, type SchoolIdentity } from "../lib/school-identity.ts";
import { buildPublicOverviewCells, defaultOverviewFilters, isPublicOverviewCell, overviewInstitutionOptions, selectPublicOverview } from "../lib/public-overview.ts";
import { overviewSummary, overviewSchools } from "../lib/dashboard-overview.ts";
import { affiliationIndex, emptyDashboardFilters, filterDashboardRecords, recordAffiliation } from "../lib/dashboard-filters.ts";
import { createDashboardWorkbook } from "../lib/exports/dashboard-excel.ts";
import { parseAssessmentAvailability } from "../lib/assessment-availability.ts";
import { calculateScore } from "../lib/scoring.ts";
import { selectOverviewDetail } from "../lib/public-overview-details.ts";
import { overviewSearchLabel } from "../lib/public-overview-search.ts";
import { createPublicOverviewWorkbook } from "../lib/exports/public-overview-excel.ts";
import { sortDashboardRecords } from "../lib/dashboard-table.ts";
import type { Score, Topic } from "../lib/assessment-data.ts";
import type { Cell } from "write-excel-file/browser";
import type { DashboardRecord } from "../lib/integrations/dashboard-repository.ts";
const first: SchoolIdentity = { id: "obec-1050130013", code: "1050130013", district: "เมืองเชียงใหม่", subdistrict: "สุเทพ", source: "obec" };
const second: SchoolIdentity = { ...first, id: "obec-1050130061", code: "1050130061", district: "จอมทอง", subdistrict: "บ้านแปะ" };
const base: DashboardRecord = { id: "r1", institution: "บ้านห้วยทราย", province: "เชียงใหม่", topicId: "bus", topicLabel: "รถรับส่ง", agencyType: null, assessmentDate: "2026-11-11", createdAt: "2026-11-11T01:00:00Z", assessorName: "", assessorPhone: "", respondentRole: "", position: "", score: 60, grade: "C", lowQuestions: [], categoryScores: [], questionResults: [] };
const records = [{ ...base, school: first }, { ...base, id: "r2", school: second }, { ...base, id: "r3", school: second }];

test("every imported school has a valid identity", () => {
  const data = JSON.parse(readFileSync(new URL("../lib/schools.generated.json", import.meta.url), "utf8"));
  for (const school of Object.values(data.schoolsByProvince).flat()) assert.ok(isSchoolIdentity(school));
});
test("same names use school IDs; legacy data is never assigned to either twin", () => {
  assert.notEqual(institutionIdentityKey(records[0]), institutionIdentityKey(records[1]));
  assert.notEqual(institutionIdentityKey(base), institutionIdentityKey(records[0]));
  assert.match(institutionLabel(records[1]), /บ้านแปะ.*จอมทอง.*1050130061/);
  assert.match(institutionLabel(base), /ยังไม่ระบุรหัสโรงเรียน/);
  assert.equal(overviewSummary(records).schools, 2);
});
test("public search counts twins separately and filters an exact ID across repeated submissions", () => {
  const cells = buildPublicOverviewCells([...records, { ...base, id: "legacy" }], () => "obec");
  assert.ok(cells.every(isPublicOverviewCell));
  const options = overviewInstitutionOptions(cells, "เชียงใหม่");
  assert.equal(options.length, 3);
  const selected = options.find(item => item.label.includes(second.code))!;
  const result = selectPublicOverview(cells, { ...defaultOverviewFilters, institution: selected.key });
  assert.equal(result.summary.assessments, 2); assert.equal(result.summary.schools, 1);
});
test("staff search recognizes location and code; affiliation uses ID when present", () => {
  const directories = { "เชียงใหม่": affiliationIndex([{ ...first, name: base.institution }, { ...second, name: base.institution }]) };
  assert.equal(recordAffiliation(records[1], directories), "obec");
  for (const term of ["จอมทอง", "บ้านแปะ", second.code, institutionLabel(records[1])]) {
    assert.deepEqual(filterDashboardRecords(records, { ...emptyDashboardFilters, institution: term }, directories).map(row => row.id), ["r2", "r3"]);
  }
});
test("Excel uses the filtered records and exports their exact identity as text", async () => {
  const filtered = filterDashboardRecords(records, { ...emptyDashboardFilters, institution: second.code });
  const result = await createDashboardWorkbook({ scope: "all", records: filtered, includePersonalData: false, provinceLabel: "เชียงใหม่", topicLabel: "ทุกประเภท", filterSummary: "รหัส 1050130061" });
  const sheet = result.sheets.find(sheet => sheet.sheet === "ผลประเมิน")!;
  assert.equal(sheet.data!.length - 4, 2);
  for (const row of sheet.data!.slice(4)) {
    assert.deepEqual(row.slice(-4).map(cell => cell && typeof cell === "object" && "value" in cell ? cell.value : cell), [second.id, second.code, second.district, second.subdistrict]);
    const codeCell = row.at(-3);
    assert.ok(codeCell && typeof codeCell === "object" && "value" in codeCell && typeof codeCell.value === "string");
  }
});
test("availability defaults to both open only for a confirmed absent document; malformed settings fail closed", () => {
  assert.deepEqual(parseAssessmentAvailability(undefined), { school: true, agency: true });
  for (const school of [false, true]) for (const agency of [false, true]) assert.deepEqual(parseAssessmentAvailability({ school, agency }), { school, agency });
  for (const bad of [null, {}, { school: true }, { school: "false", agency: true }]) assert.throws(() => parseAssessmentAvailability(bad));
});

const schoolTopics = JSON.parse(readFileSync(new URL("../lib/criteria.generated.json", import.meta.url), "utf8")).schoolTopics as Record<"bus" | "trip" | "moto", Topic>;
function scoredRecord(id: string, school: SchoolIdentity, score: Score, day: string, topicId: "bus" | "trip" = "bus"): DashboardRecord {
  const topic = schoolTopics[topicId];
  const answers = Object.fromEntries(topic.questions.map(question => [question.id, { score, explanation: `ข้อมูลทดสอบ ${id}` }]));
  const summary = calculateScore(answers, topic);
  assert.notEqual(summary.grade, "-");
  return { ...base, id, school, assessmentDate: day, topicId, topicLabel: topic.label,
    score: summary.percent, grade: summary.grade as DashboardRecord["grade"], categoryScores: summary.categories,
    questionResults: summary.questionResults.map(question => ({ ...question, explanation: answers[question.id].explanation })),
    lowQuestions: summary.questionResults.filter(question => question.requiresImprovement).map(question => ({ id: question.id, number: question.number, title: question.title, score: question.score! })),
  };
}
// Deliberately different scores expose accidental mixing that identical-score fixtures cannot.
const distinctResults = [
  scoredRecord("11111111-1111-4111-8111-111111111111", first, 3, "2026-11-01"),
  scoredRecord("22222222-2222-4222-8222-222222222222", second, 1, "2026-11-01"),
  scoredRecord("33333333-3333-4333-8333-333333333333", second, 2, "2026-11-02"),
];
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const cellValue = (cell: Cell | undefined) => cell && typeof cell === "object" && "value" in cell ? cell.value : cell;

test("same-name schools keep distinct averages, grades, category scores and gap denominators", () => {
  const cells = buildPublicOverviewCells(distinctResults, () => "obec");
  const all = selectPublicOverview(cells, defaultOverviewFilters).summary;
  assert.equal(all.schools, 2); assert.equal(all.assessments, 3); near(all.scoreSum, 200);
  const schoolRows = overviewSchools(distinctResults);
  assert.equal(schoolRows.length, 2);
  near(schoolRows.find(row => row.id === institutionIdentityKey(distinctResults[0]))!.average, 100);
  near(schoolRows.find(row => row.id === institutionIdentityKey(distinctResults[1]))!.average, 50);
  for (const [school, count, average, grades, below] of [
    [first, 1, 100, { A: 1, B: 0, C: 0, D: 0 }, 0],
    [second, 2, 50, { A: 0, B: 0, C: 1, D: 1 }, 1],
  ] as const) {
    const view = selectPublicOverview(cells, { ...defaultOverviewFilters, institution: `school:registered:${school.id}` });
    assert.equal(view.summary.schools, 1); assert.equal(view.summary.assessments, count);
    near(view.summary.scoreSum / count, average); assert.deepEqual(view.summary.grades, grades);
    assert.deepEqual(view.provinces["เชียงใหม่"], view.summary);
    assert.deepEqual(view.topics.bus, view.summary);
    for (const category of Object.values(view.summary.categories)) { assert.equal(category.count, count); near(category.sum / count, average); }
    for (const domain of Object.values(view.summary.domains)) { assert.equal(domain.count, count); near(domain.sum / count, average); }
    for (const gap of Object.values(view.summary.gaps)) assert.deepEqual(gap, { count: below, eligible: count });
  }
});

test("school/date/topic/grade filters and detail drill-down never include the other twin or legacy records", () => {
  const rows = [...distinctResults,
    scoredRecord("trip", second, 3, "2026-11-02", "trip"),
    { ...distinctResults[0], id: "legacy", school: null },
  ];
  const cells = buildPublicOverviewCells(rows, () => "obec");
  const filters = { ...defaultOverviewFilters, institution: `school:registered:${second.id}`, province: "เชียงใหม่", topic: "bus" as const, grade: "C" as const, dateFrom: "2026-11-02", dateTo: "2026-11-02" };
  const selected = selectPublicOverview(cells, filters);
  assert.equal(selected.summary.assessments, 1); near(selected.summary.scoreSum, 200 / 3);
  const detail = selectOverviewDetail(cells, filters, { title: "รถรับส่ง", topic: "bus" });
  assert.deepEqual(detail.summary, selected.summary);
  assert.equal(detail.filters.institution, filters.institution);
  const staff = filterDashboardRecords(rows, { ...emptyDashboardFilters, institution: second.code, province: "เชียงใหม่", topicId: "bus", grade: "C", dateFrom: "2026-11-02", dateTo: "2026-11-02" });
  assert.deepEqual(staff.map(row => row.id), [distinctResults[2].id]);
  const sorted = sortDashboardRecords(distinctResults, "score", "asc");
  assert.deepEqual(sorted.map(row => row.id), [distinctResults[1].id, distinctResults[2].id, distinctResults[0].id]);
  assert.equal(new Set([...sorted.slice(0, 2), ...sorted.slice(2)].map(row => row.id)).size, 3);
});

test("staff Excel keeps each assessment and its own school, score, category and question values", async () => {
  for (const [school, average, count] of [[first, 100, 1], [second, 50, 2]] as const) {
    const filtered = filterDashboardRecords(distinctResults, { ...emptyDashboardFilters, institution: school.code });
    const workbook = await createDashboardWorkbook({ scope: "all", records: filtered, includePersonalData: false, provinceLabel: "เชียงใหม่", topicLabel: "ทั้งหมด" });
    const overview = workbook.sheets.find(sheet => sheet.sheet === "ภาพรวม")!.data![4].map(cellValue);
    assert.equal(overview[0], count); assert.equal(overview[1], 1); near(overview[2] as number, average);
    for (const [name, scoreHeader, expectedRowCount] of [
      ["ผลประเมิน", "คะแนน", count],
      ["คะแนนรายหมวด", "คะแนนหมวด", count * schoolTopics.bus.categories.length],
      ["รายละเอียดรายข้อ", "คะแนน", count * schoolTopics.bus.questions.length],
    ] as const) {
      const data = workbook.sheets.find(sheet => sheet.sheet === name)!.data!;
      const headers = data[3].map(cellValue);
      const codeIndex = headers.indexOf("รหัสโรงเรียน");
      const scoreIndex = headers.indexOf(scoreHeader);
      const referenceIndex = headers.indexOf("เลขอ้างอิง");
      assert.equal(data.length - 4, expectedRowCount);
      for (const row of data.slice(4).map(row => row.map(cellValue))) {
        assert.equal(row[codeIndex], school.code);
        const record = filtered.find(record => String(row[referenceIndex]).endsWith(record.id.slice(0, 6).toUpperCase()))!;
        assert.ok(record);
        const expected = name === "ผลประเมิน" ? record.score : name === "คะแนนรายหมวด" ? record.score / 100 : record.questionResults[0].score!;
        near(row[scoreIndex] as number, expected);
      }
    }
  }
});

test("public Excel exports the selected school's exact summary and school label", () => {
  const cells = buildPublicOverviewCells(distinctResults, () => "obec");
  const filters = { ...defaultOverviewFilters, institution: `school:registered:${second.id}` };
  const view = selectPublicOverview(cells, filters);
  const workbook = createPublicOverviewWorkbook({
    filterLabel: overviewSearchLabel(filters, cells), manifest: null, ...view,
    stackRows: [{ label: "รถรับส่ง", metrics: view.topics.bus }], categoryCards: [], gaps: [], questionLabels: {},
  });
  assert.equal(workbook.assessmentCount, 2);
  assert.match(workbook.filterLabel, /บ้านแปะ.*จอมทอง.*1050130061/);
  assert.ok(!workbook.filterLabel.includes(first.code));
  const data = workbook.sheets.find(sheet => sheet.sheet === "ภาพรวม")!.data!.map(row => row.map(cellValue));
  assert.equal(data.find(row => row[0] === "ผลประเมิน (ชุด)")![1], 2);
  assert.equal(data.find(row => row[0] === "โรงเรียนไม่ซ้ำ (แห่ง)")![1], 1);
  assert.equal(data.find(row => row[0] === "คะแนนเฉลี่ยรวม / 100")![1], 50);
});
