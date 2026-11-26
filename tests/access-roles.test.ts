import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_EMAILS, inferProvinceFromOrganization, isAdminEmail, resolveDashboardRole, resolveMemberProvince, systemRoleLabel } from "../lib/access-roles.ts";

test("กำหนด Admin เจ้าของโครงการถาวรสามบัญชีโดยไม่สนตัวพิมพ์ใหญ่เล็ก", () => {
  assert.deepEqual(ADMIN_EMAILS, ["surachat.dev1@gmail.com", "nuonnaka@gmail.com", "pbusssafety69@gmail.com"]);
  assert.equal(isAdminEmail(" SURACHAT.DEV1@GMAIL.COM "), true);
  assert.equal(isAdminEmail("nuonnaka@gmail.com"), true);
  assert.equal(isAdminEmail(" PBUSSSAFETY69@GMAIL.COM "), true);
  assert.equal(isAdminEmail("busssafety69@gmail.com"), false);
  assert.equal(isAdminEmail("another-admin@gmail.com"), false);
});

test("แสดงชื่อระดับสิทธิ์ Admin และ Viewer อย่างตรงไปตรงมา", () => {
  assert.equal(systemRoleLabel("super_admin"), "ผู้ดูแลสูงสุด");
  assert.equal(systemRoleLabel("admin"), "ผู้ดูแลส่วนกลาง (ดูทุกจังหวัด)");
  assert.equal(systemRoleLabel("province_viewer"), "เจ้าหน้าที่จังหวัด");
  assert.equal(systemRoleLabel("none"), "ไม่มีสิทธิ์");
});

test("ผู้ใช้เดิมจับจังหวัดจากชื่อหน่วยงานแบบตรงตัวเท่านั้น", () => {
  const allowed = ["กาญจนบุรี", "ลำปาง", "เชียงใหม่"];
  assert.equal(inferProvinceFromOrganization("หน่วยงานประจำจังหวัดกาญจนบุรี", allowed), "กาญจนบุรี");
  assert.equal(inferProvinceFromOrganization(" หน่วยงานประจำจังหวัด ลำปาง ", allowed), "ลำปาง");
  assert.equal(inferProvinceFromOrganization("หน่วยงานประจำจังหวัดอื่น", allowed), null);
  assert.equal(inferProvinceFromOrganization("สำนักงานในกาญจนบุรีและลำปาง", allowed), null);
  assert.equal(inferProvinceFromOrganization("เจ้าหน้าที่ส่วนกลาง", allowed), null);
});

test("จังหวัดที่บันทึกไว้มีลำดับความสำคัญ และค่าที่ผิดต้องปฏิเสธ", () => {
  const allowed = ["กาญจนบุรี", "ลำปาง"];
  assert.equal(resolveMemberProvince({ province: "ลำปาง", displayName: "หน่วยงานประจำจังหวัดกาญจนบุรี" }, allowed), "ลำปาง");
  assert.equal(resolveMemberProvince({ displayName: "หน่วยงานประจำจังหวัดกาญจนบุรี" }, allowed), "กาญจนบุรี");
  assert.equal(resolveMemberProvince({ province: "", displayName: "หน่วยงานประจำจังหวัดกาญจนบุรี" }, allowed), null);
  assert.equal(resolveMemberProvince({ province: "กรุงเทพ", displayName: "หน่วยงานประจำจังหวัดกาญจนบุรี" }, allowed), null);
});

test("Super Admin fixed list always reads every province and does not require membership", () => {
  const provinces = ["กาญจนบุรี", "ลำปาง"];
  assert.deepEqual(resolveDashboardRole("surachat.dev1@gmail.com", null, provinces),
    { role: "super_admin", province: null });
  assert.deepEqual(resolveDashboardRole("nuonnaka@gmail.com", { active: false }, provinces),
    { role: "super_admin", province: null });
});

test("Central Admin uses explicit schema 3 policy with null province only", () => {
  const provinces = ["กาญจนบุรี", "ลำปาง"];
  assert.deepEqual(resolveDashboardRole("central@example.com",
    { schemaVersion: 3, role: "admin", active: true, province: null }, provinces),
    { role: "admin", province: null });
  for (const member of [
    { schemaVersion: 3, role: "admin", active: true, province: "กาญจนบุรี" },
    { schemaVersion: 3, role: "admin", active: false, province: null },
    { schemaVersion: 2, role: "admin", active: true, province: null },
    { schemaVersion: 3, role: "super_admin", active: true, province: null },
  ]) {
    assert.deepEqual(resolveDashboardRole("central@example.com", member, provinces),
      { role: "none", province: null });
  }
});

test("Legacy users remain restricted to their own province and cannot self-elevate", () => {
  const provinces = ["กาญจนบุรี", "ลำปาง"];
  assert.deepEqual(resolveDashboardRole("viewer@example.com",
    { schemaVersion: 2, active: true, province: "ลำปาง", displayName: "หน่วยงานประจำจังหวัดกาญจนบุรี" }, provinces),
    { role: "province_viewer", province: "ลำปาง" });
  assert.deepEqual(resolveDashboardRole("viewer@example.com",
    { schemaVersion: 1, active: true, displayName: "หน่วยงานประจำจังหวัดกาญจนบุรี" }, provinces),
    { role: "province_viewer", province: "กาญจนบุรี" });
  assert.deepEqual(resolveDashboardRole("viewer@example.com",
    { schemaVersion: 3, role: "province_viewer", active: true, province: "ลำปาง" }, provinces),
    { role: "province_viewer", province: "ลำปาง" });
  assert.deepEqual(resolveDashboardRole("viewer@example.com",
    { schemaVersion: 2, active: true, displayName: "ไม่มีจังหวัด" }, provinces),
    { role: "none", province: null });
  assert.deepEqual(resolveDashboardRole("viewer@example.com",
    { schemaVersion: 3, role: "admin", active: true, province: "ลำปาง" }, provinces),
    { role: "none", province: null });
});
