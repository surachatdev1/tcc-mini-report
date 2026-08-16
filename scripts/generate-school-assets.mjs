import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(new URL("../lib/schools.generated.json", import.meta.url));
const outputDirectory = fileURLToPath(new URL("../public/data/schools", import.meta.url));

const provinceFiles = {
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

const directory = JSON.parse(await readFile(sourcePath, "utf8"));

// This folder is generated from the canonical source on every build. Keeping
// one province per file prevents the entire school directory entering the JS bundle.
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await Promise.all(Object.entries(provinceFiles).map(async ([province, filename]) => {
  const schools = directory.schoolsByProvince[province];
  if (!Array.isArray(schools) || schools.length === 0) {
    throw new Error(`ไม่พบรายชื่อสถานศึกษาสำหรับจังหวัด${province}`);
  }
  await writeFile(`${outputDirectory}/${filename}.json`, `${JSON.stringify(schools)}\n`, "utf8");
}));

console.log(`Generated ${Object.keys(provinceFiles).length} province school assets.`);
