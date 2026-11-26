import type { User } from "firebase/auth";
import { inferProvinceFromOrganization, isAdminEmail, resolveDashboardRole, resolveMemberProvince, type MemberRole, type SystemRole } from "@/lib/access-roles";
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
  role: MemberRole;
  province: string | null;
  provinceSource: "central" | "stored" | "inferred" | "missing";
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
  const central = data.schemaVersion === 3 && data.role === "admin" && data.province === null;
  const province = central ? null : resolveMemberProvince(data, provinces);
  const provinceSource = central ? "central" : !province ? "missing" : Object.prototype.hasOwnProperty.call(data, "province") ? "stored" : "inferred";
  return {
    id,
    email: String(data.email ?? id),
    name: String(data.displayName ?? ""),
    createdBy: String(data.createdBy ?? "—"),
    createdAt: timestampLabel(data.createdAt),
    role: central ? "admin" : "province_viewer",
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
  const access = resolveDashboardRole(email, policy ?? null, provinces);
  const member = access.role === "admin" || access.role === "province_viewer";

  return {
    role: access.role,
    admin,
    member,
    emailVerified: true,
    province: access.province,
    provinceAssignmentRequired: !admin && policy?.active === true && access.role === "none",
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

export async function addDashboardViewer(email: string, displayName: string, province: string | null, role: MemberRole = "province_viewer") {
  const normalized = requireEmail(email);
  validateMemberScope(role, province);
  if (isAdminEmail(normalized)) throw new Error("บัญชีนี้เป็นผู้ดูแลระบบและมีสิทธิ์อยู่แล้ว");
  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อ Firestore ได้");
  const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
  await setDoc(doc(db, "dashboard_members", normalized), {
    schemaVersion: 3,
    role,
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

function validateMemberScope(role: MemberRole, province: string | null) {
  if (role === "admin" && province === null) return;
  if (role === "province_viewer" && province !== null && provinces.includes(province)) return;
  throw new Error("สิทธิ์หรือจังหวัดที่รับผิดชอบไม่ถูกต้อง");
}

/**
 * Update a member's role/province, preserving their creation audit metadata.
 * The fixed Super Admin can approve central Admin access; existing viewers
 * never gain cross-province access without an explicit authorized update.
 */
export async function updateDashboardMemberAccess(email: string, role: MemberRole, province: string | null) {
  const normalized = requireEmail(email);
  if (isAdminEmail(normalized)) throw new Error("บัญชี Super Admin ไม่สามารถแก้ไขสิทธิ์ผ่านรายการนี้");
  validateMemberScope(role, province);
  await currentAdminEmail();
  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อ Firestore ได้");
  const { doc, runTransaction } = await import("firebase/firestore");
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, "dashboard_members", normalized);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().active !== true) throw new Error("ไม่พบบัญชีผู้มีสิทธิ์ที่เปิดใช้งาน");
    transaction.update(ref, { schemaVersion: 3, role, province });
  });
}

// Keep the existing API for provincial assignment callers.
export async function updateDashboardViewerProvince(email: string, province: string) {
  return updateDashboardMemberAccess(email, "province_viewer", province);
}

/**
 * Persist provinces for pre-existing, active viewer accounts whose organisation
 * name is an exact, unambiguous provincial label. Admin-only and idempotent:
 * the transaction re-reads every member to avoid overwriting a province assigned
 * by another Admin between the list snapshot and the update.
 *
 * Unmatched names are NEVER assigned a province by guesswork.
 */
export async function migrateLegacyDashboardViewerProvinces(emails: string[]) {
  await currentAdminEmail();
  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อ Firestore ได้");
  const { doc, runTransaction } = await import("firebase/firestore");
  const uniqueEmails = [...new Set(emails.map(normalizeEmail))].filter(Boolean);
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const email of uniqueEmails) {
    if (isAdminEmail(email)) { skipped++; continue; }
    try {
      const didUpdate = await runTransaction(db, async (transaction) => {
        const memberRef = doc(db, "dashboard_members", email);
        const snapshot = await transaction.get(memberRef);
        if (!snapshot.exists()) return false;
        const data = snapshot.data();
        if (data.active !== true || Object.prototype.hasOwnProperty.call(data, "province")) return false;
        const province = inferProvinceFromOrganization(data.displayName, provinces);
        if (!province || data.email !== email) return false;
        transaction.update(memberRef, { schemaVersion: 3, role: "province_viewer", province });
        return true;
      });
      if (didUpdate) updated++;
      else skipped++;
    } catch {
      failed++;
    }
  }
  return { examined: uniqueEmails.length, updated, skipped, failed };
}
