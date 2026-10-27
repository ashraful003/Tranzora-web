import { compactMoney, date, money } from "./db/format";
import type { CollectionKey, Rec } from "./db/schema";
import { recordLabel, type DbState } from "./db/store";

/** Dashboard and analytics models computed from the local store. */

export type Period = "all" | "month" | "30" | "year";
export type Stat = { label: string; value: string; note?: string; positive?: boolean; href?: string };
export type ListRow = { label: string; sub?: string; value?: string; status?: string; href?: string; date?: string };
export type Panel =
  | { kind: "bars"; title: string; subtitle: string; data: number[]; secondary?: number[]; labels: string[]; money?: boolean; legend?: [string, string] }
  | { kind: "list"; title: string; subtitle: string; rows: ListRow[]; href?: string; empty?: string };
export type Dashboard = {
  stats: Stat[];
  trend: { title: string; subtitle: string; series: number[]; compare?: number[]; labels: string[]; color?: string; legend?: [string, string?] };
  donut: { title: string; subtitle: string; segments: { label: string; value: number }[]; center?: string; caption?: string };
  panels: [Panel, Panel];
};

const n = (v: unknown) => {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : 0;
};

export function inPeriod(value: unknown, period: Period) {
  if (period === "all") return true;
  if (!value || typeof value !== "string") return false;
  const t = Date.parse(value);
  const now = new Date();
  if (period === "30") return t >= Date.now() - 30 * 86400000 && t <= Date.now() + 86400000;
  if (period === "month") return new Date(t).getMonth() === now.getMonth() && new Date(t).getFullYear() === now.getFullYear();
  return new Date(t).getFullYear() === now.getFullYear();
}

export function months(count: number) {
  const out: { key: string; label: string }[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`, label: m.toLocaleString("en-GB", { month: "short" }) });
  }
  return out;
}

export function byMonth(rows: Rec[], dateField: string, value: (r: Rec) => number, count = 6) {
  const ms = months(count);
  const series = ms.map((m) => rows.filter((r) => String(r[dateField] ?? "").startsWith(m.key)).reduce((s, r) => s + value(r), 0));
  return { labels: ms.map((m) => m.label), series, data: series };
}

/** Daily series for the last `days` days (used when a month is too coarse). */
export function byDay(rows: Rec[], dateField: string, value: (r: Rec) => number, days = 14) {
  const labels: string[] = [];
  const series: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    labels.push(new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }));
    series.push(rows.filter((r) => String(r[dateField] ?? "").slice(0, 10) === d).reduce((s, r) => s + value(r), 0));
  }
  return { labels, series };
}

export function countBy(rows: Rec[], field: string | ((r: Rec) => string), top = 6) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = typeof field === "function" ? field(r) : String(r[field] ?? "Other");
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([label, value]) => ({ label, value }));
}

export function sumBy(rows: Rec[], field: string | ((r: Rec) => string), value: (r: Rec) => number, top = 6) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = typeof field === "function" ? field(r) : String(r[field] ?? "Other");
    map.set(k, (map.get(k) ?? 0) + value(r));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([label, v]) => ({ label, value: Math.round(v) }));
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");
const href = (key: CollectionKey, id: string) => `/records/${key}/${id}`;
const lbl = (db: DbState, key: CollectionKey, id: unknown) => recordLabel(key, db.collections[key].find((r) => r.id === id));

/** Shared building blocks for several screens. */
function finance(db: DbState, period: Period) {
  const c = db.collections;
  const incomes = c.incomes.filter((r) => inPeriod(r.date, period));
  const expenses = c.expenses.filter((r) => inPeriod(r.date, period) && r.status !== "Rejected");
  const fuel = c.fuel.filter((r) => inPeriod(r.date, period));
  const maint = c.maintenance.filter((r) => inPeriod(r.scheduledDate, period) && r.status !== "Cancelled");
  const salaries = c.driverPayments.filter((r) => inPeriod(r.date, period) && r.status === "Paid");
  const revenue = incomes.filter((r) => r.status === "Received").reduce((s, r) => s + n(r.amount), 0);
  const cost = expenses.reduce((s, r) => s + n(r.amount), 0) + fuel.reduce((s, r) => s + n(r.amount), 0) + maint.reduce((s, r) => s + n(r.cost), 0) + salaries.reduce((s, r) => s + n(r.amount), 0);
  return { incomes, expenses, fuel, maint, salaries, revenue, cost };
}

function costSeries(db: DbState, count = 6) {
  const c = db.collections;
  const e = byMonth(c.expenses.filter((r) => r.status !== "Rejected"), "date", (r) => n(r.amount), count).series;
  const f = byMonth(c.fuel, "date", (r) => n(r.amount), count).series;
  const m = byMonth(c.maintenance.filter((r) => r.status !== "Cancelled"), "scheduledDate", (r) => n(r.cost), count).series;
  const s = byMonth(c.driverPayments.filter((r) => r.status === "Paid"), "date", (r) => n(r.amount), count).series;
  return e.map((v, i) => v + f[i]! + m[i]! + s[i]!);
}

function tripProfit(db: DbState, t: Rec) {
  const fuel = db.collections.fuel.filter((f) => f.tripId === t.id).reduce((s, r) => s + n(r.amount), 0);
  const exp = db.collections.expenses.filter((e) => e.tripId === t.id && e.status !== "Rejected").reduce((s, r) => s + n(r.amount), 0);
  return { revenue: n(t.fare), cost: fuel + exp, profit: n(t.fare) - fuel - exp };
}

function upcomingMaintenance(db: DbState): ListRow[] {
  return db.collections.maintenance
    .filter((m) => ["Requested", "Scheduled", "In Progress"].includes(String(m.status)))
    .sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)))
    .slice(0, 5)
    .map((m) => ({ label: lbl(db, "vehicles", m.vehicleId), sub: `${m.serviceType} · ${m.workshop ?? ""}`, value: money(m.cost), date: String(m.scheduledDate), href: href("maintenance", m.id), status: String(m.status) }));
}

function recentTrips(db: DbState, filter: (t: Rec) => boolean = () => true): ListRow[] {
  return [...db.collections.trips]
    .filter(filter)
    .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))
    .slice(0, 5)
    .map((t) => ({ label: `${t.code} · ${lbl(db, "routes", t.routeId).replace(/^RTE-\d+ · /, "")}`, sub: `${lbl(db, "drivers", t.driverId)} · ${String(db.collections.vehicles.find((v) => v.id === t.vehicleId)?.regNo ?? "")}`, status: String(t.status), href: href("trips", t.id) }));
}

export function buildOverview(slug: string, db: DbState, period: Period): Dashboard {
  const c = db.collections;
  const fin = finance(db, period);
  const trips = c.trips.filter((t) => inPeriod(t.startDate, period));
  const active = c.trips.filter((t) => ["Dispatched", "In Progress"].includes(String(t.status)));

  if (slug === "030-trip-dashboard") {
    const today = new Date().toISOString().slice(0, 10);
    const tm = byMonth(c.trips, "startDate", () => 1);
    return {
      stats: [
        { label: "Trips in period", value: String(trips.length), note: `${trips.filter((t) => t.status === "Completed").length} completed`, href: "/screens/031-trip-list" },
        { label: "Active now", value: String(active.length), note: "dispatched or on the road", positive: true, href: "/screens/037-trip-status-and-tracking" },
        { label: "Awaiting dispatch", value: String(c.trips.filter((t) => ["Draft", "Planned", "Approved"].includes(String(t.status))).length), note: "needs vehicle / driver", href: "/screens/031-trip-list" },
        { label: "Cancelled", value: String(trips.filter((t) => t.status === "Cancelled").length), note: pct(trips.filter((t) => t.status === "Cancelled").length, trips.length) + " of trips", positive: false },
      ],
      trend: { title: "Trips per month", subtitle: "Last 6 months, by start date", ...tm, legend: ["Trips"] },
      donut: { title: "Trips by status", subtitle: `${trips.length} trips in period`, segments: countBy(trips, "status"), caption: "Trips" },
      panels: [
        { kind: "list", title: "Active trips", subtitle: "Dispatched and in progress", rows: recentTrips(db, (t) => ["Dispatched", "In Progress"].includes(String(t.status))), href: "/screens/037-trip-status-and-tracking", empty: "No trip is on the road right now." },
        { kind: "list", title: "Today's schedule", subtitle: date(today), rows: recentTrips(db, (t) => t.startDate === today || ["Planned", "Approved"].includes(String(t.status))), href: "/screens/031-trip-list", empty: "Nothing scheduled for today." },
      ],
    };
  }

  if (slug === "068-maintenance-dashboard") {
    const open = c.maintenance.filter((m) => ["Requested", "Scheduled", "In Progress"].includes(String(m.status)));
    const cost = byMonth(c.maintenance.filter((m) => m.status !== "Cancelled"), "scheduledDate", (m) => n(m.cost));
    return {
      stats: [
        { label: "Open jobs", value: String(open.length), note: "requested, scheduled or in progress", href: "/screens/069-maintenance-list" },
        { label: "In workshop", value: String(c.vehicles.filter((v) => v.status === "Maintenance").length), note: "vehicles unavailable", positive: false, href: "/screens/012-vehicle-list" },
        { label: "Completed in period", value: String(fin.maint.filter((m) => m.status === "Completed").length), note: "jobs closed", positive: true, href: "/screens/069-maintenance-list" },
        { label: "Maintenance cost", value: money(fin.maint.reduce((s, m) => s + n(m.cost), 0)), note: "parts + labour in period", href: "/screens/074-maintenance-cost-analysis" },
      ],
      trend: { title: "Maintenance cost trend", subtitle: "Parts and labour, last 6 months", ...cost, color: "#16a879", legend: ["Cost"] },
      donut: { title: "Jobs by type", subtitle: `${c.maintenance.length} jobs recorded`, segments: countBy(c.maintenance, "serviceType"), caption: "Jobs" },
      panels: [
        { kind: "list", title: "Upcoming service", subtitle: "Sorted by scheduled date", rows: upcomingMaintenance(db), href: "/screens/071-maintenance-schedule", empty: "No service is due." },
        { kind: "list", title: "Vehicles in workshop", subtitle: "Currently under maintenance", rows: c.vehicles.filter((v) => v.status === "Maintenance").map((v) => ({ label: String(v.regNo), sub: String(v.type), status: "Maintenance", href: href("vehicles", v.id) })), href: "/screens/012-vehicle-list", empty: "Every vehicle is on the road." },
      ],
    };
  }

  if (slug === "091-accounts-overview") {
    const receivable = c.invoices.reduce((s, i) => s + n(i.total) - n(i.paid), 0);
    const payable = c.supplierBills.reduce((s, b) => s + n(b.amount) - n(b.paid), 0);
    const advances = c.driverAdvances.reduce((s, a) => s + n(a.amount) - n(a.settled), 0);
    const received = c.payments.filter((p) => p.status === "Cleared" && inPeriod(p.date, period));
    const flowIn = byMonth(c.payments.filter((p) => p.status === "Cleared"), "date", (p) => n(p.amount));
    return {
      stats: [
        { label: "Collected in period", value: money(received.reduce((s, p) => s + n(p.amount), 0)), note: `${received.length} cleared payments`, positive: true, href: "/screens/092-payment-records" },
        { label: "Customer receivables", value: money(receivable), note: `${c.invoices.filter((i) => i.status === "Overdue").length} invoices overdue`, positive: false, href: "/screens/095-customer-receivables" },
        { label: "Supplier payables", value: money(payable), note: "fuel, workshop & parts", href: "/screens/096-supplier-payables" },
        { label: "Driver advances", value: money(advances), note: "outstanding with drivers", href: "/screens/097-driver-advances" },
      ],
      trend: { title: "Cash in vs cash out", subtitle: "Cleared receipts against operating cost", series: flowIn.series, compare: costSeries(db), labels: flowIn.labels, legend: ["Cash in", "Cash out"] },
      donut: { title: "Receipts by method", subtitle: "Cleared payments", segments: sumBy(c.payments.filter((p) => p.status === "Cleared"), "method", (p) => n(p.amount)), center: compactMoney(c.payments.filter((p) => p.status === "Cleared").reduce((s, p) => s + n(p.amount), 0)), caption: "Collected" },
      panels: [
        { kind: "list", title: "Recent payments", subtitle: "Latest money receipts", rows: [...c.payments].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5).map((p) => ({ label: lbl(db, "customers", p.customerId), sub: `${p.code} · ${p.method}`, value: money(p.amount), status: String(p.status), href: href("payments", p.id) })), href: "/screens/092-payment-records" },
        { kind: "list", title: "Overdue & unpaid invoices", subtitle: "Follow up for collection", rows: c.invoices.filter((i) => ["Overdue", "Partially Paid", "Sent"].includes(String(i.status))).slice(0, 5).map((i) => ({ label: `${i.code} · ${lbl(db, "customers", i.customerId)}`, sub: `Due ${date(i.dueDate)}`, value: money(n(i.total) - n(i.paid)), status: String(i.status), href: href("invoices", i.id) })), href: "/screens/084-invoice-list", empty: "All invoices are paid." },
      ],
    };
  }

  if (slug === "137-system-activity-dashboard") {
    const logs = c.auditLogs.filter((l) => inPeriod(l.createdAt, period));
    const series = byDay(c.auditLogs, "createdAt", () => 1, 14);
    return {
      stats: [
        { label: "Active users", value: String(c.users.filter((u) => u.status === "Active").length), note: `${c.users.length} accounts`, href: "/screens/119-user-list" },
        { label: "Open sessions", value: String(db.sessions.length), note: "devices signed in", href: "/screens/143-session-management" },
        { label: "Audit events", value: String(logs.length), note: `${logs.filter((l) => l.level !== "Info").length} warnings / critical`, positive: false, href: "/screens/140-audit-logs" },
        { label: "Stored records", value: Object.values(c).reduce((s, l) => s + l.length, 0).toLocaleString("en-IN"), note: "across all modules", href: "/screens/141-database-management" },
      ],
      trend: { title: "System activity", subtitle: "Audit events per day, last 14 days", ...series, color: "#7659e9", legend: ["Events"] },
      donut: { title: "Events by module", subtitle: "All recorded activity", segments: countBy(c.auditLogs, "module"), caption: "Events" },
      panels: [
        { kind: "list", title: "Latest activity", subtitle: "Most recent audit entries", rows: c.auditLogs.slice(0, 6).map((l) => ({ label: String(l.message), sub: `${l.user} · ${l.module}`, status: String(l.level), href: href("auditLogs", l.id) })), href: "/screens/140-audit-logs" },
        { kind: "list", title: "Signed-in devices", subtitle: "Session management", rows: db.sessions.map((s) => ({ label: s.device, sub: `${s.location} · ${s.ip}`, status: s.current ? "Active" : "Idle" })), href: "/screens/143-session-management" },
      ],
    };
  }

  // 006 main dashboard
  const rev = byMonth(c.incomes.filter((i) => i.status === "Received"), "date", (i) => n(i.amount));
  const pending = c.expenses.filter((e) => e.status === "Submitted").length + c.maintenance.filter((m) => m.status === "Requested").length + c.bookings.filter((b) => b.status === "Pending").length + c.settlements.filter((s) => s.status === "Pending").length;
  const expiring = c.documents.filter((d) => d.status === "Expired" || d.status === "Expiring Soon");
  return {
    stats: [
      { label: "Revenue", value: money(fin.revenue), note: `profit ${money(fin.revenue - fin.cost)}`, positive: fin.revenue >= fin.cost, href: "/screens/007-revenue-analytics" },
      { label: "Active trips", value: String(active.length), note: `${trips.length} trips in period`, positive: true, href: "/screens/037-trip-status-and-tracking" },
      { label: "Fleet", value: String(c.vehicles.length), note: `${c.vehicles.filter((v) => v.status === "Available").length} available · ${c.vehicles.filter((v) => v.status === "Maintenance").length} in workshop`, href: "/screens/012-vehicle-list" },
      { label: "Pending approvals", value: String(pending), note: `${expiring.length} documents expiring / expired`, positive: false, href: "/screens/125-notification-center" },
    ],
    trend: { title: "Revenue & cost overview", subtitle: "Received income vs operating cost, last 6 months", series: rev.series, compare: costSeries(db), labels: rev.labels, legend: ["Revenue", "Cost"] },
    donut: { title: "Fleet status", subtitle: `${c.vehicles.length} vehicles`, segments: countBy(c.vehicles, "status"), center: pct(c.vehicles.filter((v) => ["On Trip", "Assigned"].includes(String(v.status))).length, c.vehicles.length), caption: "Utilised" },
    panels: [
      { kind: "list", title: "Recent dispatches", subtitle: "Latest trips", rows: recentTrips(db), href: "/screens/031-trip-list" },
      { kind: "list", title: "Upcoming service & compliance", subtitle: "Maintenance due and documents to renew", rows: [...upcomingMaintenance(db).slice(0, 3), ...expiring.slice(0, 3).map((d) => ({ label: String(d.name), sub: `${d.docType} · expires ${date(d.expiryDate)}`, status: String(d.status), href: href("documents", d.id), date: String(d.expiryDate) }))], href: "/screens/113-document-expiry-tracking" },
    ],
  };
}

export function buildAnalytics(slug: string, db: DbState, period: Period): Dashboard {
  const c = db.collections;
  const fin = finance(db, period);
  const trips = c.trips.filter((t) => inPeriod(t.startDate, period));
  const completed = trips.filter((t) => t.status === "Completed");

  switch (slug) {
    case "007-revenue-analytics":
    case "075-income-overview": {
      const rev = byMonth(c.incomes.filter((i) => i.status === "Received"), "date", (i) => n(i.amount));
      const routeRev = sumBy(trips, (t) => lbl(db, "routes", t.routeId), (t) => n(t.fare), 5);
      const billed = c.invoices.filter((i) => inPeriod(i.issueDate, period));
      const billedTotal = billed.reduce((s, i) => s + n(i.total), 0);
      const collected = billed.reduce((s, i) => s + n(i.paid), 0);
      return {
        stats: [
          { label: "Income received", value: money(fin.revenue), note: `${fin.incomes.length} entries`, positive: true, href: "/screens/077-income-list" },
          { label: "Pending income", value: money(fin.incomes.filter((i) => i.status === "Pending").reduce((s, i) => s + n(i.amount), 0)), note: "not yet received", href: "/screens/077-income-list" },
          { label: "Invoiced", value: money(billedTotal), note: `${pct(collected, billedTotal)} collected`, href: "/screens/084-invoice-list" },
          { label: "Avg fare / trip", value: money(trips.length ? trips.reduce((s, t) => s + n(t.fare), 0) / trips.length : 0), note: `${trips.length} trips`, href: "/screens/031-trip-list" },
        ],
        trend: { title: "Revenue trend", subtitle: "Received income, last 6 months", ...rev, legend: ["Revenue"] },
        donut: { title: "Income by source", subtitle: "Selected period", segments: sumBy(fin.incomes, "source", (i) => n(i.amount)), center: compactMoney(fin.incomes.reduce((s, i) => s + n(i.amount), 0)), caption: "Total" },
        panels: [
          { kind: "bars", title: "Billed vs collected", subtitle: "Invoices by issue month", ...byMonth(c.invoices, "issueDate", (i) => n(i.total)), secondary: byMonth(c.invoices, "issueDate", (i) => n(i.paid)).series, money: true, legend: ["Billed", "Collected"] },
          { kind: "list", title: "Top revenue routes", subtitle: "Freight fare in period", rows: routeRev.map((r) => ({ label: r.label, value: money(r.value) })), href: "/screens/056-route-management" },
        ],
      };
    }
    case "008-expense-analytics":
    case "078-expense-overview": {
      const series = costSeries(db);
      const cats = [
        { label: "Fuel", value: fin.fuel.reduce((s, r) => s + n(r.amount), 0) },
        { label: "Maintenance", value: fin.maint.reduce((s, r) => s + n(r.cost), 0) },
        { label: "Driver salary", value: fin.salaries.reduce((s, r) => s + n(r.amount), 0) },
        ...sumBy(fin.expenses, (e) => lbl(db, "expenseCategories", e.categoryId), (e) => n(e.amount), 4),
      ].filter((x) => x.value > 0);
      const vehicleCost = sumBy([...fin.fuel, ...fin.expenses.filter((e) => e.vehicleId), ...fin.maint], (r) => String(c.vehicles.find((v) => v.id === r.vehicleId)?.regNo ?? "Unassigned"), (r) => n(r.amount ?? r.cost), 5);
      return {
        stats: [
          { label: "Total operating cost", value: money(fin.cost), note: "fuel, maintenance, salary & expenses", positive: false, href: "/screens/080-expense-list" },
          { label: "Fuel", value: money(cats.find((x) => x.label === "Fuel")?.value ?? 0), note: pct(cats.find((x) => x.label === "Fuel")?.value ?? 0, fin.cost) + " of cost", href: "/screens/062-fuel-records" },
          { label: "Maintenance", value: money(cats.find((x) => x.label === "Maintenance")?.value ?? 0), note: `${fin.maint.length} jobs`, href: "/screens/069-maintenance-list" },
          { label: "Awaiting approval", value: String(c.expenses.filter((e) => e.status === "Submitted").length), note: "expense claims", href: "/screens/080-expense-list" },
        ],
        trend: { title: "Expense trend", subtitle: "All operating cost, last 6 months", series, labels: months(6).map((m) => m.label), color: "#eb5365", legend: ["Cost"] },
        donut: { title: "Expense by category", subtitle: "Selected period", segments: cats, center: compactMoney(fin.cost), caption: "Total" },
        panels: [
          { kind: "bars", title: "Monthly expenses", subtitle: "Expense claims vs fuel", ...byMonth(c.expenses.filter((e) => e.status !== "Rejected"), "date", (e) => n(e.amount)), secondary: byMonth(c.fuel, "date", (f) => n(f.amount)).series, money: true, legend: ["Expenses", "Fuel"] },
          { kind: "list", title: "Highest-cost vehicles", subtitle: "Fuel, expenses and maintenance", rows: vehicleCost.map((r) => ({ label: r.label, value: money(r.value) })), href: "/screens/103-vehicle-report" },
        ],
      };
    }
    case "009-profit-and-loss-overview":
    case "083-income-and-expense-summary": {
      const rev = byMonth(c.incomes.filter((i) => i.status === "Received"), "date", (i) => n(i.amount));
      const cost = costSeries(db);
      const profit = fin.revenue - fin.cost;
      const ranked = completed.map((t) => ({ t, ...tripProfit(db, t) })).sort((a, b) => b.profit - a.profit).slice(0, 5);
      return {
        stats: [
          { label: "Revenue", value: money(fin.revenue), positive: true, note: "received income", href: "/screens/077-income-list" },
          { label: "Operating cost", value: money(fin.cost), positive: false, note: "all expense heads", href: "/screens/080-expense-list" },
          { label: "Net profit", value: money(profit), positive: profit >= 0, note: profit >= 0 ? "in profit" : "in loss" },
          { label: "Margin", value: fin.revenue ? `${((profit / fin.revenue) * 100).toFixed(1)}%` : "—", note: "profit ÷ revenue", positive: profit >= 0 },
        ],
        trend: { title: "Income vs expense", subtitle: "Last 6 months", series: rev.series, compare: cost, labels: rev.labels, legend: ["Income", "Expense"] },
        donut: {
          title: "Cost composition",
          subtitle: "Where the money goes",
          segments: [
            { label: "Fuel", value: fin.fuel.reduce((s, r) => s + n(r.amount), 0) },
            { label: "Expenses", value: fin.expenses.reduce((s, r) => s + n(r.amount), 0) },
            { label: "Maintenance", value: fin.maint.reduce((s, r) => s + n(r.cost), 0) },
            { label: "Salary", value: fin.salaries.reduce((s, r) => s + n(r.amount), 0) },
          ],
          center: compactMoney(fin.cost),
          caption: "Cost",
        },
        panels: [
          { kind: "bars", title: "Net profit by month", subtitle: "Income minus operating cost", data: rev.series.map((v, i) => Math.max(0, v - cost[i]!)), secondary: rev.series.map((v, i) => Math.max(0, cost[i]! - v)), labels: rev.labels, money: true, legend: ["Profit", "Loss"] },
          { kind: "list", title: "Most profitable trips", subtitle: "Fare minus fuel and trip expenses", rows: ranked.map((r) => ({ label: `${r.t.code} · ${lbl(db, "routes", r.t.routeId).replace(/^RTE-\d+ · /, "")}`, sub: `Fare ${money(r.revenue)} · cost ${money(r.cost)}`, value: money(r.profit), href: href("trips", r.t.id) })), href: "/screens/041-trip-profit-and-loss" },
        ],
      };
    }
    case "010-trip-statistics": {
      const tm = byMonth(c.trips, "startDate", () => 1);
      const tc = byMonth(c.trips.filter((t) => t.status === "Completed"), "startDate", () => 1).series;
      return {
        stats: [
          { label: "Total trips", value: String(trips.length), href: "/screens/031-trip-list" },
          { label: "Completed", value: String(completed.length), note: pct(completed.length, trips.length), positive: true },
          { label: "On the road", value: String(trips.filter((t) => ["Dispatched", "In Progress"].includes(String(t.status))).length), note: "active journeys" },
          { label: "Cancellation rate", value: pct(trips.filter((t) => t.status === "Cancelled").length, trips.length), positive: false, note: `${trips.filter((t) => t.status === "Cancelled").length} cancelled` },
        ],
        trend: { title: "Trips per month", subtitle: "All vs completed", series: tm.series, compare: tc, labels: tm.labels, legend: ["All trips", "Completed"] },
        donut: { title: "Trips by status", subtitle: "Selected period", segments: countBy(trips, "status"), caption: "Trips" },
        panels: [
          { kind: "bars", title: "Distance covered", subtitle: "Kilometres per month", ...byMonth(c.trips.filter((t) => t.status !== "Cancelled"), "startDate", (t) => n(t.distanceKm)) },
          { kind: "list", title: "Busiest routes", subtitle: "Number of trips", rows: countBy(trips, (t) => lbl(db, "routes", t.routeId), 5).map((r) => ({ label: r.label, value: `${r.value} trips` })), href: "/screens/056-route-management" },
        ],
      };
    }
    case "011-business-performance": {
      const utilised = c.vehicles.filter((v) => ["On Trip", "Assigned"].includes(String(v.status))).length;
      const repeat = c.customers.filter((cu) => c.trips.filter((t) => t.customerId === cu.id).length > 1).length;
      const perVehicle = sumBy(c.trips, (t) => String(c.vehicles.find((v) => v.id === t.vehicleId)?.regNo ?? "—"), (t) => n(t.fare), 8);
      const rev = byMonth(c.incomes.filter((i) => i.status === "Received"), "date", (i) => n(i.amount));
      return {
        stats: [
          { label: "Fleet utilisation", value: pct(utilised, c.vehicles.length), note: `${utilised} of ${c.vehicles.length} vehicles working`, positive: true },
          { label: "Driver score", value: (c.drivers.reduce((s, d) => s + n(d.rating), 0) / Math.max(1, c.drivers.length)).toFixed(1) + " / 5", note: "average rating", href: "/screens/028-driver-performance" },
          { label: "Customer retention", value: pct(repeat, c.customers.length), note: `${repeat} repeat customers`, positive: true, href: "/screens/049-customer-list" },
          { label: "Revenue / vehicle", value: money(fin.revenue / Math.max(1, c.vehicles.length)), note: "in period" },
        ],
        trend: { title: "Revenue trend", subtitle: "Last 6 months", ...rev, legend: ["Revenue"] },
        donut: { title: "Fleet status", subtitle: `${c.vehicles.length} vehicles`, segments: countBy(c.vehicles, "status"), caption: "Vehicles" },
        panels: [
          { kind: "bars", title: "Revenue per vehicle", subtitle: "Freight billed", data: perVehicle.map((x) => x.value), labels: perVehicle.map((x) => x.label.slice(-4)), money: true },
          { kind: "list", title: "Top customers", subtitle: "By freight value", rows: sumBy(c.trips, (t) => lbl(db, "customers", t.customerId), (t) => n(t.fare), 5).map((r) => ({ label: r.label, value: money(r.value) })), href: "/screens/049-customer-list" },
        ],
      };
    }
    case "028-driver-performance": {
      const perDriver = c.drivers.map((d) => ({ d, trips: c.trips.filter((t) => t.driverId === d.id) }));
      const ranked = [...perDriver].sort((a, b) => n(b.d.rating) - n(a.d.rating));
      const tm = byMonth(c.trips.filter((t) => t.status === "Completed"), "startDate", () => 1);
      return {
        stats: [
          { label: "Drivers", value: String(c.drivers.length), href: "/screens/022-driver-list" },
          { label: "Average score", value: (c.drivers.reduce((s, d) => s + n(d.rating), 0) / Math.max(1, c.drivers.length)).toFixed(2), note: "out of 5", positive: true },
          { label: "On trip", value: String(c.drivers.filter((d) => d.status === "On Trip").length), note: "driving now" },
          { label: "Licences expiring", value: String(c.drivers.filter((d) => ["Expired", "Expiring Soon"].includes(dStatus(d.licenseExpiry))).length), note: "within 30 days or expired", positive: false, href: "/screens/111-driver-documents" },
        ],
        trend: { title: "Completed trips", subtitle: "All drivers, last 6 months", ...tm, color: "#16a879", legend: ["Trips"] },
        donut: { title: "Driver status", subtitle: "Today", segments: countBy(c.drivers, "status"), caption: "Drivers" },
        panels: [
          { kind: "bars", title: "Trips per driver", subtitle: "All time", data: perDriver.map((p) => p.trips.length), labels: perDriver.map((p) => String(p.d.name).split(" ")[0]!) },
          { kind: "list", title: "Driver ranking", subtitle: "Performance score", rows: ranked.slice(0, 5).map((p) => ({ label: String(p.d.name), sub: `${p.trips.length} trips · ${p.d.licenseClass} licence`, value: `${p.d.rating} ★`, href: href("drivers", p.d.id) })), href: "/screens/022-driver-list" },
        ],
      };
    }
    case "041-trip-profit-and-loss": {
      const rows = completed.map((t) => ({ t, ...tripProfit(db, t) }));
      const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
      const last = rows.slice(0, 8);
      return {
        stats: [
          { label: "Completed trips", value: String(rows.length), href: "/screens/031-trip-list" },
          { label: "Trip revenue", value: money(rows.reduce((s, r) => s + r.revenue, 0)), positive: true },
          { label: "Trip cost", value: money(rows.reduce((s, r) => s + r.cost, 0)), note: "fuel + trip expenses", positive: false },
          { label: "Avg profit / trip", value: money(rows.length ? totalProfit / rows.length : 0), positive: totalProfit >= 0 },
        ],
        trend: { title: "Trip profit by month", subtitle: "Completed trips", ...byMonth(c.trips.filter((t) => t.status === "Completed"), "startDate", (t) => tripProfit(db, t).profit), color: "#16a879", legend: ["Profit"] },
        donut: { title: "Profitability", subtitle: "Completed trips", segments: [{ label: "Profitable", value: rows.filter((r) => r.profit > 0).length }, { label: "Loss-making", value: rows.filter((r) => r.profit <= 0).length }], caption: "Trips" },
        panels: [
          { kind: "bars", title: "Revenue vs cost per trip", subtitle: "Most recent completed trips", data: last.map((r) => r.revenue), secondary: last.map((r) => r.cost), labels: last.map((r) => String(r.t.code).slice(-4)), money: true, legend: ["Revenue", "Cost"] },
          { kind: "list", title: "Trip profit ranking", subtitle: "Highest first", rows: [...rows].sort((a, b) => b.profit - a.profit).slice(0, 6).map((r) => ({ label: String(r.t.code), sub: lbl(db, "routes", r.t.routeId), value: money(r.profit), href: href("trips", r.t.id) })) },
        ],
      };
    }
    case "064-fuel-cost-tracking":
    case "065-fuel-consumption-analysis": {
      const litres = fin.fuel.reduce((s, f) => s + n(f.litres), 0);
      const cost = fin.fuel.reduce((s, f) => s + n(f.amount), 0);
      const perVehicle = c.vehicles
        .map((v) => {
          const vf = c.fuel.filter((f) => f.vehicleId === v.id);
          const l = vf.reduce((s, f) => s + n(f.litres), 0);
          const km = c.trips.filter((t) => t.vehicleId === v.id && vf.some((f) => f.tripId === t.id)).reduce((s, t) => s + n(t.distanceKm), 0);
          return { v, litres: l, cost: vf.reduce((s, f) => s + n(f.amount), 0), kmpl: l ? km / l : 0 };
        })
        .filter((x) => x.litres > 0);
      const consumption = slug === "065-fuel-consumption-analysis";
      const ft = byMonth(c.fuel, "date", (f) => (consumption ? n(f.litres) : n(f.amount)));
      return {
        stats: [
          { label: "Fuel cost", value: money(cost), note: `${fin.fuel.length} refills`, href: "/screens/062-fuel-records" },
          { label: "Litres", value: `${litres.toLocaleString("en-IN")} L`, note: "diesel / CNG dispensed" },
          { label: "Average rate", value: money(litres ? cost / litres : 0) + " / L", note: "price paid" },
          { label: "Flagged entries", value: String(c.fuel.filter((f) => f.status === "Flagged").length), note: "need review", positive: false, href: "/screens/062-fuel-records" },
        ],
        trend: { title: consumption ? "Litres per month" : "Fuel cost trend", subtitle: "Last 6 months", ...ft, color: "#f3a526", legend: [consumption ? "Litres" : "Cost"] },
        donut: { title: consumption ? "Fuel by vehicle type" : "Fuel by station", subtitle: "Selected period", segments: consumption ? sumBy(fin.fuel, (f) => String(c.vehicles.find((v) => v.id === f.vehicleId)?.type ?? "—"), (f) => n(f.litres)) : sumBy(fin.fuel, "station", (f) => n(f.amount)), caption: consumption ? "Litres" : "Taka" },
        panels: [
          { kind: "bars", title: consumption ? "Mileage (km per litre)" : "Fuel cost per vehicle", subtitle: "By vehicle", data: perVehicle.map((x) => (consumption ? Math.round(x.kmpl * 10) / 10 : x.cost)), labels: perVehicle.map((x) => String(x.v.regNo).slice(-4)), money: !consumption },
          { kind: "list", title: consumption ? "Least efficient vehicles" : "Highest fuel spend", subtitle: consumption ? "Lowest km per litre" : "All time", rows: [...perVehicle].sort((a, b) => (consumption ? a.kmpl - b.kmpl : b.cost - a.cost)).slice(0, 5).map((x) => ({ label: String(x.v.regNo), sub: String(x.v.type), value: consumption ? `${x.kmpl.toFixed(1)} km/L` : money(x.cost), href: href("vehicles", x.v.id) })), href: "/screens/067-vehicle-wise-fuel-report" },
        ],
      };
    }
    case "074-maintenance-cost-analysis": {
      const mc = byMonth(c.maintenance.filter((m) => m.status !== "Cancelled"), "scheduledDate", (m) => n(m.cost));
      const perVehicle = sumBy(c.maintenance.filter((m) => m.status !== "Cancelled"), (m) => String(c.vehicles.find((v) => v.id === m.vehicleId)?.regNo ?? "—"), (m) => n(m.cost), 8);
      return {
        stats: [
          { label: "Maintenance cost", value: money(fin.maint.reduce((s, m) => s + n(m.cost), 0)), href: "/screens/069-maintenance-list" },
          { label: "Parts", value: money(fin.maint.reduce((s, m) => s + n(m.partsCost), 0)), note: "spare parts" },
          { label: "Labour", value: money(fin.maint.reduce((s, m) => s + n(m.labourCost), 0)), note: "workshop charges" },
          { label: "Repairs vs preventive", value: `${fin.maint.filter((m) => m.kind === "Repair").length} / ${fin.maint.filter((m) => m.kind !== "Repair").length}`, note: "jobs in period" },
        ],
        trend: { title: "Maintenance cost trend", subtitle: "Last 6 months", ...mc, color: "#16a879", legend: ["Cost"] },
        donut: { title: "Cost by service type", subtitle: "Selected period", segments: sumBy(fin.maint, "serviceType", (m) => n(m.cost)), caption: "Taka" },
        panels: [
          { kind: "bars", title: "Cost per vehicle", subtitle: "All time", data: perVehicle.map((x) => x.value), labels: perVehicle.map((x) => x.label.slice(-4)), money: true },
          { kind: "list", title: "Most expensive jobs", subtitle: "All time", rows: [...c.maintenance].sort((a, b) => n(b.cost) - n(a.cost)).slice(0, 5).map((m) => ({ label: `${m.code} · ${m.serviceType}`, sub: lbl(db, "vehicles", m.vehicleId), value: money(m.cost), href: href("maintenance", m.id) })), href: "/screens/073-repair-and-service-records" },
        ],
      };
    }
    case "145-system-health-monitoring": {
      const sizes = (Object.keys(c) as CollectionKey[]).map((k) => ({ label: k, value: JSON.stringify(c[k]).length }));
      const total = sizes.reduce((s, x) => s + x.value, 0);
      const series = byDay(c.auditLogs, "createdAt", () => 1, 14);
      return {
        stats: [
          { label: "Storage used", value: `${(total / 1024).toFixed(0)} KB`, note: `${((total / (5 * 1048576)) * 100).toFixed(1)}% of 5 MB browser quota` },
          { label: "Collections", value: String(sizes.length), note: "all healthy", positive: true, href: "/screens/141-database-management" },
          { label: "Background jobs", value: "3", note: "expiry scan · backups · reminders", positive: true },
          { label: "Uptime", value: "99.98%", note: "last 30 days", positive: true },
        ],
        trend: { title: "Workload", subtitle: "Audit events per day", ...series, color: "#7659e9", legend: ["Events"] },
        donut: { title: "Storage by collection", subtitle: "Bytes on this device", segments: [...sizes].sort((a, b) => b.value - a.value).slice(0, 6), center: `${(total / 1024).toFixed(0)} KB`, caption: "Used" },
        panels: [
          { kind: "bars", title: "Records per collection", subtitle: "Top 10", data: [...sizes].sort((a, b) => c[b.label as CollectionKey].length - c[a.label as CollectionKey].length).slice(0, 10).map((x) => c[x.label as CollectionKey].length), labels: [...sizes].sort((a, b) => c[b.label as CollectionKey].length - c[a.label as CollectionKey].length).slice(0, 10).map((x) => x.label.slice(0, 4)) },
          { kind: "list", title: "Recent warnings", subtitle: "From the audit log", rows: c.auditLogs.filter((l) => l.level !== "Info").slice(0, 5).map((l) => ({ label: String(l.message), sub: `${l.module} · ${l.user}`, status: String(l.level), href: href("auditLogs", l.id) })), href: "/screens/140-audit-logs", empty: "No warnings recorded." },
        ],
      };
    }
    default:
      return buildOverview("006-main-dashboard", db, period);
  }
}

function dStatus(expiry: unknown) {
  if (!expiry || typeof expiry !== "string") return "No Expiry";
  const days = (Date.parse(expiry) - Date.now()) / 86400000;
  return days < 0 ? "Expired" : days <= 30 ? "Expiring Soon" : "Valid";
}
