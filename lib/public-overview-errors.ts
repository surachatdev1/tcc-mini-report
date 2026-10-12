export function publicOverviewError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code.includes("permission-denied") || code.includes("unauthenticated")) {
    return "ยังไม่ได้รับสิทธิ์อ่านข้อมูลสรุปสาธารณะ กรุณาแจ้งผู้ดูแลระบบเพื่อเปิดใช้งาน";
  }
  if (code.includes("unavailable") || code.includes("deadline-exceeded")) {
    return "เชื่อมต่อข้อมูลไม่สำเร็จ โปรดตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
  }
  return "โหลดข้อมูลภาพรวมไม่สำเร็จ กรุณาลองใหม่ หากยังพบปัญหาโปรดแจ้งผู้ดูแลระบบ";
}
