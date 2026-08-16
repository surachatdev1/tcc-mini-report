"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ADMIN_EMAILS } from "@/lib/access-roles";
import {
  addDashboardViewer,
  removeDashboardViewer,
  subscribeDashboardViewers,
  type AccessEntry,
} from "@/lib/integrations/access-control-repository";

function friendlyAdminError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("permission-denied")) return "ไม่มีสิทธิ์แก้ไขรายการนี้ หรือ Firestore Rules รุ่นล่าสุดยังไม่ได้ Deploy";
  return error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ กรุณาลองใหม่";
}

function ViewerList({ entries, onRemove }: { entries: AccessEntry[]; onRemove: (entry: AccessEntry) => void }) {
  return (
    <ul className="admin-access-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <span className="admin-viewer-avatar" aria-hidden="true">
            {(entry.name || entry.email).trim().slice(0, 1).toLocaleUpperCase("th")}
          </span>
          <div className="admin-viewer-detail">
            <strong>{entry.name || "ไม่ได้ระบุชื่อ"}</strong>
            <span>{entry.email}</span>
            <small>เพิ่มโดย {entry.createdBy} · {entry.createdAt}</small>
          </div>
          <span className="admin-viewer-badge">ดู Dashboard</span>
          <button className="admin-remove-button" type="button" onClick={() => onRemove(entry)}>
            ลบสิทธิ์
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AdminWorkspace() {
  const [viewers, setViewers] = useState<AccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void subscribeDashboardViewers((entries) => {
      if (!active) return;
      setViewers(entries);
      setLoading(false);
    }, (nextError) => {
      if (!active) return;
      setError(friendlyAdminError(nextError));
      setLoading(false);
    }).then((nextUnsubscribe) => {
      if (active) unsubscribe = nextUnsubscribe;
      else nextUnsubscribe();
    }).catch((nextError) => {
      if (!active) return;
      setError(friendlyAdminError(nextError));
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const filteredViewers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("th");
    if (!normalizedQuery) return viewers;
    return viewers.filter((entry) => `${entry.name} ${entry.email}`.toLocaleLowerCase("th").includes(normalizedQuery));
  }, [query, viewers]);

  async function submitViewer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await addDashboardViewer(email, displayName);
      setEmail("");
      setDisplayName("");
      setStatus("เพิ่มผู้มีสิทธิ์ดู Dashboard แล้ว");
    } catch (nextError) {
      setError(friendlyAdminError(nextError));
    } finally {
      setBusy(false);
    }
  }

  function removeViewer(entry: AccessEntry) {
    if (!window.confirm(`ยืนยันลบสิทธิ์ของ ${entry.name || entry.email} หรือไม่`)) return;
    setBusy(true);
    setError("");
    setStatus("");
    void removeDashboardViewer(entry.email).then(() => {
      setStatus(`ลบสิทธิ์ของ ${entry.email} แล้ว`);
    }).catch((nextError) => {
      setError(friendlyAdminError(nextError));
    }).finally(() => setBusy(false));
  }

  return (
    <main className="page-shell admin-page" id="main-content">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">สำหรับผู้ดูแลโครงการ</p>
          <h1>จัดการผู้มีสิทธิ์ดู Dashboard</h1>
          <p>เพิ่มหรือลบอีเมล Google ของเจ้าหน้าที่ที่ได้รับอนุญาต ระบบมีสิทธิ์เพียงระดับเดียวเพื่อให้ง่ายต่อการตรวจสอบ</p>
        </div>
        <div className="admin-count-card" aria-label={`มีผู้ได้รับสิทธิ์ ${viewers.length} คน`}>
          <span>ผู้ได้รับสิทธิ์</span>
          <strong>{loading ? "—" : viewers.length.toLocaleString("th-TH")}</strong>
          <small>บัญชีที่ดูข้อมูลและส่งออก Excel ได้</small>
        </div>
      </header>

      {status ? <p className="admin-message admin-message-success" role="status">{status}</p> : null}
      {error ? <p className="admin-message admin-message-error" role="alert">{error}</p> : null}

      <section className="panel admin-viewer-panel" aria-labelledby="admin-viewers-title">
        <div className="admin-add-column">
          <div className="panel-heading">
            <p className="section-kicker">เพิ่มผู้มีสิทธิ์</p>
            <h2 id="admin-viewers-title">อนุญาตเป็นรายอีเมล</h2>
            <p>ผู้ใช้ต้องเข้าสู่ระบบด้วย Google และใช้อีเมลตรงกับรายการที่เพิ่มไว้</p>
          </div>
          <form className="admin-access-form" onSubmit={submitViewer}>
            <div className="field full">
              <label htmlFor="viewer-email">อีเมล Google</label>
              <input id="viewer-email" type="email" autoComplete="off" placeholder="name@example.go.th" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="field full">
              <label htmlFor="viewer-name">ชื่อหรือหน่วยงาน <span className="optional-tag">ไม่บังคับ</span></label>
              <input id="viewer-name" autoComplete="off" placeholder="เช่น เจ้าหน้าที่โครงการส่วนกลาง" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "กำลังบันทึก…" : "+ เพิ่มสิทธิ์"}</button>
          </form>

          <aside className="admin-owner-note" aria-label="ผู้ดูแลระบบถาวร">
            <strong>ผู้ดูแลระบบ</strong>
            <p>บัญชีเจ้าของโครงการถูกกำหนดถาวรและไม่แสดงในรายการที่ลบได้</p>
            <div className="admin-owner-list">
              {ADMIN_EMAILS.map((adminEmail) => <span key={adminEmail}>{adminEmail}</span>)}
            </div>
          </aside>
        </div>

        <div className="admin-directory-column">
          <div className="admin-directory-head">
            <div>
              <p className="section-kicker">รายการปัจจุบัน</p>
              <h2>ผู้มีสิทธิ์ดู Dashboard</h2>
            </div>
            <label className="admin-search-field" htmlFor="viewer-search">
              <span>ค้นหารายชื่อหรืออีเมล</span>
              <input id="viewer-search" type="search" placeholder="พิมพ์เพื่อค้นหา" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
          </div>

          {loading ? <p className="admin-empty-state" role="status">กำลังโหลดรายชื่อ…</p> : null}
          {!loading && viewers.length === 0 ? <div className="admin-empty-state admin-empty-card"><strong>ยังไม่มีผู้ได้รับสิทธิ์</strong><span>เพิ่มอีเมลจากแบบฟอร์มด้านซ้ายเพื่อเริ่มต้น</span></div> : null}
          {!loading && viewers.length > 0 && filteredViewers.length === 0 ? <div className="admin-empty-state admin-empty-card"><strong>ไม่พบรายการที่ค้นหา</strong><span>ลองตรวจการสะกดหรือค้นหาด้วยบางส่วนของอีเมล</span></div> : null}
          {!loading && filteredViewers.length > 0 ? <ViewerList entries={filteredViewers} onRemove={removeViewer} /> : null}
        </div>
      </section>
    </main>
  );
}
