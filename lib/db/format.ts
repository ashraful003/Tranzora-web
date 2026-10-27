import { ENTITIES, type CollectionKey, type Field, type Rec } from "./schema";
import { refLabel } from "./store";

export const money = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? `৳ ${Math.round(n).toLocaleString("en-IN")}` : "—";
};

export const compactMoney = (n: number) =>
  n >= 10000000 ? `৳ ${(n / 10000000).toFixed(2)} Cr` : n >= 100000 ? `৳ ${(n / 100000).toFixed(2)} L` : n >= 1000 ? `৳ ${(n / 1000).toFixed(1)}k` : `৳ ${Math.round(n)}`;

export const date = (v: unknown) => {
  if (!v || typeof v !== "string") return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const dateTime = (v: unknown) => {
  if (!v || typeof v !== "string") return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const ago = (v: unknown) => {
  if (!v || typeof v !== "string") return "";
  const s = Math.round((Date.now() - Date.parse(v)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return date(v);
};

export const initials = (name: unknown) =>
  String(name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

const SYSTEM_LABELS: Record<string, string> = { code: "ID", createdAt: "Created", updatedAt: "Updated" };

export function fieldOf(key: CollectionKey, name: string): Field {
  return ENTITIES[key].fields.find((f) => f.key === name) ?? { key: name, label: SYSTEM_LABELS[name] ?? name, type: name.endsWith("At") ? "datetime" : "text" };
}

/** Display text for any field value (refs resolved, money/dates formatted). */
export function display(key: CollectionKey, name: string, rec: Rec): string {
  const f = fieldOf(key, name);
  const v = rec[name];
  if (v === undefined || v === null || v === "") return "—";
  switch (f.type) {
    case "money":
      return money(v);
    case "date":
      return date(v);
    case "datetime":
      return dateTime(v);
    case "ref":
      return refLabel(f.ref!, v);
    case "number":
      // Years are labels, not quantities: 2017, not "2,017".
      return typeof v === "number" && !/year/i.test(name) ? v.toLocaleString("en-IN") : String(v);
    default:
      return name === "password" ? "••••••••" : String(v);
  }
}

/** Plain value for sorting and CSV export. */
export function sortValue(key: CollectionKey, name: string, rec: Rec): string | number {
  const f = fieldOf(key, name);
  const v = rec[name];
  if (f.type === "money" || f.type === "number") return typeof v === "number" ? v : parseFloat(String(v ?? "")) || 0;
  if (f.type === "ref") return refLabel(f.ref!, v).toLowerCase();
  return String(v ?? "").toLowerCase();
}

export function toCsv(headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

export function downloadFile(name: string, content: string | Blob, type = "text/plain") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportRecordsCsv(key: CollectionKey, rows: Rec[], columns: string[], fileName?: string) {
  const headers = columns.map((c) => fieldOf(key, c).label);
  const body = rows.map((r) => columns.map((c) => display(key, c, r)));
  downloadFile(fileName ?? `${key}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, body), "text/csv");
}

export const statusClass = (s: unknown) => `status status-${String(s ?? "").toLowerCase().replace(/[^a-z]+/g, "-")}`;
