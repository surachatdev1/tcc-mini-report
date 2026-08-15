import criteria from "./criteria.generated.json";

export type Score = 0 | 1 | 2 | 3;
export type TopicId = "bus" | "trip" | "moto" | "agency";
export type AgencyType = "road-safety" | "education-area" | "transport" | "local-admin";
export type AudienceGroup = "school" | "agency";

export type ScoreOption = { value: Score; label: string; description: string };
export type Category = { id: string; label: string; weight: number };
export type Question = {
  id: string;
  number: string;
  categoryId: string;
  title: string;
  evidence: string;
  improvement: string;
  options: ScoreOption[];
};
export type Topic = {
  id: TopicId;
  label: string;
  shortLabel: string;
  detail: string;
  audience: string;
  group: AudienceGroup;
  categories: Category[];
  questions: Question[];
};

type CriteriaPayload = {
  rubricVersion: string;
  schoolTopics: Record<Exclude<TopicId, "agency">, Topic>;
  agencyTopics: Record<AgencyType, Topic>;
};

// ไฟล์ criteria.generated.json คือ snapshot ของตารางเกณฑ์วันที่ 22 มิ.ย. 2569
// UI อ่านจากข้อมูลชุดนี้โดยตรง จึงแก้เกณฑ์หรือเวอร์ชันได้โดยไม่ผูกข้อความไว้ใน component
const payload = criteria as CriteriaPayload;

export const rubricVersion = payload.rubricVersion;
const schoolTopics = payload.schoolTopics;
const agencyTopics = payload.agencyTopics;

export const provinces = [
  "กรุงเทพมหานคร", "กาญจนบุรี", "พระนครศรีอยุธยา", "ประจวบคีรีขันธ์",
  "ขอนแก่น", "สุรินทร์", "เชียงใหม่", "น่าน", "ลำปาง", "ภูเก็ต", "ปัตตานี", "สงขลา",
];

export const schoolRespondentRoles = [
  "ผู้บริหารสถานศึกษา",
  "ครู / ผู้รับผิดชอบความปลอดภัย",
  "ผู้ประสานงานกิจการนักเรียน",
  "เจ้าหน้าที่สถานศึกษา",
];

export const agencyRespondentRoles = [
  "ผู้บริหารหน่วยงาน",
  "ผู้รับผิดชอบนโยบายหรือแผนงาน",
  "เจ้าหน้าที่ผู้ประเมิน",
  "ผู้ประสานงานระดับพื้นที่",
];

export const respondentRoles = [...schoolRespondentRoles, ...agencyRespondentRoles];

export const agencyTypes: Array<{ id: AgencyType; label: string }> = [
  { id: "road-safety", label: "ศูนย์อำนวยการความปลอดภัยทางถนนจังหวัด" },
  { id: "education-area", label: "สำนักงานเขตพื้นที่การศึกษา" },
  { id: "transport", label: "สำนักงานขนส่งจังหวัด" },
  { id: "local-admin", label: "องค์กรปกครองส่วนท้องถิ่น" },
];

export function getTopic(id: TopicId, agencyType: AgencyType = "road-safety"): Topic {
  return id === "agency" ? agencyTopics[agencyType] : schoolTopics[id];
}

export const topics: Topic[] = [
  schoolTopics.bus,
  schoolTopics.trip,
  schoolTopics.moto,
  agencyTopics["road-safety"],
];

export const schoolTopicsList = [schoolTopics.bus, schoolTopics.trip, schoolTopics.moto];

export function getGradeLabel(grade: "A" | "B" | "C" | "D" | "-", topicId: TopicId) {
  if (grade === "-") return "ยังตอบไม่ครบ";

  // บทที่ 4 กำหนดถ้อยคำแปลผลด้านบทบาทเชิงระบบต่างจากแบบของสถานศึกษา
  if (topicId === "agency") {
    return ({
      A: "แสดงถึงการมีบทบาทเชิงรุกและระบบกำกับที่เข้มแข็ง",
      B: "แสดงถึงการขับเคลื่อนนโยบายได้อย่างเหมาะสมตามมาตรฐาน",
      C: "แสดงถึงการดำเนินการในระดับพื้นฐาน ยังต้องเสริมความต่อเนื่อง",
      D: "แสดงถึงการขาดกลไกเชิงระบบ จำเป็นต้องเร่งปรับปรุง",
    })[grade];
  }

  return ({
    A: "มีความปลอดภัยสูงและมีระบบบริหารจัดการดีมาก",
    B: "มีความปลอดภัยดี และสามารถดำเนินการตามมาตรฐานได้อย่างเหมาะสม",
    C: "ผ่านเกณฑ์ขั้นต่ำ แต่ยังมีประเด็นที่ต้องปรับปรุง",
    D: "ไม่ผ่านเกณฑ์ความปลอดภัย ต้องแก้ไขก่อนดำเนินการเดินทาง",
  })[grade];
}
