"use client";
/* eslint-disable @next/next/no-img-element -- Firebase serves the existing local WebP logos. */
import "./overview-dashboard.css";
import Link from "next/link";
import type { Cell } from "write-excel-file/browser";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { agencyTypes, getTopic, provinces, type TopicId } from "@/lib/assessment-data";
import { affiliationLabels } from "@/lib/dashboard-filters";
import { defaultOverviewFilters, emptyPublicMetrics, overviewDomains, selectPublicOverview, type OverviewFilters, type PublicMetrics } from "@/lib/public-overview";
import { subscribePublicOverview, type PublicOverviewResult } from "@/lib/integrations/public-overview-repository";
import { overviewTopics } from "@/lib/dashboard-overview";
import { OverviewArt as Art } from "./overview-art";
import { OverviewDetailDialog } from "./overview-detail-dialog";
import { OverviewGapList } from "./overview-gap-list";
import { gapRankingNote, gapShortTitles, overviewGapExportRows, rankedOverviewGaps } from "@/lib/public-overview-gaps";
import type { OverviewDetailSelection } from "@/lib/public-overview-details";
import geometry from "@/lib/thailand-provinces.geometry.json";

const colors = ["#29ae5e", "#99cf70", "#ffc34b", "#f56b72"];
const grades = ["A", "B", "C", "D"] as const;
const number = (value: number) => value.toLocaleString("th-TH");
const emptyResult: PublicOverviewResult = { source: "unpublished", cells: [], manifest: null };
const rubricEntries = [...["bus", "trip", "moto"].map(id => ({ topic: getTopic(id as TopicId), key: `${id}:` })), ...agencyTypes.map(a => ({ topic: getTopic("agency", a.id), key: `agency:${a.id}` }))];
const questionLabels = Object.fromEntries(rubricEntries.flatMap(({ topic, key }) => topic.questions.map(q => [`${key}:${q.id}`, { title: q.title, shortTitle: gapShortTitles[q.id] ?? q.title, topic: topic.id === "agency" ? topic.detail : topic.label }])));
function Icon({ name }: { name: "chart" | "search" | "info" }) {
  return <svg className="td-ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === "search" ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></> : name === "info" ? <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.01" /></> : <path d="M4 3v17h17M8 16V9m5 7V5m5 11v-5" />}</svg>;
}
function Donut({ metrics, overall = false, onGrade }: { metrics: PublicMetrics; overall?: boolean; onGrade: (grade: typeof grades[number]) => void }) {
  let cursor = 0;
  const stops = grades.map((g, i) => { const start = cursor; cursor += metrics.assessments ? metrics.grades[g] / metrics.assessments * 100 : 0; return `${colors[i]} ${start}% ${cursor}%`; });
  return <div className="td-donut-row">
    <div className={overall ? "td-overall-ring" : "td-ring-wrap"}><div className="td-ring" role="img" aria-label={`ผลประเมิน ${number(metrics.assessments)} รายการ; ${grades.map(g => `${g} ${number(metrics.grades[g])} รายการ`).join(", ")}`} style={{ background: metrics.assessments ? `conic-gradient(${stops.join(",")})` : "#e8eef4" }}>
      <div className="td-ring-label"><b>{number(metrics.assessments)}</b><span>ผลประเมิน</span></div>
    </div></div>
    <div className="td-legend">{grades.map((g, i) => <button type="button" key={g} disabled={!metrics.grades[g]} onClick={() => onGrade(g)} aria-label={`ดูรายละเอียดระดับ ${g}: ${number(metrics.grades[g])} รายการ`}><span className="td-legend-grade"><i className="td-dot" style={{ background: colors[i] }} /><b>{g}</b></span><span className="td-legend-value"><b>{metrics.assessments ? `${Math.round(metrics.grades[g] / metrics.assessments * 100)}%` : "—"}</b><small className="td-count">{number(metrics.grades[g])} รายการ</small></span></button>)}</div>
  </div>;
}
const dateLabel = (iso: string) => iso && !Number.isNaN(Date.parse(iso)) ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(iso)) : "—";
export function OverviewDashboard() {
  const [draft, setDraft] = useState<OverviewFilters>(defaultOverviewFilters);
  const [applied, setApplied] = useState<OverviewFilters>(defaultOverviewFilters);
  const [state, setState] = useState<{ year: string; result: PublicOverviewResult } | null>(null);
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState<OverviewDetailSelection | null>(null);
  const [definitions, setDefinitions] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  useEffect(() => {
    let active = true; let stop = () => {};
    void subscribePublicOverview(applied.year, result => { if (active) setState({ year: applied.year, result }); })
      .then(unsubscribe => { if (active) stop = unsubscribe; else unsubscribe(); })
      .catch(() => { if (active) setState({ year: applied.year, result: { ...emptyResult, source: "unavailable", error: "เชื่อมต่อข้อมูลภาพรวมไม่สำเร็จ กรุณาลองใหม่" } }); });
    return () => { active = false; stop(); };
  }, [applied.year, reload]);
  const waiting = !state || state.year !== applied.year;
  const result = waiting ? emptyResult : state.result;
  const view = useMemo(() => selectPublicOverview(result.cells, applied), [result.cells, applied]);
  const summary = view.summary;
  const searchReady = !waiting && result.source === "live";
  const pending = JSON.stringify(draft) !== JSON.stringify(applied);
  const years = state?.result.manifest?.years ?? [];
  const visibleTopics = overviewTopics.filter(t => applied.topic === "all" ? t.id !== "agency" : t.id === applied.topic);
  const categoryCards = applied.topic === "all" ? overviewDomains.map(d => ({ id: d.id, label: d.label, art: d.art, tone: d.tone, detail: d.detail, metric: summary.domains[d.id] })) : rubricEntries.filter(e => e.topic.id === applied.topic).flatMap(({ topic, key }) => topic.categories.map((category, i) => ({ id: `${key}:${category.id}`, label: category.label, art: overviewDomains[i % 5].art, tone: overviewDomains[i % 5].tone, detail: topic.id === "agency" ? topic.detail : topic.label, metric: summary.categories[`${key}:${category.id}`] }))).filter(c => applied.topic !== "agency" || c.metric);
  const gaps = rankedOverviewGaps(summary.gaps).slice(0, 5);
  const stackRows = [{ id: applied.topic, label: "ทั้งหมด", metrics: summary }, ...overviewTopics.filter(t => applied.topic === "all" || t.id === applied.topic).map(t => ({ id: t.id, label: t.short, metrics: view.topics[t.id] ?? emptyPublicMetrics() }))];
  const maxStack = Math.max(summary.assessments, 1);
  const selectedTopic = overviewTopics.find(t => t.id === applied.topic)?.label ?? "ทุกประเภท";
  const filterLabel = `${applied.year === "all" ? "ทุกปี" : Number(applied.year) + 543} · ${applied.province === "all" ? "ทุกจังหวัด" : applied.province} · ${selectedTopic} · ${applied.affiliation === "all" ? "ทุกสังกัด" : affiliationLabels[applied.affiliation]} · ${applied.grade === "all" ? "ทุกระดับผล" : `ระดับ ${applied.grade}`}`;
  function change<K extends keyof OverviewFilters>(key: K, value: OverviewFilters[K]) { setDraft(current => ({ ...current, [key]: value })); }
  function search(event: FormEvent) { event.preventDefault(); if (!searchReady) return; setDetail(null); setApplied({ ...draft }); setExportMessage(""); }
  function gradeDetail(grade: typeof grades[number], topic = applied.topic) { setDetail({ title: `ผลประเมินระดับ ${grade}`, grade, topic }); }
  function retry() { setState(null); setReload(value => value + 1); }
  async function exportExcel() {
    setExporting(true); setExportMessage("");
    try {
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      const cell = (value: string | number): Cell => typeof value === "number" ? { type: Number, value } : { type: String, value };
      const rows = [["ภาพรวมการประเมินการเดินทางที่ปลอดภัย"], [filterLabel], ["เผยแพร่เมื่อ", dateLabel(result.manifest?.updatedAt ?? "")], ["โรงเรียนไม่ซ้ำ", summary.schools], ["หน่วยงานไม่ซ้ำ", summary.agencies], ["ผลประเมิน", summary.assessments], [], ["ระดับ", "จำนวนผลประเมิน"], ...grades.map(g => [g, summary.grades[g]]), [], ["หมวด", "คะแนนเฉลี่ย", "ผลประเมินที่มีหมวดนี้"], ...categoryCards.map(c => [c.label, c.metric?.count ? Number((c.metric.sum / c.metric.count).toFixed(1)) : "ไม่มีข้อมูล", c.metric?.count ?? 0]), [], ["5 ประเด็นที่พบผลต่ำกว่าเกณฑ์มากที่สุด"], [gapRankingNote], ["สัดส่วนคำนวณจากชุดที่ตอบคำถามข้อนั้น ไม่ใช่คะแนนเฉลี่ย; เปอร์เซ็นต์ปัดเป็นจำนวนเต็มให้รวมเป็น 100%"], ["เกณฑ์ต้นฉบับ", "แบบประเมิน", "ชุดที่ตอบข้อนี้", "ต่ำกว่าเกณฑ์ (คะแนน 0–1): ชุด", "ต่ำกว่าเกณฑ์ (%)", "ถึงเกณฑ์ (คะแนน 2–3): ชุด", "ถึงเกณฑ์ (%)"], ...overviewGapExportRows(gaps, questionLabels)];
      await writeXlsxFile(rows.map(row => row.map(cell)), { columns: [{ width: 78 }, { width: 32 }, { width: 24 }, { width: 32 }, { width: 24 }, { width: 32 }, { width: 24 }] }, { fontFamily: "Sarabun", fontSize: 11 }).toFile(`tcc-overview-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch { setExportMessage("ส่งออกไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setExporting(false); }
  }
  return <div id="tcc-overview"><div className="td-shell">
    <aside className="td-rail"><div className="td-rail-brand"><span className="td-brand-mark"><Art name="school" /></span></div><nav aria-label="เมนูภาพรวม"><a className="td-home active" href="#main-content" aria-current="page"><Icon name="chart" />ภาพรวม</a></nav><div className="td-info">ประเมินเพื่อพัฒนา<br />ความปลอดภัยในการเดินทาง</div></aside>
    <main className="td-main" id="main-content">
      <header className="td-header"><div><h1>ระบบประเมินการเดินทางที่ปลอดภัยของนักเรียน</h1><p>โครงการสานพลังความร่วมมือท้องถิ่นเพื่อการพัฒนาและสื่อสารสาธารณะ</p></div><div className="td-header-meta"><span className="td-public-label">ภาพรวมสาธารณะ</span><div className="td-logos"><img src="/images/tcc-office-logo.webp" alt="สภาองค์กรของผู้บริโภค" /><img src="/images/thaihealth-logo.webp" alt="สสส." /></div></div></header>
      <section className="td-filter-panel" aria-label="ค้นหาภาพรวม"><form className="td-filters" onSubmit={search} aria-busy={waiting}>
        <label>ปีที่ประเมิน (พ.ศ.)<select aria-label="ปีที่ประเมิน (พ.ศ.)" value={draft.year} onChange={e => change("year", e.target.value)}><option value="all">ทุกปี</option>{years.map(y => <option key={y} value={y}>{Number(y) + 543}</option>)}</select></label>
        <label>จังหวัด<select aria-label="จังหวัด" value={draft.province} onChange={e => change("province", e.target.value)}><option value="all">ทุกจังหวัด</option>{provinces.map(p => <option key={p}>{p}</option>)}</select></label>
        <label>ประเภทการประเมิน<select aria-label="ประเภทการประเมิน" value={draft.topic} onChange={e => change("topic", e.target.value as OverviewFilters["topic"])}><option value="all">ทุกประเภท</option>{overviewTopics.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
        <label>สังกัดโรงเรียน<select aria-label="สังกัดโรงเรียน" value={draft.affiliation} onChange={e => change("affiliation", e.target.value as OverviewFilters["affiliation"])}><option value="all">ทุกสังกัด</option>{Object.entries(affiliationLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>ระดับผลประเมิน<select aria-label="ระดับผลประเมิน" value={draft.grade} onChange={e => change("grade", e.target.value as OverviewFilters["grade"])}><option value="all">ทุกระดับผล</option>{grades.map(g => <option key={g}>{g}</option>)}</select></label>
        <div className="td-filter-actions"><button type="button" className="td-clear" onClick={() => setDraft({ ...defaultOverviewFilters })}>ล้างตัวกรอง</button><button type="submit" className="td-reset" disabled={!searchReady}><Icon name="search" />ค้นหา</button></div>
      </form>{pending && <p className="td-pending" role="status">มีการเปลี่ยนเงื่อนไข · กดค้นหาเพื่ออัปเดตข้อมูล</p>}</section>
      <p className="td-applied" role="status" aria-live="polite">{searchReady && <b>พบ {number(summary.assessments)} ผลประเมิน · </b>}{filterLabel}</p>
      {waiting ? <section className="td-card td-empty" role="status"><h2>กำลังโหลดข้อมูลภาพรวม…</h2></section> : result.source === "unavailable" ? <section className="td-card td-empty" role="alert"><h2>ยังแสดงข้อมูลไม่ได้</h2><p>{result.error}</p><p className="td-detail-note">การค้นหาจะพร้อมใช้งานเมื่ออ่านข้อมูลสรุปได้</p><button className="td-clear" onClick={retry}>ลองใหม่</button></section> : result.source === "unpublished" ? <section className="td-card td-empty" role="status"><h2>ยังไม่มีข้อมูลสรุปที่เผยแพร่</h2><p>อยู่ระหว่างเตรียมข้อมูลสรุปของโครงการ ทุกคนสามารถดูและค้นหาภาพรวมได้โดยไม่ต้องเข้าสู่ระบบ</p></section> : <>
        {!summary.assessments && <p className="td-zero" role="status">ไม่พบผลประเมินตามเงื่อนไขที่ค้นหา</p>}
        <div className={`td-top ${applied.topic !== "all" ? "is-filtered" : ""}`}>
          <article className="td-card td-school-card"><div className="td-card-heading"><Art name="school-header" /><h2>{applied.topic === "agency" ? "หน่วยงานที่เข้าร่วมประเมิน" : "โรงเรียนที่เข้าร่วมประเมิน"}</h2></div><div className="td-school-main"><div><strong className="td-big" data-overview-total>{number(applied.topic === "agency" ? summary.agencies : summary.schools)}</strong> แห่ง</div><p>{number(summary.assessments)} ผลประเมินตามเงื่อนไข</p><div className="td-summary-detail">คะแนนเฉลี่ย <b>{summary.assessments ? (summary.scoreSum / summary.assessments).toFixed(1) : "—"}</b> / 100</div>{applied.topic === "all" && summary.agencies > 0 && <small>หน่วยงานกำกับ {number(summary.agencies)} แห่ง</small>}</div><button type="button" className="td-card-action" onClick={() => setDetail({ title: "โรงเรียนและผลประเมินรายจังหวัด" })}>ดูรายละเอียดรายจังหวัด <span aria-hidden="true">↗</span></button></article>
          <article className="td-card td-overall"><div className="td-card-heading"><span className="td-art td-overall-art" aria-hidden="true"><Icon name="chart" /></span><h2>สัดส่วนระดับผลการประเมิน</h2></div><div className="td-chart-body"><Donut metrics={summary} overall onGrade={g => gradeDetail(g)} /></div><button type="button" className="td-card-action" onClick={() => setDetail({ title: "รายละเอียดระดับผลการประเมิน" })}>ดูรายละเอียดผลประเมิน <span aria-hidden="true">↗</span></button></article>
          {visibleTopics.map(t => <article className={`td-card td-topic-card td-${t.color}`} key={t.id}><div className="td-card-heading">{t.id === "agency" ? <Art name="school-header" /> : <Art name={`${t.id}-header`} />}<h2>{t.label}</h2></div><div className="td-chart-body"><Donut metrics={view.topics[t.id] ?? emptyPublicMetrics()} onGrade={g => gradeDetail(g, t.id)} /></div><button type="button" className="td-card-action" onClick={() => setDetail({ title: t.label, topic: t.id })}>ดูรายละเอียด <span aria-hidden="true">↗</span></button></article>)}
        </div>
        <section className="td-card td-category-section"><div className="td-section-head"><h2>{applied.topic === "all" ? "ภาพรวมคะแนนด้านความปลอดภัย" : "คะแนนเฉลี่ยรายหมวดการประเมิน"} <span data-topic-caption>({selectedTopic})</span></h2></div><div className="td-category-grid" data-count={categoryCards.length} style={{ "--category-count": Math.min(categoryCards.length || 1, 5) } as CSSProperties}>{categoryCards.map(c => <article className="td-category" key={c.id} style={{ "--tone": c.tone } as CSSProperties}><div className="td-category-title"><span><Art name={c.art} /></span><h3 title={c.detail}>{c.label}</h3></div><strong>{c.metric?.count ? `${(c.metric.sum / c.metric.count).toFixed(1)}` : "—"}</strong><div className="td-track"><span style={{ width: `${c.metric?.count ? c.metric.sum / c.metric.count : 0}%` }} /></div><small>จาก 100 คะแนน</small><div className="td-change td-change-muted">{c.metric?.count ? `${number(c.metric.count)} ผลประเมิน` : "ยังไม่มีข้อมูลหมวดนี้"}</div><button type="button" className="td-card-action" onClick={() => setDetail({ title: c.label, metric: { field: applied.topic === "all" ? "domains" : "categories", id: c.id, description: c.detail } })}>ดูรายละเอียด <span aria-hidden="true">↗</span></button></article>)}</div></section>
        <div className="td-bottom">
          <section className="td-card"><h2>โรงเรียนที่เข้าร่วมรายจังหวัด</h2><p className="td-subtitle">ตามปี ประเภท สังกัด และระดับผลที่ค้นหา</p><div className="td-map-row"><svg className="td-map" viewBox="0 0 210 310" role="group" aria-label={provinces.map(p => `${p} ${view.provinces[p]?.schools ?? 0} โรงเรียน`).join(", ")}>{geometry.map(p => { const count = view.provinces[p.province]?.schools ?? 0; const fill = count >= 50 ? "#2479b7" : count >= 10 ? "#519dd3" : count >= 5 ? "#87bde4" : count > 0 ? "#b6d7ef" : "#e1e9f1"; return <path d={p.d} key={p.name} fill={fill} role={p.province ? "button" : undefined} tabIndex={p.province ? 0 : undefined} aria-label={p.province ? `ดูรายละเอียดจังหวัด${p.province}: ${number(count)} โรงเรียน` : undefined} onClick={() => { if (p.province) setDetail({ title: `จังหวัด${p.province}`, province: p.province }); }} onKeyDown={e => { if (p.province && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setDetail({ title: `จังหวัด${p.province}`, province: p.province }); } }} stroke={applied.province === p.province ? "#153a56" : "white"} strokeWidth={applied.province === p.province ? 1.5 : .45}><title>{p.province || p.name}{p.province ? `: ${number(count)} โรงเรียน` : ": นอกพื้นที่นำร่อง"}</title></path>; })}</svg><div className="td-map-key"><b>จำนวนโรงเรียน</b>{[["#2479b7", "50 แห่งขึ้นไป"], ["#519dd3", "10–49 แห่ง"], ["#87bde4", "5–9 แห่ง"], ["#b6d7ef", "1–4 แห่ง"], ["#e1e9f1", "ไม่มีข้อมูล"]].map(([color, label]) => <span key={label}><i style={{ background: color }} />{label}</span>)}</div></div><p className="td-map-caption">กดจังหวัดบนแผนที่เพื่อดูรายละเอียด</p><button type="button" className="td-card-action" onClick={() => setDetail({ title: "รายละเอียดรายจังหวัด" })}>ดูตารางรายจังหวัด <span aria-hidden="true">↗</span></button></section>
          <section className="td-card"><h2>จำนวนผลประเมินตามระดับผล</h2><p className="td-subtitle">โรงเรียนหนึ่งแห่งอาจส่งหลายผลประเมิน</p><div className="td-color-legend">{grades.map((g, i) => <span key={g}><i className="td-dot" style={{ background: colors[i] }} />{g}</span>)}</div><div data-stacks>{stackRows.map(row => <div className="td-stack-row" key={row.label}><div className="td-stack-title"><span>{row.label}</span><b>{number(row.metrics.assessments)}</b></div><div className="td-stacked" role="group" aria-label={`${row.label}: ${grades.map(g => `${g} ${number(row.metrics.grades[g])} รายการ`).join(", ")}`}>{grades.map((g, i) => row.metrics.grades[g] > 0 && <button type="button" key={g} onClick={() => gradeDetail(g, row.id)} aria-label={`ดู${row.label} ระดับ ${g}: ${number(row.metrics.grades[g])} รายการ`} title={`${g}: ${number(row.metrics.grades[g])} รายการ`} style={{ width: `${row.metrics.grades[g] / maxStack * 100}%`, background: colors[i] }}>{row.metrics.grades[g] / maxStack >= .07 ? number(row.metrics.grades[g]) : ""}</button>)}</div></div>)}</div><p className="td-stack-note">ความยาวแท่งใช้สเกลเดียวกัน เริ่มจาก 0 รายการ</p><button type="button" className="td-card-action" onClick={() => setDetail({ title: "ผลประเมินตามประเภทและระดับผล" })}>ดูรายละเอียดกราฟ <span aria-hidden="true">↗</span></button></section>
          <section className="td-card td-gaps">
            <h2>5 ประเด็นที่พบผลต่ำกว่าเกณฑ์มากที่สุด</h2>
            {gaps.length ? <OverviewGapList entries={gaps} questionLabels={questionLabels} /> : <p className="td-gap-empty">{summary.assessments ? "ไม่พบประเด็นต่ำกว่าเกณฑ์ในผลประเมินชุดนี้" : "ยังไม่มีข้อมูลตามเงื่อนไข"}</p>}
            <div className="td-more"><button type="button" onClick={() => setDetail({ title: "ประเด็นที่พบผลต่ำกว่าเกณฑ์", gaps: true })}>ดูประเด็นทั้งหมด ↗</button><button type="button" onClick={() => setDefinitions(value => !value)} aria-expanded={definitions} aria-controls="overview-definitions"><Icon name="info" />วิธีอ่านข้อมูล</button></div>
            {definitions && <div className="td-definition" id="overview-definitions">
              <p>ต่ำกว่าเกณฑ์ = คำตอบที่ได้คะแนน 0–1 จาก 3 คะแนน ส่วนคะแนน 2–3 นับว่าถึงเกณฑ์ของข้อนั้น เปอร์เซ็นต์คำนวณจากจำนวนชุดในแต่ละกลุ่ม ÷ จำนวนชุดที่ตอบข้อนั้น × 100 โดยปัดเป็นจำนวนเต็มให้รวมกันได้ 100%</p>
              <p>หนึ่งชุดอาจมีหลายประเด็นต่ำกว่าเกณฑ์ จึงนำจำนวนชุดแต่ละประเด็นมาบวกเป็นจำนวนผู้ตอบหรือจำนวนโรงเรียนไม่ได้ การจัดอันดับนี้แสดงจำนวนชุดที่พบ ไม่ใช่ระดับความรุนแรงของปัญหา</p>
              {applied.topic === "all" && <p>คะแนนด้านความปลอดภัยจัดกลุ่มหมวดที่เกี่ยวข้องจากแบบประเมินต่างประเภท โดยเฉลี่ยภายในผลประเมินตามน้ำหนักหมวด แล้วเฉลี่ยผลประเมินที่มีข้อมูล ไม่เปลี่ยนคะแนนรวมหรือเกรดเดิม เลือกประเภทแล้วค้นหาเพื่อดูหมวดตามเกณฑ์ต้นฉบับ</p>}
            </div>}
          </section>
        </div>
      </>}
      <footer className="td-footer"><span>{result.manifest ? `ข้อมูลสรุปเผยแพร่เมื่อ ${dateLabel(result.manifest.updatedAt)}` : "แสดงเฉพาะข้อมูลสรุปของโครงการ"}<br />แผนที่: <a href="https://github.com/apisit/thailand.json" target="_blank" rel="noreferrer">apisit/thailand.json · MIT</a></span><div className="td-footer-actions">{result.source === "live" && <button type="button" className="td-clear" disabled={exporting || !summary.assessments || waiting} onClick={exportExcel}>{exporting ? "กำลังส่งออก…" : "ส่งออก Excel"}</button>}<Link href="/">ทำแบบประเมิน</Link><Link href="/dashboard">สำหรับเจ้าหน้าที่</Link></div></footer>{exportMessage && <p role="alert">{exportMessage}</p>}
      {detail && searchReady && <OverviewDetailDialog cells={result.cells} applied={applied} selection={detail} questionLabels={questionLabels} onClose={() => setDetail(null)} />}
    </main>
  </div></div>;
}
