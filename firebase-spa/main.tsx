import "@fontsource/sarabun/400.css";
import "@fontsource/sarabun/500.css";
import "@fontsource/sarabun/600.css";
import "@fontsource/sarabun/700.css";
import "@/app/globals.css";

import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

// Each route loads its own workspace. This keeps the public assessment from
// downloading Dashboard/Admin logic and reduces JavaScript parsing on mobile.
const AssessmentWorkspace = lazy(() => import("@/components/assessment-workspace").then((module) => ({ default: module.AssessmentWorkspace })));
const DashboardAuthGate = lazy(() => import("@/components/dashboard-auth-gate").then((module) => ({ default: module.DashboardAuthGate })));
const AdminAuthGate = lazy(() => import("@/components/admin-auth-gate").then((module) => ({ default: module.AdminAuthGate })));

function RouteFallback({ label }: { label: string }) {
  return <main className="dashboard-login-shell"><p className="auth-status" role="status">{label}</p></main>;
}

function FirebaseApplication() {
  const isAdmin = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");
  if (isAdmin) {
    return (
      <>
        <SiteHeader active="admin" />
        <Suspense fallback={<RouteFallback label="กำลังเปิดระบบผู้ดูแล…" />}>
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
        <Suspense fallback={<RouteFallback label="กำลังเปิด Dashboard…" />}>
          <DashboardAuthGate />
        </Suspense>
        <SiteFooter />
      </>
    );
  }
  return (
    <Suspense fallback={<RouteFallback label="กำลังเปิดแบบประเมิน…" />}>
      <AssessmentWorkspace />
    </Suspense>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("ไม่พบตำแหน่งสำหรับแสดงผลเว็บไซต์");

createRoot(root).render(
  <StrictMode>
    <FirebaseApplication />
  </StrictMode>,
);
