import type { DashboardRecord, DashboardGrade } from "./integrations/dashboard-repository";

export const overviewTopics = [
  { id: "bus", label: "รถรับ–ส่งนักเรียน", short: "รถรับ–ส่ง", icon: "bus", color: "blue" },
  { id: "trip", label: "รถทัศนศึกษา", short: "ทัศนศึกษา", icon: "trip", color: "orange" },
  { id: "moto", label: "รถจักรยานยนต์และหมวกนิรภัย", short: "จักรยานยนต์", icon: "moto", color: "green" },
  { id: "agency", label: "หน่วยงานกำกับ", short: "หน่วยงาน", icon: "agency", color: "purple" },
] as const;
export const overviewGrades: DashboardGrade[] = ["A", "B", "C", "D"];
export function institutionKey(record: DashboardRecord) {
  return `${record.province}:${record.institution.normalize("NFC").replace(/^โรงเรียน\s*/, "").replace(/\s+/g, "").toLocaleLowerCase("th")}`;
}
export function overviewYear(record: DashboardRecord) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(record.assessmentDate)) return record.assessmentDate.slice(0, 4);
  const date = new Date(record.createdAt);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric" }).format(date);
}
export function gradeDistribution(records: DashboardRecord[]) {
  return overviewGrades.map(grade => {
    const count = records.filter(record => record.grade === grade).length;
    return { grade, count, percent: records.length ? count * 100 / records.length : 0 };
  });
}
export function overviewSummary(records: DashboardRecord[]) {
  return {
    assessments: records.length,
    schools: new Set(records.filter(r => r.topicId !== "agency").map(institutionKey)).size,
    agencies: new Set(records.filter(r => r.topicId === "agency").map(institutionKey)).size,
    provinces: new Set(records.map(r => r.province)).size,
    average: records.length ? records.reduce((sum, r) => sum + r.score, 0) / records.length : null,
    grades: gradeDistribution(records),
  };
}
export function overviewCategories(records: DashboardRecord[]) {
  const groups = new Map<string, { id: string; label: string; topicLabel: string; sum: number; count: number }>();
  for (const record of records) for (const category of record.categoryScores) {
    // Keep different assessment rubrics and agency subtypes separate.
    const id = `${record.topicId}:${record.agencyType ?? ""}:${category.id}`;
    const group = groups.get(id) ?? { id, label: category.label, topicLabel: record.topicLabel, sum: 0, count: 0 };
    group.sum += category.percent;
    group.count++;
    groups.set(id, group);
  }
  return [...groups.values()].map(group => ({ ...group, average: group.sum / group.count }));
}
export function overviewGaps(records: DashboardRecord[]) {
  const questions = new Map<string, { id: string; title: string; topicLabel: string; count: number; eligible: number }>();
  for (const record of records) for (const question of record.questionResults) {
    const id = `${record.topicId}:${record.agencyType ?? ""}:${question.id}`;
    const group = questions.get(id) ?? { id, title: question.title, topicLabel: record.topicLabel, count: 0, eligible: 0 };
    group.eligible++;
    if (question.requiresImprovement) group.count++;
    questions.set(id, group);
  }
  return [...questions.values()].filter(group => group.count > 0)
    .map(group => ({ ...group, percent: group.count * 100 / group.eligible }))
    .sort((a, b) => b.count - a.count || b.percent - a.percent || a.id.localeCompare(b.id));
}
export function overviewSchools(records: DashboardRecord[]) {
  const groups = new Map<string, { id: string; name: string; province: string; count: number; sum: number; topics: Set<string> }>();
  for (const record of records.filter(r => r.topicId !== "agency")) {
    const id = institutionKey(record);
    const group = groups.get(id) ?? { id, name: record.institution, province: record.province, count: 0, sum: 0, topics: new Set<string>() };
    group.count++;
    group.sum += record.score;
    group.topics.add(record.topicId);
    groups.set(id, group);
  }
  return [...groups.values()].map(group => ({ ...group, average: group.sum / group.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "th"));
}
