import { benchmarkDocumentId, buildBenchmarkSnapshots, type BenchmarkSnapshot } from "../benchmarking";
import { agencyTypes, provinces, type AgencyType, type TopicId } from "../assessment-data";
import { getFirebaseDb, shouldUseFirestore } from "./firebase-client";
import { firestoreRecord, type DashboardRecord } from "./dashboard-repository";

function toIsoDate(value: unknown) {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

function parseBenchmark(raw: Record<string, unknown>): BenchmarkSnapshot | null {
  if (raw.schemaVersion !== 1 || typeof raw.sampleSize !== "number" || raw.sampleSize < 10) return null;
  if (!["bus", "trip", "moto", "agency"].includes(String(raw.topicId))) return null;
  if (!Array.isArray(raw.categoryMedians) || !raw.categoryMedians.length || raw.categoryMedians.length > 4) return null;
  if (typeof raw.medianScore !== "number" || raw.medianScore < 0 || raw.medianScore > 100) return null;
  if (typeof raw.averageScore !== "number" || raw.averageScore < 0 || raw.averageScore > 100) return null;
  const agencyType = typeof raw.agencyType === "string" && agencyTypes.some((item) => item.id === raw.agencyType)
    ? raw.agencyType as AgencyType
    : null;
  const province = typeof raw.province === "string" && provinces.includes(raw.province) ? raw.province : null;
  if ((raw.scope === "province") !== Boolean(province)) return null;
  const categoryMedians = raw.categoryMedians
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({ id: String(item.id), label: String(item.label), percent: Number(item.percent) }));
  if (categoryMedians.length !== raw.categoryMedians.length || categoryMedians.some((item) => !item.id || !item.label || !Number.isFinite(item.percent) || item.percent < 0 || item.percent > 100)) return null;
  return {
    schemaVersion: 1,
    topicId: raw.topicId as TopicId,
    agencyType,
    province,
    scope: raw.scope === "province" ? "province" : "pilot",
    sampleSize: raw.sampleSize,
    averageScore: raw.averageScore,
    medianScore: raw.medianScore,
    gradeCounts: raw.gradeCounts as BenchmarkSnapshot["gradeCounts"],
    categoryMedians,
    updatedAt: toIsoDate(raw.updatedAt),
  };
}

export async function loadPeerBenchmark(topicId: TopicId, agencyType: AgencyType | null, province: string) {
  if (!shouldUseFirestore()) return null;
  const db = await getFirebaseDb();
  if (!db) return null;
  const { doc, getDoc } = await import("firebase/firestore");
  const [provinceDocument, pilotDocument] = await Promise.all([
    getDoc(doc(db, "benchmarks", benchmarkDocumentId(topicId, agencyType, province))),
    getDoc(doc(db, "benchmarks", benchmarkDocumentId(topicId, agencyType, null))),
  ]);
  const preferred = provinceDocument.exists() ? parseBenchmark(provinceDocument.data()) : null;
  if (preferred) return preferred;
  return pilotDocument.exists() ? parseBenchmark(pilotDocument.data()) : null;
}

export async function rebuildBenchmarkSnapshots() {
  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อข้อมูลสำหรับสร้างค่ากลางได้");
  const { collection, doc, getDocs, serverTimestamp, writeBatch } = await import("firebase/firestore");
  const [submissionSnapshot, currentBenchmarkSnapshot] = await Promise.all([
    getDocs(collection(db, "submissions")),
    getDocs(collection(db, "benchmarks")),
  ]);
  const records = submissionSnapshot.docs
    .map((item) => firestoreRecord(item.id, item.data()))
    .filter((record): record is DashboardRecord => record !== null);
  const snapshots = buildBenchmarkSnapshots(records);
  const batch = writeBatch(db);

  // ลบ snapshot เดิมที่กลุ่มมีข้อมูลต่ำกว่าเกณฑ์แล้ว เพื่อไม่เผยแพร่ค่ากลางจากกลุ่มเล็ก
  for (const existing of currentBenchmarkSnapshot.docs) {
    if (!snapshots.has(existing.id)) batch.delete(existing.ref);
  }
  for (const [id, snapshot] of snapshots) {
    batch.set(doc(db, "benchmarks", id), { ...snapshot, updatedAt: serverTimestamp() });
  }
  await batch.commit();
  return { published: snapshots.size, submissions: records.length };
}
