import type { DashboardRecord, DashboardGrade } from "./integrations/dashboard-repository";
import { assessmentDay, type Affiliation } from "./dashboard-filters.ts";

export type OverviewFilters = { year: string; province: string; topic: "all" | DashboardRecord["topicId"]; affiliation: "all" | Affiliation; grade: "all" | DashboardGrade; institution?: string; dateFrom?: string; dateTo?: string };
export const defaultOverviewFilters: OverviewFilters = { year: "all", province: "all", topic: "all", affiliation: "all", grade: "all", institution: "all", dateFrom: "", dateTo: "" };
export const overviewDomains = [
  { id: "driver", label: "คนขับและพฤติกรรม", art: "driver", tone: "#168fe1", detail: "มาตรฐานคนขับรถรับ–ส่งและทัศนศึกษา รวมพฤติกรรมการใช้รถจักรยานยนต์" },
  { id: "vehicle", label: "มาตรฐานยานพาหนะ", art: "vehicle", tone: "#e9a127", detail: "มาตรฐานยานพาหนะของแบบรถรับ–ส่งและทัศนศึกษา" },
  { id: "management", label: "การบริหารจัดการ", art: "management", tone: "#9068d1", detail: "การจัดการ การวางแผน และมาตรการสนับสนุนความปลอดภัย" },
  { id: "knowledge", label: "การสนับสนุนความรู้", art: "education", tone: "#36a775", detail: "หมวดการสนับสนุนองค์ความรู้ของแบบรถจักรยานยนต์" },
  { id: "environment", label: "สภาพแวดล้อม", art: "road", tone: "#169faa", detail: "หมวดสภาพแวดล้อมของแบบรถจักรยานยนต์" },
] as const;
const domainMapping: Record<string, string> = { "bus:driver": "driver", "trip:driver": "driver", "moto:behavior": "driver", "bus:vehicle": "vehicle", "trip:vehicle": "vehicle", "bus:management": "management", "trip:school": "management", "trip:support": "management", "moto:management": "management", "moto:knowledge": "knowledge", "moto:environment": "environment" };
export type SumCount = { sum: number; count: number };
export type PublicMetrics = { assessments: number; schools: number; agencies: number; scoreSum: number; grades: Record<DashboardGrade, number>; domains: Record<string, SumCount>; categories: Record<string, SumCount>; gaps: Record<string, { count: number; eligible: number }> };
export type PublicOverviewCell = { year: string; province: string; affiliation: Affiliation; scopes: Record<string, PublicMetrics>; institutionKey?: string; institution?: string; assessmentDate?: string };
export type PublicOverviewManifest = { schemaVersion: 1 | 2; version: string; years: string[]; updatedAt: string };
export function emptyPublicMetrics(): PublicMetrics { return { assessments: 0, schools: 0, agencies: 0, scoreSum: 0, grades: { A: 0, B: 0, C: 0, D: 0 }, domains: {}, categories: {}, gaps: {} }; }
export function publicRecordYear(record: DashboardRecord) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(record.assessmentDate)) return record.assessmentDate.slice(0, 4);
  const date = new Date(record.createdAt);
  return Number.isNaN(date.getTime()) ? "unknown" : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric" }).format(date);
}
export function schoolKey(record: DashboardRecord) { return `${record.province}:${record.institution.normalize("NFC").replace(/^โรงเรียน\s*/, "").replace(/\s+/g, "").toLocaleLowerCase("th")}`; }
export function rubricKey(record: Pick<DashboardRecord, "topicId" | "agencyType">) { return `${record.topicId}:${record.agencyType ?? ""}`; }
export function scopeKey(topic: OverviewFilters["topic"], grade: OverviewFilters["grade"]) { return `${topic}_${grade}`; }
function summarize(records: DashboardRecord[]): PublicMetrics {
  const result = emptyPublicMetrics();
  result.assessments = records.length;
  result.schools = new Set(records.filter(r => r.topicId !== "agency").map(schoolKey)).size;
  result.agencies = new Set(records.filter(r => r.topicId === "agency").map(schoolKey)).size;
  for (const record of records) {
    result.scoreSum += record.score; result.grades[record.grade]++;
    const perRecordDomains: Record<string, { weighted: number; weight: number }> = {};
    for (const category of record.categoryScores) {
      const key = `${rubricKey(record)}:${category.id}`;
      const current = result.categories[key] ?? { sum: 0, count: 0 };
      current.sum += category.percent; current.count++; result.categories[key] = current;
      const domain = domainMapping[`${record.topicId}:${category.id}`];
      if (domain) { const item = perRecordDomains[domain] ?? { weighted: 0, weight: 0 }; item.weighted += category.percent * category.weight; item.weight += category.weight; perRecordDomains[domain] = item; }
    }
    for (const [key, value] of Object.entries(perRecordDomains)) if (value.weight > 0) {
      const current = result.domains[key] ?? { sum: 0, count: 0 }; current.sum += value.weighted / value.weight; current.count++; result.domains[key] = current;
    }
    for (const question of record.questionResults) {
      const key = `${rubricKey(record)}:${question.id}`;
      const current = result.gaps[key] ?? { count: 0, eligible: 0 };
      current.eligible++; if (question.requiresImprovement) current.count++; result.gaps[key] = current;
    }
  }
  return result;
}
// Only numeric aggregates and controlled dimensions leave the authenticated area.
// Institution labels and assessment days support the public search.
// No submission IDs, contact fields or free-text answers are copied.
export function buildPublicOverviewCells(records: DashboardRecord[], affiliationOf: (record: DashboardRecord) => Affiliation): PublicOverviewCell[] {
  const buckets = new Map<string, { year: string; province: string; affiliation: Affiliation; institutionKey: string; institution: string; assessmentDate: string; records: DashboardRecord[] }>();
  for (const record of records) {
    const affiliation = record.topicId === "agency" ? "agency" : affiliationOf(record);
    const institutionKey = `${record.topicId === "agency" ? "agency" : "school"}:${schoolKey(record)}`;
    const day = assessmentDay(record);
    for (const year of ["all", publicRecordYear(record)]) {
      const key = JSON.stringify([year, record.province, affiliation, institutionKey, day]);
      const bucket = buckets.get(key) ?? { year, province: record.province, affiliation, institutionKey, institution: record.institution.trim().slice(0, 180), assessmentDate: day, records: [] };
      bucket.records.push(record); buckets.set(key, bucket);
    }
  }
  return [...buckets.values()].map(bucket => {
    const scopes: PublicOverviewCell["scopes"] = {};
    for (const topic of ["all", "bus", "trip", "moto", "agency"] as const) for (const grade of ["all", "A", "B", "C", "D"] as const) {
      const subset = bucket.records.filter(r => (topic === "all" || r.topicId === topic) && (grade === "all" || r.grade === grade));
      if (subset.length) scopes[scopeKey(topic, grade)] = summarize(subset);
    }
    return { year: bucket.year, province: bucket.province, affiliation: bucket.affiliation, institutionKey: bucket.institutionKey, institution: bucket.institution, assessmentDate: bucket.assessmentDate, scopes };
  });
}
function addMetrics(target: PublicMetrics, value: PublicMetrics) {
  target.assessments += value.assessments; target.schools += value.schools; target.agencies += value.agencies; target.scoreSum += value.scoreSum;
  for (const grade of ["A", "B", "C", "D"] as const) target.grades[grade] += value.grades[grade];
  for (const field of ["domains", "categories"] as const) for (const [key, metric] of Object.entries(value[field])) { const sum = target[field][key] ?? { sum: 0, count: 0 }; sum.sum += metric.sum; sum.count += metric.count; target[field][key] = sum; }
  for (const [key, metric] of Object.entries(value.gaps)) { const sum = target.gaps[key] ?? { count: 0, eligible: 0 }; sum.count += metric.count; sum.eligible += metric.eligible; target.gaps[key] = sum; }
}
export function overviewInstitutionOptions(cells: PublicOverviewCell[], province: string) {
  const entries = new Map<string, { key: string; label: string; province: string }>();
  for (const cell of cells) if (cell.institutionKey && cell.institution && (province === "all" || cell.province === province)) {
    entries.set(cell.institutionKey, { key: cell.institutionKey, label: cell.institution, province: cell.province });
  }
  return [...entries.values()].sort((a, b) => a.label.localeCompare(b.label, "th") || a.province.localeCompare(b.province, "th"));
}
export function validOverviewDateRange(filters: OverviewFilters) {
  return !filters.dateFrom || !filters.dateTo || filters.dateFrom <= filters.dateTo;
}
export function selectPublicOverview(cells: PublicOverviewCell[], filters: OverviewFilters) {
  const summary = emptyPublicMetrics(); const provinces: Record<string, PublicMetrics> = {}; const topics: Record<string, PublicMetrics> = {};
  // A school can submit on several dates. Count it once in each result group.
  const seen = new WeakMap<PublicMetrics, Set<string>>();
  function add(target: PublicMetrics, value: PublicMetrics, cell: PublicOverviewCell) {
    const keys = seen.get(target) ?? new Set<string>();
    const duplicate = cell.institutionKey && keys.has(cell.institutionKey);
    addMetrics(target, value);
    if (duplicate) { target.schools -= value.schools; target.agencies -= value.agencies; }
    if (cell.institutionKey) keys.add(cell.institutionKey);
    seen.set(target, keys);
  }
  if (!validOverviewDateRange(filters)) return { summary, provinces, topics };
  for (const cell of cells) {
    if (cell.year !== filters.year || (filters.affiliation !== "all" && filters.affiliation !== cell.affiliation)) continue;
    if (filters.province !== "all" && filters.province !== cell.province) continue;
    if (filters.institution && filters.institution !== "all" && cell.institutionKey !== filters.institution) continue;
    if (filters.dateFrom && (!cell.assessmentDate || cell.assessmentDate < filters.dateFrom)) continue;
    if (filters.dateTo && (!cell.assessmentDate || cell.assessmentDate > filters.dateTo)) continue;
    const metric = cell.scopes[scopeKey(filters.topic, filters.grade)];
    if (metric) {
      add(summary, metric, cell);
      const province = provinces[cell.province] ?? emptyPublicMetrics(); add(province, metric, cell); provinces[cell.province] = province;
    }
    for (const topic of ["bus", "trip", "moto", "agency"] as const) {
      if (filters.topic !== "all" && filters.topic !== topic) continue;
      const value = cell.scopes[scopeKey(topic, filters.grade)];
      if (value) { const total = topics[topic] ?? emptyPublicMetrics(); add(total, value, cell); topics[topic] = total; }
    }
  }
  return { summary, provinces, topics };
}
// Reject malformed published payloads instead of showing partial/misleading figures.
export function isPublicOverviewCell(value: unknown): value is PublicOverviewCell {
  if (!value || typeof value !== "object") return false;
  const cell = value as PublicOverviewCell;
  if (typeof cell.year !== "string" || !/^(all|unknown|\d{4})$/.test(cell.year) || typeof cell.province !== "string" || !["obec", "private", "unknown", "agency"].includes(cell.affiliation) || !cell.scopes || typeof cell.scopes !== "object") return false;
  const detailed = [cell.institutionKey, cell.institution, cell.assessmentDate];
  if (detailed.some(v => v !== undefined) && !(typeof cell.institutionKey === "string" && /^(school|agency):/.test(cell.institutionKey) && cell.institutionKey.length <= 260 && typeof cell.institution === "string" && cell.institution.length <= 180 && typeof cell.assessmentDate === "string" && /^(|\d{4}-\d{2}-\d{2})$/.test(cell.assessmentDate))) return false;
  const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
  return Object.entries(cell.scopes).every(([key, metric]) => {
    if (!/^(all|bus|trip|moto|agency)_(all|A|B|C|D)$/.test(key) || !metric || typeof metric !== "object") return false;
    if (![metric.assessments, metric.schools, metric.agencies].every(n => positive(n) && Number.isInteger(n)) || !positive(metric.scoreSum) || metric.scoreSum > 100 * metric.assessments) return false;
    if (!metric.grades || !["A", "B", "C", "D"].every(g => positive(metric.grades[g as DashboardGrade])) || Object.values(metric.grades).reduce((sum, n) => sum + n, 0) !== metric.assessments) return false;
    for (const name of ["domains", "categories"] as const) if (!metric[name] || typeof metric[name] !== "object" || !Object.values(metric[name]).every(m => m && positive(m.sum) && positive(m.count) && m.sum <= m.count * 100 + .00001)) return false;
    return Boolean(metric.gaps && typeof metric.gaps === "object" && Object.values(metric.gaps).every(m => m && positive(m.count) && positive(m.eligible) && m.count <= m.eligible));
  });
}
