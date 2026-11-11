import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OBEC_URL = "https://opendata.edudev.in.th/v1/OBEC_SCHOOL_007";
const PRIVATE_SCHOOL_URL = "https://catalog.moe.go.th/dataset/483893fd-25d8-41f9-8596-133302e90a02/resource/9298827d-576a-4df5-95d6-cfef9bd2d585/download/.csv";
const TARGET_PROVINCES = [
  "กรุงเทพมหานคร", "กาญจนบุรี", "พระนครศรีอยุธยา", "ประจวบคีรีขันธ์",
  "ขอนแก่น", "สุรินทร์", "เชียงใหม่", "น่าน", "ลำปาง", "ภูเก็ต", "ปัตตานี", "สงขลา",
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (character === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function normalizeKey(value) {
  return value.normalize("NFC").replace(/\s+/g, "").toLocaleLowerCase("th");
}

async function fetchChecked(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ดาวน์โหลดไม่สำเร็จ ${response.status}: ${url}`);
  return response;
}

async function main() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const destination = resolve(projectRoot, "lib/schools.generated.json");
  const previous = JSON.parse(await readFile(destination, "utf8"));
  const keepPrivate = process.argv.includes("--keep-private");
  const fileArg = process.argv.indexOf("--obec-file");
  const obecRows = fileArg >= 0
    ? JSON.parse(await readFile(process.argv[fileArg + 1], "utf8"))
    : await (await fetchChecked(OBEC_URL)).json();
  if (!Array.isArray(obecRows) || !obecRows.length) throw new Error("ไม่มีข้อมูล สพฐ.");
  const privateRows = keepPrivate ? [] : parseCsv(new TextDecoder("windows-874").decode(
    await (await fetchChecked(PRIVATE_SCHOOL_URL)).arrayBuffer()));
  const privateHeaders = keepPrivate ? [] : privateRows.shift();
  const privateColumn = Object.fromEntries(privateHeaders.map((value, index) => [value, index]));
  if (!keepPrivate && ["ชื่อโรงเรียน (ไทย)", "จังหวัด", "อำเภอ"].some(key => privateColumn[key] === undefined)) {
    throw new Error("หัวตารางโรงเรียนเอกชนไม่ตรงกับรูปแบบที่รองรับ");
  }
  const privateKey = (province, school) => [province, school.name, school.district, school.subdistrict ?? ""].map(normalizeKey).join(":");
  const existingPrivate = new Map(Object.entries(previous.schoolsByProvince).flatMap(([province, schools]) =>
    schools.filter(school => school.source === "private").map(school => [privateKey(province, school), school.id])));

  const directory = Object.fromEntries(TARGET_PROVINCES.map((province) => [province, []]));
  const seen = new Set();

  function addSchool({ id, name, province, district, subdistrict = "", code = "", source }) {
    const cleanName = String(name ?? "").trim().replace(/\s+/g, " ");
    const cleanProvince = String(province ?? "").trim();
    if (!directory[cleanProvince] || cleanName.length < 2) return;

    const key = String(id);
    if (!/^(obec|private)-[A-Za-z0-9-]+$/.test(key)) throw new Error(`รหัสโรงเรียนไม่ถูกต้อง: ${key}`);
    if (seen.has(key)) return;
    seen.add(key);
    directory[cleanProvince].push({
      id: String(id),
      name: cleanName,
      district: String(district ?? "").trim(),
      subdistrict: String(subdistrict ?? "").trim(),
      code: String(code ?? "").trim(),
      source,
    });
  }

  for (const row of obecRows) {
    addSchool({
      id: `obec-${row.moeCode}`,
      name: row.schoolName,
      province: row.province,
      district: row.district,
      subdistrict: row.subdistrict,
      code: row.moeCode,
      source: "obec",
    });
  }

  if (keepPrivate) {
    for (const [province, schools] of Object.entries(previous.schoolsByProvince)) {
      for (const school of schools) if (school.source === "private") addSchool({ ...school, province });
    }
  } else for (const row of privateRows) {
    const school = {
      name: row[privateColumn["ชื่อโรงเรียน (ไทย)"]] ?? "",
      province: row[privateColumn["จังหวัด"]] ?? "",
      district: row[privateColumn["อำเภอ"]] ?? "",
      subdistrict: row[privateColumn["ตำบล"]] ?? "",
      source: "private",
    };
    // Preserve existing IDs; new entries use a location-based ID, never CSV row order.
    const signature = privateKey(school.province, school);
    const oldId = existingPrivate.get(signature)
      ?? existingPrivate.get(privateKey(school.province, { ...school, subdistrict: "" }));
    addSchool({ ...school, id: oldId ?? `private-${createHash("sha256").update(signature).digest("hex").slice(0, 24)}` });
  }

  const collator = new Intl.Collator("th");
  for (const schools of Object.values(directory)) {
    schools.sort((left, right) => collator.compare(left.name, right.name) || collator.compare(left.district, right.district) || collator.compare(left.subdistrict, right.subdistrict) || left.id.localeCompare(right.id));
  }

  const countsByProvince = Object.fromEntries(
    Object.entries(directory).map(([province, schools]) => [province, schools.length]),
  );
  for (const [province, count] of Object.entries(countsByProvince)) {
    if (count === 0) throw new Error(`ไม่พบรายชื่อสถานศึกษาในจังหวัด ${province}`);
  }

  const result = {
    metadata: {
      generatedOn: new Date().toISOString().slice(0, 10),
      scope: "12 จังหวัดดำเนินการ",
      total: Object.values(countsByProvince).reduce((sum, count) => sum + count, 0),
      countsByProvince,
      sources: [
        { id: "obec", label: "สพฐ. / DMC", url: OBEC_URL, dataYear: "2563" },
        { ...(keepPrivate ? previous.metadata.sources.find(source => source.id === "private") : {}), id: "private", label: "สำนักงานคณะกรรมการส่งเสริมการศึกษาเอกชน", url: PRIVATE_SCHOOL_URL, dataYear: "ปรับปรุง 5 เม.ย. 2567", ...(keepPrivate ? { retainedFrom: previous.metadata.sources.find(source => source.id === "private")?.retainedFrom ?? previous.metadata.generatedOn } : {}) },
      ],
    },
    schoolsByProvince: directory,
  };

  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result.metadata, null, 2)}\n`);
}

await main();
