import "@fontsource/sarabun/400.css";
import "@fontsource/sarabun/500.css";
import "@fontsource/sarabun/600.css";
import "@fontsource/sarabun/700.css";
import "@/app/globals.css";

import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AssessmentWorkspace } from "@/components/assessment-workspace";
import { DashboardAuthGate } from "@/components/dashboard-auth-gate";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const AdminAuthGate = lazy(() => import("@/components/admin-auth-gate").then((module) => ({ default: module.AdminAuthGate })));

function FirebaseApplication() {
  const isAdmin = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");
  if (isAdmin) {
    return (
      <>
        <SiteHeader active="admin" />
        <Suspense fallback={<main className="dashboard-login-shell"><p className="auth-status" role="status">กำลังเปิดระบบผู้ดูแล…</p></main>}>
          <AdminAuthGate />
        </Suspense>
        <SiteFooter />
      </>
    );
  }
  const isDashboard = window.location.pathname === "/dashboard" || window.location.pathname.startsWith("/dashboard/");
  if (isDashboard) {
    return (
      <>
        <SiteHeader active="dashboard" />
        <DashboardAuthGate />
        <SiteFooter />
      </>
    );
  }
  return <AssessmentWorkspace />;
}

const root = document.getElementById("root");
if (!root) throw new Error("ไม่พบตำแหน่งสำหรับแสดงผลเว็บไซต์");

createRoot(root).render(
  <StrictMode>
    <FirebaseApplication />
  </StrictMode>,
);
