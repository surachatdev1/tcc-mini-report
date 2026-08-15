import { DashboardAuthGate } from "@/components/dashboard-auth-gate";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function DashboardPage() {
  return (
    <>
      <SiteHeader active="dashboard" />
      <DashboardAuthGate />
      <SiteFooter />
    </>
  );
}
