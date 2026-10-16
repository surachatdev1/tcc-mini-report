"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { overviewTopics } from "@/lib/dashboard-overview";
import { overviewSearchLabel } from "@/lib/public-overview-search";
import { selectOverviewDetail, type OverviewDetailSelection } from "@/lib/public-overview-details";
import type { OverviewFilters, PublicOverviewCell } from "@/lib/public-overview";

import { OverviewGapList } from "./overview-gap-list";
import { rankedOverviewGaps, type OverviewQuestionLabel } from "@/lib/public-overview-gaps";

const number = (value: number) => value.toLocaleString("th-TH");
const grades = ["A", "B", "C", "D"] as const;
export function OverviewDetailDialog({ cells, applied, selection, questionLabels, onClose }: {
  cells: PublicOverviewCell[];
  applied: OverviewFilters;
  selection: OverviewDetailSelection;
  questionLabels: Record<string, OverviewQuestionLabel>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  const { filters, summary, topics, rows } = selectOverviewDetail(cells, applied, selection);
  const gaps = rankedOverviewGaps(summary.gaps);
  const metric = selection.metric && summary[selection.metric.field][selection.metric.id];
  const context = overviewSearchLabel(filters, cells);
  return <dialog className="td-detail-dialog" ref={ref} aria-labelledby="overview-detail-title" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) { const box = e.currentTarget.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) onClose(); } }}>
    <div className="td-dialog-head"><div><span className="td-eyebrow">รายละเอียดข้อมูลสรุป</span><h2 id="overview-detail-title">{selection.title}</h2></div><button type="button" className="td-close" onClick={onClose} aria-label="ปิดรายละเอียด">×</button></div>
    <div className="td-dialog-body">
      <p className="td-detail-context">{context}</p>
      <div className="td-detail-stats"><div><span>โรงเรียนไม่ซ้ำ</span><b>{number(summary.schools)} <small>แห่ง</small></b></div><div><span>ผลประเมิน</span><b>{number(summary.assessments)} <small>รายการ</small></b></div><div><span>{selection.metric ? "คะแนนเฉลี่ยด้านนี้" : "คะแนนเฉลี่ยรวม"}</span><b>{selection.metric ? metric?.count ? (metric.sum / metric.count).toFixed(1) : "—" : summary.assessments ? (summary.scoreSum / summary.assessments).toFixed(1) : "—"}<small> / 100</small></b></div></div>
      {summary.agencies > 0 && <p className="td-detail-note">หน่วยงานกำกับ {number(summary.agencies)} แห่ง (แยกจากจำนวนโรงเรียน)</p>}
      {selection.metric && <p className="td-detail-note">{selection.metric.description} · คำนวณจาก {number(metric?.count ?? 0)} ผลประเมินที่มีข้อมูลด้านนี้</p>}
      {selection.gaps ? <>
        <h3>พบผลต่ำกว่าเกณฑ์ {number(gaps.length)} ประเด็น</h3>
        {gaps.length ? <OverviewGapList entries={gaps} questionLabels={questionLabels} /> : <p>ไม่พบประเด็นต่ำกว่าเกณฑ์ตามเงื่อนไขนี้</p>}
      </> : <>
        <h3>ข้อมูลรายจังหวัด</h3>
        {rows.length ? <div className="td-table-scroll" role="region" aria-label="ตารางรายละเอียดรายจังหวัด" tabIndex={0}><table className="td-detail-table"><thead><tr><th>จังหวัด</th><th>โรงเรียน</th><th>ผลประเมิน</th><th>คะแนนเฉลี่ย</th>{!selection.metric && grades.map(g => <th key={g}>{g}</th>)}</tr></thead><tbody>{rows.map(([province, m]) => { const value = selection.metric && m[selection.metric.field][selection.metric.id]; return <tr key={province}><th scope="row">{province}</th><td>{number(m.schools)}</td><td>{number(selection.metric ? value?.count ?? 0 : m.assessments)}</td><td>{selection.metric ? value?.count ? (value.sum / value.count).toFixed(1) : "—" : m.assessments ? (m.scoreSum / m.assessments).toFixed(1) : "—"}</td>{!selection.metric && grades.map(g => <td key={g}>{number(m.grades[g])}</td>)}</tr>; })}</tbody></table></div> : <p className="td-detail-note">ไม่มีข้อมูลตามเงื่อนไขนี้</p>}
        {!selection.metric && <><h3>แยกตามประเภทการประเมิน</h3><div className="td-detail-topics">{overviewTopics.filter(t => filters.topic === "all" || t.id === filters.topic).map(t => <div key={t.id}><span>{t.label}</span><b>{number(topics[t.id]?.assessments ?? 0)} รายการ</b></div>)}</div></>}
      </>}
    </div>
    <footer className="td-dialog-footer"><Link href="/dashboard">ดูผลประเมินรายรายการ (เจ้าหน้าที่)</Link><button type="button" className="td-clear" onClick={onClose}>ปิดรายละเอียด</button></footer>
  </dialog>;
}
