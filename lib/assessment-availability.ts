export type AssessmentAvailability = { school: boolean; agency: boolean };
export const DEFAULT_AVAILABILITY: AssessmentAvailability = { school: true, agency: true };

export function parseAssessmentAvailability(value: unknown): AssessmentAvailability {
  // A project that has never configured availability keeps its existing behavior.
  if (value === undefined) return { ...DEFAULT_AVAILABILITY };
  if (!value || typeof value !== "object"
    || !("school" in value) || typeof value.school !== "boolean"
    || !("agency" in value) || typeof value.agency !== "boolean") {
    throw new Error("อ่านสถานะการเปิดรับแบบประเมินไม่ได้ กรุณาลองใหม่");
  }
  return { school: value.school, agency: value.agency };
}

export function closedAssessmentMessage(group: keyof AssessmentAvailability) {
  return `ขณะนี้ปิดรับแบบประเมินสำหรับ${group === "school" ? "โรงเรียน / สถานศึกษา" : "หน่วยงานระดับพื้นที่"} ร่างของคุณยังอยู่ในเครื่อง กรุณาติดต่อผู้ดูแลโครงการ`;
}
