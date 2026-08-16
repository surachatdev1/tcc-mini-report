export const ADMIN_EMAILS = [
  "surachat.dev1@gmail.com",
  "nuonnaka@gmail.com",
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
