import fs from "fs";
import path from "path";
import { buildSeed } from "./seed";
import { ENTITIES, entityKeys, type CollectionKey, type Rec } from "./schema";

export type Subscription = { plan: string; price: number; cycle: "Monthly" | "Yearly"; status: string; startedAt: string; nextBilling: string };
export type Crud = { c: boolean; r: boolean; u: boolean; d: boolean };

export type DbState = {
  version: number;
  collections: Record<CollectionKey, Rec[]>;
  seq: Record<string, number>;
  settings: Record<string, Record<string, unknown>>;
  subscription: Subscription;
  permissions: Record<string, Record<string, Crud>>;
  sessions: { id: string; device: string; location: string; ip: string; lastActive: string; current?: boolean }[];
  currentUserId: string | null;
};

export type Backup = { id: string; name: string; kind: "Manual" | "Automatic" | "Before restore"; createdAt: string; size: number; records: number; data: string };

const VERSION = 2;
export const DEMO_WS = "demo";

/* ---------------------------------------------------- Cloud KV (Vercel KV / Upstash) */

function getCloudConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url, token };
  return null;
}

export function isCloudStorage(): boolean {
  return !!getCloudConfig();
}

async function cloudRedis(cmd: (string | number)[]): Promise<any> {
  const config = getCloudConfig();
  if (!config) return null;
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmd),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[CloudKV] HTTP ${res.status}: ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    return data.result;
  } catch (err) {
    console.error("[CloudKV] Fetch error:", err);
    return null;
  }
}

async function cloudGet<T>(key: string): Promise<T | null> {
  const result = await cloudRedis(["GET", key]);
  if (!result) return null;
  if (typeof result === "object") return result as T;
  try {
    return JSON.parse(result) as T;
  } catch {
    return result as T;
  }
}

async function cloudSet(key: string, value: unknown): Promise<boolean> {
  const res = await cloudRedis(["SET", key, JSON.stringify(value)]);
  return res === "OK";
}

async function cloudDel(key: string): Promise<boolean> {
  const res = await cloudRedis(["DEL", key]);
  return !!res;
}

/* ------------------------------------------------ Local File Storage (/data) */

const DATA_DIR = path.join(process.cwd(), "data");
const WORKSPACES_DIR = path.join(DATA_DIR, "workspaces");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");
const KEYS_DIR = path.join(DATA_DIR, "keys");

const DIRECTORY_FILE = path.join(DATA_DIR, "directory.json");

function ensureDirs() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(WORKSPACES_DIR)) fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });
  } catch (err) {
    // Read-only filesystem on Vercel without cloud KV
    console.warn("[ProjectStorage] Read-only filesystem:", err);
  }
}

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    return null;
  }
}

function safeWriteJson(filePath: string, data: unknown): boolean {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.warn(`[ProjectStorage] Warning writing ${filePath}:`, err);
    return false;
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
const emailKey = (email: unknown) => String(email ?? "").trim().toLowerCase();

function defaultPermissions(roles: Rec[]): DbState["permissions"] {
  const all: Crud = { c: true, r: true, u: true, d: true };
  const view: Crud = { c: false, r: true, u: false, d: false };
  const none: Crud = { c: false, r: false, u: false, d: false };
  const edit: Crud = { c: true, r: true, u: true, d: false };
  const scope: Record<string, number[]> = {
    "Fleet Manager": [2, 3, 4, 5, 8, 9, 10, 15],
    "Operations Manager": [2, 4, 5, 6, 7, 8, 12, 18],
    Dispatcher: [5, 6, 8, 18],
    Driver: [5, 9],
    "Maintenance Manager": [3, 10, 15],
    Storekeeper: [10],
    "Finance / Accountant": [2, 9, 11, 12, 13, 14],
    "Customer Service": [6, 7, 12],
  };
  const out: DbState["permissions"] = {};
  for (const role of roles) {
    const name = String(role.name);
    out[role.id] = {};
    for (let m = 2; m <= 20; m++) {
      if (name === "Super Admin") out[role.id]![m] = all;
      else if (name === "Management Viewer" || name === "Auditor") out[role.id]![m] = m >= 17 && name !== "Auditor" ? none : view;
      else out[role.id]![m] = scope[name]?.includes(m) ? edit : m === 2 || m === 18 ? view : none;
    }
  }
  return out;
}

export function freshState(): DbState {
  const { collections, seq } = buildSeed();
  const start = addDays(today(), -48);
  return {
    version: VERSION,
    collections,
    seq,
    settings: {},
    subscription: { plan: "Business", price: 4999, cycle: "Monthly", status: "Active", startedAt: start, nextBilling: addDays(today(), 12) },
    permissions: defaultPermissions(collections.roles),
    sessions: [
      { id: "S1", device: "Chrome on Windows 11", location: "Dhaka, Bangladesh", ip: "103.48.16.21", lastActive: nowIso(), current: true },
      { id: "S2", device: "Tranzora Android app", location: "Chattogram, Bangladesh", ip: "103.92.84.7", lastActive: new Date(Date.now() - 3 * 3600000).toISOString() },
      { id: "S3", device: "Safari on iPhone", location: "Gazipur, Bangladesh", ip: "27.147.200.4", lastActive: new Date(Date.now() - 26 * 3600000).toISOString() },
      { id: "S4", device: "Edge on Windows 10", location: "Bogura, Bangladesh", ip: "114.130.5.62", lastActive: new Date(Date.now() - 4 * 86400000).toISOString() },
    ],
    currentUserId: collections.users[0]?.id ?? null,
  };
}

export function emptyState(): DbState {
  return {
    version: VERSION,
    collections: Object.fromEntries(entityKeys.map((k) => [k, []])) as unknown as DbState["collections"],
    seq: {},
    settings: {},
    subscription: { plan: "Starter", price: 0, cycle: "Monthly", status: "Trial", startedAt: today(), nextBilling: addDays(today(), 14) },
    permissions: {},
    sessions: [],
    currentUserId: null,
  };
}

export function newWorkspaceState(admin: { name: string; email: string; password: string; company?: string }): DbState {
  const seed = buildSeed().collections;
  const db = emptyState();
  const at = nowIso();
  db.collections.roles = seed.roles;
  db.collections.expenseCategories = seed.expenseCategories;
  db.collections.paymentMethods = [
    ["Cash", "Cash"],
    ["bKash", "Mobile Banking"],
    ["Nagad", "Mobile Banking"],
    ["Bank transfer", "Bank"],
    ["Cheque", "Cheque"],
  ].map(([name, type], i) => {
    const id = `${ENTITIES.paymentMethods.idPrefix}-${String(i + 1).padStart(4, "0")}`;
    return { id, code: id, createdAt: at, updatedAt: at, name, type, account: "", status: "Enabled" };
  });
  const role = seed.roles.find((r) => r.name === "Super Admin");
  const userId = `${ENTITIES.users.idPrefix}-0001`;
  db.collections.users = [{ id: userId, code: userId, createdAt: at, updatedAt: at, name: admin.name, email: admin.email.trim(), phone: "", roleId: role?.id, branch: "Head office", password: admin.password, lastLogin: at, status: "Active" }];
  db.seq = { roles: seed.roles.length, expenseCategories: seed.expenseCategories.length, paymentMethods: db.collections.paymentMethods.length, users: 1 };
  const company = { name: admin.company?.trim() || `${admin.name}'s company`, email: admin.email.trim(), address: "", phone: "", tradeLicense: "", bin: "", bank: "", bkash: "", branches: "Head office" };
  db.settings = { company, gateway: { fromEmail: admin.email.trim() }, notifications: { recipients: admin.email.trim() } };
  db.permissions = defaultPermissions(seed.roles);
  db.sessions = [{ id: "S1", device: "This browser", location: "—", ip: "—", lastActive: at, current: true }];
  db.currentUserId = userId;
  return db;
}

export async function initProjectStorage() {
  if (isCloudStorage()) {
    const dir = await cloudGet<Record<string, string>>("tranzora:directory");
    if (!dir) {
      await cloudSet("tranzora:directory", { "admin@tranzora.com": DEMO_WS });
    }
    const demo = await cloudGet<DbState>(`tranzora:ws:${DEMO_WS}:db`);
    if (!demo) {
      await cloudSet(`tranzora:ws:${DEMO_WS}:db`, freshState());
    }
    return;
  }

  ensureDirs();
  const demoFile = path.join(WORKSPACES_DIR, `${DEMO_WS}.json`);
  if (!fs.existsSync(demoFile)) {
    const demo = freshState();
    safeWriteJson(demoFile, demo);
  }

  if (!fs.existsSync(DIRECTORY_FILE)) {
    const dir: Record<string, string> = { "admin@tranzora.com": DEMO_WS };
    safeWriteJson(DIRECTORY_FILE, dir);
  }

  const demoBackupFile = path.join(BACKUPS_DIR, `${DEMO_WS}.json`);
  if (!fs.existsSync(demoBackupFile)) {
    safeWriteJson(demoBackupFile, []);
  }
}

export async function readDirectory(): Promise<Record<string, string>> {
  if (isCloudStorage()) {
    const dir = await cloudGet<Record<string, string>>("tranzora:directory");
    return dir ?? { "admin@tranzora.com": DEMO_WS };
  }
  await initProjectStorage();
  return safeReadJson<Record<string, string>>(DIRECTORY_FILE) ?? { "admin@tranzora.com": DEMO_WS };
}

export async function writeDirectory(dir: Record<string, string>): Promise<boolean> {
  if (isCloudStorage()) {
    return cloudSet("tranzora:directory", dir);
  }
  await initProjectStorage();
  return safeWriteJson(DIRECTORY_FILE, dir);
}

export async function readWorkspace(ws: string): Promise<DbState | null> {
  if (isCloudStorage()) {
    let parsed = await cloudGet<DbState>(`tranzora:ws:${ws}:db`);
    if (!parsed && ws === DEMO_WS) {
      parsed = freshState();
      await cloudSet(`tranzora:ws:${DEMO_WS}:db`, parsed);
    }
    if (!parsed || parsed.version !== VERSION || !parsed.collections) return null;
    for (const key of entityKeys) parsed.collections[key] ??= [];
    return parsed;
  }

  await initProjectStorage();
  const file = path.join(WORKSPACES_DIR, `${ws}.json`);
  let parsed = safeReadJson<DbState>(file);
  if (!parsed && ws === DEMO_WS) {
    parsed = freshState();
    safeWriteJson(file, parsed);
  }
  if (!parsed || parsed.version !== VERSION || !parsed.collections) return null;
  for (const key of entityKeys) parsed.collections[key] ??= [];
  return parsed;
}

export async function writeWorkspace(ws: string, state: DbState): Promise<boolean> {
  if (isCloudStorage()) {
    return cloudSet(`tranzora:ws:${ws}:db`, state);
  }
  await initProjectStorage();
  const file = path.join(WORKSPACES_DIR, `${ws}.json`);
  return safeWriteJson(file, state);
}

export async function readBackups(ws: string): Promise<Backup[]> {
  if (isCloudStorage()) {
    return (await cloudGet<Backup[]>(`tranzora:ws:${ws}:backups`)) ?? [];
  }
  await initProjectStorage();
  const file = path.join(BACKUPS_DIR, `${ws}.json`);
  return safeReadJson<Backup[]>(file) ?? [];
}

export async function writeBackups(ws: string, backups: Backup[]): Promise<boolean> {
  if (isCloudStorage()) {
    return cloudSet(`tranzora:ws:${ws}:backups`, backups);
  }
  await initProjectStorage();
  const file = path.join(BACKUPS_DIR, `${ws}.json`);
  return safeWriteJson(file, backups);
}

/* ------------------------------------------------ Central Authentication (Multi-Device) */

export async function serverLogin(email: string, password: string) {
  const dir = await readDirectory();
  const ws = dir[emailKey(email)];
  if (!ws) throw new Error("No account found for this email address");

  const db = await readWorkspace(ws);
  if (!db) throw new Error("Workspace data could not be found");

  const user = db.collections.users.find((u) => emailKey(u.email) === emailKey(email));
  if (!user || String(user.password) !== password) {
    throw new Error("Email or password is incorrect");
  }

  if (user.status !== "Active") {
    throw new Error(`This account is ${String(user.status).toLowerCase()} — contact your administrator`);
  }

  // Update last login
  user.lastLogin = nowIso();
  if (!db.collections.auditLogs) db.collections.auditLogs = [];
  db.collections.auditLogs.unshift({
    id: `LOG-${Date.now()}`,
    code: `LOG-${Date.now()}`,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    action: "Login",
    module: "Authentication",
    details: `${user.name} signed in`,
    level: "Info",
    userId: user.id,
  });
  db.currentUserId = user.id;

  await writeWorkspace(ws, db);

  return {
    user,
    workspace: ws,
    db,
  };
}

export async function serverRegister(data: { name: string; email: string; password: string; company?: string }) {
  if (!data.email || !data.email.trim()) throw new Error("Email is required");
  if (!data.password || data.password.length < 6) throw new Error("Password must be at least 6 characters");

  const dir = await readDirectory();
  if (dir[emailKey(data.email)]) {
    throw new Error("An account with this email already exists — sign in instead");
  }

  const ws = `ws${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const db = newWorkspaceState(data);

  await writeWorkspace(ws, db);
  dir[emailKey(data.email)] = ws;
  await writeDirectory(dir);

  return {
    user: db.collections.users[0],
    workspace: ws,
    db,
  };
}
