import { publicOverviewError } from "../public-overview-errors";
import { getFirebaseDb } from "./firebase-client";
import { isPublicOverviewCell, type PublicOverviewCell, type PublicOverviewManifest } from "../public-overview";

export type PublicOverviewResult = { source: "live" | "unpublished" | "unavailable"; cells: PublicOverviewCell[]; manifest: PublicOverviewManifest | null; error?: string };
export async function subscribePublicOverview(year: string, listener: (value: PublicOverviewResult) => void) {
  const db = await getFirebaseDb();
  if (!db) { listener({ source: "unavailable", cells: [], manifest: null, error: "ยังไม่สามารถเชื่อมต่อข้อมูลภาพรวมได้" }); return () => {}; }
  const { collection, doc, getDocs, onSnapshot, query, where } = await import("firebase/firestore");
  let generation = 0; let active = true;
  const stop = onSnapshot(doc(db, "public_overview", "current"), async snapshot => {
    const request = ++generation;
    if (!snapshot.exists()) { listener({ source: "unpublished", cells: [], manifest: null }); return; }
    const raw = snapshot.data();
    if (![1, 2].includes(raw.schemaVersion) || typeof raw.version !== "string" || !Array.isArray(raw.years) || !raw.years.every(y => typeof y === "string" && /^\d{4}$/.test(y))) { listener({ source: "unavailable", cells: [], manifest: null, error: "ข้อมูลภาพรวมยังไม่พร้อม กรุณาลองใหม่ภายหลัง" }); return; }
    try {
      const rows = await getDocs(query(collection(db, "public_overview_versions", raw.version, "cells"), where("year", "==", year)));
      if (!active || request !== generation) return;
      const cells = rows.docs.map(row => row.data());
      if (!cells.every(isPublicOverviewCell)) throw new Error("Invalid aggregate payload");
      if (raw.schemaVersion === 2 && cells.some(cell => cell.institutionKey === undefined || cell.institution === undefined || cell.assessmentDate === undefined)) throw new Error("Incomplete search dimensions");
      listener({ source: "live", cells, manifest: { schemaVersion: raw.schemaVersion, version: raw.version, years: raw.years, updatedAt: raw.updatedAt?.toDate?.().toISOString() ?? "" } });
    } catch (error) { if (active && request === generation) listener({ source: "unavailable", cells: [], manifest: null, error: publicOverviewError(error) }); }
  }, error => { if (active) { generation++; listener({ source: "unavailable", cells: [], manifest: null, error: publicOverviewError(error) }); } });
  return () => { active = false; generation++; stop(); };
}
