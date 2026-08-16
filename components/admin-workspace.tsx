"use client";

import { type FormEvent, useEffect, useState } from "react";
import { isSuperAdminEmail, systemRoleLabel } from "@/lib/access-roles";
import {
  addAdmin,
  addAllowedDomain,
  addGoogleMember,
  createPasswordMember,
  removeAccessEntry,
  subscribeAccessDirectory,
  type AccessDirectory,
  type AccessEntry,
} from "@/lib/integrations/access-control-repository";
import { getFirebaseAuth } from "@/lib/integrations/firebase-client";
import { rebuildBenchmarkSnapshots } from "@/lib/integrations/benchmark-repository";

const EMPTY_DIRECTORY: AccessDirectory = { admins: [], members: [], domains: [] };

function friendlyAdminError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("permission-denied")) return "ไม่มีสิทธิ์แก้ไขรายการนี้ หรือ Firestore Rules รุ่นล่าสุดยังไม่ได้ Deploy";
  if (code.includes("email-already-in-use")) return "อีเมลนี้มีบัญชี Firebase Auth อยู่แล้ว ให้เพิ่มในรายการอีเมล Google แทน หรือใช้บัญชีเดิม";
  if (code.includes("operation-not-allowed")) return "ยังไม่ได้เปิด Email/Password ที่ Firebase Authentication > Sign-in method";
  if (code.includes("weak-password")) return "รหัสผ่านยังไม่แข็งแรงพอ กรุณาใช้ตั้งแต่ 8 ตัวอักษรขึ้นไป";
  return error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ กรุณาลองใหม่";
}

function AccessList({
  entries,
  emptyText,
  currentEmail,
  onRemove,
}: {
  entries: AccessEntry[];
  emptyText: string;
  currentEmail?: string;
  onRemove: (entry: AccessEntry) => void;
}) {
  if (entries.length === 0) return <p className="admin-empty-state">{emptyText}</p>;
  return (
    <ul className="admin-access-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <div>
            <strong>{entry.label}</strong>
            {entry.name ? <span>{entry.name}</span> : null}
            <span>{systemRoleLabel(entry.role)}</span>
            <small>เพิ่มโดย {entry.createdBy} · {entry.createdAt}</small>
          </div>
          {entry.protected ? <span className="admin-current-badge">Superadmin · ล็อกถาวร</span> : entry.id === currentEmail ? <span className="admin-current-badge">บัญชีปัจจุบัน</span> : (
            <button className="admin-remove-button" type="button" onClick={() => onRemove(entry)}>นำสิทธิ์ออก</button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AdminWorkspace() {
  const [directory, setDirectory] = useState(EMPTY_DIRECTORY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [currentEmail, setCurrentEmail] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [domain, setDomain] = useState("");
  const [passwordEmail, setPasswordEmail] = useState("");
  const [passwordName, setPasswordName] = useState("");
  const [initialPassword, setInitialPassword] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void getFirebaseAuth().then((auth) => {
      if (active) setCurrentEmail(auth?.currentUser?.email?.toLowerCase() ?? "");
    });
    void subscribeAccessDirectory((nextDirectory) => {
      if (!active) return;
      setDirectory(nextDirectory);
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

  async function runAction(action: () => Promise<unknown>, successMessage: string, clear: () => void) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await action();
      clear();
      setStatus(successMessage);
    } catch (nextError) {
      setError(friendlyAdminError(nextError));
    } finally {
      setBusy(false);
    }
  }

  function submitAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction(() => addAdmin(adminEmail, adminName), "เพิ่มผู้ดูแลระบบแล้ว", () => {
      setAdminEmail("");
      setAdminName("");
    });
  }

  function submitMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction(() => addGoogleMember(memberEmail, memberName), "เพิ่มสิทธิ์อีเมล Google แล้ว", () => {
      setMemberEmail("");
      setMemberName("");
    });
  }

  function submitDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction(() => addAllowedDomain(domain), "เพิ่มโดเมนที่อนุญาตแล้ว", () => setDomain(""));
  }

  function submitPasswordMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction(
      () => createPasswordMember(passwordEmail, initialPassword, passwordName),
      "สร้างบัญชีแล้ว ระบบส่งอีเมลยืนยันไปยังผู้ใช้เรียบร้อย",
      () => {
        setPasswordEmail("");
        setPasswordName("");
        setInitialPassword("");
      },
    );
  }

  function remove(collectionName: "dashboard_admins" | "dashboard_members" | "dashboard_domains", entry: AccessEntry) {
    if (entry.protected) {
      setError("ไม่สามารถลบหรือลดสิทธิ์ Superadmin ได้");
      return;
    }
    if (!window.confirm(`ยืนยันนำสิทธิ์ของ ${entry.label} ออกจากระบบหรือไม่`)) return;
    void runAction(() => removeAccessEntry(collectionName, entry.id), `นำสิทธิ์ของ ${entry.label} ออกแล้ว`, () => undefined);
  }

  async function refreshBenchmarks() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await rebuildBenchmarkSnapshots();
      setStatus(`อัปเดตข้อมูลเปรียบเทียบแล้ว ${result.published} กลุ่ม จากผลประเมิน ${result.submissions} รายการ`);
    } catch (nextError) {
      setError(friendlyAdminError(nextError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell admin-page" id="main-content">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>จัดการผู้มีสิทธิ์ดู Dashboard</h1>
          <p>แบ่งสิทธิ์เป็น Superadmin, Admin และ User โดยบังคับใช้ทั้งหน้าเว็บและ Firestore Security Rules</p>
        </div>
        <div className="admin-security-note">
          <strong>หลักการให้สิทธิ์</strong>
          <span>{isSuperAdminEmail(currentEmail) ? "คุณเป็น Superadmin และจัดการสิทธิ์ได้ทุกระดับ" : "คุณเป็น Admin และจัดการ User กับข้อมูล Dashboard ได้"}</span>
        </div>
      </header>

      {status ? <p className="admin-message admin-message-success" role="status">{status}</p> : null}
      {error ? <p className="admin-message admin-message-error" role="alert">{error}</p> : null}

      <div className="admin-panel-grid">
        <section className="panel admin-panel admin-benchmark-panel" aria-labelledby="admin-benchmark-title">
          <div className="panel-heading">
            <p className="section-kicker">ผลเปรียบเทียบสำหรับผู้ตอบ</p>
            <h2 id="admin-benchmark-title">อัปเดตค่ากลางของกลุ่ม</h2>
            <p>สร้างข้อมูลสรุปแบบไม่ระบุตัวบุคคลให้หน้าผลลัพธ์ใช้เปรียบเทียบ ระบบเผยแพร่เฉพาะกลุ่มที่มีอย่างน้อย 10 ผลประเมิน</p>
          </div>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void refreshBenchmarks()}>{busy ? "กำลังคำนวณ…" : "อัปเดตข้อมูลเปรียบเทียบ"}</button>
        </section>
        {isSuperAdminEmail(currentEmail) ? <section className="panel admin-panel" aria-labelledby="admin-managers-title">
          <div className="panel-heading">
            <p className="section-kicker">สิทธิ์ระดับสูง</p>
            <h2 id="admin-managers-title">ผู้ดูแลระบบ</h2>
            <p>Superadmin สองบัญชีถูกล็อกถาวร ส่วนบัญชีที่เพิ่มจากหน้านี้จะเป็น Admin และไม่สามารถจัดการ Superadmin ได้</p>
          </div>
          <form className="admin-access-form" onSubmit={submitAdmin}>
            <div className="field"><label htmlFor="admin-email">Google email</label><input id="admin-email" type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} required /></div>
            <div className="field"><label htmlFor="admin-name">ชื่อหรือหน่วยงาน <span className="optional-tag">ไม่บังคับ</span></label><input id="admin-name" value={adminName} onChange={(event) => setAdminName(event.target.value)} /></div>
            <button className="btn btn-primary" type="submit" disabled={busy}>เพิ่มผู้ดูแล</button>
          </form>
          {loading ? <p className="admin-empty-state">กำลังโหลดรายการ…</p> : <AccessList entries={directory.admins} emptyText="ยังไม่มีรายชื่อผู้ดูแล" currentEmail={currentEmail} onRemove={(entry) => remove("dashboard_admins", entry)} />}
        </section> : null}

        <section className="panel admin-panel" aria-labelledby="admin-members-title">
          <div className="panel-heading">
            <p className="section-kicker">อนุญาตรายบุคคล</p>
            <h2 id="admin-members-title">User ผ่าน Google email</h2>
            <p>ให้สิทธิ์ดู Dashboard เฉพาะบุคคล โดยไม่ให้สิทธิ์จัดการระบบ</p>
          </div>
          <form className="admin-access-form" onSubmit={submitMember}>
            <div className="field"><label htmlFor="member-email">Google email</label><input id="member-email" type="email" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} required /></div>
            <div className="field"><label htmlFor="member-name">ชื่อหรือหน่วยงาน <span className="optional-tag">ไม่บังคับ</span></label><input id="member-name" value={memberName} onChange={(event) => setMemberName(event.target.value)} /></div>
            <button className="btn btn-primary" type="submit" disabled={busy}>เพิ่มอีเมล</button>
          </form>
          {loading ? <p className="admin-empty-state">กำลังโหลดรายการ…</p> : <AccessList entries={directory.members.filter((entry) => entry.authMethod !== "password")} emptyText="ยังไม่มี Google email ที่ได้รับอนุญาต" onRemove={(entry) => remove("dashboard_members", entry)} />}
        </section>

        <section className="panel admin-panel" aria-labelledby="admin-domains-title">
          <div className="panel-heading">
            <p className="section-kicker">อนุญาตระดับองค์กร</p>
            <h2 id="admin-domains-title">User ผ่านโดเมนอีเมล</h2>
            <p>ผู้ใช้ Google ที่ยืนยันแล้วภายใต้โดเมนนี้จะดูเฉพาะข้อมูลสรุปใน Dashboard</p>
          </div>
          <form className="admin-access-form admin-domain-form" onSubmit={submitDomain}>
            <div className="field"><label htmlFor="allowed-domain">โดเมน</label><input id="allowed-domain" inputMode="url" placeholder="example.ac.th" value={domain} onChange={(event) => setDomain(event.target.value)} required /></div>
            <button className="btn btn-primary" type="submit" disabled={busy}>เพิ่มโดเมน</button>
          </form>
          {loading ? <p className="admin-empty-state">กำลังโหลดรายการ…</p> : <AccessList entries={directory.domains} emptyText="ยังไม่มีโดเมนที่ได้รับอนุญาต" onRemove={(entry) => remove("dashboard_domains", entry)} />}
        </section>

        <section className="panel admin-panel" aria-labelledby="admin-password-title">
          <div className="panel-heading">
            <p className="section-kicker">บัญชีเฉพาะระบบ</p>
            <h2 id="admin-password-title">สร้าง User ด้วยอีเมลและรหัสผ่าน</h2>
            <p>อีเมลใช้เป็นชื่อผู้ใช้ รหัสผ่านไม่ถูกบันทึกใน Firestore และระบบจะส่งลิงก์ยืนยันอีเมลให้ผู้ใช้</p>
          </div>
          <form className="admin-access-form" onSubmit={submitPasswordMember}>
            <div className="field"><label htmlFor="password-member-email">อีเมลผู้ใช้</label><input id="password-member-email" type="email" autoComplete="off" value={passwordEmail} onChange={(event) => setPasswordEmail(event.target.value)} required /></div>
            <div className="field"><label htmlFor="password-member-name">ชื่อหรือหน่วยงาน <span className="optional-tag">ไม่บังคับ</span></label><input id="password-member-name" autoComplete="off" value={passwordName} onChange={(event) => setPasswordName(event.target.value)} /></div>
            <div className="field full"><label htmlFor="initial-password">รหัสผ่านเริ่มต้น อย่างน้อย 8 ตัวอักษร</label><input id="initial-password" type="password" autoComplete="new-password" minLength={8} value={initialPassword} onChange={(event) => setInitialPassword(event.target.value)} required /></div>
            <p className="admin-form-note">ส่งรหัสผ่านให้ผู้ใช้ผ่านช่องทางที่ปลอดภัย และแนะนำให้เปลี่ยนรหัสผ่านเมื่อเข้าใช้ครั้งแรก</p>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "กำลังดำเนินการ…" : "สร้างบัญชีผู้ใช้"}</button>
          </form>
          {loading ? <p className="admin-empty-state">กำลังโหลดรายการ…</p> : <AccessList entries={directory.members.filter((entry) => entry.authMethod === "password")} emptyText="ยังไม่มีบัญชีอีเมลและรหัสผ่าน" onRemove={(entry) => remove("dashboard_members", entry)} />}
        </section>
      </div>
    </main>
  );
}
