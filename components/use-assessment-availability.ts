"use client";

import { useEffect, useState } from "react";
import type { AssessmentAvailability } from "@/lib/assessment-availability";
import { subscribeAssessmentAvailability } from "@/lib/integrations/assessment-availability-repository";

export function useAssessmentAvailability() {
  const [availability, setAvailability] = useState<AssessmentAvailability | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const timeout = window.setTimeout(() => {
      if (active) setError("ยังตรวจสอบสถานะการเปิดรับไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
    }, 15000);
    void subscribeAssessmentAvailability((value) => {
      if (!active) return;
      window.clearTimeout(timeout);
      setAvailability(value);
      setError("");
    }, () => {
      if (!active) return;
      window.clearTimeout(timeout);
      setAvailability(null);
      setError("โหลดสถานะการเปิดรับไม่สำเร็จ กรุณาลองใหม่หรือติดต่อผู้ดูแล");
    }).then((stop) => { if (active) unsubscribe = stop; else stop(); }).catch(() => {
      if (active) { setAvailability(null); setError("เชื่อมต่อสถานะการเปิดรับไม่ได้ กรุณาลองใหม่"); }
    });
    return () => { active = false; window.clearTimeout(timeout); unsubscribe?.(); };
  }, [attempt]);
  return { availability, error, retry: () => { setAvailability(null); setError(""); setAttempt((value) => value + 1); } };
}
