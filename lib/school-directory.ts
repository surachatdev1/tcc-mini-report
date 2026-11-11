import { isSchoolIdentity, type SchoolIdentity } from "./school-identity.ts";

export type SchoolDirectoryEntry = SchoolIdentity & { name: string };

const provinceFiles: Record<string, string> = {
  "กรุงเทพมหานคร": "bangkok",
  "กาญจนบุรี": "kanchanaburi",
  "พระนครศรีอยุธยา": "phra-nakhon-si-ayutthaya",
  "ประจวบคีรีขันธ์": "prachuap-khiri-khan",
  "ขอนแก่น": "khon-kaen",
  "สุรินทร์": "surin",
  "เชียงใหม่": "chiang-mai",
  "น่าน": "nan",
  "ลำปาง": "lampang",
  "ภูเก็ต": "phuket",
  "ปัตตานี": "pattani",
  "สงขลา": "songkhla",
};

const schoolCache = new Map<string, SchoolDirectoryEntry[]>();

function isSchoolDirectoryEntry(value: unknown): value is SchoolDirectoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.name === "string" && isSchoolIdentity(entry);
}

export async function getSchoolsByProvince(province: string) {
  const cached = schoolCache.get(province);
  if (cached) return cached;

  const filename = provinceFiles[province];
  if (!filename) return [];
  const response = await fetch(`/data/schools/${filename}.json?v=20261111`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`โหลดรายชื่อสถานศึกษาของจังหวัด${province}ไม่สำเร็จ`);
  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || !payload.every(isSchoolDirectoryEntry)) {
    throw new Error(`รูปแบบรายชื่อสถานศึกษาของจังหวัด${province}ไม่ถูกต้อง`);
  }
  schoolCache.set(province, payload);
  return payload;
}

export function normalizeSchoolSearch(value: string) {
  return value.normalize("NFC").replace(/\s+/g, "").toLocaleLowerCase("th");
}
