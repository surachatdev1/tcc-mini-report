import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const directory = JSON.parse(await readFile(new URL("../lib/schools.generated.json", import.meta.url), "utf8"));
const formSource = await readFile(new URL("../components/assessment-workspace.tsx", import.meta.url), "utf8");
const schoolDirectorySource = await readFile(new URL("../lib/school-directory.ts", import.meta.url), "utf8");

const provinces = [
  "กรุงเทพมหานคร", "กาญจนบุรี", "พระนครศรีอยุธยา", "ประจวบคีรีขันธ์",
  "ขอนแก่น", "สุรินทร์", "เชียงใหม่", "น่าน", "ลำปาง", "ภูเก็ต", "ปัตตานี", "สงขลา",
];

test("school directory มีครบ 12 จังหวัดและใช้รหัสแยกโรงเรียนชื่อซ้ำ", () => {
  assert.deepEqual(Object.keys(directory.schoolsByProvince), provinces);
  for (const province of provinces) {
    const schools = directory.schoolsByProvince[province];
    assert.ok(schools.length > 0, province);
    const ids = schools.map((school) => school.id);
    assert.equal(new Set(ids).size, ids.length, `พบรหัสซ้ำใน ${province}`);
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
  assert.ok(schoolDirectorySource.includes("/data/schools/${filename}.json?v="));
  assert.doesNotMatch(schoolDirectorySource, /import directory from/);
});

test("restores both บ้านห้วยทราย schools and all 131 excluded OBEC IDs", () => {
  const schools = Object.values(directory.schoolsByProvince).flat();
  assert.equal(schools.filter(school => school.source === "obec").length, 5417);
  assert.equal(schools.filter(school => school.source === "private").length, 1432);
  assert.equal(new Set(schools.map(school => school.id)).size, 6849);
  const twins = directory.schoolsByProvince["เชียงใหม่"].filter(school => school.name === "บ้านห้วยทราย");
  assert.deepEqual(twins.map(school => [school.code, school.district, school.subdistrict]).sort(), [
    ["1050130013", "เมืองเชียงใหม่", "สุเทพ"], ["1050130061", "จอมทอง", "บ้านแปะ"],
  ]);
});
