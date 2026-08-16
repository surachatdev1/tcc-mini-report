import assert from "node:assert/strict";
import test from "node:test";
import { isSuperAdminEmail, SUPER_ADMIN_EMAILS, systemRoleLabel } from "../lib/access-roles.ts";

test("กำหนด Superadmin ถาวรสองบัญชีโดยไม่สนตัวพิมพ์ใหญ่เล็ก", () => {
  assert.deepEqual(SUPER_ADMIN_EMAILS, ["surachat.dev1@gmail.com", "nuonnaka@gmail.com"]);
  assert.equal(isSuperAdminEmail(" SURACHAT.DEV1@GMAIL.COM "), true);
  assert.equal(isSuperAdminEmail("nuonnaka@gmail.com"), true);
  assert.equal(isSuperAdminEmail("another-admin@gmail.com"), false);
});

test("แสดงชื่อระดับสิทธิ์ครบ Superadmin Admin และ User", () => {
  assert.equal(systemRoleLabel("superadmin"), "Superadmin");
  assert.equal(systemRoleLabel("admin"), "Admin");
  assert.equal(systemRoleLabel("user"), "User");
  assert.equal(systemRoleLabel("none"), "ไม่มีสิทธิ์");
});
