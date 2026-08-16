import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_EMAILS, isAdminEmail, systemRoleLabel } from "../lib/access-roles.ts";

test("กำหนด Admin เจ้าของโครงการถาวรสองบัญชีโดยไม่สนตัวพิมพ์ใหญ่เล็ก", () => {
  assert.deepEqual(ADMIN_EMAILS, ["surachat.dev1@gmail.com", "nuonnaka@gmail.com"]);
  assert.equal(isAdminEmail(" SURACHAT.DEV1@GMAIL.COM "), true);
  assert.equal(isAdminEmail("nuonnaka@gmail.com"), true);
  assert.equal(isAdminEmail("another-admin@gmail.com"), false);
});

test("แสดงชื่อระดับสิทธิ์ Admin และ Viewer อย่างตรงไปตรงมา", () => {
  assert.equal(systemRoleLabel("admin"), "ผู้ดูแลระบบ");
  assert.equal(systemRoleLabel("viewer"), "ผู้มีสิทธิ์ดู Dashboard");
  assert.equal(systemRoleLabel("none"), "ไม่มีสิทธิ์");
});
