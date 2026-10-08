import type { DraftPayload } from "./assessment-repository";

export const DRAFT_KEY = "tcc-assessment-draft-v5";
export const STORAGE_WARNING = "บันทึกร่างในเครื่องไม่ได้ กรุณาเปิดใช้งานพื้นที่เก็บข้อมูลของเบราว์เซอร์ และอย่าปิดหรือรีเฟรชหน้านี้";

export type SavedDraft = DraftPayload & {
  idempotencyKey?: string;
  submissionAttempted?: boolean;
};

// Pass a getter so even accessing localStorage (which can throw) is protected.
export function createDraftStore(storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  return {
    load(): SavedDraft | null {
      const raw = storage().getItem(DRAFT_KEY);
      if (!raw) return null;
      let value: unknown;
      try { value = JSON.parse(raw); } catch { throw new Error("ร่างในเครื่องเสียหาย ไม่สามารถกู้คืนได้ กรุณาติดต่อผู้ดูแลหากเคยกดส่งแล้ว"); }
      if (!value || typeof value !== "object") throw new Error("รูปแบบร่างในเครื่องไม่ถูกต้อง");
      const draft = value as Record<string, unknown>;
      if (draft.completed === true) return null;
      const fields = ["institution", "province", "assessorName", "respondentRole", "position", "assessmentDate"];
      if (fields.some((key) => typeof draft[key] !== "string")
        || !["bus", "trip", "moto", "agency"].includes(String(draft.topicId))
        || !["road-safety", "education-area", "transport", "local-admin"].includes(String(draft.agencyType))
        || !draft.answers || typeof draft.answers !== "object" || Array.isArray(draft.answers)
        || Object.values(draft.answers).some((answer) => !answer || typeof answer !== "object"
          || typeof answer.explanation !== "string"
          || (answer.score !== undefined && ![0, 1, 2, 3].includes(answer.score)))
        || (draft.idempotencyKey !== undefined && (typeof draft.idempotencyKey !== "string"
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draft.idempotencyKey)))
        || (draft.submissionAttempted === true && !draft.idempotencyKey)) {
        throw new Error("รูปแบบร่างในเครื่องไม่ถูกต้อง กรุณาติดต่อผู้ดูแลหากเคยกดส่งแล้ว");
      }
      return { ...draft, assessorPhone: typeof draft.assessorPhone === "string" ? draft.assessorPhone : "",
        publicConsent: draft.publicConsent === true } as SavedDraft;
    },
    save(draft: SavedDraft) {
      storage().setItem(DRAFT_KEY, JSON.stringify(draft));
    },
    complete(idempotencyKey: string): boolean {
      try {
        const raw = storage().getItem(DRAFT_KEY);
        const current = raw ? JSON.parse(raw) : null;
        // Do not erase a newer draft saved by another tab.
        if (current?.idempotencyKey && current.idempotencyKey !== idempotencyKey) return true;
        // A small tombstone replaces PII and prevents restoring an already sent draft.
        // If storage fails, keep the old draft WITH its key; never report the write as failed.
        storage().setItem(DRAFT_KEY, JSON.stringify({ completed: true, idempotencyKey }));
        return true;
      } catch { return false; }
    },
  };
}

export const assessmentDraftStore = createDraftStore(() => window.localStorage);
