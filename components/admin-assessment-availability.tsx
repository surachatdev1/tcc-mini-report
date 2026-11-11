"use client";

import { useState } from "react";
import { useAssessmentAvailability } from "./use-assessment-availability";
import { setAssessmentAvailability } from "@/lib/integrations/assessment-availability-repository";
import type { AssessmentAvailability } from "@/lib/assessment-availability";

const groups = [
  { id: "school", label: "โรงเรียน / สถานศึกษา", detail: "รถรับส่งนักเรียน รถทัศนศึกษา และรถจักรยานยนต์" },
  { id: "agency", label: "หน่วยงานระดับพื้นที่", detail: "ทุกประเภทหน่วยงานระดับพื้นที่" },
] as const;

export function AdminAssessmentAvailability() {
  const { availability, error, retry } = useAssessmentAvailability();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [status, setStatus] = useState("");
  async function toggle(group: keyof AssessmentAvailability) {
    if (!availability || busy) return;
    const next = !availability[group];
    setBusy(true); setSaveError(""); setStatus("");
    try {
      await setAssessmentAvailability(group, next);
      setStatus(`${next ? "เปิด" : "ปิด"}รับแบบประเมินสำหรับ${groups.find((item) => item.id === group)!.label}แล้ว`);
    } catch { setSaveError("บันทึกไม่สำเร็จ กรุณาตรวจสอบสิทธิ์ Admin การเชื่อมต่อ และ Firestore Rules แล้วลองใหม่"); }
    finally { setBusy(false); }
  }
  return (
    <section className="panel availability-panel" aria-labelledby="availability-title" aria-busy={busy}>
      <div className="panel-heading">
        <p className="section-kicker">จัดการแบบประเมิน</p>
        <h2 id="availability-title">เปิด–ปิดการรับแบบประเมิน</h2>
        <p>เลือกแต่ละกลุ่มได้อิสระ บันทึกทันทีเมื่อกดสวิตช์ มีผลกับการส่งใหม่และแบบฟอร์มที่เปิดค้างไว้ ผลเดิมและ Dashboard ยังดูได้</p>
      </div>
      {error ? <p role="alert">{error} <button className="btn btn-secondary" onClick={retry}>ลองใหม่</button></p> : !availability ? <p role="status">กำลังโหลดสถานะ…</p> : null}
      <div className="availability-grid">
        {groups.map((group) => (
          <div className="availability-card" key={group.id}>
            <div><h3 id={`availability-${group.id}`}>{group.label}</h3><p>{group.detail}</p></div>
            <button className="availability-switch" type="button" role="switch" aria-checked={availability?.[group.id] ?? false}
              aria-labelledby={`availability-${group.id}`} disabled={!availability || !!error || busy} onClick={() => void toggle(group.id)}>
              <span className="availability-track" aria-hidden="true"><span /></span>
              <span>{!availability ? "รอโหลด" : availability[group.id] ? "เปิดรับ" : "ปิดรับ"}</span>
            </button>
          </div>
        ))}
      </div>
      {busy ? <p role="status">กำลังบันทึกสถานะ…</p> : status ? <p role="status">{status}</p> : null}
      {saveError ? <p className="admin-message admin-message-error" role="alert">{saveError}</p> : null}
    </section>
  );
}
