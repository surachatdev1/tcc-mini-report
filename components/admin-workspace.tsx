"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ADMIN_EMAILS } from "@/lib/access-roles";
import {
  addDashboardViewer,
  removeDashboardViewer,
  subscribeDashboardViewers,
  type AccessEntry,
} from "@/lib/integrations/access-control-repository";
import {
  deleteAllAssessmentSubmissions,
  deleteAssessmentSubmission,
  subscribeAssessmentSubmissions,
  type AssessmentSubmission,
} from "@/lib/integrations/submission-moderation-repository";

const SUBMISSIONS_PER_PAGE = 20;

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

type PendingSubmissionDeletion =
  | { type: "one"; submission: AssessmentSubmission }
  | { type: "all"; count: number };

function ConfirmationDialog({ pending, busy, onCancel, onConfirm }: {
  pending: PendingSubmissionDeletion | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!pending) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel, pending]);

  if (!pending) return null;
  const deletingAll = pending.type === "all";

  return (
    <div className="confirmation-backdrop">
      <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-description">
        <span className="confirmation-icon" aria-hidden="true">!</span>
        <div>
          <p className="section-kicker">โปรดยืนยันอีกครั้ง</p>
          <h2 id="confirmation-title">{deletingAll ? `ลบแบบประเมินทั้งหมด ${pending.count.toLocaleString("th-TH")} ชุดหรือไม่` : "ลบแบบประเมินชุดนี้หรือไม่"}</h2>
          <p id="confirmation-description">{deletingAll
            ? "ผลคะแนน คำตอบ เหตุผลประกอบ และข้อมูลผู้ประเมินของทุกคนจะถูกลบออกจากระบบ"
            : "ผลคะแนน คำตอบ เหตุผลประกอบ และข้อมูลผู้ประเมินของแบบประเมินชุดนี้จะถูกลบออกจากระบบ"}</p>
          {!deletingAll ? <div className="confirmation-record"><strong>{pending.submission.institution}</strong><span>{pending.submission.province} · {pending.submission.topicLabel}</span><span>ผู้ประเมิน {pending.submission.assessorName || "ไม่ระบุ"} · วันที่ {pending.submission.assessmentDate || "—"}</span></div> : null}
          <strong className="confirmation-warning">เมื่อลบแล้วจะไม่สามารถกู้คืนข้อมูลแบบประเมินได้</strong>
          <div className="confirmation-actions">
            <button className="btn btn-secondary" type="button" autoFocus disabled={busy} onClick={onCancel}>ยกเลิก</button>
            <button className="btn btn-danger" type="button" disabled={busy} onClick={onConfirm}>{busy ? "กำลังลบ…" : deletingAll ? "ยืนยันลบแบบประเมินทั้งหมด" : "ยืนยันลบแบบประเมินนี้"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function SubmissionList({ submissions, busy, onDelete }: {
  submissions: AssessmentSubmission[];
  busy: boolean;
  onDelete: (submission: AssessmentSubmission) => void;
}) {
  return (
    <ul className="admin-submission-list">
      {submissions.map((submission) => {
        const explanations = submission.questionResults.filter((question) => question.explanation.trim());
        return (
          <li key={submission.id}>
            <details className="admin-submission-record">
              <summary className="admin-submission-row">
                <span className="admin-submission-row-field admin-submission-school">
                  <small>สถานศึกษา</small>
                  <strong>{submission.institution}</strong>
                </span>
                <span className="admin-submission-row-field">
                  <small>ผู้ประเมิน</small>
                  <strong>{submission.assessorName || "ไม่ระบุชื่อ"}</strong>
                  <span>{submission.respondentRole || "ไม่ระบุบทบาท"}</span>
                </span>
                <span className="admin-submission-row-field">
                  <small>ประเภทการประเมิน</small>
                  <strong className="admin-submission-type">{submission.topicLabel}</strong>
                </span>
                <span className="admin-submission-row-field">
                  <small>พื้นที่และวันที่</small>
                  <strong>{submission.province}</strong>
                  <span>{submission.assessmentDate || "—"}</span>
                </span>
                <span className="admin-submission-open-label" aria-hidden="true">
                  <span className="when-closed">ดูรายละเอียด</span>
                  <span className="when-open">ซ่อนรายละเอียด</span>
                  <span className="admin-submission-chevron">⌄</span>
                </span>
              </summary>

              <div className="admin-submission-expanded">
                <div className="admin-submission-head">
                  <div>
                    <strong>รายละเอียดแบบประเมิน</strong>
                    <small>เลขอ้างอิง {submission.id.slice(0, 8).toUpperCase()} · บันทึกเมื่อ {new Date(submission.createdAt).toLocaleString("th-TH")}</small>
                  </div>
                  <button className="admin-remove-button" type="button" disabled={busy} onClick={() => onDelete(submission)}>ลบแบบประเมินนี้</button>
                </div>
                <div className="admin-submission-summary">
                  <div><span>ผลคะแนนรวม</span><strong>{submission.score.toFixed(1)}%</strong><small>ระดับ {submission.grade}</small></div>
                  <div><span>ตำแหน่ง</span><strong>{submission.position || "ไม่ระบุ"}</strong><small>{submission.assessorPhone || "ไม่ระบุเบอร์โทรศัพท์"}</small></div>
                  <div><span>เหตุผลประกอบ</span><strong>{explanations.length.toLocaleString("th-TH")} ข้อ</strong><small>จากคำถามทั้งหมด {submission.questionResults.length.toLocaleString("th-TH")} ข้อ</small></div>
                </div>
                <section className="admin-submission-details" aria-label="คำตอบและเหตุผลประกอบรายข้อ">
                  <h3>คำตอบและเหตุผลประกอบรายข้อ</h3>
                  <div>{submission.questionResults.map((question) => (
                    <article key={question.id}>
                      <div className="admin-question-result-head">
                        <strong>ข้อ {question.number} · {question.title}</strong>
                        <span>ระดับ {question.score ?? "—"}/3 · {question.level}</span>
                      </div>
                      {question.selectedDescription ? <p className="admin-selected-answer">คำตอบที่เลือก: {question.selectedDescription}</p> : null}
                      <p><strong>เหตุผลประกอบ:</strong> {question.explanation.trim() || "ไม่ได้ระบุ"}</p>
                      {question.recommendation ? <p className="admin-question-recommendation"><strong>ข้อเสนอแนะ:</strong> {question.recommendation}</p> : null}
                    </article>
                  ))}</div>
                </section>
              </div>
            </details>
          </li>
        );
      })}
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
  const [submissions, setSubmissions] = useState<AssessmentSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [submissionQuery, setSubmissionQuery] = useState("");
  const [submissionPage, setSubmissionPage] = useState(1);
  const [submissionBusy, setSubmissionBusy] = useState(false);
  const [pendingSubmissionDeletion, setPendingSubmissionDeletion] = useState<PendingSubmissionDeletion | null>(null);

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

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void subscribeAssessmentSubmissions((nextSubmissions) => {
      if (!active) return;
      setSubmissions(nextSubmissions);
      setSubmissionsLoading(false);
    }, (nextError) => {
      if (!active) return;
      setError(friendlyAdminError(nextError));
      setSubmissionsLoading(false);
    }).then((nextUnsubscribe) => {
      if (active) unsubscribe = nextUnsubscribe;
      else nextUnsubscribe();
    }).catch((nextError) => {
      if (!active) return;
      setError(friendlyAdminError(nextError));
      setSubmissionsLoading(false);
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

  const filteredSubmissions = useMemo(() => {
    const normalizedQuery = submissionQuery.trim().toLocaleLowerCase("th");
    if (!normalizedQuery) return submissions;
    return submissions.filter((submission) => `${submission.institution} ${submission.province} ${submission.topicLabel} ${submission.assessorName} ${submission.respondentRole} ${submission.questionResults.map((question) => `${question.title} ${question.explanation}`).join(" ")}`.toLocaleLowerCase("th").includes(normalizedQuery));
  }, [submissionQuery, submissions]);
  const totalSubmissionPages = Math.max(1, Math.ceil(filteredSubmissions.length / SUBMISSIONS_PER_PAGE));
  const activeSubmissionPage = Math.min(submissionPage, totalSubmissionPages);
  const firstSubmissionIndex = (activeSubmissionPage - 1) * SUBMISSIONS_PER_PAGE;
  const paginatedSubmissions = filteredSubmissions.slice(firstSubmissionIndex, firstSubmissionIndex + SUBMISSIONS_PER_PAGE);

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

  async function confirmSubmissionDeletion() {
    if (!pendingSubmissionDeletion || submissionBusy) return;
    setSubmissionBusy(true);
    setError("");
    setStatus("");
    try {
      if (pendingSubmissionDeletion.type === "one") {
        await deleteAssessmentSubmission(pendingSubmissionDeletion.submission);
        setStatus("ลบแบบประเมินที่เลือก พร้อมข้อมูลผู้ประเมินเรียบร้อยแล้ว");
      } else {
        await deleteAllAssessmentSubmissions(submissions);
        setStatus(`ลบแบบประเมินทั้งหมด ${submissions.length.toLocaleString("th-TH")} ชุด พร้อมข้อมูลผู้ประเมินเรียบร้อยแล้ว`);
      }
      setPendingSubmissionDeletion(null);
    } catch (nextError) {
      setError(friendlyAdminError(nextError));
    } finally {
      setSubmissionBusy(false);
    }
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

      <section className="panel admin-submissions-panel" aria-labelledby="admin-submissions-title">
        <div className="admin-submissions-heading">
          <div>
            <p className="section-kicker">ข้อมูลจากแบบประเมิน</p>
            <h2 id="admin-submissions-title">จัดการรายการแบบประเมิน</h2>
            <p>หนึ่งรายการหมายถึงแบบประเมินหนึ่งชุดของผู้ตอบหนึ่งคน การลบจะนำผลคะแนน คำตอบ เหตุผลประกอบ และข้อมูลผู้ประเมินของชุดนั้นออกทั้งหมด</p>
          </div>
          <div className="admin-submission-count" aria-label={`มีแบบประเมิน ${submissions.length} ชุด`}>
            <span>แบบประเมินทั้งหมด</span>
            <strong>{submissionsLoading ? "—" : submissions.length.toLocaleString("th-TH")}</strong>
            <small>ชุดที่บันทึกในระบบ</small>
          </div>
        </div>

        <div className="admin-submissions-toolbar">
          <label className="admin-search-field" htmlFor="submission-search">
            <span>ค้นหาสถานศึกษา ผู้ประเมิน จังหวัด หรือข้อความประกอบ</span>
            <input id="submission-search" type="search" placeholder="พิมพ์คำที่ต้องการค้นหา" value={submissionQuery} onChange={(event) => { setSubmissionQuery(event.target.value); setSubmissionPage(1); }} />
          </label>
          <button className="btn btn-danger-outline" type="button" disabled={submissionsLoading || submissionBusy || submissions.length === 0} onClick={() => setPendingSubmissionDeletion({ type: "all", count: submissions.length })}>ลบแบบประเมินทั้งหมด</button>
        </div>

        {submissionsLoading ? <p className="admin-empty-state" role="status">กำลังโหลดรายการแบบประเมิน…</p> : null}
        {!submissionsLoading && submissions.length === 0 ? <div className="admin-empty-state admin-empty-card"><strong>ยังไม่มีแบบประเมิน</strong><span>เมื่อมีผู้ส่งแบบประเมิน รายการจะแสดงที่ส่วนนี้</span></div> : null}
        {!submissionsLoading && submissions.length > 0 && filteredSubmissions.length === 0 ? <div className="admin-empty-state admin-empty-card"><strong>ไม่พบแบบประเมินที่ค้นหา</strong><span>ลองใช้ชื่อสถานศึกษา ผู้ประเมิน จังหวัด หรือข้อความบางส่วน</span></div> : null}
        {!submissionsLoading && filteredSubmissions.length > 0 ? <SubmissionList submissions={paginatedSubmissions} busy={submissionBusy} onDelete={(submission) => setPendingSubmissionDeletion({ type: "one", submission })} /> : null}
        {!submissionsLoading && filteredSubmissions.length > 0 ? (
          <nav className="admin-pagination" aria-label="แบ่งหน้ารายการแบบประเมิน">
            <p>แสดงรายการ {(firstSubmissionIndex + 1).toLocaleString("th-TH")}–{Math.min(firstSubmissionIndex + SUBMISSIONS_PER_PAGE, filteredSubmissions.length).toLocaleString("th-TH")} จาก {filteredSubmissions.length.toLocaleString("th-TH")} ชุด</p>
            <div>
              <button className="btn btn-secondary" type="button" disabled={activeSubmissionPage === 1} onClick={() => setSubmissionPage(Math.max(1, activeSubmissionPage - 1))}>← ก่อนหน้า</button>
              <span aria-live="polite">หน้า {activeSubmissionPage.toLocaleString("th-TH")} จาก {totalSubmissionPages.toLocaleString("th-TH")}</span>
              <button className="btn btn-secondary" type="button" disabled={activeSubmissionPage === totalSubmissionPages} onClick={() => setSubmissionPage(Math.min(totalSubmissionPages, activeSubmissionPage + 1))}>ถัดไป →</button>
            </div>
          </nav>
        ) : null}
      </section>

      <ConfirmationDialog pending={pendingSubmissionDeletion} busy={submissionBusy} onCancel={() => setPendingSubmissionDeletion(null)} onConfirm={() => void confirmSubmissionDeletion()} />
    </main>
  );
}
