"use client";

import { useEffect, useMemo, useState } from "react";
import { provinces, type TopicId } from "@/lib/assessment-data";
import {
  dashboardRepository,
  type DashboardGrade as Grade,
  type DashboardRecord,
  type DashboardResult,
} from "@/lib/integrations/dashboard-repository";

const topicOptions: Array<{ id: "all" | TopicId; label: string }> = [
  { id: "all", label: "ทุกแบบประเมิน" },
  { id: "bus", label: "รถรับ–ส่งนักเรียน" },
  { id: "trip", label: "ทัศนศึกษา / นอกสถานศึกษา" },
  { id: "moto", label: "รถจักรยานยนต์และหมวกนิรภัย" },
  { id: "agency", label: "บทบาทหน่วยงานกำกับ" },
];

function average(records: DashboardRecord[]) {
  return records.length ? records.reduce((sum, item) => sum + item.score, 0) / records.length : 0;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" }).format(new Date(value));
}

export function DashboardWorkspace() {
  const [records, setRecords] = useState<DashboardRecord[]>([]);
  const [source, setSource] = useState<"loading" | DashboardResult["source"]>("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [province, setProvince] = useState("all");
  const [topicId, setTopicId] = useState<"all" | TopicId>("all");

  function reloadDashboard() {
    setSource("loading");
    setLoadError("");
    setRecords([]);
    setReloadKey((value) => value + 1);
  }

  useEffect(() => {
    let active = true;
    let unsubscribe = () => undefined;

    void dashboardRepository.subscribe((payload) => {
      if (!active) return;
      setRecords(payload.records);
      setSource(payload.source);
      setLoadError(payload.error ?? "");
    }).then((stop) => {
      if (active) unsubscribe = stop;
      else stop();
    }).catch(() => {
      if (!active) return;
      setRecords([]);
      setSource("unavailable");
      setLoadError("เชื่อมต่อข้อมูล Dashboard ไม่สำเร็จ");
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [reloadKey]);

  const filtered = useMemo(() => records.filter((record) =>
    (province === "all" || record.province === province) &&
    (topicId === "all" || record.topicId === topicId)
  ), [records, province, topicId]);

  const metrics = useMemo(() => ({
    submissions: filtered.length,
    organizations: new Set(filtered.map((record) => record.institution)).size,
    average: average(filtered),
    urgent: filtered.filter((record) => record.grade === "D").length,
  }), [filtered]);

  const grades = useMemo(() => (["A", "B", "C", "D"] as Grade[]).map((grade) => ({
    grade,
    count: filtered.filter((record) => record.grade === grade).length,
  })), [filtered]);

  const topicSummaries = useMemo(() => topicOptions.slice(1).map((topic) => {
    const items = filtered.filter((record) => record.topicId === topic.id);
    return { ...topic, count: items.length, average: average(items) };
  }), [filtered]);

  const provinceSummaries = useMemo(() => provinces
    .map((item) => {
      const items = filtered.filter((record) => record.province === item);
      return { province: item, count: items.length, organizations: new Set(items.map((record) => record.institution)).size, average: average(items), urgent: items.filter((record) => record.grade === "D").length };
    })
    .filter((item) => item.count > 0), [filtered]);

  const topGaps = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.flatMap((record) => record.lowQuestions).forEach((question) => counts.set(question.title, (counts.get(question.title) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [filtered]);

  const recent = useMemo(() => [...filtered]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6), [filtered]);

  return (
    <main className="page-shell dashboard-shell" aria-busy={source === "loading"}>
      <div className="dashboard-head">
        <div>
          <p className="eyebrow">ภาพรวมเพื่อการพัฒนาและติดตามผล</p>
          <h1>Dashboard ความปลอดภัยในการเดินทาง</h1>
          <p>ดูผลตามจังหวัด ประเภทการประเมิน และประเด็นที่ควรเร่งสนับสนุน</p>
        </div>
        <span className={`data-badge ${source}`}>
          {source === "loading" && "กำลังโหลดข้อมูลจริง"}
          {source === "live" && "ข้อมูลจาก Firestore"}
          {source === "empty" && "ยังไม่มีผลประเมิน"}
          {source === "unavailable" && "เชื่อมต่อข้อมูลไม่สำเร็จ"}
        </span>
      </div>

      <section className="dashboard-note" aria-label="ขอบเขตข้อมูล">
        <strong>หลักการอ่านผล:</strong> คะแนนใช้สะท้อนช่องว่างเพื่อจัดทำแผนพัฒนา ไม่ใช้ลงโทษหรือตัดงบประมาณ
        และยังไม่แสดง “อัตราการส่งครบ” จนกว่าจะมีรายชื่อหน่วยงานเป้าหมายประจำรอบประเมิน
      </section>

      {source === "unavailable" ? (
        <section className="dashboard-load-state error" role="alert">
          <div><strong>ไม่สามารถดึงข้อมูลจริงได้</strong><span>{loadError || "กรุณาตรวจสอบการเข้าสู่ระบบและการตั้งค่า Firestore"}</span></div>
          <button type="button" className="btn btn-secondary" onClick={reloadDashboard}>ลองโหลดอีกครั้ง</button>
        </section>
      ) : null}

      {source === "empty" ? (
        <section className="dashboard-load-state empty" role="status">
          <div><strong>ระบบเชื่อมต่อ Firestore แล้ว แต่ยังไม่มีผลประเมิน</strong><span>เมื่อมีผู้ส่งแบบประเมิน รายการและตัวเลขสรุปจะปรากฏในหน้านี้โดยอัตโนมัติ</span></div>
        </section>
      ) : null}

      <section className="filter-bar" aria-label="ตัวกรองข้อมูล">
        <label className="field">
          <span>จังหวัด</span>
          <select value={province} onChange={(event) => setProvince(event.target.value)}>
            <option value="all">ทุกจังหวัด (12 จังหวัดนำร่อง)</option>
            {provinces.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="field">
          <span>ประเภทแบบประเมิน</span>
          <select value={topicId} onChange={(event) => setTopicId(event.target.value as "all" | TopicId)}>
            {topicOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </section>

      <section className="kpi-grid" aria-label="ตัวเลขสรุป">
        <article className="kpi-card"><span>ผลที่ส่งแล้ว</span><strong>{metrics.submissions}</strong><small>รายการตามตัวกรอง</small></article>
        <article className="kpi-card"><span>องค์กรที่มีข้อมูล</span><strong>{metrics.organizations}</strong><small>แห่ง / หน่วยงาน</small></article>
        <article className="kpi-card"><span>คะแนนเฉลี่ย</span><strong>{metrics.average.toFixed(1)}</strong><small>จาก 100 คะแนน</small></article>
        <article className="kpi-card urgent"><span>ระดับ D ต้องเร่งพัฒนา</span><strong>{metrics.urgent}</strong><small>รายการที่ควรติดตาม</small></article>
      </section>

      <section className="topic-summary-grid" aria-label="สรุปตามแบบประเมิน">
        {topicSummaries.map((topic) => (
          <article className="topic-summary-card" key={topic.id}>
            <p>{topic.label}</p>
            <strong>{topic.count ? topic.average.toFixed(1) : "—"}</strong>
            <small>{topic.count} รายการ · คะแนนเฉลี่ย</small>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel compact-panel">
          <div className="panel-heading"><div><p className="section-kicker">การกระจายระดับผล</p><h2>ระดับ A–D</h2></div></div>
          <div className="grade-bars">
            {grades.map(({ grade, count }) => (
              <div className="grade-row" key={grade}>
                <span className={`grade-pill grade-${grade.toLowerCase()}`}>{grade}</span>
                <div className="bar-track" aria-label={`ระดับ ${grade} ${count} รายการ`}><span style={{ width: `${filtered.length ? (count / filtered.length) * 100 : 0}%` }} /></div>
                <b>{count}</b>
              </div>
            ))}
          </div>
        </article>

        <article className="panel compact-panel">
          <div className="panel-heading"><div><p className="section-kicker">คะแนน 0–1 ที่พบซ้ำ</p><h2>ประเด็นที่ควรเร่งสนับสนุน</h2></div></div>
          {topGaps.length ? <ol className="gap-list">{topGaps.map(([label, count]) => <li key={label}><span>{label}</span><b>{count} ครั้ง</b></li>)}</ol> : <p className="empty-state">ไม่พบประเด็นคะแนนต่ำในตัวกรองนี้</p>}
        </article>
      </section>

      <section className="panel compact-panel table-panel">
        <div className="panel-heading"><div><p className="section-kicker">ติดตามพื้นที่ดำเนินการ</p><h2>สรุปตามจังหวัด</h2></div></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>จังหวัด</th><th>จำนวนองค์กร</th><th>ผลประเมิน</th><th>คะแนนเฉลี่ย</th><th>ระดับ D</th></tr></thead>
            <tbody>
              {provinceSummaries.map((item) => <tr key={item.province}><td><strong>{item.province}</strong></td><td>{item.organizations}</td><td>{item.count}</td><td>{item.average.toFixed(1)}</td><td>{item.urgent}</td></tr>)}
              {!provinceSummaries.length ? <tr><td colSpan={5} className="table-empty">ยังไม่มีข้อมูลตามตัวกรองนี้</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel compact-panel table-panel">
        <div className="panel-heading"><div><p className="section-kicker">รายการล่าสุด</p><h2>ผลประเมินที่บันทึกเข้าระบบ</h2></div></div>
        {recent.length ? <div className="recent-list">{recent.map((record) => <div key={record.id}><span><strong>{record.institution}</strong><small>{record.province} · {record.topicLabel} · {formatDate(record.createdAt)}</small></span><b className={`text-grade-${record.grade.toLowerCase()}`}>{record.score.toFixed(1)} · {record.grade}</b></div>)}</div> : <p className="empty-state">ยังไม่มีข้อมูลตามตัวกรองนี้</p>}
      </section>
    </main>
  );
}
