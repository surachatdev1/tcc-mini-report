import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { institutionIdentityKey, institutionLabel, isSchoolIdentity, type SchoolIdentity } from "../lib/school-identity.ts";
import { buildPublicOverviewCells, defaultOverviewFilters, isPublicOverviewCell, overviewInstitutionOptions, selectPublicOverview } from "../lib/public-overview.ts";
import { overviewSummary } from "../lib/dashboard-overview.ts";
import { affiliationIndex, emptyDashboardFilters, filterDashboardRecords, recordAffiliation } from "../lib/dashboard-filters.ts";
import { createDashboardWorkbook } from "../lib/exports/dashboard-excel.ts";
import { parseAssessmentAvailability } from "../lib/assessment-availability.ts";
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
