import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_EMAILS, inferProvinceFromOrganization, isAdminEmail, resolveMemberProvince, systemRoleLabel } from "../lib/access-roles.ts";

test("กำหนด Admin เจ้าของโครงการถาวรสามบัญชีโดยไม่สนตัวพิมพ์ใหญ่เล็ก", () => {
  assert.deepEqual(ADMIN_EMAILS, ["surachat.dev1@gmail.com", "nuonnaka@gmail.com", "pbusssafety69@gmail.com"]);
  assert.equal(isAdminEmail(" SURACHAT.DEV1@GMAIL.COM "), true);
  assert.equal(isAdminEmail("nuonnaka@gmail.com"), true);
  assert.equal(isAdminEmail(" PBUSSSAFETY69@GMAIL.COM "), true);
  assert.equal(isAdminEmail("busssafety69@gmail.com"), false);
  assert.equal(isAdminEmail("another-admin@gmail.com"), false);
});

test("แสดงชื่อระดับสิทธิ์ Admin และ Viewer อย่างตรงไปตรงมา", () => {
  assert.equal(systemRoleLabel("admin"), "ผู้ดูแลระบบ");
  assert.equal(systemRoleLabel("viewer"), "ผู้มีสิทธิ์ดู Dashboard");
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
