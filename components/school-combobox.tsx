"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  getSchoolsByProvince,
  normalizeSchoolSearch,
  type SchoolDirectoryEntry,
} from "@/lib/school-directory";

type Props = {
  province: string;
  value: string;
  onChange: (value: string) => void;
};

const RESULT_LIMIT = 60;
const EMPTY_SCHOOLS: SchoolDirectoryEntry[] = [];

type SchoolLoadState = {
  province: string;
  schools: SchoolDirectoryEntry[];
  error: string;
};

export function SchoolCombobox({ province, value, onChange }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draftQuery, setDraftQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [schoolState, setSchoolState] = useState<SchoolLoadState>({ province: "", schools: EMPTY_SCHOOLS, error: "" });
  const currentSchoolState = schoolState.province === province ? schoolState : null;
  const schools = currentSchoolState?.schools ?? EMPTY_SCHOOLS;
  const loadingSchools = Boolean(province) && currentSchoolState === null;
  const schoolLoadError = currentSchoolState?.error ?? "";
  const query = draftQuery ?? value;

  useEffect(() => {
    let active = true;
    if (!province) return () => { active = false; };
    void getSchoolsByProvince(province).then((entries) => {
      if (!active) return;
      setSchoolState({ province, schools: entries, error: "" });
    }).catch(() => {
      if (!active) return;
      setSchoolState({ province, schools: EMPTY_SCHOOLS, error: "ไม่สามารถโหลดรายชื่อสถานศึกษาได้ กรุณากรอกชื่อเอง" });
    });

    return () => { active = false; };
  }, [province]);

  const matches = useMemo(() => {
    const needle = normalizeSchoolSearch(query);
    if (!needle) return schools.slice(0, RESULT_LIMIT);
    const startsWith: SchoolDirectoryEntry[] = [];
    const contains: SchoolDirectoryEntry[] = [];
    for (const school of schools) {
      const haystack = normalizeSchoolSearch(`${school.name} ${school.district}`);
      if (haystack.startsWith(needle)) startsWith.push(school);
      else if (haystack.includes(needle)) contains.push(school);
      if (startsWith.length + contains.length >= RESULT_LIMIT * 2) break;
    }
    return [...startsWith, ...contains].slice(0, RESULT_LIMIT);
  }, [query, schools]);

  function selectSchool(school: SchoolDirectoryEntry) {
    setDraftQuery(school.name);
    onChange(school.name);
    setOpen(false);
  }

  function enterManualMode() {
    setManualMode(true);
    setDraftQuery("");
    onChange("");
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || manualMode) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && matches[activeIndex]) {
      event.preventDefault();
      selectSchool(matches[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  if (!province) {
    return (
      <div className="school-combobox is-disabled">
        <input id="institution" disabled placeholder="กรุณาเลือกจังหวัดก่อน" />
        <span className="field-help">ระบบจะแสดงรายชื่อสถานศึกษาให้ตรงกับจังหวัดที่เลือก</span>
      </div>
    );
  }

  return (
    <div className="school-combobox" aria-busy={loadingSchools}>
      <div className="combobox-input-wrap">
        <input
          ref={inputRef}
          id="institution"
          role={manualMode ? undefined : "combobox"}
          aria-autocomplete={manualMode ? undefined : "list"}
          aria-controls={manualMode ? undefined : listId}
          aria-expanded={manualMode ? undefined : open}
          aria-activedescendant={!manualMode && open && matches[activeIndex] ? `${listId}-${matches[activeIndex].id}` : undefined}
          value={query}
          onFocus={() => !manualMode && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            const next = event.target.value;
            setDraftQuery(next);
            setActiveIndex(0);
            setOpen(!manualMode);
            onChange(manualMode ? next : "");
          }}
          placeholder={manualMode ? "พิมพ์ชื่อสถานศึกษา" : "ค้นหาชื่อสถานศึกษาหรืออำเภอ"}
          autoComplete="organization"
        />
        {query && (
          <button
            className="combobox-clear"
            type="button"
            aria-label="ล้างชื่อสถานศึกษา"
            onClick={() => {
              setDraftQuery("");
              onChange("");
              inputRef.current?.focus();
            }}
          >
            ล้าง
          </button>
        )}
      </div>

      {!manualMode && open && (
        <div className="combobox-results" id={listId} role="listbox" aria-label={`สถานศึกษาในจังหวัด${province}`}>
          {loadingSchools ? <p className="combobox-empty">กำลังโหลดรายชื่อสถานศึกษา…</p> : schoolLoadError ? (
            <p className="combobox-empty">{schoolLoadError}</p>
          ) : matches.length ? matches.map((school, index) => (
            <button
              id={`${listId}-${school.id}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className="combobox-option"
              key={school.id}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectSchool(school)}
            >
              <strong>{school.name}</strong>
              <span>{school.district || province} · {school.source === "private" ? "โรงเรียนเอกชนในระบบ" : "สังกัด สพฐ."}</span>
            </button>
          )) : (
            <p className="combobox-empty">ไม่พบชื่อที่ค้นหา กรุณาตรวจคำสะกดหรือกรอกชื่อเอง</p>
          )}
          {schools.length > RESULT_LIMIT && !query && <p className="combobox-hint">พิมพ์ชื่อหรืออำเภอเพื่อค้นหาจากทั้งหมด {schools.length.toLocaleString("th-TH")} แห่ง</p>}
        </div>
      )}

      <div className="school-field-footer">
        <span className="field-help">
          {manualMode
            ? "โหมดกรอกชื่อเอง — ใช้เมื่อไม่พบชื่อในฐานข้อมูล"
            : loadingSchools
              ? "กำลังโหลดรายชื่อสถานศึกษา…"
              : schoolLoadError || `มีรายชื่อ ${schools.length.toLocaleString("th-TH")} แห่งในจังหวัด${province}`}
        </span>
        <button className="text-button" type="button" onClick={manualMode ? () => { setManualMode(false); setDraftQuery(""); onChange(""); } : enterManualMode}>
          {manualMode ? "กลับไปค้นหาจากรายชื่อ" : "ไม่พบรายชื่อ? กรอกชื่อเอง"}
        </button>
      </div>
      <p className="school-source-note">รายชื่อรวมโรงเรียนสังกัด สพฐ. และโรงเรียนเอกชนในระบบจากข้อมูลภาครัฐ หากเป็นสังกัดอื่นหรือมีการเปลี่ยนชื่อ ให้เลือก “กรอกชื่อเอง”</p>
    </div>
  );
}
