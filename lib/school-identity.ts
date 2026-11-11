export type SchoolIdentity = {
  id: string;
  code: string;
  district: string;
  subdistrict: string;
  source: "obec" | "private";
};

export function isSchoolIdentity(value: unknown): value is SchoolIdentity {
  if (!value || typeof value !== "object") return false;
  const school = value as Record<string, unknown>;
  return (school.source === "obec" || school.source === "private")
    && typeof school.id === "string" && school.id.length <= 100
    && school.id.startsWith(`${school.source}-`) && /^(obec|private)-[a-z0-9-]+$/.test(school.id)
    && typeof school.code === "string" && /^(|[0-9]{10})$/.test(school.code)
    && (school.source !== "obec" || school.id === `obec-${school.code}` && school.code.length === 10)
    && typeof school.district === "string" && school.district.length <= 100
    && typeof school.subdistrict === "string" && school.subdistrict.length <= 100;
}

export function schoolIdentity(school: SchoolIdentity): SchoolIdentity {
  return { id: school.id, code: school.code, district: school.district, subdistrict: school.subdistrict, source: school.source };
}

type Institution = { institution: string; province: string; topicId?: string; school?: SchoolIdentity | null };

export function institutionIdentityKey(record: Institution) {
  if (record.topicId !== "agency" && isSchoolIdentity(record.school)) return `registered:${record.school.id}`;
  // Legacy / manual names stay separate from registered schools. Never infer an ID from a name.
  return `${record.province}:${record.institution.normalize("NFC").replace(/^โรงเรียน\s*/, "").replace(/\s+/g, "").toLocaleLowerCase("th")}`;
}

export function schoolLocation(school: SchoolIdentity | null | undefined, province = "") {
  if (!school) return "";
  const bangkok = province === "กรุงเทพมหานคร";
  return [school.subdistrict && `${bangkok ? "แขวง" : "ต."}${school.subdistrict}`,
    school.district && `${bangkok ? "เขต" : "อ."}${school.district}`].filter(Boolean).join(" · ");
}

export function institutionLabel(record: Institution) {
  if (record.topicId === "agency") return record.institution;
  const location = schoolLocation(record.school, record.province);
  return [record.institution, location, record.school?.code ? `รหัส ${record.school.code}` : !record.school ? "ยังไม่ระบุรหัสโรงเรียน" : ""].filter(Boolean).join(" · ");
}

export const schoolCountNote = "รายการที่ยังไม่มีรหัสโรงเรียนแยกนับตามชื่อและจังหวัด จึงยังยืนยันจำนวนโรงเรียนจริงไม่ได้";
