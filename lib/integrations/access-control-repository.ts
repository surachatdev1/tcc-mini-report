import type { User } from "firebase/auth";
import { isSuperAdminEmail, SUPER_ADMIN_EMAILS, type SystemRole } from "@/lib/access-roles";
import { getFirebaseAuth, getFirebaseClientOptions, getFirebaseDb } from "@/lib/integrations/firebase-client";

export type DashboardAccess = {
  role: SystemRole;
  superadmin: boolean;
  admin: boolean;
  member: boolean;
  domain: boolean;
  emailVerified: boolean;
};

export type AccessEntry = {
  id: string;
  label: string;
  name: string;
  authMethod?: "google" | "password";
  createdBy: string;
  createdAt: string;
  role: Exclude<SystemRole, "none">;
  protected: boolean;
};

export type AccessDirectory = {
  admins: AccessEntry[];
  members: AccessEntry[];
  domains: AccessEntry[];
};

type AccessCollection = "dashboard_admins" | "dashboard_members" | "dashboard_domains";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

function domainFromEmail(email: string) {
  return normalizeEmail(email).split("@")[1] ?? "";
}

function requireEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(normalized)) {
    throw new Error("กรุณากรอกอีเมลให้ถูกต้อง");
  }
  return normalized;
}

function requireDomain(domain: string) {
  const normalized = normalizeDomain(domain);
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(normalized)) {
    throw new Error("กรุณากรอกโดเมน เช่น example.ac.th");
  }
  return normalized;
}

function timestampLabel(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(value.toDate());
  }
  return "—";
}

function toEntry(id: string, data: Record<string, unknown>): AccessEntry {
  return {
    id,
    label: String(data.email ?? data.domain ?? id),
    name: String(data.displayName ?? ""),
    authMethod: data.authMethod === "password" ? "password" : data.authMethod === "google" ? "google" : undefined,
    createdBy: String(data.createdBy ?? "—"),
    createdAt: timestampLabel(data.createdAt),
    role: data.role === "admin" ? "admin" : "user",
    protected: false,
  };
}

function withSuperAdmins(entries: AccessEntry[]) {
  const byEmail = new Map(entries.map((entry) => [normalizeEmail(entry.id), entry]));
  const protectedEntries: AccessEntry[] = SUPER_ADMIN_EMAILS.map((email) => {
    const stored = byEmail.get(email);
    byEmail.delete(email);
    return {
      id: email,
      label: email,
      name: stored?.name ?? "",
      createdBy: stored?.createdBy ?? "กำหนดโดยระบบ",
      createdAt: stored?.createdAt ?? "ถาวร",
      role: "superadmin",
      protected: true,
    };
  });
  return [...protectedEntries, ...byEmail.values()];
}

export async function getDashboardAccess(user: User): Promise<DashboardAccess> {
  const email = normalizeEmail(user.email ?? "");
  const domain = domainFromEmail(email);
  if (!email || !domain) {
    return { role: "none", superadmin: false, admin: false, member: false, domain: false, emailVerified: false };
  }

  // Firestore Rules only allow users to read the policy documents that match
  // their own verified email/domain. The UI check mirrors, but never replaces, Rules.
  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อ Firestore เพื่อตรวจสอบสิทธิ์ได้");
  const { doc, getDoc } = await import("firebase/firestore");
  const [admin, member, allowedDomain] = await Promise.all([
    getDoc(doc(db, "dashboard_admins", email)),
    getDoc(doc(db, "dashboard_members", email)),
    getDoc(doc(db, "dashboard_domains", domain)),
  ]);

  const superadmin = user.emailVerified && isSuperAdminEmail(email);
  const hasAdminPolicy = admin.exists() && admin.data().active === true && admin.data().role === "admin";
  const hasMemberPolicy = member.exists() && member.data().active === true;
  const hasDomainPolicy = allowedDomain.exists() && allowedDomain.data().active === true;
  const role: SystemRole = superadmin ? "superadmin" : hasAdminPolicy ? "admin" : hasMemberPolicy || hasDomainPolicy ? "user" : "none";

  return {
    role,
    superadmin,
    admin: superadmin || hasAdminPolicy,
    member: hasMemberPolicy,
    domain: hasDomainPolicy,
    emailVerified: user.emailVerified,
  };
}

export async function subscribeAccessDirectory(
  onValue: (directory: AccessDirectory) => void,
  onError: (error: unknown) => void,
) {
  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อ Firestore ได้");
  const { collection, onSnapshot } = await import("firebase/firestore");
  const directory: AccessDirectory = { admins: [], members: [], domains: [] };
  const loaded = new Set<keyof AccessDirectory>();

  function emit(key: keyof AccessDirectory, entries: AccessEntry[]) {
    directory[key] = entries.toSorted((a, b) => a.label.localeCompare(b.label, "th"));
    loaded.add(key);
    if (loaded.size === 3) onValue({ ...directory });
  }

  const unsubscribers = [
    onSnapshot(collection(db, "dashboard_admins"), (snapshot) => {
      emit("admins", withSuperAdmins(snapshot.docs.map((item) => toEntry(item.id, item.data()))));
    }, onError),
    onSnapshot(collection(db, "dashboard_members"), (snapshot) => {
      emit("members", snapshot.docs.map((item) => toEntry(item.id, item.data())));
    }, onError),
    onSnapshot(collection(db, "dashboard_domains"), (snapshot) => {
      emit("domains", snapshot.docs.map((item) => toEntry(item.id, item.data())));
    }, onError),
  ];

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

async function auditIdentity() {
  const auth = await getFirebaseAuth();
  const user = auth?.currentUser;
  if (!user?.email) throw new Error("ไม่พบผู้ดูแลที่เข้าสู่ระบบ");
  return normalizeEmail(user.email);
}

async function writeAccessEntry(collectionName: AccessCollection, id: string, payload: Record<string, unknown>) {
  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อ Firestore ได้");
  const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
  await setDoc(doc(db, collectionName, id), {
    schemaVersion: 1,
    ...payload,
    active: true,
    createdAt: serverTimestamp(),
    createdBy: await auditIdentity(),
  });
}

export async function addAdmin(email: string, displayName: string) {
  const normalized = requireEmail(email);
  if (isSuperAdminEmail(normalized)) throw new Error("บัญชีนี้เป็น Superadmin แบบถาวรอยู่แล้ว");
  await writeAccessEntry("dashboard_admins", normalized, {
    email: normalized,
    displayName: displayName.trim(),
    role: "admin",
  });
}

export async function addGoogleMember(email: string, displayName: string) {
  const normalized = requireEmail(email);
  await writeAccessEntry("dashboard_members", normalized, {
    email: normalized,
    displayName: displayName.trim(),
    authMethod: "google",
  });
}

export async function addAllowedDomain(domain: string) {
  const normalized = requireDomain(domain);
  await writeAccessEntry("dashboard_domains", normalized, { domain: normalized });
}

export async function removeAccessEntry(collectionName: AccessCollection, id: string) {
  if (collectionName === "dashboard_admins" && isSuperAdminEmail(id)) {
    throw new Error("ไม่สามารถลบหรือลดสิทธิ์ Superadmin ได้");
  }
  const db = await getFirebaseDb();
  if (!db) throw new Error("ไม่สามารถเชื่อมต่อ Firestore ได้");
  const { deleteDoc, doc } = await import("firebase/firestore");
  await deleteDoc(doc(db, collectionName, id));
}

export async function createPasswordMember(email: string, password: string, displayName: string) {
  const normalized = requireEmail(email);
  if (password.length < 8) throw new Error("รหัสผ่านเริ่มต้นต้องมีอย่างน้อย 8 ตัวอักษร");
  const options = getFirebaseClientOptions();
  if (!options) throw new Error("Firebase ยังตั้งค่าไม่ครบ");

  const { deleteApp, initializeApp } = await import("firebase/app");
  const {
    connectAuthEmulator,
    createUserWithEmailAndPassword,
    deleteUser,
    getAuth,
    sendEmailVerification,
    signOut,
    updateProfile,
  } = await import("firebase/auth");
  const secondaryApp = initializeApp(options, `tcc-user-provision-${crypto.randomUUID()}`);
  const secondaryAuth = getAuth(secondaryApp);
  if ((import.meta as ImportMeta & { env?: { VITE_FIREBASE_USE_EMULATORS?: string } }).env?.VITE_FIREBASE_USE_EMULATORS === "true") {
    connectAuthEmulator(secondaryAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  }

  let createdUser: User | null = null;
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, normalized, password);
    createdUser = credential.user;
    if (displayName.trim()) await updateProfile(createdUser, { displayName: displayName.trim() });
    await sendEmailVerification(createdUser);
    await writeAccessEntry("dashboard_members", normalized, {
      email: normalized,
      displayName: displayName.trim(),
      authMethod: "password",
    });
    await signOut(secondaryAuth);
    return credential.user.uid;
  } catch (error) {
    // If policy creation fails, remove the freshly created Auth account so the
    // administrator can retry without leaving an orphan account.
    if (createdUser) await deleteUser(createdUser).catch(() => undefined);
    throw error;
  } finally {
    await deleteApp(secondaryApp);
  }
}
