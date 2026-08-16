"use client";

import { DashboardWorkspace } from "@/components/dashboard-workspace";
import { FirebaseProtectedArea } from "@/components/firebase-protected-area";

export function DashboardAuthGate() {
  return (
    <FirebaseProtectedArea area="dashboard">
      <DashboardWorkspace />
    </FirebaseProtectedArea>
  );
}
