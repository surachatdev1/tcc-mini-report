import { DEFAULT_AVAILABILITY, parseAssessmentAvailability, type AssessmentAvailability } from "../assessment-availability";
import { getFirebaseAuth, getFirebaseDb, shouldUseFirestore } from "./firebase-client";

export async function subscribeAssessmentAvailability(
  onChange: (value: AssessmentAvailability) => void,
  onError: (error: unknown) => void,
) {
  if (!shouldUseFirestore()) { onChange({ ...DEFAULT_AVAILABILITY }); return () => {}; }
  const db = await getFirebaseDb();
  if (!db) throw new Error("ยังเชื่อมต่อสถานะการเปิดรับแบบประเมินไม่ได้");
  const { doc, onSnapshot } = await import("firebase/firestore");
  return onSnapshot(doc(db, "assessment_settings", "availability"), { includeMetadataChanges: true }, (snapshot) => {
    // Do not interpret an empty offline cache as a server-confirmed missing document.
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    try { onChange(parseAssessmentAvailability(snapshot.data())); } catch (error) { onError(error); }
  }, onError);
}

export async function readAssessmentAvailability(): Promise<AssessmentAvailability> {
  if (!shouldUseFirestore()) return { ...DEFAULT_AVAILABILITY };
  const db = await getFirebaseDb();
  if (!db) throw new Error("ยังเชื่อมต่อสถานะการเปิดรับแบบประเมินไม่ได้");
  const { doc, getDocFromServer } = await import("firebase/firestore");
  return parseAssessmentAvailability((await getDocFromServer(doc(db, "assessment_settings", "availability"))).data());
}

export async function setAssessmentAvailability(group: keyof AssessmentAvailability, enabled: boolean) {
  const [db, auth] = await Promise.all([getFirebaseDb(), getFirebaseAuth()]);
  if (!db || !auth?.currentUser?.email) throw new Error("กรุณาเข้าสู่ระบบ Admin ของ Firebase ก่อนตั้งค่า");
  const { doc, runTransaction, serverTimestamp } = await import("firebase/firestore");
  const ref = doc(db, "assessment_settings", "availability");
  const updatedBy = auth.currentUser.email.toLowerCase();
  // Update only the requested group; another admin's setting for the other group is preserved.
  await runTransaction(db, async (transaction) => {
    const current = parseAssessmentAvailability((await transaction.get(ref)).data());
    transaction.set(ref, { schemaVersion: 1, ...current, [group]: enabled, updatedAt: serverTimestamp(), updatedBy });
  });
}
