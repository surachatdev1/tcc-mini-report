"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { getDashboardAccess, type DashboardAccess } from "@/lib/integrations/access-control-repository";
import { getFirebaseAuth } from "@/lib/integrations/firebase-client";

const EMBEDDED_BROWSER_PATTERN = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|MicroMessenger|BytedanceWebview|TikTok|; wv\)|\bwv\b/i;

function browserBlocksOAuthState() {
  if (typeof window === "undefined") return false;
  if (EMBEDDED_BROWSER_PATTERN.test(window.navigator.userAgent)) return true;
  try {
    const probeKey = "__tcc_auth_storage_probe__";
    window.sessionStorage.setItem(probeKey, "1");
    window.sessionStorage.removeItem(probeKey);
    return false;
  } catch {
    return true;
  }
}

function shouldUseRedirect() {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
}

function friendlyAuthError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (code.includes("web-storage-unsupported") || code.includes("operation-not-supported-in-this-environment") || /sessionStorage|web storage/i.test(message)) {
    return "เบราว์เซอร์นี้ปิดกั้นข้อมูลชั่วคราวสำหรับ Google Sign-In กรุณาเปิดใน Safari หรือ Chrome หรือใช้อีเมลและรหัสผ่าน";
  }
  if (code.includes("popup-closed-by-user")) return "ยกเลิกการเข้าสู่ระบบแล้ว สามารถลองใหม่ได้เมื่อพร้อม";
  if (code.includes("popup-blocked")) return "เบราว์เซอร์ปิดกั้นหน้าต่างเข้าสู่ระบบ กรุณาอนุญาต popup แล้วลองใหม่";
  if (code.includes("unauthorized-domain")) return "โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Authentication";
  if (code.includes("operation-not-allowed")) return "ยังไม่ได้เปิดวิธีเข้าสู่ระบบนี้ใน Firebase Authentication";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  if (code.includes("invalid-email")) return "รูปแบบอีเมลไม่ถูกต้อง";
  if (code.includes("too-many-requests")) return "มีการลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่";
  return "ไม่สามารถเข้าสู่ระบบได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";
}

function friendlyAccessError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("permission-denied")) return "Firestore Rules สำหรับระบบสิทธิ์ยังไม่พร้อม หรือบัญชีนี้ไม่มีสิทธิ์";
  return error instanceof Error ? error.message : "ไม่สามารถตรวจสอบสิทธิ์ได้";
}

type ProtectedAreaProps = {
  area: "dashboard" | "admin";
  children: ReactNode;
};

export function FirebaseProtectedArea({ area, children }: ProtectedAreaProps) {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<DashboardAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [requiresExternalBrowser, setRequiresExternalBrowser] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetStatus, setResetStatus] = useState("");

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;
    let accessSequence = 0;
    const blockedBrowser = browserBlocksOAuthState();

    void getFirebaseAuth().then(async (auth) => {
      if (!active) return;
      setRequiresExternalBrowser(blockedBrowser);
      if (!auth) {
        setError("ระบบยืนยันตัวตนยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแลโครงการ");
        setLoading(false);
        return;
      }
      const { getRedirectResult, onAuthStateChanged } = await import("firebase/auth");
      if (!active) return;
      unsubscribe = onAuthStateChanged(auth, (nextUser) => {
        const sequence = ++accessSequence;
        setUser(nextUser);
        setAccess(null);
        setLoading(Boolean(nextUser));
        if (!nextUser) return;
        if (!nextUser.emailVerified) {
          setLoading(false);
          return;
        }
        void getDashboardAccess(nextUser).then((nextAccess) => {
          if (!active || sequence !== accessSequence) return;
          setAccess(nextAccess);
          setLoading(false);
        }).catch((nextError) => {
          if (!active || sequence !== accessSequence) return;
          setError(friendlyAccessError(nextError));
          setLoading(false);
        });
      });

      if (!blockedBrowser) {
        void getRedirectResult(auth).catch((nextError) => {
          if (active) setError(friendlyAuthError(nextError));
        });
      }
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  async function signInWithGoogle() {
    setError("");
    setResetStatus("");
    if (browserBlocksOAuthState()) {
      setRequiresExternalBrowser(true);
      return;
    }
    setSigningIn(true);
    try {
      const auth = await getFirebaseAuth();
      if (!auth) throw new Error("auth-unavailable");
      const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import("firebase/auth");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      if (shouldUseRedirect()) {
        await signInWithRedirect(auth, provider);
        return;
      }
      await signInWithPopup(auth, provider);
    } catch (nextError) {
      setError(friendlyAuthError(nextError));
    } finally {
      setSigningIn(false);
    }
  }

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResetStatus("");
    setSigningIn(true);
    try {
      const auth = await getFirebaseAuth();
      if (!auth) throw new Error("auth-unavailable");
      const { signInWithEmailAndPassword } = await import("firebase/auth");
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (nextError) {
      setError(friendlyAuthError(nextError));
    } finally {
      setSigningIn(false);
    }
  }

  async function sendPasswordReset() {
    setError("");
    setResetStatus("");
    if (!email.trim()) {
      setError("กรอกอีเมลก่อนขอเปลี่ยนรหัสผ่าน");
      return;
    }
    try {
      const auth = await getFirebaseAuth();
      if (!auth) throw new Error("auth-unavailable");
      const { sendPasswordResetEmail } = await import("firebase/auth");
      await sendPasswordResetEmail(auth, email.trim());
      setResetStatus("ส่งลิงก์เปลี่ยนรหัสผ่านแล้ว กรุณาตรวจสอบอีเมล");
    } catch (nextError) {
      setError(friendlyAuthError(nextError));
    }
  }

  async function copyCurrentLink() {
    const url = window.location.href;
    try {
      await window.navigator.clipboard.writeText(url);
      setCopyStatus("คัดลอกลิงก์แล้ว ให้วางใน Safari หรือ Chrome");
    } catch {
      window.prompt("คัดลอกลิงก์นี้ แล้วนำไปเปิดใน Safari หรือ Chrome", url);
      setCopyStatus("หากคัดลอกแล้ว ให้นำลิงก์ไปเปิดใน Safari หรือ Chrome");
    }
  }

  async function signOut() {
    const auth = await getFirebaseAuth();
    if (!auth) return;
    const { signOut: firebaseSignOut } = await import("firebase/auth");
    await firebaseSignOut(auth);
  }

  if (loading) {
    return <main className="dashboard-login-shell"><p className="auth-status" role="status">กำลังตรวจสอบบัญชีและสิทธิ์…</p></main>;
  }

  if (!user) {
    const title = area === "admin" ? "เข้าสู่ระบบผู้ดูแล" : "เข้าสู่ระบบก่อนดู Dashboard";
    return (
      <main className="dashboard-login-shell">
        <section className="dashboard-login-card" aria-labelledby="protected-login-title">
          <div className="auth-lock-mark" aria-hidden="true">✓</div>
          <p className="eyebrow">{area === "admin" ? "จัดการสิทธิ์ระบบ" : "สำหรับเจ้าหน้าที่โครงการ"}</p>
          <h1 id="protected-login-title">{title}</h1>
          <p className="dashboard-login-description">
            เฉพาะบัญชีที่ผู้ดูแลอนุญาตเป็นรายอีเมล รายโดเมน หรือบัญชีเจ้าหน้าที่เท่านั้น
          </p>
          {requiresExternalBrowser ? (
            <div className="auth-purpose-note" role="alert">
              <strong>Google Sign-In ใช้ใน Messenger ไม่ได้</strong>
              <p>เปิดหน้านี้ใน Safari/Chrome หรือใช้อีเมลและรหัสผ่านด้านล่าง</p>
              <button className="google-signin-button" type="button" onClick={copyCurrentLink}>คัดลอกลิงก์หน้านี้</button>
              {copyStatus ? <p className="auth-status" role="status">{copyStatus}</p> : null}
            </div>
          ) : (
            <button className="google-signin-button" type="button" onClick={signInWithGoogle} disabled={signingIn}>
              {signingIn ? "กำลังไปยังหน้าลงชื่อเข้าใช้…" : "เข้าสู่ระบบด้วย Google"}
            </button>
          )}

          <div className="auth-divider" aria-hidden="true"><span>หรือ</span></div>
          <form className="auth-password-form" onSubmit={signInWithPassword}>
            <label htmlFor="protected-email">อีเมลผู้ใช้</label>
            <input id="protected-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <label htmlFor="protected-password">รหัสผ่าน</label>
            <input id="protected-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <button className="google-signin-button" type="submit" disabled={signingIn}>
              {signingIn ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบด้วยอีเมล"}
            </button>
            <button className="auth-text-button" type="button" onClick={sendPasswordReset}>ลืมรหัสผ่าน</button>
          </form>
          {resetStatus ? <p className="auth-status" role="status">{resetStatus}</p> : null}
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <Link className="auth-back-link" href="/">กลับไปหน้าแบบประเมิน</Link>
        </section>
      </main>
    );
  }

  const allowed = area === "admin" ? access?.admin === true : Boolean(access?.admin || access?.member || access?.domain);
  if (!allowed) {
    return (
      <main className="dashboard-login-shell">
        <section className="dashboard-login-card" aria-labelledby="access-denied-title">
          <div className="auth-lock-mark auth-lock-warning" aria-hidden="true">!</div>
          <p className="eyebrow">ไม่อนุญาตให้เข้าถึง</p>
          <h1 id="access-denied-title">บัญชีนี้ยังไม่มีสิทธิ์</h1>
          <p className="dashboard-login-description">
            {user.emailVerified
              ? `กรุณาให้ผู้ดูแลเพิ่ม ${user.email ?? "อีเมลนี้"} ในหน้าจัดการสิทธิ์`
              : "กรุณาเปิดลิงก์ยืนยันอีเมลที่ระบบส่งให้ แล้วออกจากระบบและเข้าสู่ระบบใหม่"}
          </p>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="google-signin-button" type="button" onClick={signOut}>ออกจากระบบ</button>
          <Link className="auth-back-link" href={area === "admin" ? "/dashboard" : "/"}>
            {area === "admin" ? "กลับไป Dashboard" : "กลับไปหน้าแบบประเมิน"}
          </Link>
        </section>
      </main>
    );
  }

  return (
    <>
      <div className="dashboard-utility-wrap">
        <nav className="dashboard-session-actions" aria-label="เมนูผู้ใช้งาน">
          {area === "admin" ? <Link href="/dashboard">ดู Dashboard</Link> : null}
          <button
            type="button"
            onClick={signOut}
            aria-label={`ออกจากระบบ${user.displayName ? `ของ ${user.displayName}` : ""}`}
          >
            ออกจากระบบ
          </button>
        </nav>
      </div>
      {children}
    </>
  );
}
