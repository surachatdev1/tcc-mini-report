"use client";

import { useEffect, useMemo, useState } from "react";
import { provinces, type TopicId } from "@/lib/assessment-data";
import {
  dashboardRepository,
  type DashboardGrade as Grade,
  type DashboardRecord,
  type DashboardResult,
} from "@/lib/integrations/dashboard-repository";
import {
  downloadDashboardExcel,
  type DashboardExportScope,
} from "@/lib/exports/dashboard-excel";

import { getSchoolsByProvince } from "@/lib/school-directory";
import { affiliationIndex, affiliationLabels, emptyDashboardFilters, filterDashboardRecords, type Affiliation, type DashboardFilters } from "@/lib/dashboard-filters";

import { assessmentReference, pageSizes, paginationItems, sortDashboardRecords, type DashboardSortKey, type SortDirection } from "@/lib/dashboard-table";

const sortOptions: Array<{ key: DashboardSortKey; label: string; personal?: boolean }> = [
  { key: "assessmentDate", label: "วันที่ประเมิน" }, { key: "score", label: "คะแนนผลประเมิน" },
  { key: "institution", label: "สถานศึกษา / หน่วยงาน" }, { key: "affiliation", label: "สังกัด" },
  { key: "province", label: "จังหวัด" }, { key: "topicLabel", label: "แบบประเมิน" },
  { key: "assessorName", label: "ผู้ให้ข้อมูล", personal: true }, { key: "respondentRole", label: "หน้าที่ / ตำแหน่ง", personal: true },
  { key: "assessorPhone", label: "เบอร์โทร", personal: true }, { key: "reference", label: "เลขอ้างอิง" },
];
const topicOptions: Array<{ id: "all" | TopicId; label: string }> = [
  { id: "all", label: "ทุกแบบประเมิน" },
  { id: "bus", label: "รถรับ–ส่งนักเรียน" },
  { id: "trip", label: "ทัศนศึกษา / นอกสถานศึกษา" },
  { id: "moto", label: "รถจักรยานยนต์และหมวกนิรภัย" },
  { id: "agency", label: "บทบาทหน่วยงานกำกับ" },
];

const exportOptions: Array<{ id: Exclude<DashboardExportScope, "all">; label: string }> = [
  { id: "overview", label: "ภาพรวมและ KPI" },
  { id: "provinces", label: "สรุปตามจังหวัด" },
  { id: "topics", label: "สรุปตามแบบประเมิน" },
  { id: "grades", label: "การกระจายระดับ A–D" },
  { id: "gaps", label: "ประเด็นที่ควรเร่งพัฒนา" },
  { id: "assessments", label: "รายการผลประเมิน" },
  { id: "categories", label: "คะแนนแยกตามหมวด" },
  { id: "questions", label: "รายละเอียดคะแนนรายข้อ" },
];

function average(records: DashboardRecord[]) {
  return records.length ? records.reduce((sum, item) => sum + item.score, 0) / records.length : 0;
}

function formatDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+07:00`) : new Date(value);
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" }).format(date);
}


export function DashboardWorkspace() {
  const [records, setRecords] = useState<DashboardRecord[]>([]);
  const [source, setSource] = useState<"loading" | DashboardResult["source"]>("loading");
  const [loadError, setLoadError] = useState("");
  const [personalDataVisible, setPersonalDataVisible] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [draftFilters, setDraftFilters] = useState<DashboardFilters>(emptyDashboardFilters);
  const [filters, setFilters] = useState<DashboardFilters>(emptyDashboardFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortKey, setSortKey] = useState<DashboardSortKey>("assessmentDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const visibleSortKey = !personalDataVisible && sortOptions.find(option => option.key === sortKey)?.personal ? "assessmentDate" : sortKey;
  function changeSort(key: DashboardSortKey) {
    setSortDirection(key === visibleSortKey ? (sortDirection === "asc" ? "desc" : "asc") : (key === "score" || key === "assessmentDate" ? "desc" : "asc"));
    setSortKey(key);
    setPage(1);
  }
  function sortHeader(key: DashboardSortKey, label: string) {
    const active = visibleSortKey === key;
    return <th scope="col" aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="table-sort-button" onClick={() => changeSort(key)} aria-label={`${label}: เรียง${(active ? sortDirection === "asc" : key === "score" || key === "assessmentDate") ? "จากมากไปน้อย" : "จากน้อยไปมาก"}`}><span>{label}</span><span aria-hidden="true" className={active ? "sort-indicator active" : "sort-indicator"}>{active ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</span></button></th>;
  }
  const [directories, setDirectories] = useState<Record<string, Map<string, Affiliation>>>({});
  const [directoryStatus, setDirectoryStatus] = useState<{ key: string; retry: number; state: "ready" | "error" } | null>(null);
  const [directoryRetry, setDirectoryRetry] = useState(0);
  const { province, topicId } = filters;
  const invalidDates = Boolean(draftFilters.dateFrom && draftFilters.dateTo && draftFilters.dateFrom > draftFilters.dateTo);
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => value !== emptyDashboardFilters[key as keyof DashboardFilters] && (!["responsible", "role", "phone"].includes(key) || personalDataVisible)).length;
  function updateFilter<K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) {
    setDraftFilters(current => ({ ...current, [key]: value }));
  }
  function clearFilters() {
    setDraftFilters(emptyDashboardFilters);
    setFilters(emptyDashboardFilters);
    setPage(1);
    setExportMessage("");
  }
  const [exportScope, setExportScope] = useState<Exclude<DashboardExportScope, "all">>("provinces");
  const [exportState, setExportState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [exportMessage, setExportMessage] = useState("");

  function reloadDashboard() {
    setSource("loading");
    setLoadError("");
    setRecords([]);
    setReloadKey((value) => value + 1);
  }

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;

    void dashboardRepository.subscribe((payload) => {
      if (!active) return;
      setRecords(payload.records);
      setSource(payload.source);
      setLoadError(payload.error ?? "");
      setPersonalDataVisible(payload.personalDataVisible);
    }).then((stop) => {
      if (active) unsubscribe = stop;
      else stop();
    }).catch(() => {
      if (!active) return;
      setRecords([]);
      setPersonalDataVisible(false);
      setSource("unavailable");
      setLoadError("เชื่อมต่อข้อมูล Dashboard ไม่สำเร็จ");
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [reloadKey]);

  const directoryProvinces = useMemo(() => JSON.stringify([...new Set(records.filter(record => record.topicId !== "agency").map(record => record.province))].sort()), [records]);
  const directoryState = directoryStatus?.key === directoryProvinces && directoryStatus.retry === directoryRetry ? directoryStatus.state : "loading";
  useEffect(() => {
    let active = true;
    const names: string[] = JSON.parse(directoryProvinces);
    void Promise.all(names.map(async name => [name, affiliationIndex(await getSchoolsByProvince(name))] as const))
      .then(entries => { if (active) { setDirectories(Object.fromEntries(entries)); setDirectoryStatus({ key: directoryProvinces, retry: directoryRetry, state: "ready" }); } })
      .catch(() => { if (active) setDirectoryStatus({ key: directoryProvinces, retry: directoryRetry, state: "error" }); });
    return () => { active = false; };
  }, [directoryProvinces, directoryRetry]);

  const filtered = useMemo(() => filters.affiliation !== "all" && directoryState !== "ready" ? [] : filterDashboardRecords(records, filters, directories, personalDataVisible), [records, filters, directories, personalDataVisible, directoryState]);
  const institutionOptions = useMemo(() => [...new Set(records.filter(record => draftFilters.province === "all" || record.province === draftFilters.province).map(record => record.institution))].sort((a, b) => a.localeCompare(b, "th")), [records, draftFilters.province]);
  const responsibleOptions = useMemo(() => personalDataVisible ? [...new Set(records.map(record => record.assessorName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th")) : [], [records, personalDataVisible]);

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

  const sortedRecords = useMemo(() => sortDashboardRecords(filtered, visibleSortKey, sortDirection, directories), [filtered, visibleSortKey, sortDirection, directories]);
  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const recent = sortedRecords.slice(pageStart, pageStart + pageSize);

  async function exportExcel(scope: DashboardExportScope) {
    if (!filtered.length || exportState === "working") return;
    setExportState("working");
    setExportMessage("กำลังสร้างไฟล์ Excel…");
    try {
      await downloadDashboardExcel({
        scope,
        records: sortedRecords,
        includePersonalData: personalDataVisible,
        filterSummary: [
          filters.reference.trim() && `เลขอ้างอิง: ${filters.reference.trim()}`,
          personalDataVisible && filters.role.trim() && `หน้าที่/ตำแหน่ง: ${filters.role.trim()}`,
          personalDataVisible && filters.phone.trim() && `เบอร์โทร: ${filters.phone.trim()}`,
          filters.institution.trim() && `โรงเรียน/หน่วยงาน: ${filters.institution.trim()}`,
          filters.affiliation !== "all" && `สังกัด: ${affiliationLabels[filters.affiliation]}`,
          personalDataVisible && filters.responsible.trim() && `ผู้รับผิดชอบ: ${filters.responsible.trim()}`,
          filters.grade !== "all" && `ผล: ${filters.grade}`,
          filters.dateFrom && `ตั้งแต่: ${filters.dateFrom}`,
          filters.dateTo && `ถึง: ${filters.dateTo}`,
        ].filter(Boolean).join(" · "),
        provinceLabel: province === "all" ? "ทุกจังหวัด" : province,
        topicLabel: topicOptions.find((option) => option.id === topicId)?.label ?? "ทุกแบบประเมิน",
      });
      setExportState("done");
      setExportMessage("ดาวน์โหลดไฟล์ Excel เรียบร้อยแล้ว");
    } catch {
      setExportState("error");
      setExportMessage("สร้างไฟล์ Excel ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  }

  const exportDisabled = source !== "live" || !filtered.length || exportState === "working";

  return (
    <main className="page-shell dashboard-shell" aria-busy={source === "loading"}>
      <div className="dashboard-head">
        <div>
          <p className="eyebrow">ภาพรวมเพื่อการพัฒนาและติดตามผล</p>
          <h1>Dashboard ความปลอดภัยในการเดินทาง</h1>
          <p>ดูผลตามจังหวัด ประเภทการประเมิน และประเด็นที่ควรเร่งสนับสนุน</p>
        </div>
      </div>

      <section className="dashboard-note" aria-label="ขอบเขตข้อมูล">
        <strong>การใช้ผลประเมิน:</strong> คะแนนใช้สะท้อนช่องว่างเพื่อจัดทำแผนพัฒนา ไม่ใช้ลงโทษหรือตัดงบประมาณ
        และยังไม่แสดง “อัตราการส่งครบ” จนกว่าจะมีรายชื่อหน่วยงานเป้าหมายประจำรอบประเมิน
      </section>

      {source === "unavailable" ? (
        <section className="dashboard-load-state error" role="alert">
          <div><strong>ไม่สามารถโหลดข้อมูลได้</strong><span>{loadError || "กรุณาลองเชื่อมต่อใหม่อีกครั้ง"}</span></div>
          <button type="button" className="btn btn-secondary" onClick={reloadDashboard}>ลองโหลดอีกครั้ง</button>
        </section>
      ) : null}

      {source === "loading" ? (
        <section className="dashboard-load-state" role="status" aria-live="polite">
          <div><strong>กำลังเตรียมข้อมูล Dashboard</strong><span>กำลังโหลดผลประเมินล่าสุด โปรดรอสักครู่</span></div>
        </section>
      ) : null}

      {source === "empty" ? (
        <section className="dashboard-load-state empty" role="status">
          <div><strong>ยังไม่มีผลประเมิน</strong><span>เมื่อมีผู้ส่งแบบประเมิน รายการและตัวเลขสรุปจะปรากฏในหน้านี้โดยอัตโนมัติ</span></div>
        </section>
      ) : null}

      {source === "live" ? <><section className="advanced-search panel" id="dashboard-search" aria-labelledby="search-title">
        <div className="advanced-search-heading"><div><h2 id="search-title">ค้นหาขั้นสูง</h2><p>เริ่มต้นค้นหาทั้งหมด (Search all) · เลือกเงื่อนไขแล้วกดค้นหา · Excel ส่งออกผลค้นหาครบทุกหน้า</p></div>{activeFilterCount > 0 ? <span className="search-count">ใช้ {activeFilterCount} ตัวกรอง</span> : null}</div>
        <form onSubmit={event => {
          event.preventDefault();
          if (invalidDates || (draftFilters.affiliation !== "all" && directoryState !== "ready")) return;
          setFilters({ ...draftFilters, responsible: personalDataVisible ? draftFilters.responsible : "", role: personalDataVisible ? draftFilters.role : "", phone: personalDataVisible ? draftFilters.phone : "" });
          setPage(1); setExportMessage("");
        }}>
          <div className="advanced-search-grid">
            <label className="field"><span>เลขอ้างอิง</span><input type="search" value={draftFilters.reference} onChange={event => updateFilter("reference", event.target.value)} placeholder="เลขอ้างอิงทั้งหมดหรือบางส่วน" /></label>
            <label className="field"><span>โรงเรียน / หน่วยงาน</span><input type="search" list="dashboard-institutions" value={draftFilters.institution} onChange={event => updateFilter("institution", event.target.value)} placeholder="พิมพ์ชื่อหรือบางส่วนของชื่อ" /></label>
            <datalist id="dashboard-institutions">{institutionOptions.map(name => <option key={name} value={name} />)}</datalist>
            <label className="field"><span>สังกัดสถานศึกษา</span><select value={draftFilters.affiliation} onChange={event => updateFilter("affiliation", event.target.value as DashboardFilters["affiliation"])} disabled={directoryState !== "ready"} aria-describedby="affiliation-help"><option value="all">ทุกสังกัด</option>{Object.entries(affiliationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field"><span>จังหวัด</span><select value={draftFilters.province} onChange={event => updateFilter("province", event.target.value)}><option value="all">ทุกจังหวัด</option>{provinces.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
            <label className="field"><span>ประเภทแบบประเมิน</span><select value={draftFilters.topicId} onChange={event => updateFilter("topicId", event.target.value as DashboardFilters["topicId"])}>{topicOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            {personalDataVisible ? <label className="field"><span>ผู้รับผิดชอบ / ผู้ให้ข้อมูล</span><input type="search" list="dashboard-assessors" value={draftFilters.responsible} onChange={event => updateFilter("responsible", event.target.value)} placeholder="ชื่อผู้ให้ข้อมูลทั้งหมดหรือบางส่วน" /></label> : null}
            {personalDataVisible ? <>
              <label className="field"><span>หน้าที่ / ตำแหน่ง</span><input type="search" value={draftFilters.role} onChange={event => updateFilter("role", event.target.value)} placeholder="พิมพ์หน้าที่หรือตำแหน่ง" /></label>
              <label className="field"><span>เบอร์โทร</span><input type="search" inputMode="tel" value={draftFilters.phone} onChange={event => updateFilter("phone", event.target.value)} placeholder="เบอร์โทรทั้งหมดหรือบางส่วน" /></label>
            </> : null}
            {personalDataVisible ? <datalist id="dashboard-assessors">{responsibleOptions.map(name => <option key={name} value={name} />)}</datalist> : null}
            <label className="field"><span>ผลประเมิน</span><select value={draftFilters.grade} onChange={event => updateFilter("grade", event.target.value as DashboardFilters["grade"])}><option value="all">ทุกระดับผล</option>{(["A", "B", "C", "D"] as const).map(grade => <option key={grade} value={grade}>ระดับ {grade}</option>)}</select></label>
            <label className="field"><span>วันที่ประเมิน ตั้งแต่</span><input type="date" value={draftFilters.dateFrom} onChange={event => updateFilter("dateFrom", event.target.value)} aria-invalid={invalidDates} aria-describedby={invalidDates ? "date-filter-error" : undefined} /></label>
            <label className="field"><span>วันที่ประเมิน ถึง</span><input type="date" value={draftFilters.dateTo} onChange={event => updateFilter("dateTo", event.target.value)} aria-invalid={invalidDates} aria-describedby={invalidDates ? "date-filter-error" : undefined} /></label>
          </div>
          <p className="filter-help" id="affiliation-help">สังกัดอ้างอิงทะเบียนโรงเรียนจากชื่อและจังหวัด แสดงเฉพาะ สพฐ. / เอกชนที่จับคู่ได้</p>
          {directoryState === "loading" ? <p className="filter-help" role="status">กำลังโหลดข้อมูลสังกัด… ตัวกรองอื่นยังใช้งานได้</p> : null}
          {directoryState === "error" ? <p className="filter-error" role="alert">โหลดข้อมูลสังกัดไม่สำเร็จ <button type="button" className="btn btn-secondary" onClick={() => setDirectoryRetry(value => value + 1)}>ลองโหลดสังกัดอีกครั้ง</button></p> : null}
          {invalidDates ? <p className="filter-error" role="alert" id="date-filter-error">วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด</p> : null}
          <div className="advanced-search-actions"><p role="status">พบ <strong>{filtered.length.toLocaleString("th-TH")}</strong> จาก {records.length.toLocaleString("th-TH")} รายการ</p><button type="button" className="btn btn-secondary" onClick={clearFilters}>ล้างตัวกรอง</button><button type="submit" className="btn btn-primary" disabled={invalidDates || (draftFilters.affiliation !== "all" && directoryState !== "ready")}>ค้นหา</button></div>
        </form>
      </section>

      <section className="export-panel" aria-labelledby="export-title">
        <div className="excel-mark" aria-hidden="true"><span>X</span></div>
        <div className="export-copy">
          <h2 id="export-title">ส่งออกข้อมูลเป็น Excel</h2>
          <p>{personalDataVisible
            ? "ไฟล์รายการผลประเมินมีชื่อผู้ให้ข้อมูล ตำแหน่ง และเบอร์โทรศัพท์ โปรดจัดเก็บอย่างเหมาะสม"
            : "ไฟล์เป็นไปตามตัวกรองด้านบน และไม่รวมข้อมูลส่วนบุคคล"}</p>
        </div>
        <div className="export-actions">
          <button type="button" className="btn btn-primary export-all-button" disabled={exportDisabled} onClick={() => void exportExcel("all")}>
            <span aria-hidden="true">↓</span> ดาวน์โหลดข้อมูลรวม
          </button>
          <div className="export-section-control">
            <label htmlFor="export-section">เลือกข้อมูลแต่ละส่วน</label>
            <div>
              <select id="export-section" value={exportScope} onChange={(event) => setExportScope(event.target.value as Exclude<DashboardExportScope, "all">)}>
                {exportOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <button type="button" className="btn btn-secondary" disabled={exportDisabled} onClick={() => void exportExcel(exportScope)}>
                <span aria-hidden="true">↓</span> ดาวน์โหลดส่วนนี้
              </button>
            </div>
          </div>
        </div>
        <p className={`export-status ${exportState}`} aria-live="polite">{exportMessage || (filtered.length ? `พร้อมส่งออก ${filtered.length} รายการตามตัวกรอง` : "ยังไม่มีข้อมูลสำหรับส่งออก")}</p>
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
        <div className="panel-heading"><div><p className="section-kicker">รายการตามผลค้นหา</p><h2>ผลประเมินและผู้ให้ข้อมูล</h2><p>{personalDataVisible ? "แสดงข้อมูลติดต่อเฉพาะบัญชีที่ได้รับสิทธิ์รายบุคคล" : "บัญชีนี้เห็นเฉพาะข้อมูลสรุป ไม่แสดงข้อมูลส่วนบุคคล"}</p></div></div>
        <div className="record-table-toolbar">
          <p><a href="#dashboard-search">ตัวกรองค้นหา</a> · พบ <strong>{filtered.length.toLocaleString("th-TH")}</strong> รายการ</p>
          <div className="record-table-controls">
            <button type="button" className="btn btn-secondary" disabled={exportDisabled} onClick={() => void exportExcel("assessments")}>↓ Export ผลค้นหา</button>
            <label>เรียงตาม <select value={visibleSortKey} onChange={event => changeSort(event.target.value as DashboardSortKey)}>{sortOptions.filter(option => !option.personal || personalDataVisible).map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
            <button type="button" className="btn btn-secondary sort-direction" onClick={() => changeSort(visibleSortKey)} aria-label="สลับทิศทางการเรียง">{sortDirection === "asc" ? "↑ น้อยไปมาก" : "↓ มากไปน้อย"}</button>
            <label>แสดง <select aria-label="จำนวนรายการต่อหน้า" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{pageSizes.map(size => <option key={size} value={size}>{size}</option>)}</select> รายการ</label>
          </div>
        </div>
        {recent.length ? <div className="table-scroll record-table-scroll" role="region" aria-label="ตารางผลประเมิน เลื่อนแนวนอนเพื่อดูทุกคอลัมน์" tabIndex={0}><table className={`assessment-record-table ${personalDataVisible ? "with-personal-data" : "summary-data"}`}>
          <colgroup><col className="col-reference" /><col className="col-institution" /><col className="col-province" /><col className="col-topic" />{personalDataVisible ? <><col className="col-assessor" /><col className="col-role" /><col className="col-phone" /></> : null}<col className="col-date" /><col className="col-score" /></colgroup>
          <thead><tr>{sortHeader("reference", "เลขอ้างอิง")}{sortHeader("institution", "สถานศึกษา / หน่วยงาน")}{sortHeader("province", "จังหวัด")}{sortHeader("topicLabel", "แบบประเมิน")}{personalDataVisible ? <>{sortHeader("assessorName", "ผู้ให้ข้อมูล")}{sortHeader("respondentRole", "หน้าที่ / ตำแหน่ง")}{sortHeader("assessorPhone", "เบอร์โทร")}</> : null}{sortHeader("assessmentDate", "วันที่ประเมิน")}{sortHeader("score", "ผล")}</tr></thead>
          <tbody>{recent.map((record) => <tr key={record.id}>
            <td className="record-reference">{assessmentReference(record)}</td>
            <td>{record.institution}</td>
            <td>{record.province}</td><td>{record.topicLabel}</td>
            {personalDataVisible ? <><td>{record.assessorName || "ไม่ระบุ"}</td><td><strong>{record.respondentRole || "ไม่ระบุหน้าที่"}</strong>{record.position ? <small>{record.position}</small> : null}</td><td className="record-phone">{record.assessorPhone || "ไม่ระบุ"}</td></> : null}
            <td className="record-date">{formatDate(record.assessmentDate || record.createdAt)}</td><td className="record-score"><b className={`text-grade-${record.grade.toLowerCase()}`}>{record.score.toFixed(1)} · {record.grade}</b></td>
          </tr>)}</tbody>
        </table></div> : <div className="empty-state"><p>ไม่พบรายการที่ตรงกับเงื่อนไข ลองลดตัวกรองหรือเปลี่ยนช่วงวันที่</p><button type="button" className="btn btn-secondary" onClick={clearFilters}>ล้างตัวกรองทั้งหมด</button></div>}
        {filtered.length > 0 ? <nav className="search-pagination record-pagination" aria-label="หน้ารายการผลประเมิน">
          <p role="status">แสดง {pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} จาก {filtered.length.toLocaleString("th-TH")} รายการ · หน้า {currentPage}/{totalPages}</p>
          <div className="pagination-buttons">
            <button type="button" aria-label="หน้าแรก" disabled={currentPage === 1} onClick={() => setPage(1)}>«</button>
            <button type="button" aria-label="หน้าก่อนหน้า" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>
            {paginationItems(currentPage, totalPages).map(item => typeof item === "number" ? <button key={item} type="button" aria-label={`หน้า ${item}`} aria-current={item === currentPage ? "page" : undefined} onClick={() => setPage(item)}>{item}</button> : <span key={item} aria-hidden="true">…</span>)}
            <button type="button" aria-label="หน้าถัดไป" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>›</button>
            <button type="button" aria-label="หน้าสุดท้าย" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        </nav> : null}
      </section>
      </> : null}
    </main>
  );
}
