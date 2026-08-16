import type { AgencyType, TopicId } from "./assessment-data";
import type { CategoryScore } from "./scoring";

export const MIN_BENCHMARK_SAMPLE = 10;

export type BenchmarkInputRecord = {
  topicId: TopicId;
  agencyType: AgencyType | null;
  province: string;
  score: number;
  grade: "A" | "B" | "C" | "D";
  categoryScores: CategoryScore[];
};

export type BenchmarkSnapshot = {
  schemaVersion: 1;
  topicId: TopicId;
  agencyType: AgencyType | null;
  province: string | null;
  scope: "province" | "pilot";
  sampleSize: number;
  averageScore: number;
  medianScore: number;
  gradeCounts: Record<"A" | "B" | "C" | "D", number>;
  categoryMedians: Array<{ id: string; label: string; percent: number }>;
  updatedAt: string;
};

function groupIdentity(topicId: TopicId, agencyType: AgencyType | null) {
  return `${topicId}::${agencyType ?? "none"}`;
}

export function benchmarkDocumentId(topicId: TopicId, agencyType: AgencyType | null, province: string | null) {
  return `${topicId}--${agencyType ?? "none"}--${province ?? "all"}`;
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function createSnapshot(records: BenchmarkInputRecord[], province: string | null, updatedAt: string): BenchmarkSnapshot {
  const first = records[0];
  const categoryIds = [...new Set(records.flatMap((record) => record.categoryScores.map((category) => category.id)))];
  const categoryMedians = categoryIds.map((id) => {
    const categories = records.flatMap((record) => record.categoryScores.filter((category) => category.id === id));
    return {
      id,
      label: categories[0]?.label ?? id,
      percent: median(categories.map((category) => category.percent)),
    };
  });

  return {
    schemaVersion: 1,
    topicId: first.topicId,
    agencyType: first.agencyType,
    province,
    scope: province ? "province" : "pilot",
    sampleSize: records.length,
    averageScore: records.reduce((sum, record) => sum + record.score, 0) / records.length,
    medianScore: median(records.map((record) => record.score)),
    gradeCounts: {
      A: records.filter((record) => record.grade === "A").length,
      B: records.filter((record) => record.grade === "B").length,
      C: records.filter((record) => record.grade === "C").length,
      D: records.filter((record) => record.grade === "D").length,
    },
    categoryMedians,
    updatedAt,
  };
}

// เผยแพร่เฉพาะกลุ่มที่มีอย่างน้อย 10 รายการ เพื่อลดความเสี่ยงในการอนุมานผลของรายบุคคล
export function buildBenchmarkSnapshots(records: BenchmarkInputRecord[], updatedAt = new Date().toISOString()) {
  const snapshots = new Map<string, BenchmarkSnapshot>();
  const assessmentGroups = new Map<string, BenchmarkInputRecord[]>();

  for (const record of records) {
    const key = groupIdentity(record.topicId, record.agencyType);
    assessmentGroups.set(key, [...(assessmentGroups.get(key) ?? []), record]);
  }

  for (const groupRecords of assessmentGroups.values()) {
    if (groupRecords.length >= MIN_BENCHMARK_SAMPLE) {
      const snapshot = createSnapshot(groupRecords, null, updatedAt);
      snapshots.set(benchmarkDocumentId(snapshot.topicId, snapshot.agencyType, null), snapshot);
    }

    const provinceGroups = new Map<string, BenchmarkInputRecord[]>();
    for (const record of groupRecords) {
      provinceGroups.set(record.province, [...(provinceGroups.get(record.province) ?? []), record]);
    }
    for (const [province, provinceRecords] of provinceGroups) {
      if (provinceRecords.length < MIN_BENCHMARK_SAMPLE) continue;
      const snapshot = createSnapshot(provinceRecords, province, updatedAt);
      snapshots.set(benchmarkDocumentId(snapshot.topicId, snapshot.agencyType, province), snapshot);
    }
  }

  return snapshots;
}

export function comparisonText(currentScore: number, benchmark: BenchmarkSnapshot) {
  const difference = currentScore - benchmark.medianScore;
  if (Math.abs(difference) < 2) return `ใกล้เคียงค่ากลางของกลุ่ม (ต่าง ${Math.abs(difference).toFixed(1)} คะแนน)`;
  return difference > 0
    ? `สูงกว่าค่ากลางของกลุ่ม ${difference.toFixed(1)} คะแนน`
    : `ต่ำกว่าค่ากลางของกลุ่ม ${Math.abs(difference).toFixed(1)} คะแนน`;
}
