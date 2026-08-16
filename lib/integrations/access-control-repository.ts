import type { User } from "firebase/auth";
import { isAdminEmail, type SystemRole } from "@/lib/access-roles";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/integrations/firebase-client";

export type DashboardAccess = {
  role: SystemRole;
  admin: boolean;
  member: boolean;
  emailVerified: boolean;
};

export type AccessEntry = {
  id: string;
  email: string;
  name: string;
  createdBy: string;
  createdAt: string;
  role: "viewer";
};

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function requireEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(normalized)) {
    throw new Error("กรุณากรอกอีเมลให้ถูกต้อง");
  }
  return normalized;
}

function timestampLabel(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(value.toDate());
  }
  return "—";
}

function toEntry(id: string, data: Record<string, unknown>): AccessEntry {
  return {
    id,
    email: String(data.email ?? id),
    name: String(data.displayName ?? ""),
    createdBy: String(data.createdBy ?? "—"),
    createdAt: timestampLabel(data.createdAt),
    role: "viewer",
  };
}

export async function getDashboardAccess(user: User): Promise<DashboardAccess> {
  const email = normalizeEmail(user.email ?? "");
  if (!email || !user.emailVerified) {
    return { role: "none", admin: false, member: false, emailVerified: false };
  }

  // Admin สองบัญชีกำหนดถาวรใน Rules เพื่อป้องกันระบบถูกล็อกเอาต์ทั้งหมด
  // ส่วน Viewer ต้องมี policy ที่ตรงกับอีเมลของตนเองใน dashboard_members
  const admin = isAdminEmail(email);
  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อ Firestore เพื่อตรวจสอบสิทธิ์ได้");
  const { doc, getDoc } = await import("firebase/firestore");
  const memberDocument = await getDoc(doc(db, "dashboard_members", email));
  const member = memberDocument.exists() && memberDocument.data().active === true;

  return {
    role: admin ? "admin" : member ? "viewer" : "none",
    admin,
    member,
    emailVerified: true,
  };
}

export async function subscribeDashboardViewers(
  onValue: (entries: AccessEntry[]) => void,
  onError: (error: unknown) => void,
) {
  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อ Firestore ได้");
  const { collection, onSnapshot } = await import("firebase/firestore");

  return onSnapshot(collection(db, "dashboard_members"), (snapshot) => {
    const entries = snapshot.docs
      .map((item) => toEntry(item.id, item.data()))
      .toSorted((a, b) => a.email.localeCompare(b.email, "th"));
    onValue(entries);
  }, onError);
}

async function currentAdminEmail() {
  const auth = await getFirebaseAuth();
  const email = normalizeEmail(auth?.currentUser?.email ?? "");
  if (!email || !isAdminEmail(email)) throw new Error("บัญชีนี้ไม่มีสิทธิ์จัดการผู้ใช้งาน");
  return email;
}

export async function addDashboardViewer(email: string, displayName: string) {
  const normalized = requireEmail(email);
  if (isAdminEmail(normalized)) throw new Error("บัญชีนี้เป็นผู้ดูแลระบบและมีสิทธิ์อยู่แล้ว");
  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อ Firestore ได้");
  const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
  await setDoc(doc(db, "dashboard_members", normalized), {
    schemaVersion: 1,
    email: normalized,
    displayName: displayName.trim(),
    authMethod: "google",
    active: true,
    createdAt: serverTimestamp(),
    createdBy: await currentAdminEmail(),
  });
}

export async function removeDashboardViewer(email: string) {
  const normalized = requireEmail(email);
  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อ Firestore ได้");
  await currentAdminEmail();
  const { deleteDoc, doc } = await import("firebase/firestore");
  await deleteDoc(doc(db, "dashboard_members", normalized));
}
