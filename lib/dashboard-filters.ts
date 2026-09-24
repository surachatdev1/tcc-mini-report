import type { DashboardRecord } from "./integrations/dashboard-repository";
import type { SchoolDirectoryEntry } from "./school-directory";

export type Affiliation = "obec" | "private" | "unknown" | "agency";
export const affiliationLabels: Record<Affiliation, string> = {
  obec: "สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.)",
  private: "โรงเรียนเอกชน",
  unknown: "ไม่พบข้อมูลสังกัด",
  agency: "หน่วยงานกำกับ (ไม่ใช่สถานศึกษา)",
};
export type DashboardFilters = {
  institution: string; affiliation: "all" | Affiliation; province: string;
  topicId: "all" | DashboardRecord["topicId"]; responsible: string;
  grade: "all" | DashboardRecord["grade"]; dateFrom: string; dateTo: string;
};
export const emptyDashboardFilters: DashboardFilters = {
  institution: "", affiliation: "all", province: "all", topicId: "all",
  responsible: "", grade: "all", dateFrom: "", dateTo: "",
};
export function normalizeSearch(value: string) {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("th");
}
function schoolKey(value: string) {
  return normalizeSearch(value).replace(/^โรงเรียน\s*/, "").replace(/\s+/g, "");
}
export function affiliationIndex(schools: SchoolDirectoryEntry[]) {
  const index = new Map<string, Affiliation>();
  for (const school of schools) {
    const key = schoolKey(school.name);
    const existing = index.get(key);
    index.set(key, existing && existing !== school.source ? "unknown" : school.source);
  }
  return index;
}
export function recordAffiliation(record: DashboardRecord, directories: Record<string, Map<string, Affiliation>>) {
  if (record.topicId === "agency") return "agency";
  return directories[record.province]?.get(schoolKey(record.institution)) ?? "unknown";
}
export function assessmentDay(record: DashboardRecord) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(record.assessmentDate)) return record.assessmentDate;
  const date = new Date(record.createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function filterDashboardRecords(records: DashboardRecord[], filters: DashboardFilters, directories: Record<string, Map<string, Affiliation>> = {}, includePersonalData = true) {
  const institution = normalizeSearch(filters.institution);
  const responsible = includePersonalData ? normalizeSearch(filters.responsible) : "";
  return records.filter(record => {
    const day = assessmentDay(record);
    return (!institution || normalizeSearch(record.institution).includes(institution))
      && (filters.province === "all" || record.province === filters.province)
      && (filters.topicId === "all" || record.topicId === filters.topicId)
      && (filters.affiliation === "all" || recordAffiliation(record, directories) === filters.affiliation)
      && (!responsible || normalizeSearch(`${record.assessorName} ${record.respondentRole} ${record.position}`).includes(responsible))
      && (filters.grade === "all" || record.grade === filters.grade)
      && (!filters.dateFrom || day >= filters.dateFrom)
      && (!filters.dateTo || Boolean(day && day <= filters.dateTo));
  });
}
