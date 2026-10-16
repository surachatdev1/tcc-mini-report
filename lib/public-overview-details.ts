import { selectPublicOverview, type OverviewFilters, type PublicOverviewCell } from "./public-overview.ts";

export type OverviewDetailSelection = {
  title: string;
  topic?: OverviewFilters["topic"];
  grade?: OverviewFilters["grade"];
  province?: string;
  metric?: { field: "domains" | "categories"; id: string; description: string };
  gaps?: boolean;
};

/** A detail view keeps the applied search; map/grade clicks only narrow its scope. */
export function selectOverviewDetail(cells: PublicOverviewCell[], applied: OverviewFilters, selection: OverviewDetailSelection) {
  const filters = { ...applied, ...(selection.topic ? { topic: selection.topic } : {}), ...(selection.grade ? { grade: selection.grade } : {}), ...(selection.province ? { province: selection.province } : {}) };
  const view = selectPublicOverview(cells, filters);
  // Detail rows and exports use the same searched province scope.
  const rows = Object.entries(view.provinces)
    .filter(([province]) => filters.province === "all" || province === filters.province)
    .filter(([, metrics]) => !selection.metric || (metrics[selection.metric.field][selection.metric.id]?.count ?? 0) > 0)
    .sort(([a, ma], [b, mb]) => mb.assessments - ma.assessments || a.localeCompare(b, "th"));
  return { filters, ...view, rows };
}
