"use client";

import { useSyncExternalStore } from "react";
import { docStatus, ENTITIES, entityKeys, type CollectionKey, type Rec } from "./schema";
import { buildSeed } from "./seed";

/**
 * Browser-only data store. The whole workspace (records, settings, profile, subscription,
 * permissions) lives in localStorage under one key; components read it through `useDb()` and
 * change it only through the functions exported here, so every write is logged, derived fields
 * stay consistent and all open screens re-render.
 */

const KEY = "tranzora_db_v2";
const BACKUP_KEY = "tranzora_backups_v1";
const SESSION_KEY = "tranzora_logged_in";
const VERSION = 2;

export type Access = "full" | "view" | "none";
export type Crud = { c: boolean; r: boolean; u: boolean; d: boolean };

export type Subscription = { plan: string; price: number; cycle: "Monthly" | "Yearly"; status: string; startedAt: string; nextBilling: string };

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

/* ------------------------------------------------------------------ state */

let state: DbState | null = null;
let backups: Backup[] | null = null;
const listeners = new Set<() => void>();

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);

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

function freshState(): DbState {
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

function load(): DbState {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DbState;
      if (parsed.version === VERSION && parsed.collections) {
        // Collections added after the data was first saved start empty instead of crashing.
        for (const key of entityKeys) parsed.collections[key] ??= [];
        state = parsed;
        return state;
      }
    }
  } catch {
    /* corrupt or blocked storage: fall back to demo data */
  }
  state = freshState();
  persist();
  return state;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded or storage blocked: keep working in memory */
  }
}

function commit(next: DbState) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      state = null;
      listener();
    } else if (e.key === BACKUP_KEY) {
      backups = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Current store, or null during server rendering (render a loading state then). */
export function useDb(): DbState | null {
  return useSyncExternalStore(subscribe, load, () => null);
}

export function getDb(): DbState {
  return load();
}

/* ---------------------------------------------------------------- queries */

export function list(key: CollectionKey): Rec[] {
  return load().collections[key] ?? [];
}

export function getRecord(key: CollectionKey, id: string | undefined | null): Rec | undefined {
  if (!id) return undefined;
  return list(key).find((r) => r.id === id);
}

/** Human-readable name of a record, used in ref cells, selects and titles. */
export function recordLabel(key: CollectionKey, rec: Rec | undefined): string {
  if (!rec) return "—";
  const def = ENTITIES[key];
  const title = String(rec[def.titleField] ?? rec.code ?? rec.id);
  switch (key) {
    case "trips": {
      const route = getRecord("routes", rec.routeId as string);
      return route ? `${title} · ${route.name}` : title;
    }
    case "invoices":
    case "bookings":
    case "payments": {
      const c = getRecord("customers", rec.customerId as string);
      return c ? `${title} · ${c.name}` : title;
    }
    default:
      return title;
  }
}

export function refLabel(key: CollectionKey, id: unknown): string {
  return typeof id === "string" && id ? recordLabel(key, getRecord(key, id)) : "—";
}

export function currentUser(): Rec | undefined {
  const db = load();
  return getRecord("users", db.currentUserId);
}

export function actorName() {
  return String(currentUser()?.name ?? "System");
}

/* ------------------------------------------------------- derived fields */

function num(v: unknown) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function derive(key: CollectionKey, rec: Rec): Rec {
  const r = { ...rec };
  if (key === "fuel") r.amount = Math.round(num(r.litres) * num(r.rate));
  if (key === "maintenance") r.cost = num(r.partsCost) + num(r.labourCost);
  if (key === "settlements") r.balance = num(r.advance) - num(r.actualExpense);
  if (key === "documents") r.status = docStatus(r.expiryDate);
  if (key === "invoices") {
    r.total = Math.round((num(r.freight) + num(r.extraCharges) - num(r.discount)) * (1 + num(r.vatPct) / 100));
    r.paid = num(r.paid);
  }
  if (key === "trips" && r.routeId && !r.distanceKm) r.distanceKm = getRecord("routes", r.routeId as string)?.distanceKm;
  return r;
}

/* ------------------------------------------------------------- mutations */

type Draft = Record<string, unknown>;

function nextCode(db: DbState, key: CollectionKey) {
  const n = (db.seq[key] ?? db.collections[key].length) + 1;
  db.seq[key] = n;
  return `${ENTITIES[key].idPrefix}-${String(n).padStart(4, "0")}`;
}

function clone(db: DbState): DbState {
  return { ...db, collections: { ...db.collections }, seq: { ...db.seq } };
}

function pushLog(db: DbState, action: string, module: string, message: string, level = "Info", recordRef = "") {
  const id = nextCode(db, "auditLogs");
  const at = nowIso();
  const entry: Rec = { id, code: id, createdAt: at, updatedAt: at, action, module, message, user: actorName(), level, recordRef, ip: "127.0.0.1" };
  db.collections.auditLogs = [entry, ...db.collections.auditLogs].slice(0, 400);
}

function pushNotice(db: DbState, title: string, body: string, category: string, severity: string, entity?: CollectionKey, recordId?: string) {
  const id = nextCode(db, "notifications");
  const at = nowIso();
  db.collections.notifications = [{ id, code: id, createdAt: at, updatedAt: at, title, body, category, severity, entity, recordId, read: false }, ...db.collections.notifications].slice(0, 300);
}

function setIn(db: DbState, key: CollectionKey, id: string, patch: Draft) {
  db.collections[key] = db.collections[key].map((r) => (r.id === id ? derive(key, { ...r, ...patch, updatedAt: nowIso() }) : r));
}

/** Keeps linked records in step: invoice balances, vehicle/driver availability, booking state. */
function cascade(db: DbState, key: CollectionKey, rec: Rec, before?: Rec) {
  if (key === "payments" && rec.invoiceId) recalcInvoice(db, String(rec.invoiceId));
  if (key === "payments" && before?.invoiceId && before.invoiceId !== rec.invoiceId) recalcInvoice(db, String(before.invoiceId));

  if (key === "trips") {
    const status = String(rec.status);
    const busy = ["Dispatched", "In Progress"].includes(status);
    const done = ["Completed", "Cancelled"].includes(status);
    if (busy || done) {
      if (rec.vehicleId) setIn(db, "vehicles", String(rec.vehicleId), { status: busy ? "On Trip" : "Available" });
      if (rec.driverId) setIn(db, "drivers", String(rec.driverId), { status: busy ? "On Trip" : "Available" });
    }
    if (rec.bookingId) {
      const booking = db.collections.bookings.find((b) => b.id === rec.bookingId);
      if (booking && !["Completed", "Cancelled"].includes(String(booking.status))) setIn(db, "bookings", booking.id, { status: status === "Completed" ? "Completed" : "Assigned" });
    }
    if (status === "Completed" && before?.status !== "Completed") pushNotice(db, `Trip ${rec.code} completed`, `Delivered to ${rec.dropoff}. Verify POD and raise the invoice.`, "Trip", "Success", "trips", rec.id);
    if (status === "Dispatched" && before?.status !== "Dispatched") pushNotice(db, `Trip ${rec.code} dispatched`, `${refLabel("vehicles", rec.vehicleId)} left ${rec.pickup}`, "Trip", "Info", "trips", rec.id);
  }
  if (key === "maintenance") {
    const status = String(rec.status);
    if (status === "In Progress") setIn(db, "vehicles", String(rec.vehicleId), { status: "Maintenance" });
    if (status === "Completed" && before?.status !== "Completed") {
      setIn(db, "vehicles", String(rec.vehicleId), { status: "Available" });
      if (!rec.completedDate) setIn(db, "maintenance", rec.id, { completedDate: today() });
    }
  }
}

function recalcInvoice(db: DbState, invoiceId: string) {
  const inv = db.collections.invoices.find((i) => i.id === invoiceId);
  if (!inv) return;
  const paid = db.collections.payments.filter((p) => p.invoiceId === invoiceId && p.status === "Cleared").reduce((s, p) => s + num(p.amount), 0);
  const total = num(inv.total);
  let status = String(inv.status);
  if (paid >= total && total > 0) status = "Paid";
  else if (paid > 0) status = "Partially Paid";
  else if (status === "Paid" || status === "Partially Paid") status = "Sent";
  setIn(db, "invoices", invoiceId, { paid, status });
}

function validate(key: CollectionKey, data: Draft): string | null {
  for (const f of ENTITIES[key].fields) {
    if (f.readOnly || !f.required) continue;
    const v = data[f.key];
    if (v === undefined || v === null || String(v).trim() === "") return `${f.label} is required`;
  }
  if (key === "users") {
    const email = String(data.email ?? "").toLowerCase();
    if (list("users").some((u) => u.id !== data.id && String(u.email).toLowerCase() === email)) return "Another user already uses this email";
  }
  return null;
}

export class StoreError extends Error {}

export function createRecord(key: CollectionKey, data: Draft, opts: { silent?: boolean } = {}): Rec {
  const err = validate(key, data);
  if (err) throw new StoreError(err);
  const db = clone(load());
  const code = nextCode(db, key);
  const at = nowIso();
  const rec = derive(key, { ...data, id: code, code, createdAt: at, updatedAt: at });
  db.collections[key] = [rec, ...db.collections[key]];
  cascade(db, key, rec);
  if (!opts.silent) {
    pushLog(db, "Create", ENTITIES[key].label, `${ENTITIES[key].singular} ${recordLabel(key, rec)} created`, "Info", `${key}/${rec.id}`);
    if (key === "bookings") pushNotice(db, "New booking received", `${code} from ${refLabel("customers", rec.customerId)}`, "Trip", "Info", key, rec.id);
    if (key === "payments") pushNotice(db, "Payment received", `৳ ${num(rec.amount).toLocaleString("en-IN")} from ${refLabel("customers", rec.customerId)}`, "Payment", "Success", key, rec.id);
    if (key === "maintenance") pushNotice(db, "Maintenance request raised", `${code} · ${rec.serviceType} for ${refLabel("vehicles", rec.vehicleId)}`, "Maintenance", "Warning", key, rec.id);
    if (key === "expenses") pushNotice(db, "Expense awaiting approval", `${code} — ${rec.description}`, "Approval", "Info", key, rec.id);
  }
  commit(db);
  return rec;
}

export function updateRecord(key: CollectionKey, id: string, patch: Draft, action = "Update"): Rec {
  const db = clone(load());
  const before = db.collections[key].find((r) => r.id === id);
  if (!before) throw new StoreError("Record not found — it may have been deleted");
  const merged = { ...before, ...patch, id };
  const err = validate(key, merged);
  if (err) throw new StoreError(err);
  setIn(db, key, id, patch);
  const rec = db.collections[key].find((r) => r.id === id)!;
  cascade(db, key, rec, before);
  const def = ENTITIES[key];
  const statusMsg = def.statusField && patch[def.statusField] !== undefined && patch[def.statusField] !== before[def.statusField] ? `: ${before[def.statusField]} → ${patch[def.statusField]}` : "";
  pushLog(db, statusMsg ? "Status change" : action, def.label, `${def.singular} ${recordLabel(key, rec)} ${statusMsg ? "status changed" + statusMsg : "updated"}`, "Info", `${key}/${id}`);
  commit(db);
  return rec;
}

export function setStatus(key: CollectionKey, id: string, status: string) {
  const field = ENTITIES[key].statusField ?? "status";
  return updateRecord(key, id, { [field]: status });
}

export function deleteRecord(key: CollectionKey, id: string) {
  const db = clone(load());
  const rec = db.collections[key].find((r) => r.id === id);
  if (!rec) return;
  db.collections[key] = db.collections[key].filter((r) => r.id !== id);
  if (key === "payments" && rec.invoiceId) recalcInvoice(db, String(rec.invoiceId));
  pushLog(db, "Delete", ENTITIES[key].label, `${ENTITIES[key].singular} ${recordLabel(key, rec)} deleted`, "Warning", `${key}/${id}`);
  commit(db);
}

export function deleteMany(key: CollectionKey, ids: string[]) {
  const db = clone(load());
  const set = new Set(ids);
  db.collections[key] = db.collections[key].filter((r) => !set.has(r.id));
  pushLog(db, "Delete", ENTITIES[key].label, `${ids.length} ${ENTITIES[key].label.toLowerCase()} deleted`, "Warning");
  commit(db);
}

export function duplicateRecord(key: CollectionKey, id: string): Rec {
  const src = getRecord(key, id);
  if (!src) throw new StoreError("Record not found");
  const { id: _id, code: _code, createdAt: _c, updatedAt: _u, ...rest } = src;
  void _id;
  void _code;
  void _c;
  void _u;
  const copy: Draft = { ...rest };
  const def = ENTITIES[key];
  if (def.titleField !== "code" && typeof copy[def.titleField] === "string") copy[def.titleField] = `${copy[def.titleField]} (copy)`;
  if (def.statuses?.length && def.statusField && key !== "documents") copy[def.statusField] = def.statuses[0];
  if (key === "users") copy.email = `copy.${Date.now() % 10000}.${copy.email}`;
  return createRecord(key, copy);
}

/* ------------------------------------------------------- notifications */

export function markNotification(id: string, read: boolean) {
  const db = clone(load());
  setIn(db, "notifications", id, { read });
  commit(db);
}

export function markAllNotifications(ids?: string[]) {
  const db = clone(load());
  const set = ids ? new Set(ids) : null;
  db.collections.notifications = db.collections.notifications.map((n) => (!set || set.has(n.id) ? { ...n, read: true } : n));
  commit(db);
}

export function notify(title: string, body: string, category = "System", severity = "Info", entity?: CollectionKey, recordId?: string) {
  const db = clone(load());
  pushNotice(db, title, body, category, severity, entity, recordId);
  commit(db);
}

export function logActivity(action: string, module: string, message: string, level = "Info") {
  const db = clone(load());
  pushLog(db, action, module, message, level);
  commit(db);
}

/* ----------------------------------------------------------- settings */

export function getSettings(section: string, defaults: Record<string, unknown> = {}) {
  return { ...defaults, ...(load().settings[section] ?? {}) };
}

export function saveSettings(section: string, values: Record<string, unknown>, label = section) {
  const db = clone(load());
  db.settings = { ...db.settings, [section]: { ...(db.settings[section] ?? {}), ...values } };
  pushLog(db, "Update", "Settings", `${label} saved`);
  commit(db);
}

export function savePermissions(roleId: string, moduleId: number, crud: Crud) {
  const db = clone(load());
  db.permissions = { ...db.permissions, [roleId]: { ...(db.permissions[roleId] ?? {}), [moduleId]: crud } };
  commit(db);
}

export function seedRolePermissions(roleId: string) {
  const db = clone(load());
  if (db.permissions[roleId]) return;
  const blank: Record<string, Crud> = {};
  for (let m = 2; m <= 20; m++) blank[m] = { c: false, r: m === 2, u: false, d: false };
  db.permissions = { ...db.permissions, [roleId]: blank };
  commit(db);
}

export function logPermissionChange(roleName: string) {
  logActivity("Update", "Permissions", `Permissions updated for role ${roleName}`);
}

export function terminateSession(id: string) {
  const db = clone(load());
  const s = db.sessions.find((x) => x.id === id);
  db.sessions = db.sessions.filter((x) => x.id !== id);
  pushLog(db, "Terminate session", "Security", `Session ended: ${s?.device ?? id}`, "Warning");
  commit(db);
}

export function terminateOtherSessions() {
  const db = clone(load());
  const n = db.sessions.filter((s) => !s.current).length;
  db.sessions = db.sessions.filter((s) => s.current);
  pushLog(db, "Terminate session", "Security", `${n} other sessions signed out`, "Warning");
  commit(db);
}

/* ---------------------------------------------------------- subscription */

export const PLANS = [
  { name: "Starter", monthly: 1999, vehicles: 15, users: 5, features: ["Up to 15 vehicles", "5 staff seats", "Trips, fuel & expense tracking", "Invoices & challans", "Email support"] },
  { name: "Business", monthly: 4999, vehicles: 75, users: 25, features: ["Up to 75 vehicles", "25 staff seats", "Maintenance & document expiry alerts", "Driver settlement & advances", "Reports with CSV export", "Priority support"] },
  { name: "Enterprise", monthly: 9999, vehicles: 250, users: 999, features: ["Up to 250 vehicles", "Unlimited staff seats", "Multi-branch operations", "Role permissions & audit log", "Daily backups", "Dedicated account manager"] },
];

export function changePlan(plan: string, cycle: "Monthly" | "Yearly", method: string, reference = "") {
  const p = PLANS.find((x) => x.name === plan);
  if (!p) throw new StoreError("Unknown plan");
  const amount = cycle === "Yearly" ? p.monthly * 10 : p.monthly;
  const db = clone(load());
  const prev = db.subscription.plan;
  db.subscription = { plan, price: amount, cycle, status: "Active", startedAt: today(), nextBilling: addDays(today(), cycle === "Yearly" ? 365 : 30) };
  const code = nextCode(db, "subscriptionPayments");
  const at = nowIso();
  db.collections.subscriptionPayments = [
    { id: code, code, createdAt: at, updatedAt: at, plan, period: cycle === "Yearly" ? `${new Date().getFullYear()}–${new Date().getFullYear() + 1}` : new Date().toLocaleString("en-GB", { month: "long", year: "numeric" }), date: today(), amount, method, reference, status: "Paid" },
    ...db.collections.subscriptionPayments,
  ];
  pushLog(db, "Subscription", "Subscription", prev === plan ? `${plan} plan renewed (${cycle})` : `Plan changed ${prev} → ${plan} (${cycle})`);
  pushNotice(db, "Subscription payment received", `৳ ${amount.toLocaleString("en-IN")} via ${method} — ${plan} plan active until ${db.subscription.nextBilling}`, "Payment", "Success", "subscriptionPayments", code);
  commit(db);
  return code;
}

export function cancelSubscription() {
  const db = clone(load());
  db.subscription = { ...db.subscription, status: "Cancelled at period end" };
  pushLog(db, "Subscription", "Subscription", "Auto-renewal cancelled", "Warning");
  commit(db);
}

/* ------------------------------------------------------------------ auth */

export function isLoggedIn() {
  try {
    return localStorage.getItem(SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

export function login(email: string, password: string): Rec {
  const user = list("users").find((u) => String(u.email).toLowerCase() === email.trim().toLowerCase());
  if (!user || String(user.password) !== password) {
    logActivity("Failed login", "Authentication", `Failed sign-in attempt for ${email}`, "Warning");
    throw new StoreError("Email or password is incorrect");
  }
  if (user.status !== "Active") throw new StoreError(`This account is ${String(user.status).toLowerCase()} — contact your administrator`);
  const db = clone(load());
  db.currentUserId = user.id;
  setIn(db, "users", user.id, { lastLogin: nowIso() });
  pushLog(db, "Login", "Authentication", `${user.name} signed in`);
  commit(db);
  localStorage.setItem(SESSION_KEY, "true");
  return user;
}

export function registerAccount(data: { name: string; email: string; password: string; company?: string }) {
  const role = list("roles").find((r) => r.name === "Super Admin");
  const user = createRecord("users", { name: data.name, email: data.email, password: data.password, roleId: role?.id, branch: "All branches", phone: "", status: "Active" });
  if (data.company) saveSettings("company", { name: data.company }, "Company profile");
  return login(data.email, data.password);
}

export function userByEmail(email: string) {
  return list("users").find((u) => String(u.email).toLowerCase() === email.trim().toLowerCase());
}

export function resetPassword(email: string, password: string) {
  const user = userByEmail(email);
  if (!user) throw new StoreError("No account found for this email");
  updateRecord("users", user.id, { password }, "Password reset");
}

export function changePassword(current: string, next: string) {
  const user = currentUser();
  if (!user) throw new StoreError("Not signed in");
  if (String(user.password) !== current) throw new StoreError("Current password is incorrect");
  if (next.length < 6) throw new StoreError("New password must be at least 6 characters");
  updateRecord("users", user.id, { password: next }, "Password change");
}

export function logout() {
  try {
    logActivity("Logout", "Authentication", `${actorName()} signed out`);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------- backup / import / reset */

function loadBackups(): Backup[] {
  if (backups) return backups;
  try {
    backups = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "[]") as Backup[];
  } catch {
    backups = [];
  }
  return backups;
}

function saveBackups(next: Backup[]) {
  backups = next;
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(next));
  } catch {
    // Storage is full: drop the oldest snapshot and try once more.
    backups = next.slice(0, -1);
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));
    } catch {
      /* give up silently; the in-memory list still works this session */
    }
  }
  listeners.forEach((l) => l());
}

export function listBackups(): Backup[] {
  return loadBackups();
}

export function useBackups(): Backup[] | null {
  return useSyncExternalStore(subscribe, loadBackups, () => null);
}

export function recordCount(db: DbState = load()) {
  return entityKeys.reduce((s, k) => s + db.collections[k].length, 0);
}

export function createBackup(name: string, kind: Backup["kind"] = "Manual"): Backup {
  const data = JSON.stringify(load());
  const at = nowIso();
  const b: Backup = { id: `BKP-${Date.now()}`, name, kind, createdAt: at, size: data.length, records: recordCount(), data };
  saveBackups([b, ...loadBackups()].slice(0, 8));
  logActivity("Backup", "Backup & Restore", `Snapshot "${name}" created`);
  return b;
}

export function deleteBackup(id: string) {
  saveBackups(loadBackups().filter((b) => b.id !== id));
}

export function restoreBackup(id: string) {
  const b = loadBackups().find((x) => x.id === id);
  if (!b) throw new StoreError("Snapshot not found");
  importJson(b.data, `snapshot "${b.name}"`);
}

export function exportJson() {
  return JSON.stringify(load(), null, 2);
}

export function importJson(text: string, source = "file") {
  let parsed: DbState;
  try {
    parsed = JSON.parse(text) as DbState;
  } catch {
    throw new StoreError("The file is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || !parsed.collections || parsed.version !== VERSION) throw new StoreError("This is not a Tranzora data export");
  for (const key of entityKeys) parsed.collections[key] ??= [];
  const current = load();
  parsed.currentUserId = current.currentUserId && parsed.collections.users.some((u) => u.id === current.currentUserId) ? current.currentUserId : parsed.collections.users[0]?.id ?? null;
  const db = clone(parsed);
  pushLog(db, "Restore", "Backup & Restore", `Data restored from ${source}`, "Warning");
  commit(db);
}

export function resetDemoData() {
  const fresh = freshState();
  pushLog(fresh, "Reset", "Database", "Workspace reset to demo data", "Warning");
  commit(fresh);
}

/** Re-applies computed fields and invoice balances (the "rebuild indexes" tool). */
export function rebuildDerived() {
  const db = clone(load());
  for (const key of entityKeys) db.collections[key] = db.collections[key].map((r) => derive(key, r));
  db.collections.invoices.forEach((i) => recalcInvoice(db, i.id));
  pushLog(db, "Maintenance", "Database", "Computed fields and balances rebuilt");
  commit(db);
}

export function purgeCollection(key: CollectionKey, predicate: (r: Rec) => boolean, label: string) {
  const db = clone(load());
  const before = db.collections[key].length;
  db.collections[key] = db.collections[key].filter((r) => !predicate(r));
  const removed = before - db.collections[key].length;
  pushLog(db, "Maintenance", "Database", `${label}: ${removed} removed`);
  commit(db);
  return removed;
}

/* ----------------------------------------------------------- bulk helpers */

/** Creates one invoice per completed trip that has not been billed yet. */
export function generateBills(tripIds: string[], vatPct: number, dueDays: number) {
  const created: Rec[] = [];
  for (const id of tripIds) {
    const t = getRecord("trips", id);
    if (!t) continue;
    const route = getRecord("routes", t.routeId as string);
    created.push(
      createRecord("invoices", {
        customerId: t.customerId,
        tripId: t.id,
        issueDate: today(),
        dueDate: addDays(today(), dueDays),
        freight: num(t.fare),
        extraCharges: num(route?.toll),
        discount: 0,
        vatPct,
        paid: 0,
        status: "Draft",
        notes: `Freight for ${t.code}`,
      }),
    );
  }
  return created;
}

export { today, addDays, num };
