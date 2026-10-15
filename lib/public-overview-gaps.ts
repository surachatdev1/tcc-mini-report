import type { PublicMetrics } from "./public-overview";

export type OverviewGap = PublicMetrics["gaps"][string];
export type OverviewQuestionLabel = { title: string; shortTitle: string; topic: string };

// Presentation labels only. The original rubric remains available in the details.
export const gapShortTitles: Record<string, string> = {
  "bus-driver-1": "คุณสมบัติใบอนุญาตขับรถ",
  "bus-driver-2": "ใบรับรองแพทย์และการตรวจสุขภาพคนขับ",
  "bus-driver-3": "การอบรมคนขับรถรับส่งนักเรียน",
  "bus-vehicle-1": "การรับรองและตรวจสอบรถตามกฎหมาย",
  "bus-vehicle-2": "ความพร้อมของอุปกรณ์ฉุกเฉินบนรถ",
  "bus-vehicle-3": "ประกันภัยรถรับส่งนักเรียน",
  "bus-management-1": "ระบบข้อมูลนักเรียน คนขับ และเส้นทาง",
  "bus-management-2": "การแจ้งเตือนรับ–ส่งและการติดต่อครู",
  "bus-management-3": "แผนงานความปลอดภัยในการเดินทาง",
  "trip-driver-1": "ใบอนุญาตและประวัติการขับรถสาธารณะ",
  "trip-driver-2": "ใบรับรองแพทย์และการตรวจสุขภาพคนขับ",
  "trip-driver-3": "การอบรมความปลอดภัยและการดูแลนักเรียน",
  "trip-vehicle-1": "การตรวจสภาพรถก่อนรับงาน",
  "trip-vehicle-2": "ความคุ้มครองประกันภัยรถทัศนศึกษา",
  "trip-vehicle-3": "อุปกรณ์และระบบติดตามความปลอดภัย",
  "trip-school-1": "การขออนุมัติเดินทางทัศนศึกษา",
  "trip-school-2": "มาตรการเลือกใช้รถโดยสารที่ปลอดภัย",
  "trip-school-3": "การคัดเลือกผู้ประกอบการและสัญญาจ้าง",
  "trip-support-1": "มาตรการความปลอดภัยและแผนบริหารความเสี่ยง",
  "trip-support-2": "แผนและความพร้อมรับมือเหตุฉุกเฉิน",
  "trip-support-3": "การจัดเก็บและใช้ข้อมูลปรับปรุงการเดินทาง",
  "moto-behavior-1": "ใบอนุญาตขับขี่รถจักรยานยนต์ของนักเรียน",
  "moto-behavior-2": "การใช้หมวกกันน็อกมาตรฐาน มอก.",
  "moto-behavior-3": "ป้ายทะเบียนและภาษีรถจักรยานยนต์",
  "moto-management-1": "ระเบียบประกันภัยและทะเบียนรถจักรยานยนต์",
  "moto-management-2": "การลงทะเบียนและตรวจสอบผู้ใช้รถจักรยานยนต์",
  "moto-management-3": "ข้อตกลงความปลอดภัยร่วมกับผู้ปกครอง",
  "moto-knowledge-1": "การให้ความรู้ความปลอดภัยทางถนนในโรงเรียน",
  "moto-knowledge-2": "การให้ความรู้โดยบุคคลหรือหน่วยงานภายนอก",
  "moto-knowledge-3": "การประเมินความรู้และทัศนคติด้านความปลอดภัย",
  "moto-environment-1": "พื้นที่จอดรถจักรยานยนต์",
  "moto-environment-2": "มาตรการจำกัดความเร็วในพื้นที่โรงเรียน",
  "moto-environment-3": "การสำรวจและทบทวนจุดเสี่ยงจราจร",
  "agency-road-safety-1": "คณะทำงานกำกับความปลอดภัยของนักเรียน",
  "agency-road-safety-2": "แผนสนับสนุนความปลอดภัยในการเดินทาง",
  "agency-road-safety-3": "แผนบูรณาการรถรับส่งนักเรียนระดับจังหวัด",
  "agency-education-area-4": "ผู้บริหารและครูผู้ดูแลรถรับส่งนักเรียน",
  "agency-education-area-5": "ยุทธศาสตร์และแผนงานรถรับส่งของโรงเรียน",
  "agency-education-area-6": "การบรรจุแผนรถรับส่งและติดตามผลต่อเนื่อง",
  "agency-transport-7": "การบังคับใช้มาตรฐานรถรับส่งนักเรียน",
  "agency-transport-8": "การพัฒนาความรู้ด้านความปลอดภัยรถรับส่ง",
  "agency-transport-9": "ระบบข้อมูลรถรับส่งร่วมระหว่างหน่วยงาน",
  "agency-local-admin-10": "นโยบายจัดบริการรถรับส่งของ อปท.",
  "agency-local-admin-11": "การจัดหรือสนับสนุนบริการรถรับส่งของ อปท.",
  "agency-local-admin-12": "หลักเกณฑ์งบประมาณสนับสนุนรถรับส่ง",
};

export const gapRankingNote = "เรียงตามจำนวนชุดที่ได้คะแนน 0–1 มากที่สุด • โรงเรียนหนึ่งแห่งอาจส่งหลายชุด";

export function rankedOverviewGaps(gaps: PublicMetrics["gaps"]) {
  return Object.entries(gaps).filter(([, value]) => value.count > 0 && value.eligible > 0)
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
}

export function overviewGapStats({ count, eligible }: OverviewGap) {
  const belowShare = eligible ? count / eligible * 100 : 0;
  const belowPercent = eligible ? Math.round(belowShare) : null;
  return {
    belowShare,
    belowPercent,
    meetsCount: eligible - count,
    // Complementary rounded labels always add up to 100%, including x.5 ties.
    meetsPercent: belowPercent === null ? null : 100 - belowPercent,
  };
}

export function overviewGapExportRows(entries: [string, OverviewGap][], labels: Record<string, OverviewQuestionLabel>) {
  return entries.map(([key, value]) => {
    const stats = overviewGapStats(value);
    return [labels[key]?.title ?? key, labels[key]?.topic ?? "", value.eligible, value.count, stats.belowPercent ?? "ไม่มีข้อมูล", stats.meetsCount, stats.meetsPercent ?? "ไม่มีข้อมูล"];
  });
}
