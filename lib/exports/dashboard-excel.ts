import type { Cell, CellObject, Sheet } from "write-excel-file/browser";
import type { DashboardRecord } from "../integrations/dashboard-repository";

export type DashboardExportScope =
  | "all"
  | "overview"
  | "provinces"
  | "topics"
  | "grades"
  | "gaps"
  | "assessments"
  | "categories"
  | "questions";

export type DashboardExportInput = {
  scope: DashboardExportScope;
  records: DashboardRecord[];
  provinceLabel: string;
  topicLabel: string;
  includePersonalData?: boolean;
};

type CellValue = string | number | Date | null;
type ColumnSpec = { header: string; width: number; numberFormat?: string };
export type DashboardWorkbook = { sheets: Sheet<ArrayBuffer>[] };

const topicLabels = {
  bus: "รถรับ–ส่งนักเรียน",
  trip: "ทัศนศึกษา / นอกสถานศึกษา",
  moto: "รถจักรยานยนต์และหมวกนิรภัย",
  agency: "บทบาทหน่วยงานกำกับ",
} as const;

const scopeFileNames: Record<DashboardExportScope, string> = {
  all: "ข้อมูลรวม",
  overview: "ภาพรวม",
  provinces: "ตามจังหวัด",
  topics: "ตามแบบประเมิน",
  grades: "ระดับผล",
  gaps: "ประเด็นเร่งพัฒนา",
  assessments: "ผลประเมิน",
  categories: "คะแนนรายหมวด",
  questions: "รายละเอียดรายข้อ",
};

function average(records: DashboardRecord[]) {
  return records.length ? records.reduce((sum, record) => sum + record.score, 0) / records.length : 0;
}

// ป้องกันค่าจากผู้กรอกถูก Excel ตีความเป็นสูตรเมื่อเปิดไฟล์
function safeCell(value: CellValue): CellValue {
  if (typeof value === "string" && /^[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

function generatedAtText() {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date());
}

function fileDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

function referenceCode(record: DashboardRecord) {
  const date = record.assessmentDate.replaceAll("-", "").slice(2) || "000000";
  return `TCC-${date}-${record.id.slice(0, 6).toUpperCase()}`;
}

function titleRow(value: string, columnCount: number): Cell[] {
  return [
    {
      value,
      columnSpan: columnCount,
      height: 32,
      fontFamily: "Sarabun",
      fontSize: 17,
      fontWeight: "bold",
      textColor: "#FFFFFF",
      backgroundColor: "#165C3B",
      alignVertical: "center",
      wrap: true,
    },
    ...Array.from({ length: Math.max(0, columnCount - 1) }, () => null),
  ];
}

function metaRow(value: string, columnCount: number): Cell[] {
  return [
    {
      value,
      columnSpan: columnCount,
      height: 28,
      fontFamily: "Sarabun",
      fontSize: 10,
      textColor: "#5B6C62",
      alignVertical: "center",
      wrap: true,
    },
    ...Array.from({ length: Math.max(0, columnCount - 1) }, () => null),
  ];
}

function headerCell(value: string): CellObject {
  return {
    value,
    height: 30,
    fontFamily: "Sarabun",
    fontSize: 11,
    fontWeight: "bold",
    textColor: "#FFFFFF",
    backgroundColor: "#2D7655",
    borderColor: "#B8CCC1",
    borderStyle: "thin",
    align: "center",
    alignVertical: "center",
    wrap: true,
  };
}

function dataCell(value: CellValue, column: ColumnSpec, rowIndex: number): CellObject {
  return {
    value: safeCell(value) ?? undefined,
    height: 24,
    fontFamily: "Sarabun",
    fontSize: 11,
    textColor: "#24332C",
    backgroundColor: rowIndex % 2 === 1 ? "#F4F8F5" : "#FFFFFF",
    bottomBorderColor: "#D8E2DC",
    bottomBorderStyle: "hair",
    format: column.numberFormat,
    alignVertical: "center",
    wrap: true,
  };
}

export async function createDashboardWorkbook(input: DashboardExportInput): Promise<DashboardWorkbook> {
  const sheets: Sheet<ArrayBuffer>[] = [];
  const meta = `ตัวกรอง: จังหวัด ${input.provinceLabel} · แบบประเมิน ${input.topicLabel} · ส่งออกเมื่อ ${generatedAtText()}`;

  function addTableSheet(name: string, title: string, columns: ColumnSpec[], rows: CellValue[][]) {
    const data: Cell[][] = [
      titleRow(title, columns.length),
      metaRow(meta, columns.length),
      Array.from({ length: columns.length }, () => null),
      columns.map((column) => headerCell(column.header)),
      ...rows.map((row, rowIndex) => row.map((value, columnIndex) => dataCell(value, columns[columnIndex], rowIndex))),
    ];
    sheets.push({
      sheet: name,
      data,
      columns: columns.map((column) => ({ width: column.width })),
      stickyRowsCount: 4,
      showGridLines: false,
      orientation: columns.length > 7 ? "landscape" : undefined,
    });
  }

  function addOverview() {
    addTableSheet("ภาพรวม", "ภาพรวมผลการประเมิน", [
      { header: "ผลประเมิน", width: 18, numberFormat: "#,##0" },
      { header: "องค์กร", width: 18, numberFormat: "#,##0" },
      { header: "คะแนนเฉลี่ย", width: 20, numberFormat: "0.0" },
      { header: "ระดับ D", width: 18, numberFormat: "#,##0" },
    ], [[
      input.records.length,
      new Set(input.records.map((record) => record.institution)).size,
      average(input.records),
      input.records.filter((record) => record.grade === "D").length,
    ]]);
  }

  function addProvinces() {
    const values = [...new Set(input.records.map((record) => record.province))].sort((a, b) => a.localeCompare(b, "th"));
    const rows = values.map((province) => {
      const records = input.records.filter((record) => record.province === province);
      return [province, new Set(records.map((record) => record.institution)).size, records.length, average(records), records.filter((record) => record.grade === "D").length] satisfies CellValue[];
    });
    addTableSheet("ตามจังหวัด", "สรุปผลตามจังหวัด", [
      { header: "จังหวัด", width: 24 },
      { header: "จำนวนองค์กร", width: 18, numberFormat: "#,##0" },
      { header: "ผลประเมิน", width: 18, numberFormat: "#,##0" },
      { header: "คะแนนเฉลี่ย", width: 18, numberFormat: "0.0" },
      { header: "ระดับ D", width: 14, numberFormat: "#,##0" },
    ], rows);
  }

  function addTopics() {
    const rows = Object.entries(topicLabels).map(([topicId, label]) => {
      const records = input.records.filter((record) => record.topicId === topicId);
      return [label, records.length, average(records), records.filter((record) => record.grade === "D").length] satisfies CellValue[];
    });
    addTableSheet("ตามแบบประเมิน", "สรุปผลตามแบบประเมิน", [
      { header: "แบบประเมิน", width: 42 },
      { header: "ผลประเมิน", width: 18, numberFormat: "#,##0" },
      { header: "คะแนนเฉลี่ย", width: 18, numberFormat: "0.0" },
      { header: "ระดับ D", width: 14, numberFormat: "#,##0" },
    ], rows);
  }

  function addGrades() {
    const rows = (["A", "B", "C", "D"] as const).map((grade) => {
      const count = input.records.filter((record) => record.grade === grade).length;
      return [grade, count, input.records.length ? count / input.records.length : 0] satisfies CellValue[];
    });
    addTableSheet("ระดับผล", "การกระจายระดับผล A–D", [
      { header: "ระดับ", width: 14 },
      { header: "จำนวน", width: 16, numberFormat: "#,##0" },
      { header: "สัดส่วน", width: 16, numberFormat: "0.0%" },
    ], rows);
  }

  function addGaps() {
    const counts = new Map<string, { count: number; scores: number[] }>();
    for (const question of input.records.flatMap((record) => record.lowQuestions)) {
      const value = counts.get(question.title) ?? { count: 0, scores: [] };
      value.count += 1;
      value.scores.push(question.score);
      counts.set(question.title, value);
    }
    const rows = [...counts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([title, value], index) => [index + 1, title, value.count, value.scores.reduce((sum, score) => sum + score, 0) / value.scores.length] satisfies CellValue[]);
    addTableSheet("ประเด็นเร่งพัฒนา", "ประเด็นที่ควรเร่งสนับสนุน", [
      { header: "ลำดับ", width: 10, numberFormat: "#,##0" },
      { header: "ประเด็น", width: 68 },
      { header: "จำนวนครั้ง", width: 16, numberFormat: "#,##0" },
      { header: "คะแนนเฉลี่ยรายข้อ", width: 22, numberFormat: "0.0" },
    ], rows);
  }

  function addAssessments() {
    const personalColumns: ColumnSpec[] = input.includePersonalData ? [
      { header: "ชื่อผู้ให้ข้อมูล", width: 30 },
      { header: "บทบาท", width: 30 },
      { header: "หน้าที่ / ตำแหน่ง", width: 34 },
      { header: "เบอร์โทรศัพท์", width: 22 },
    ] : [];
    const rows = input.records.map((record) => [
      referenceCode(record), record.institution, record.province, record.topicLabel, record.agencyType ?? "—",
      ...(input.includePersonalData ? [record.assessorName || "ไม่ระบุ", record.respondentRole || "ไม่ระบุ", record.position || "ไม่ระบุ", record.assessorPhone || "ไม่ระบุ"] : []),
      record.assessmentDate ? new Date(`${record.assessmentDate}T00:00:00+07:00`) : new Date(record.createdAt),
      new Date(record.createdAt), record.score, record.grade, record.lowQuestions.length,
    ] satisfies CellValue[]);
    addTableSheet("ผลประเมิน", "รายการผลประเมิน", [
      { header: "เลขอ้างอิง", width: 26 },
      { header: "สถานศึกษา / หน่วยงาน", width: 42 },
      { header: "จังหวัด", width: 22 },
      { header: "แบบประเมิน", width: 46 },
      { header: "ประเภทหน่วยงาน", width: 22 },
      ...personalColumns,
      { header: "วันที่ประเมิน", width: 18, numberFormat: "dd/mm/yyyy" },
      { header: "วันที่บันทึก", width: 22, numberFormat: "dd/mm/yyyy hh:mm" },
      { header: "คะแนน", width: 14, numberFormat: "0.0" },
      { header: "ระดับ", width: 12 },
      { header: "ข้อที่ต้องพัฒนา", width: 20, numberFormat: "#,##0" },
    ], rows);
  }

  function addCategories() {
    const rows = input.records.flatMap((record) => record.categoryScores.map((category) => [
      referenceCode(record), record.institution, record.province, record.topicLabel, category.label,
      category.weight / 100, category.percent / 100, category.contribution,
    ] satisfies CellValue[]));
    addTableSheet("คะแนนรายหมวด", "คะแนนแยกตามหมวด", [
      { header: "เลขอ้างอิง", width: 26 },
      { header: "สถานศึกษา / หน่วยงาน", width: 40 },
      { header: "จังหวัด", width: 22 },
      { header: "แบบประเมิน", width: 42 },
      { header: "หมวด", width: 42 },
      { header: "น้ำหนัก", width: 14, numberFormat: "0%" },
      { header: "คะแนนหมวด", width: 18, numberFormat: "0.0%" },
      { header: "คะแนนถ่วงน้ำหนัก", width: 22, numberFormat: "0.0" },
    ], rows);
  }

  function addQuestions() {
    const rows = input.records.flatMap((record) => record.questionResults.map((question) => [
      referenceCode(record), record.institution, record.province, record.topicLabel, question.number, question.title,
      question.categoryLabel, question.categoryWeight / 100, question.score, question.level,
      question.selectedDescription, question.scorePercent / 100, question.contribution,
      question.requiresImprovement ? "ต้องปรับปรุง" : "ถึงขั้นมาตรฐาน",
      question.recommendation ?? "—", question.explanation || "—",
    ] satisfies CellValue[]));
    addTableSheet("รายละเอียดรายข้อ", "รายละเอียดผลประเมินรายข้อ", [
      { header: "เลขอ้างอิง", width: 26 },
      { header: "สถานศึกษา / หน่วยงาน", width: 40 },
      { header: "จังหวัด", width: 22 },
      { header: "แบบประเมิน", width: 42 },
      { header: "ข้อ", width: 10 },
      { header: "ประเด็นประเมิน", width: 62 },
      { header: "หมวด", width: 38 },
      { header: "น้ำหนักหมวด", width: 18, numberFormat: "0%" },
      { header: "คะแนน", width: 12, numberFormat: "0" },
      { header: "ระดับที่เลือก", width: 26 },
      { header: "เกณฑ์ที่ตรง", width: 70 },
      { header: "คะแนนรายข้อ", width: 18, numberFormat: "0.0%" },
      { header: "คะแนนถ่วงน้ำหนัก", width: 22, numberFormat: "0.0" },
      { header: "สถานะ", width: 20 },
      { header: "ข้อเสนอแนะ", width: 76 },
      { header: "ข้อมูลประกอบ", width: 70 },
    ], rows);
  }

  const addByScope: Record<Exclude<DashboardExportScope, "all">, () => void> = {
    overview: addOverview,
    provinces: addProvinces,
    topics: addTopics,
    grades: addGrades,
    gaps: addGaps,
    assessments: addAssessments,
    categories: addCategories,
    questions: addQuestions,
  };

  if (input.scope === "all") {
    addOverview();
    addProvinces();
    addTopics();
    addGrades();
    addGaps();
    addAssessments();
    addCategories();
    addQuestions();
  } else {
    addByScope[input.scope]();
  }
  return { sheets };
}

export async function downloadDashboardExcel(input: DashboardExportInput) {
  const [{ default: writeExcelFile }, workbook] = await Promise.all([
    import("write-excel-file/browser"),
    createDashboardWorkbook(input),
  ]);
  await writeExcelFile(workbook.sheets, { fontFamily: "Sarabun", fontSize: 11 })
    .toFile(`tcc-dashboard-${scopeFileNames[input.scope]}-${fileDate()}.xlsx`);
}
