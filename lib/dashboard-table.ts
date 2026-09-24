import type { DashboardRecord } from "./integrations/dashboard-repository";
import { assessmentReference, affiliationLabels, assessmentDay, recordAffiliation, type Affiliation } from "./dashboard-filters.ts";

export type DashboardSortKey = "reference" | "institution" | "affiliation" | "province" | "topicLabel" | "assessorName" | "respondentRole" | "assessorPhone" | "assessmentDate" | "score";
export type SortDirection = "asc" | "desc";
export const pageSizes = [10, 20, 50, 100] as const;
const collator = new Intl.Collator("th", { numeric: true, sensitivity: "base" });
export { assessmentReference } from "./dashboard-filters.ts";
export function sortDashboardRecords(records: DashboardRecord[], key: DashboardSortKey, direction: SortDirection, directories: Record<string, Map<string, Affiliation>> = {}) {
  function value(record: DashboardRecord): string | number {
    if (key === "reference") return assessmentReference(record);
    if (key === "assessmentDate") return assessmentDay(record);
    if (key === "affiliation") return affiliationLabels[recordAffiliation(record, directories)];
    if (key === "respondentRole") return `${record.respondentRole} ${record.position}`.trim();
    return record[key];
  }
  return [...records].sort((a, b) => {
    const left = value(a), right = value(b);
    // Missing values stay last for either direction; equal values have stable IDs.
    if (left === "" && right !== "") return 1;
    if (right === "" && left !== "") return -1;
    const compared = typeof left === "number" && typeof right === "number" ? left - right : collator.compare(String(left), String(right));
    return (direction === "asc" ? compared : -compared) || a.id.localeCompare(b.id);
  });
}
export function paginationItems(current: number, total: number): Array<number | "ellipsis-left" | "ellipsis-right"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const start = Math.max(2, Math.min(current - 1, total - 4));
  const end = Math.min(total - 1, Math.max(current + 1, 5));
  const items: Array<number | "ellipsis-left" | "ellipsis-right"> = [1];
  if (start > 2) items.push("ellipsis-left");
  for (let page = start; page <= end; page++) items.push(page);
  if (end < total - 1) items.push("ellipsis-right");
  items.push(total);
  return items;
}
