export const ADMIN_EMAILS = [
  "surachat.dev1@gmail.com",
  "nuonnaka@gmail.com",
  "pbusssafety69@gmail.com",
] as const;

export type SystemRole = "admin" | "viewer" | "none";

export function isAdminEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  return ADMIN_EMAILS.some((email) => email === normalized);
}

export function systemRoleLabel(role: SystemRole) {
  if (role === "admin") return "ผู้ดูแลระบบ";
  if (role === "viewer") return "ผู้มีสิทธิ์ดู Dashboard";
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
