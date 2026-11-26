import type { User } from "firebase/auth";
import { isAdminEmail, resolveMemberProvince, type SystemRole } from "@/lib/access-roles";
import { provinces } from "@/lib/assessment-data";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/integrations/firebase-client";

export type DashboardAccess = {
  role: SystemRole;
  admin: boolean;
  member: boolean;
  emailVerified: boolean;
  /** null for Admin or unauthorised members; viewers are always province-scoped. */
  province: string | null;
  provinceAssignmentRequired: boolean;
};

export type AccessEntry = {
  id: string;
  email: string;
  name: string;
  createdBy: string;
  createdAt: string;
  role: "viewer";
  province: string | null;
  provinceSource: "stored" | "inferred" | "missing";
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
  const province = resolveMemberProvince(data, provinces);
  const provinceSource = !province ? "missing" : Object.prototype.hasOwnProperty.call(data, "province") ? "stored" : "inferred";
  return {
    id,
    email: String(data.email ?? id),
    name: String(data.displayName ?? ""),
    createdBy: String(data.createdBy ?? "—"),
    createdAt: timestampLabel(data.createdAt),
    role: "viewer",
    province,
    provinceSource,
  };
}

export async function getDashboardAccess(user: User): Promise<DashboardAccess> {
  const email = normalizeEmail(user.email ?? "");
  if (!email || !user.emailVerified) {
    return { role: "none", admin: false, member: false, emailVerified: false, province: null, provinceAssignmentRequired: false };
  }

  // Admin กำหนดถาวรตามรายชื่อใน access-roles.ts และ Firestore Rules
  // Viewer ต้องมี policy active พร้อมจังหวัดที่ถูกต้องหรืออนุมานจากชื่อหน่วยงานเดิมได้ตรงตัว
  const admin = isAdminEmail(email);
  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อ Firestore เพื่อตรวจสอบสิทธิ์ได้");
  const { doc, getDoc } = await import("firebase/firestore");
  const memberDocument = await getDoc(doc(db, "dashboard_members", email));
  const policy = memberDocument.exists() ? memberDocument.data() : null;
  const province = policy?.active === true ? resolveMemberProvince(policy, provinces) : null;
  const member = province !== null;

  return {
    role: admin ? "admin" : member ? "viewer" : "none",
    admin,
    member,
    emailVerified: true,
    province: admin ? null : province,
    provinceAssignmentRequired: !admin && policy?.active === true && province === null,
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

export async function addDashboardViewer(email: string, displayName: string, province: string) {
  const normalized = requireEmail(email);
  if (!provinces.includes(province)) throw new Error("กรุณาเลือกจังหวัดที่รับผิดชอบ");
  if (isAdminEmail(normalized)) throw new Error("บัญชีนี้เป็นผู้ดูแลระบบและมีสิทธิ์อยู่แล้ว");
  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อ Firestore ได้");
  const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
  await setDoc(doc(db, "dashboard_members", normalized), {
    schemaVersion: 2,
    province,
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

/** Assign or correct a viewer's province; existing timestamps/creator stay intact. */
export async function updateDashboardViewerProvince(email: string, province: string) {
  const normalized = requireEmail(email);
  if (!provinces.includes(province)) throw new Error("กรุณาเลือกจังหวัดที่รับผิดชอบ");
  await currentAdminEmail();
  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อ Firestore ได้");
  const { doc, updateDoc } = await import("firebase/firestore");
  await updateDoc(doc(db, "dashboard_members", normalized), { schemaVersion: 2, province });
}
