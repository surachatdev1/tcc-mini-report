"use client";

import { AdminWorkspace } from "@/components/admin-workspace";
import { FirebaseProtectedArea } from "@/components/firebase-protected-area";

export function AdminAuthGate() {
  return (
    <FirebaseProtectedArea area="admin">
      <AdminWorkspace />
    </FirebaseProtectedArea>
  );
}
