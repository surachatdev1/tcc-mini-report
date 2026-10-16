import { affiliationLabels } from "./dashboard-filters.ts";
import { overviewTopics } from "./dashboard-overview.ts";
import type { OverviewFilters, PublicOverviewCell } from "./public-overview";

export function overviewSearchLabel(filters: OverviewFilters, cells: PublicOverviewCell[]) {
  const institution = cells.find(c => c.institutionKey === filters.institution)?.institution;
  return [
    filters.province === "all" ? "ทุกจังหวัด" : filters.province,
    !filters.institution || filters.institution === "all" ? "ทุกโรงเรียน / หน่วยงาน" : institution ?? "โรงเรียน / หน่วยงานที่เลือก",
    overviewTopics.find(t => t.id === filters.topic)?.label ?? "ทุกประเภท",
    filters.dateFrom || filters.dateTo ? `วันที่ประเมิน ${filters.dateFrom || "ไม่จำกัดวันเริ่ม"} ถึง ${filters.dateTo || "ไม่จำกัดวันสิ้นสุด"}` : "ทุกช่วงเวลา",
    filters.year === "all" ? "ทุกปี" : `ปี ${Number(filters.year) + 543}`,
    filters.affiliation === "all" ? "ทุกสังกัด" : affiliationLabels[filters.affiliation],
    filters.grade === "all" ? "ทุกระดับผล" : `ระดับ ${filters.grade}`,
  ].join(" · ");
}
