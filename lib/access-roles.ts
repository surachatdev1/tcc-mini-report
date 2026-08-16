export const SUPER_ADMIN_EMAILS = [
  "surachat.dev1@gmail.com",
  "nuonnaka@gmail.com",
] as const;

export type SystemRole = "superadmin" | "admin" | "user" | "none";

export function isSuperAdminEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  return SUPER_ADMIN_EMAILS.some((email) => email === normalized);
}

export function systemRoleLabel(role: SystemRole) {
  if (role === "superadmin") return "Superadmin";
  if (role === "admin") return "Admin";
  if (role === "user") return "User";
  return "ไม่มีสิทธิ์";
}
