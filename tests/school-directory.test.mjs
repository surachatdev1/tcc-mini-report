import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const directory = JSON.parse(await readFile(new URL("../lib/schools.generated.json", import.meta.url), "utf8"));
const formSource = await readFile(new URL("../components/assessment-workspace.tsx", import.meta.url), "utf8");

const provinces = [
  "กรุงเทพมหานคร", "กาญจนบุรี", "พระนครศรีอยุธยา", "ประจวบคีรีขันธ์",
  "ขอนแก่น", "สุรินทร์", "เชียงใหม่", "น่าน", "ลำปาง", "ภูเก็ต", "ปัตตานี", "สงขลา",
];

test("school directory มีครบ 12 จังหวัดและไม่มีชื่อซ้ำในจังหวัดเดียวกัน", () => {
  assert.deepEqual(Object.keys(directory.schoolsByProvince), provinces);
  for (const province of provinces) {
    const schools = directory.schoolsByProvince[province];
    assert.ok(schools.length > 0, province);
    const names = schools.map((school) => school.name.replace(/\s+/g, "").toLocaleLowerCase("th"));
    assert.equal(new Set(names).size, names.length, `พบชื่อซ้ำใน ${province}`);
  }
  assert.equal(directory.metadata.total, Object.values(directory.metadata.countsByProvince).reduce((sum, count) => sum + count, 0));
});

test("รายชื่อรวมทั้ง สพฐ. และโรงเรียนเอกชนในระบบ", () => {
  const schools = Object.values(directory.schoolsByProvince).flat();
  assert.ok(schools.some((school) => school.source === "obec"));
  assert.ok(schools.some((school) => school.source === "private"));
});

test("ฟอร์มใช้ searchable school combobox หลังเลือกจังหวัด", () => {
  assert.match(formSource, /SchoolCombobox/);
  assert.match(formSource, /setProvince: changeProvince/);
});
