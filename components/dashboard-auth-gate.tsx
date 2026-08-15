"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { DashboardWorkspace } from "@/components/dashboard-workspace";
import { getFirebaseAuth } from "@/lib/integrations/firebase-client";

function friendlyAuthError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
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

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    void getFirebaseAuth().then(async (auth) => {
      if (!active) return;
      if (!auth) {
        setError("ระบบยืนยันตัวตนยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแลโครงการ");
        setLoading(false);
        return;
      }
      const { onAuthStateChanged } = await import("firebase/auth");
      if (!active) return;
      unsubscribe = onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setLoading(false);
      });
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  async function signIn() {
    setError("");
    setSigningIn(true);
    try {
      const auth = await getFirebaseAuth();
      if (!auth) throw new Error("auth-unavailable");
      const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (nextError) {
      setError(friendlyAuthError(nextError));
    } finally {
      setSigningIn(false);
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
          <button className="google-signin-button" type="button" onClick={signIn} disabled={signingIn}>
            {signingIn ? "กำลังเปิดหน้าต่างเข้าสู่ระบบ…" : "เข้าสู่ระบบด้วย Google"}
          </button>
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
