import { mkdir, writeFile } from "node:fs/promises";
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
  const [obecResponse, privateResponse] = await Promise.all([
    fetchChecked(OBEC_URL),
    fetchChecked(PRIVATE_SCHOOL_URL),
  ]);

  const obecRows = await obecResponse.json();
  const privateBytes = await privateResponse.arrayBuffer();
  // ไฟล์ต้นทางของ สช. ใช้รหัสอักขระภาษาไทย Windows-874 (TIS-620 compatible)
  const privateRows = parseCsv(new TextDecoder("windows-874").decode(privateBytes));
  const privateHeaders = privateRows.shift();
  const privateColumn = Object.fromEntries(privateHeaders.map((value, index) => [value, index]));

  const directory = Object.fromEntries(TARGET_PROVINCES.map((province) => [province, []]));
  const seen = new Set();

  function addSchool({ id, name, province, district, source }) {
    const cleanName = String(name ?? "").trim().replace(/\s+/g, " ");
    const cleanProvince = String(province ?? "").trim();
    if (!directory[cleanProvince] || cleanName.length < 2) return;

    const key = `${cleanProvince}:${normalizeKey(cleanName)}`;
    if (seen.has(key)) return;
    seen.add(key);
    directory[cleanProvince].push({
      id: String(id),
      name: cleanName,
      district: String(district ?? "").trim(),
      source,
    });
  }

  for (const row of obecRows) {
    addSchool({
      id: `obec-${row.moeCode}`,
      name: row.schoolName,
      province: row.province,
      district: row.district,
      source: "obec",
    });
  }

  for (const [index, row] of privateRows.entries()) {
    addSchool({
      id: `private-${index + 1}`,
      name: row[privateColumn["ชื่อโรงเรียน (ไทย)"]],
      province: row[privateColumn["จังหวัด"]],
      district: row[privateColumn["อำเภอ"]],
      source: "private",
    });
  }

  const collator = new Intl.Collator("th");
  for (const schools of Object.values(directory)) {
    schools.sort((left, right) => collator.compare(left.name, right.name));
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
        { id: "private", label: "สำนักงานคณะกรรมการส่งเสริมการศึกษาเอกชน", url: PRIVATE_SCHOOL_URL, dataYear: "ปรับปรุง 5 เม.ย. 2567" },
      ],
    },
    schoolsByProvince: directory,
  };

  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const destination = resolve(projectRoot, "lib/schools.generated.json");
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result.metadata, null, 2)}\n`);
}

await main();
