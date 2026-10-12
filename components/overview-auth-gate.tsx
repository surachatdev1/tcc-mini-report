"use client";

import { OverviewDashboard } from "@/components/overview-dashboard";

// Public route: this component reads only the published aggregate collection.
export function OverviewAuthGate() {
  return <OverviewDashboard />;
}
