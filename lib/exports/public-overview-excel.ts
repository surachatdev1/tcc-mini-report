import type { Cell, Sheet } from "write-excel-file/browser";
import type { PublicMetrics, PublicOverviewManifest, SumCount } from "../public-overview";
import { gapRankingNote, overviewGapExportRows, type OverviewGap, type OverviewQuestionLabel } from "../public-overview-gaps.ts";

export type OverviewExportSnapshot = {
  filterLabel: string;
  manifest: PublicOverviewManifest | null;
  summary: PublicMetrics;
  provinces: Record<string, PublicMetrics>;
  stackRows: { label: string; metrics: PublicMetrics }[];
  categoryCards: { label: string; detail: string; metric?: SumCount }[];
  gaps: [string, OverviewGap][];
  questionLabels: Record<string, OverviewQuestionLabel>;
};
const grades = ["A", "B", "C", "D"] as const;
const average = (metrics: PublicMetrics) => metrics.assessments ? Number((metrics.scoreSum / metrics.assessments).toFixed(1)) : "ไม่มีข้อมูล";

/** Serialize the exact rendered view; never reload, re-filter or expand its scope. */
export function createPublicOverviewWorkbook(snapshot: OverviewExportSnapshot) {
  const { summary, manifest } = snapshot;
  const published = manifest?.updatedAt && Number.isFinite(Date.parse(manifest.updatedAt)) ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(manifest.updatedAt)) : "ไม่ระบุ";
  const meta = `ผลค้นหา ${summary.assessments} ชุด · โรงเรียน ${summary.schools} แห่ง · หน่วยงาน ${summary.agencies} แห่ง · เผยแพร่ ${published} · รุ่นข้อมูล ${manifest?.version ?? "ไม่ระบุ"}`;
  const cell = (value: string | number): Cell => ({ type: typeof value === "number" ? Number : String, value, wrap: true });
  const sheets: Sheet<ArrayBuffer>[] = [];
  function add(sheet: string, title: string, headers: string[], rows: (string | number)[][], note = "") {
    sheets.push({
      sheet,
      data: [[title], [snapshot.filterLabel], [meta], ...(note ? [[note]] : []), headers, ...rows].map(row => row.map(cell)),
      columns: headers.map((_, i) => ({ width: i === 0 ? 64 : 26 })),
      stickyRowsCount: note ? 5 : 4,
    });
  }
  add("ภาพรวม", "ข้อมูลสรุปตามผลค้นหาที่แสดงบน Dashboard", ["ตัวชี้วัด", "ค่า"], [
    ["ผลประเมิน (ชุด)", summary.assessments], ["โรงเรียนไม่ซ้ำ (แห่ง)", summary.schools],
    ["หน่วยงานไม่ซ้ำ (แห่ง)", summary.agencies], ["คะแนนเฉลี่ยรวม / 100", average(summary)],
  ], "แต่ละชีตเป็นข้อมูลสรุปคนละส่วน จำนวนแถวในชีตจึงไม่ใช่จำนวนชุดประเมิน");
  add("ระดับผล", "สัดส่วนระดับผลการประเมิน", ["ระดับ", "ผลประเมิน (ชุด)", "สัดส่วน (%)"], grades.map(g => [g, summary.grades[g], summary.assessments ? Math.round(summary.grades[g] / summary.assessments * 100) : "ไม่มีข้อมูล"]));
  add("ตามแบบประเมิน", "จำนวนผลประเมินตามประเภทและระดับผล", ["แบบประเมิน", "ผลประเมิน (ชุด)", ...grades.map(g => `${g} (ชุด)`)], snapshot.stackRows.map(row => [row.label, row.metrics.assessments, ...grades.map(g => row.metrics.grades[g])]));
  add("คะแนนรายหมวด", "คะแนนด้านความปลอดภัยตามที่แสดง", ["หมวด", "คะแนนเฉลี่ย / 100", "ผลประเมินที่มีหมวดนี้ (ชุด)", "ขอบเขต"], snapshot.categoryCards.map(c => [c.label, c.metric?.count ? Number((c.metric.sum / c.metric.count).toFixed(1)) : "ไม่มีข้อมูล", c.metric?.count ?? 0, c.detail]));
  add("รายจังหวัด", "ข้อมูลรายจังหวัดตามผลค้นหา", ["จังหวัด", "โรงเรียน (แห่ง)", "หน่วยงาน (แห่ง)", "ผลประเมิน (ชุด)", "คะแนนเฉลี่ย / 100", ...grades.map(g => `${g} (ชุด)`)], Object.entries(snapshot.provinces).sort(([a], [b]) => a.localeCompare(b, "th")).map(([province, m]) => [province, m.schools, m.agencies, m.assessments, average(m), ...grades.map(g => m.grades[g])]));
  add("ประเด็นที่แสดง", `ประเด็นต่ำกว่าเกณฑ์ที่แสดงบน Dashboard (${snapshot.gaps.length} ประเด็น)`, ["เกณฑ์ต้นฉบับ", "แบบประเมิน", "ชุดที่ตอบข้อนี้", "ต่ำกว่าเกณฑ์ (คะแนน 0–1): ชุด", "ต่ำกว่าเกณฑ์ (%)", "ถึงเกณฑ์ (คะแนน 2–3): ชุด", "ถึงเกณฑ์ (%)"], overviewGapExportRows(snapshot.gaps, snapshot.questionLabels), gapRankingNote);
  return { sheets, assessmentCount: summary.assessments, filterLabel: snapshot.filterLabel, version: manifest?.version };
}
