"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { DashboardWorkspace } from "@/components/dashboard-workspace";
import { getFirebaseAuth } from "@/lib/integrations/firebase-client";

const EMBEDDED_BROWSER_PATTERN = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|MicroMessenger|BytedanceWebview|TikTok|; wv\)|\bwv\b/i;

function browserBlocksOAuthState() {
  if (typeof window === "undefined") return false;

  // Google OAuth does not support embedded webviews. A storage probe also catches
  // privacy modes that prevent Firebase from retaining the redirect state.
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
    return "เบราว์เซอร์นี้ปิดกั้นพื้นที่จัดเก็บที่จำเป็นต่อการเข้าสู่ระบบ กรุณาเปิด Dashboard ใน Safari หรือ Chrome";
  }
  if (code.includes("popup-closed-by-user")) return "ยกเลิกการเข้าสู่ระบบแล้ว สามารถลองใหม่ได้เมื่อพร้อม";
  if (code.includes("popup-blocked")) return "เบราว์เซอร์ปิดกั้นหน้าต่างเข้าสู่ระบบ กรุณาอนุญาต popup แล้วลองใหม่";
  if (code.includes("unauthorized-domain")) return "โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Authentication";
  if (code.includes("operation-not-allowed")) return "โครงการยังไม่ได้เปิด Google เป็นวิธีเข้าสู่ระบบ";
  return "ไม่สามารถเข้าสู่ระบบได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";
}

export function DashboardAuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [requiresExternalBrowser, setRequiresExternalBrowser] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

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
        setUser(nextUser);
        setLoading(false);
      });

      // Complete a mobile redirect only in a full browser. Embedded browsers such
      // as Messenger cannot safely retain the OAuth state between page changes.
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

  async function signIn() {
    setError("");
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

  async function copyDashboardLink() {
    const url = new URL("/dashboard", window.location.origin).toString();
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
    return <main className="dashboard-login-shell"><p className="auth-status" role="status">กำลังตรวจสอบการเข้าสู่ระบบ…</p></main>;
  }

  if (!user) {
    return (
      <main className="dashboard-login-shell">
        <section className="dashboard-login-card" aria-labelledby="dashboard-login-title">
          <div className="auth-lock-mark" aria-hidden="true">✓</div>
          <p className="eyebrow">สำหรับเจ้าหน้าที่โครงการ</p>
          <h1 id="dashboard-login-title">เข้าสู่ระบบก่อนดู Dashboard</h1>
          <p className="dashboard-login-description">
            ข้อมูลสรุปการประเมินเปิดให้เฉพาะผู้ที่ยืนยันตัวตนด้วยบัญชี Google
          </p>
          <div className="auth-purpose-note">
            ระบบใช้ Google เพื่อยืนยันตัวตนเท่านั้น ไม่ขอสิทธิ์อ่าน Gmail, Google Drive หรือข้อมูลอื่น
          </div>
          {requiresExternalBrowser ? (
            <div className="auth-purpose-note" role="alert">
              <strong>กรุณาเปิดด้วย Safari หรือ Chrome</strong>
              <p>
                เบราว์เซอร์ภายใน Messenger ปิดกั้นข้อมูลชั่วคราวที่ Google ใช้ยืนยันการเข้าสู่ระบบ
                จึงไม่สามารถเข้าสู่ระบบจากหน้านี้ได้อย่างปลอดภัย
              </p>
              <p>แตะเมนู … หรือปุ่มแชร์ แล้วเลือก “เปิดใน Safari” หรือคัดลอกลิงก์ด้านล่างไปเปิดในเบราว์เซอร์หลัก</p>
              <button className="google-signin-button" type="button" onClick={copyDashboardLink}>
                คัดลอกลิงก์ Dashboard
              </button>
              {copyStatus ? <p className="auth-status" role="status">{copyStatus}</p> : null}
            </div>
          ) : (
            <button className="google-signin-button" type="button" onClick={signIn} disabled={signingIn}>
              {signingIn ? "กำลังไปยังหน้าลงชื่อเข้าใช้…" : "เข้าสู่ระบบด้วย Google"}
            </button>
          )}
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <Link className="auth-back-link" href="/">กลับไปหน้าแบบประเมิน</Link>
        </section>
      </main>
    );
  }

  return (
    <>
      <div className="dashboard-session-wrap">
        <div className="dashboard-session">
          <span>เข้าสู่ระบบแล้ว: {user.displayName || user.email || "บัญชี Google"}</span>
          <button type="button" onClick={signOut}>ออกจากระบบ</button>
        </div>
      </div>
      <DashboardWorkspace />
    </>
  );
}
