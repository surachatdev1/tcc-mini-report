export const ADMIN_EMAILS = [
  "surachat.dev1@gmail.com",
  "nuonnaka@gmail.com",
  "pbusssafety69@gmail.com",
] as const;

/** Existing fixed project administrators retain full management privileges. */
export const SUPER_ADMIN_EMAILS = ADMIN_EMAILS;

export type SystemRole = "super_admin" | "admin" | "province_viewer" | "none";
export type MemberRole = "admin" | "province_viewer";

export function isAdminEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  return ADMIN_EMAILS.some((email) => email === normalized);
}

export function systemRoleLabel(role: SystemRole) {
  if (role === "super_admin") return "ผู้ดูแลสูงสุด";
  if (role === "admin") return "ผู้ดูแลส่วนกลาง (ดูทุกจังหวัด)";
  if (role === "province_viewer") return "เจ้าหน้าที่จังหวัด";
  return "ไม่มีสิทธิ์";
}

/**
 * Transitional support for provincial viewers added before an explicit
 * province field existed. Only unambiguous, exact organization labels match.
 * Keep these formats in sync with firestore.rules/canReadProvince.
 */
export function inferProvinceFromOrganization(name: unknown, allowedProvinces: readonly string[]): string | null {
  if (typeof name !== "string") return null;
  const label = name.trim();
  return allowedProvinces.find((province) =>
    label === `หน่วยงานประจำจังหวัด${province}`
    || label === `หน่วยงานประจำจังหวัด ${province}`
  ) ?? null;
}

/** An explicitly configured but invalid province never falls back to the name. */
export function resolveMemberProvince(
  member: { province?: unknown; displayName?: unknown },
  allowedProvinces: readonly string[],
): string | null {
  if (Object.prototype.hasOwnProperty.call(member, "province")) {
    return typeof member.province === "string" && allowedProvinces.includes(member.province)
      ? member.province
      : null;
  }
  return inferProvinceFromOrganization(member.displayName, allowedProvinces);
}

/**
 * Resolve the same permission model enforced in firestore.rules:
 * - The fixed central accounts are always super admins.
 * - New (v3) members explicitly select admin or province_viewer.
 * - Legacy v1/v2 members without a role remain provincial viewers only.
 * Invalid/inactive/ambiguous policies never acquire central access.
 */
export function resolveDashboardRole(
  email: string,
  member: Record<string, unknown> | null,
  allowedProvinces: readonly string[],
): { role: SystemRole; province: string | null } {
  if (isAdminEmail(email)) return { role: "super_admin", province: null };
  if (!member || member.active !== true) return { role: "none", province: null };
  if (member.schemaVersion === 3) {
    if (member.role === "admin" && member.province === null) {
      return { role: "admin", province: null };
    }
    if (member.role === "province_viewer") {
      const province = resolveMemberProvince(member, allowedProvinces);
      return province ? { role: "province_viewer", province } : { role: "none", province: null };
    }
    return { role: "none", province: null };
  }
  if ((member.schemaVersion === 1 || member.schemaVersion === 2) && member.role === undefined) {
    const province = resolveMemberProvince(member, allowedProvinces);
    return province ? { role: "province_viewer", province } : { role: "none", province: null };
  }
  return { role: "none", province: null };
}
