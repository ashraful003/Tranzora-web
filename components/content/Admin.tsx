"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { months } from "@/lib/analytics";
import { ago, date, dateTime, downloadFile, money, toCsv } from "@/lib/db/format";
import { ENTITIES, entityKeys, type CollectionKey, type Rec } from "@/lib/db/schema";
import {
  cancelSubscription, changePlan, createBackup, listBackups, createRecord, deleteBackup, exportJson, getSettings, importJson, isDemoWorkspace, list, logActivity, num, PLANS, purgeCollection, rebuildDerived, recordCount, resetDemoData,
  restoreBackup, saveSettings, savePermissions, seedRolePermissions, StoreError, useBackups, useDb, type Crud, type DbState,
} from "@/lib/db/store";
import { modules } from "@/lib/screens";
import { listSlugFor } from "@/lib/views";
import RecordTable from "../records/RecordTable";
import { inPeriod, useShell } from "../Shell";
import { ConfirmDialog, DonutChart, EmptyState, Icon, Modal, QrArt, StatGrid, Status, useToast } from "../ui";

/* ---------------------------------------------------------------- reports */

type Report = { headers: string[]; rows: (string | number)[][]; total?: (string | number)[] };
type ReportDef = { slug: string; name: string; type: string; about: string; build: (db: DbState, inP: (v: unknown) => boolean) => Report };

const vName = (db: DbState, id: unknown) => String(db.collections.vehicles.find((v) => v.id === id)?.regNo ?? "—");
const dName = (db: DbState, id: unknown) => String(db.collections.drivers.find((v) => v.id === id)?.name ?? "—");
const cName = (db: DbState, id: unknown) => String(db.collections.customers.find((v) => v.id === id)?.name ?? "—");
const rName = (db: DbState, id: unknown) => String(db.collections.routes.find((v) => v.id === id)?.name ?? "—");
const sumCol = (rows: (string | number)[][], i: number) => rows.reduce((s, r) => s + num(r[i]), 0);

export const REPORTS: ReportDef[] = [
  {
    slug: "099-trip-report", name: "Trip report", type: "Operations", about: "Every trip with route, vehicle, driver, distance and fare.",
    build: (db, inP) => {
      const rows = db.collections.trips.filter((t) => inP(t.startDate)).map((t) => [String(t.code), String(t.startDate), rName(db, t.routeId), cName(db, t.customerId), vName(db, t.vehicleId), dName(db, t.driverId), num(t.distanceKm), num(t.fare), String(t.status)]);
      return { headers: ["Trip", "Date", "Route", "Customer", "Vehicle", "Driver", "Km", "Fare", "Status"], rows, total: ["Total", "", "", "", "", "", sumCol(rows, 6), sumCol(rows, 7), `${rows.length} trips`] };
    },
  },
  {
    slug: "100-income-report", name: "Income report", type: "Finance", about: "Income entries by source, customer and trip.",
    build: (db, inP) => {
      const rows = db.collections.incomes.filter((i) => inP(i.date)).map((i) => [String(i.code), String(i.date), String(i.source), cName(db, i.customerId), String(db.collections.trips.find((t) => t.id === i.tripId)?.code ?? "—"), String(i.method), num(i.amount), String(i.status)]);
      return { headers: ["Ref", "Date", "Source", "Customer", "Trip", "Method", "Amount", "Status"], rows, total: ["Total", "", "", "", "", "", sumCol(rows, 6), ""] };
    },
  },
  {
    slug: "101-expense-report", name: "Expense report", type: "Finance", about: "Expense claims by category with approval status.",
    build: (db, inP) => {
      const rows = db.collections.expenses.filter((e) => inP(e.date)).map((e) => [String(e.code), String(e.date), String(db.collections.expenseCategories.find((c) => c.id === e.categoryId)?.name ?? "—"), String(e.description), vName(db, e.vehicleId), num(e.amount), String(e.status)]);
      return { headers: ["Ref", "Date", "Category", "Description", "Vehicle", "Amount", "Status"], rows, total: ["Total", "", "", "", "", sumCol(rows, 5), ""] };
    },
  },
  {
    slug: "102-profit-and-loss-report", name: "Profit & loss statement", type: "Finance", about: "Monthly revenue against every cost head.",
    build: (db) => {
      const c = db.collections;
      const rows = months(12).map((m) => {
        const inM = (v: unknown) => String(v ?? "").startsWith(m.key);
        const rev = c.incomes.filter((i) => i.status === "Received" && inM(i.date)).reduce((s, i) => s + num(i.amount), 0);
        const fuel = c.fuel.filter((f) => inM(f.date)).reduce((s, f) => s + num(f.amount), 0);
        const exp = c.expenses.filter((e) => e.status !== "Rejected" && inM(e.date)).reduce((s, e) => s + num(e.amount), 0);
        const mnt = c.maintenance.filter((x) => x.status !== "Cancelled" && inM(x.scheduledDate)).reduce((s, x) => s + num(x.cost), 0);
        const sal = c.driverPayments.filter((p) => p.status === "Paid" && inM(p.date)).reduce((s, p) => s + num(p.amount), 0);
        return [m.key, rev, fuel, exp, mnt, sal, rev - fuel - exp - mnt - sal];
      });
      return { headers: ["Month", "Revenue", "Fuel", "Expenses", "Maintenance", "Salary", "Net profit"], rows, total: ["Total", ...[1, 2, 3, 4, 5, 6].map((i) => sumCol(rows, i))] };
    },
  },
  {
    slug: "103-vehicle-report", name: "Vehicle profitability", type: "Fleet", about: "Revenue, running cost and cost per km for each vehicle.",
    build: (db, inP) => {
      const c = db.collections;
      const rows = c.vehicles.map((v) => {
        const trips = c.trips.filter((t) => t.vehicleId === v.id && inP(t.startDate));
        const km = trips.reduce((s, t) => s + num(t.distanceKm), 0);
        const rev = trips.reduce((s, t) => s + num(t.fare), 0);
        const fuel = c.fuel.filter((f) => f.vehicleId === v.id && inP(f.date)).reduce((s, f) => s + num(f.amount), 0);
        const mnt = c.maintenance.filter((m) => m.vehicleId === v.id && inP(m.scheduledDate)).reduce((s, m) => s + num(m.cost), 0);
        return [String(v.regNo), String(v.type), trips.length, km, rev, fuel, mnt, km ? Math.round((fuel + mnt) / km) : 0, rev - fuel - mnt];
      });
      return { headers: ["Vehicle", "Type", "Trips", "Km", "Revenue", "Fuel", "Maintenance", "Cost / km", "Profit"], rows, total: ["Total", "", sumCol(rows, 2), sumCol(rows, 3), sumCol(rows, 4), sumCol(rows, 5), sumCol(rows, 6), "", sumCol(rows, 8)] };
    },
  },
  {
    slug: "104-driver-report", name: "Driver report", type: "Fleet", about: "Trips, revenue generated, pay and advances per driver.",
    build: (db, inP) => {
      const c = db.collections;
      const rows = c.drivers.map((d) => {
        const trips = c.trips.filter((t) => t.driverId === d.id && inP(t.startDate));
        const paid = c.driverPayments.filter((p) => p.driverId === d.id && p.status === "Paid" && inP(p.date)).reduce((s, p) => s + num(p.amount), 0);
        const adv = c.driverAdvances.filter((a) => a.driverId === d.id).reduce((s, a) => s + num(a.amount) - num(a.settled), 0);
        return [String(d.name), String(d.licenseNo), trips.length, trips.reduce((s, t) => s + num(t.fare), 0), paid, adv, num(d.rating), String(d.status)];
      });
      return { headers: ["Driver", "Licence", "Trips", "Revenue", "Paid", "Advance due", "Score", "Status"], rows, total: ["Total", "", sumCol(rows, 2), sumCol(rows, 3), sumCol(rows, 4), sumCol(rows, 5), "", ""] };
    },
  },
  {
    slug: "105-customer-report", name: "Customer report", type: "Finance", about: "Trips, billing, collection and dues per customer.",
    build: (db, inP) => {
      const c = db.collections;
      const rows = c.customers.map((cu) => {
        const inv = c.invoices.filter((i) => i.customerId === cu.id && inP(i.issueDate));
        const billed = inv.reduce((s, i) => s + num(i.total), 0);
        const paid = inv.reduce((s, i) => s + num(i.paid), 0);
        return [String(cu.name), String(cu.city ?? ""), c.trips.filter((t) => t.customerId === cu.id && inP(t.startDate)).length, billed, paid, billed - paid, String(cu.paymentTerms ?? "")];
      });
      return { headers: ["Customer", "City", "Trips", "Billed", "Received", "Due", "Terms"], rows, total: ["Total", "", sumCol(rows, 2), sumCol(rows, 3), sumCol(rows, 4), sumCol(rows, 5), ""] };
    },
  },
  {
    slug: "106-fuel-report", name: "Fuel report", type: "Fuel & Cost", about: "Every refill with litres, rate, station and verification.",
    build: (db, inP) => {
      const rows = db.collections.fuel.filter((f) => inP(f.date)).map((f) => [String(f.code), String(f.date), vName(db, f.vehicleId), dName(db, f.driverId), num(f.litres), num(f.rate), num(f.amount), String(f.station ?? ""), String(f.status)]);
      return { headers: ["Ref", "Date", "Vehicle", "Driver", "Litres", "Rate", "Amount", "Station", "Status"], rows, total: ["Total", "", "", "", sumCol(rows, 4), "", sumCol(rows, 6), "", ""] };
    },
  },
  {
    slug: "107-maintenance-report", name: "Maintenance report", type: "Fuel & Cost", about: "Service and repair jobs with parts and labour cost.",
    build: (db, inP) => {
      const rows = db.collections.maintenance.filter((m) => inP(m.scheduledDate)).map((m) => [String(m.code), String(m.scheduledDate), vName(db, m.vehicleId), String(m.serviceType), String(m.workshop ?? ""), num(m.partsCost), num(m.labourCost), num(m.cost), String(m.status)]);
      return { headers: ["Job", "Date", "Vehicle", "Service", "Workshop", "Parts", "Labour", "Total", "Status"], rows, total: ["Total", "", "", "", "", sumCol(rows, 5), sumCol(rows, 6), sumCol(rows, 7), ""] };
    },
  },
  {
    slug: "108-monthly-and-yearly-reports", name: "Monthly business summary", type: "Executive", about: "Trips, revenue, cost and profit for the last 12 months.",
    build: (db) => {
      const c = db.collections;
      const rows = months(12).map((m) => {
        const inM = (v: unknown) => String(v ?? "").startsWith(m.key);
        const trips = c.trips.filter((t) => inM(t.startDate));
        const rev = c.incomes.filter((i) => i.status === "Received" && inM(i.date)).reduce((s, i) => s + num(i.amount), 0);
        const cost = c.fuel.filter((f) => inM(f.date)).reduce((s, f) => s + num(f.amount), 0) + c.expenses.filter((e) => e.status !== "Rejected" && inM(e.date)).reduce((s, e) => s + num(e.amount), 0) + c.maintenance.filter((x) => inM(x.scheduledDate)).reduce((s, x) => s + num(x.cost), 0);
        return [m.key, trips.length, trips.filter((t) => t.status === "Completed").length, rev, cost, rev - cost];
      });
      return { headers: ["Month", "Trips", "Completed", "Revenue", "Cost", "Profit"], rows, total: ["Total", sumCol(rows, 1), sumCol(rows, 2), sumCol(rows, 3), sumCol(rows, 4), sumCol(rows, 5)] };
    },
  },
  {
    slug: "066-fuel-efficiency-report", name: "Fuel efficiency", type: "Fuel & Cost", about: "Km per litre per vehicle with flagged refills (theft risk).",
    build: (db, inP) => {
      const c = db.collections;
      const rows = c.vehicles.map((v) => {
        const f = c.fuel.filter((x) => x.vehicleId === v.id && inP(x.date));
        const litres = f.reduce((s, x) => s + num(x.litres), 0);
        const km = c.trips.filter((t) => t.vehicleId === v.id && f.some((x) => x.tripId === t.id)).reduce((s, t) => s + num(t.distanceKm), 0);
        return [String(v.regNo), String(v.type), litres, km, litres ? Math.round((km / litres) * 10) / 10 : 0, f.reduce((s, x) => s + num(x.amount), 0), f.filter((x) => x.status === "Flagged").length];
      }).filter((r) => num(r[2]) > 0);
      return { headers: ["Vehicle", "Type", "Litres", "Km", "Km / L", "Cost", "Flagged"], rows, total: ["Total", "", sumCol(rows, 2), sumCol(rows, 3), "", sumCol(rows, 5), sumCol(rows, 6)] };
    },
  },
  {
    slug: "067-vehicle-wise-fuel-report", name: "Vehicle-wise fuel", type: "Fuel & Cost", about: "Refills, litres and spend for each registration.",
    build: (db, inP) => {
      const c = db.collections;
      const rows = c.vehicles.map((v) => {
        const f = c.fuel.filter((x) => x.vehicleId === v.id && inP(x.date));
        const litres = f.reduce((s, x) => s + num(x.litres), 0);
        const cost = f.reduce((s, x) => s + num(x.amount), 0);
        return [String(v.regNo), String(v.fuelType ?? ""), f.length, litres, cost, litres ? Math.round((cost / litres) * 100) / 100 : 0];
      });
      return { headers: ["Vehicle", "Fuel", "Refills", "Litres", "Cost", "Avg rate"], rows, total: ["Total", "", sumCol(rows, 2), sumCol(rows, 3), sumCol(rows, 4), ""] };
    },
  },
];

const MONEY_HEADERS = /fare|amount|revenue|cost|fuel$|expenses|maintenance|salary|profit|billed|received|due|paid|parts|labour|total|advance/i;

export function ReportsCenter({ slug }: { slug: string }) {
  const db = useDb();
  const toast = useToast();
  const { period } = useShell();
  const def = REPORTS.find((r) => r.slug === slug) ?? REPORTS[0]!;
  const report = useMemo(() => (db ? def.build(db, (v) => inPeriod(v, period)) : null), [db, def, period]);
  if (!db || !report) return null;
  const fmt = (h: string, v: string | number) => (typeof v === "number" && MONEY_HEADERS.test(h) && !/km|litres|trips|refills|flagged|score|completed/i.test(h) ? money(v) : typeof v === "number" ? v.toLocaleString("en-IN") : v);
  const stamp = new Date().toISOString().slice(0, 10);
  const save = () => {
    createRecord("reports", { name: def.name, type: def.type, rows: report.rows.length, generatedBy: String(db.collections.users.find((u) => u.id === db.currentUserId)?.name ?? "User"), status: "Ready", reportKey: def.slug }, { silent: true });
    logActivity("Export", "Reports", `${def.name} generated (${report.rows.length} rows)`);
  };
  const byType = REPORTS.reduce<Record<string, number>>((m, r) => ((m[r.type] = (m[r.type] ?? 0) + 1), m), {});

  return (
    <>
      <div className="reports-layout">
        <section className="panel">
          <div className="panel-title">
            <div>
              <h3>{def.name}</h3>
              <p>
                {def.about} {report.rows.length} rows · period: {period === "all" ? "all time" : period === "30" ? "last 30 days" : period === "month" ? "this month" : "this year"}
              </p>
            </div>
            <div className="rx-tools-right">
              <button
                type="button"
                className="rx-btn"
                onClick={() => {
                  save();
                  window.print();
                }}
              >
                <Icon name="print" size={13} /> Print
              </button>
              <button
                type="button"
                className="rx-btn rx-btn-primary"
                disabled={!report.rows.length}
                onClick={() => {
                  downloadFile(`${def.slug.slice(4)}-${stamp}.csv`, toCsv(report.headers, report.total ? [...report.rows, report.total] : report.rows), "text/csv");
                  save();
                  toast(`${def.name} downloaded (${report.rows.length} rows)`);
                }}
              >
                <Icon name="download" size={13} /> Download CSV
              </button>
            </div>
          </div>
          {report.rows.length === 0 ? (
            <EmptyState title="No data in this period" text="Choose a wider date range at the top of the page." />
          ) : (
            <div className="table-scroll rx-report-table">
              <table className="rx-table">
                <thead>
                  <tr>
                    {report.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.slice(0, 25).map((r, i) => (
                    <tr key={i}>
                      {r.map((v, j) => (
                        <td key={j} className={typeof v === "number" ? "rx-num" : j === 0 ? "primary-cell" : ""}>
                          {fmt(report.headers[j]!, v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {report.total && (
                    <tr className="rx-total-row">
                      {report.total.map((v, j) => (
                        <td key={j} className={typeof v === "number" ? "rx-num" : ""}>
                          <b>{fmt(report.headers[j]!, v)}</b>
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
              {report.rows.length > 25 && <p className="rx-muted rx-pad">Preview shows 25 of {report.rows.length} rows — the download includes everything.</p>}
            </div>
          )}
        </section>
        <aside className="panel report-summary">
          <div className="panel-title">
            <div>
              <h3>Report library</h3>
              <p>{REPORTS.length} reports available</p>
            </div>
          </div>
          <DonutChart segments={Object.entries(byType).map(([label, value]) => ({ label, value }))} center={String(REPORTS.length)} caption="Reports" />
        </aside>
      </div>
      <div className="panel rx-section-gap">
        <div className="panel-title">
          <div>
            <h3>All reports</h3>
            <p>Open any report to preview and download it</p>
          </div>
        </div>
        <div className="report-tiles">
          {REPORTS.map((r, i) => (
            <Link key={r.slug} href={`/screens/${r.slug}`} className={`rx-report-tile ${r.slug === def.slug ? "on" : ""}`}>
              <span className={`report-icon avatar-${i % 4}`}>
                <Icon name={r.type === "Fleet" ? "vehicle" : r.type === "Operations" ? "trip" : r.type.startsWith("Fuel") ? "fuel" : "report"} />
              </span>
              <span>
                <b>{r.name}</b>
                <small>{r.about}</small>
              </span>
              <Icon name="arrow" size={15} />
            </Link>
          ))}
        </div>
      </div>
      <div className="rx-section-gap">
        <h3 className="rx-h3">Generated report history</h3>
        <RecordTable embedded view={{ type: "table", entity: "reports" }} />
      </div>
    </>
  );
}

/* ------------------------------------------------------- backup & restore */

export function BackupContent() {
  const db = useDb();
  const backups = useBackups();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<null | { title: string; message: string; label: string; run: () => void }>(null);
  const auto = db ? Boolean(getSettings("backup", { auto: true }).auto) : false;

  useEffect(() => {
    if (!db || !backups || !auto) return;
    const lastAuto = listBackups().find((b) => b.kind === "Automatic");
    if (!lastAuto || Date.now() - Date.parse(lastAuto.createdAt) > 86400000) createBackup(`Daily backup — ${new Date().toLocaleDateString("en-GB")}`, "Automatic");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!db, !!backups, auto]);

  if (!db || !backups) return null;
  const used = backups.reduce((s, b) => s + b.size, 0) + JSON.stringify(db).length;

  return (
    <>
      <StatGrid
        items={[
          { label: "Snapshots", value: String(backups.length), note: "kept on this device (max 8)", icon: "database" },
          { label: "Latest backup", value: backups[0] ? ago(backups[0].createdAt) : "Never", note: backups[0]?.name ?? "create one now", icon: "calendar", positive: !!backups[0] },
          { label: "Storage used", value: `${(used / 1024).toFixed(0)} KB`, note: "data + snapshots", icon: "report" },
          { label: "Live records", value: recordCount(db).toLocaleString("en-IN"), note: "across all modules", icon: "check" },
        ]}
      />
      <div className="panel backup-history">
        <div className="panel-title">
          <div>
            <h3>Backup snapshots</h3>
            <p>Restore any snapshot in one click — a safety snapshot is taken first.</p>
          </div>
          <div className="rx-tools-right">
            <label className="rx-check-inline">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => {
                  saveSettings("backup", { auto: e.target.checked }, "Automatic backup");
                  toast(e.target.checked ? "Daily automatic backup on" : "Automatic backup off");
                }}
              />{" "}
              Daily automatic backup
            </label>
            <button
              type="button"
              className="rx-btn"
              onClick={() => {
                downloadFile(`tranzora-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJson(), "application/json");
                toast("Full data export downloaded");
              }}
            >
              <Icon name="download" size={13} /> Export JSON
            </button>
            <button type="button" className="rx-btn" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={13} /> Import JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                f.text().then((text) =>
                  setConfirm({
                    title: "Import data file?",
                    message: `Everything in this workspace will be replaced by “${f.name}”. A safety snapshot of the current data is taken first.`,
                    label: "Import",
                    run: () => {
                      try {
                        createBackup("Before import", "Before restore");
                        importJson(text, f.name);
                        toast("Data imported");
                      } catch (err) {
                        toast(err instanceof StoreError ? err.message : "Import failed", "error");
                      }
                    },
                  }),
                );
              }}
            />
            <button type="button" className="primary" onClick={() => (setName(`Manual backup — ${new Date().toLocaleString("en-GB")}`), setNaming(true))}>
              <Icon name="plus" size={14} /> Create snapshot
            </button>
          </div>
        </div>
        {backups.length === 0 ? (
          <EmptyState title="No snapshots yet" text="Create a snapshot before big changes so you can roll back." />
        ) : (
          <div className="table-scroll">
            <table className="rx-table">
              <thead>
                <tr>
                  <th>Snapshot</th>
                  <th>Type</th>
                  <th>Created</th>
                  <th>Records</th>
                  <th>Size</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span className="primary-cell">{b.name}</span>
                    </td>
                    <td>
                      <Status>{b.kind}</Status>
                    </td>
                    <td>{dateTime(b.createdAt)}</td>
                    <td>{b.records.toLocaleString("en-IN")}</td>
                    <td>{(b.size / 1024).toFixed(0)} KB</td>
                    <td>
                      <div className="actions rx-actions-text">
                        <button
                          type="button"
                          onClick={() =>
                            setConfirm({
                              title: "Restore this snapshot?",
                              message: `Current data will be replaced by “${b.name}” (${b.records} records). A safety snapshot is taken first.`,
                              label: "Restore",
                              run: () => {
                                try {
                                  createBackup("Before restore", "Before restore");
                                  restoreBackup(b.id);
                                  toast(`Restored “${b.name}”`);
                                } catch (err) {
                                  toast(err instanceof StoreError ? err.message : "Restore failed", "error");
                                }
                              },
                            })
                          }
                        >
                          Restore
                        </button>
                        <button type="button" onClick={() => (downloadFile(`${b.name.replace(/[^a-z0-9]+/gi, "-")}.json`, b.data, "application/json"), toast("Snapshot downloaded"))}>
                          Download
                        </button>
                        <button type="button" className="delete" onClick={() => setConfirm({ title: "Delete snapshot?", message: `“${b.name}” will be removed.`, label: "Delete", run: () => (deleteBackup(b.id), toast("Snapshot deleted")) })}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="panel rx-danger-zone">
        <div>
          <b>{isDemoWorkspace() ? "Reset to demo data" : "Reset workspace"}</b>
          <small>{isDemoWorkspace() ? "Replaces every record with the original sample data." : "Removes every record from your company's workspace; your account and company profile stay."} Take a snapshot first if you want to keep your changes.</small>
        </div>
        <button type="button" className="rx-danger" onClick={() => setConfirm({ title: "Reset all data?", message: isDemoWorkspace() ? "Every record, setting and change will be replaced with the demo data. A safety snapshot is taken first." : "Every record will be removed. A safety snapshot is taken first.", label: "Reset", run: () => (createBackup("Before reset", "Before restore"), resetDemoData(), toast("Workspace reset")) })}>
          <Icon name="refresh" size={14} /> {isDemoWorkspace() ? "Reset demo data" : "Reset workspace"}
        </button>
      </div>

      {naming && (
        <Modal
          title="Create snapshot"
          size="sm"
          onClose={() => setNaming(false)}
          footer={
            <>
              <button type="button" className="secondary" onClick={() => setNaming(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={!name.trim()}
                onClick={() => {
                  createBackup(name.trim());
                  setNaming(false);
                  toast("Snapshot created");
                }}
              >
                Create
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label className="wide">
              <span>Snapshot name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
          </div>
        </Modal>
      )}
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.label} danger onClose={() => setConfirm(null)} onConfirm={confirm.run} />}
    </>
  );
}

/* --------------------------------------------------------------- database */

export function DatabaseContent() {
  const db = useDb();
  const toast = useToast();
  const [peek, setPeek] = useState<CollectionKey | null>(null);
  const [confirm, setConfirm] = useState<null | { title: string; message: string; run: () => void }>(null);
  if (!db) return null;
  const sizes = entityKeys.map((k) => ({ k, n: db.collections[k].length, size: JSON.stringify(db.collections[k]).length, last: db.collections[k].reduce((m, r) => (String(r.updatedAt) > m ? String(r.updatedAt) : m), "") }));
  const total = sizes.reduce((s, x) => s + x.size, 0);
  const tools: { label: string; help: string; run: () => void; danger?: boolean }[] = [
    { label: "Rebuild computed fields", help: "Recalculate totals, balances and document expiry", run: () => (rebuildDerived(), toast("Computed fields rebuilt")) },
    { label: "Purge read notifications", help: "Delete notifications already read", run: () => toast(`${purgeCollection("notifications", (n) => !!n.read, "Read notifications purged")} notifications removed`) },
    { label: "Trim audit log (> 30 days)", help: "Keep only the last 30 days of activity", run: () => toast(`${purgeCollection("auditLogs", (l) => Date.parse(String(l.createdAt)) < Date.now() - 30 * 86400000, "Audit log trimmed")} entries removed`) },
    { label: "Export JSON dump", help: "Download the complete database", run: () => (downloadFile(`tranzora-db-${new Date().toISOString().slice(0, 10)}.json`, exportJson(), "application/json"), toast("Database exported")) },
    isDemoWorkspace()
      ? { label: "Reset demo data", help: "Replace everything with sample data", danger: true, run: () => setConfirm({ title: "Reset all data?", message: "Every record will be replaced with the demo data. Use Backup & Restore first if you need a copy.", run: () => (resetDemoData(), toast("Workspace reset")) }) }
      : { label: "Reset workspace", help: "Remove every record from this company", danger: true, run: () => setConfirm({ title: "Reset all data?", message: "Every record will be removed. Use Backup & Restore first if you need a copy.", run: () => (resetDemoData(), toast("Workspace reset")) }) },
  ];
  return (
    <>
      <StatGrid
        items={[
          { label: "Database status", value: "Healthy", note: "project local storage (data/)", positive: true, icon: "check" },
          { label: "Engine", value: "Project Local Storage", note: "JSON file store (data/workspaces)", icon: "database" },
          { label: "Collections", value: String(entityKeys.length), note: `${recordCount(db).toLocaleString("en-IN")} records`, icon: "grid" },
          { label: "Data size", value: `${(total / 1024).toFixed(0)} KB`, note: "Persistent disk storage in project", icon: "report" },
        ]}
      />
      <div className="database-layout">
        <section className="panel">
          <div className="panel-title">
            <div>
              <h3>Collections</h3>
              <p>Records and storage per module</p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="rx-table">
              <thead>
                <tr>
                  <th>Collection</th>
                  <th>Records</th>
                  <th>Size</th>
                  <th>Last change</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sizes.map((s) => (
                  <tr key={s.k}>
                    <td>
                      <b>{ENTITIES[s.k].label}</b>
                      <small className="rx-sub">{s.k}</small>
                    </td>
                    <td>{s.n.toLocaleString("en-IN")}</td>
                    <td>{(s.size / 1024).toFixed(1)} KB</td>
                    <td>{s.last ? ago(s.last) : "—"}</td>
                    <td>
                      <div className="actions rx-actions-text">
                        <button type="button" onClick={() => setPeek(s.k)}>
                          Inspect
                        </button>
                        {listSlugFor(s.k) && <Link href={`/screens/${listSlugFor(s.k)}`}>Open list</Link>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="panel database-tools">
          <h3>Maintenance tools</h3>
          {tools.map((t) => (
            <button type="button" className={t.danger ? "rx-danger rx-tool" : "secondary rx-tool"} key={t.label} onClick={t.run}>
              <b>{t.label}</b>
              <small>{t.help}</small>
            </button>
          ))}
        </aside>
      </div>
      {peek && (
        <Modal title={`${ENTITIES[peek].label} · sample documents`} subtitle={`${db.collections[peek].length} records — first 3 shown`} size="lg" onClose={() => setPeek(null)} footer={<button type="button" className="secondary" onClick={() => setPeek(null)}>Close</button>}>
          <pre className="rx-json">{JSON.stringify(db.collections[peek].slice(0, 3).map((r) => ({ ...r, fileData: r.fileData ? "[file]" : undefined })), null, 2)}</pre>
        </Modal>
      )}
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel="Reset" danger onClose={() => setConfirm(null)} onConfirm={confirm.run} />}
    </>
  );
}

/* ------------------------------------------------------- roles & permissions */

const MODULES = modules.filter((m) => m.id !== 1);

export function RolesContent() {
  const db = useDb();
  const router = useRouter();
  if (!db) return null;
  const roles = db.collections.roles;
  return (
    <>
      <div className="role-cards">
        {roles.slice(0, 6).map((role, i) => {
          const users = db.collections.users.filter((u) => u.roleId === role.id).length;
          const perms = db.permissions[role.id] ?? {};
          const modulesOn = Object.values(perms).filter((p) => p.r).length;
          return (
            <Link className="panel rx-role-card" key={role.id} href={`/records/roles/${role.id}`}>
              <span className={`role-icon avatar-${i % 4}`}>
                <Icon name="users" />
              </span>
              <b>{String(role.name)}</b>
              <strong>{users}</strong>
              <small>
                users · {modulesOn} modules
              </small>
            </Link>
          );
        })}
      </div>
      <div className="rx-quick">
        <span>Manage</span>
        <button type="button" className="rx-btn rx-btn-primary" onClick={() => router.push("/records/roles/new")}>
          <Icon name="plus" size={13} /> Add role
        </button>
        <Link className="rx-btn" href="/screens/123-permissions-management">
          <Icon name="shield" size={13} /> Edit permissions
        </Link>
        <Link className="rx-btn" href="/screens/119-user-list">
          <Icon name="users" size={13} /> Users
        </Link>
      </div>
      <RecordTable embedded view={{ type: "table", entity: "roles", columns: ["name", "description", "status"] }} />
    </>
  );
}

export function PermissionsContent() {
  const db = useDb();
  const toast = useToast();
  const sp = useSearchParams();
  const roles = db?.collections.roles ?? [];
  const [roleId, setRoleId] = useState(sp.get("role") ?? "");
  const current = roleId || roles[0]?.id || "";
  const stored = db?.permissions[current];
  const [draft, setDraft] = useState<Record<string, Crud>>({});
  useEffect(() => {
    if (db && current && !db.permissions[current]) seedRolePermissions(current);
    setDraft(JSON.parse(JSON.stringify(db?.permissions[current] ?? {})));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, !!stored]);
  if (!db) return null;
  const role = roles.find((r) => r.id === current);
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored ?? {});
  const locked = role?.name === "Super Admin";
  const cell = (m: number) => draft[m] ?? { c: false, r: false, u: false, d: false };
  const toggle = (m: number, k: keyof Crud) => {
    const next = { ...cell(m), [k]: !cell(m)[k] };
    if (k !== "r" && next[k]) next.r = true;
    if (k === "r" && !next.r) Object.assign(next, { c: false, u: false, d: false });
    setDraft((d) => ({ ...d, [m]: next }));
  };
  const setRow = (m: number, on: boolean) => setDraft((d) => ({ ...d, [m]: { c: on, r: on, u: on, d: on } }));

  return (
    <section className="panel permissions-panel">
      <div className="panel-title">
        <div>
          <h3>Module access for {String(role?.name ?? "")}</h3>
          <p>{locked ? "Super Admin always has full access." : "C = create · R = view · U = edit · D = delete. Turning off view removes all rights."}</p>
        </div>
        <div className="rx-tools-right">
          <select className="rx-select" value={current} onChange={(e) => setRoleId(e.target.value)} aria-label="Role">
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {String(r.name)}
              </option>
            ))}
          </select>
          <select
            className="rx-select"
            value=""
            disabled={locked}
            onChange={(e) => {
              const src = db.permissions[e.target.value];
              if (src) {
                setDraft(JSON.parse(JSON.stringify(src)));
                toast(`Copied from ${roles.find((r) => r.id === e.target.value)?.name} — save to apply`, "info");
              }
            }}
            aria-label="Copy permissions from"
          >
            <option value="">Copy from…</option>
            {roles.filter((r) => r.id !== current).map((r) => (
              <option key={r.id} value={r.id}>
                {String(r.name)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="table-scroll rx-matrix">
        <table>
          <thead>
            <tr>
              <th>Module</th>
              {(["c", "r", "u", "d"] as const).map((k) => (
                <th key={k}>{{ c: "Create", r: "View", u: "Edit", d: "Delete" }[k]}</th>
              ))}
              <th>All</th>
            </tr>
          </thead>
          <tbody>
            {MODULES.map((m) => {
              const p = cell(m.id);
              const all = p.c && p.r && p.u && p.d;
              return (
                <tr key={m.id}>
                  <td>
                    <b>
                      {m.code}. {m.title}
                    </b>
                  </td>
                  {(["c", "r", "u", "d"] as const).map((k) => (
                    <td key={k}>
                      <input type="checkbox" disabled={locked} checked={locked || p[k]} onChange={() => toggle(m.id, k)} aria-label={`${m.title} ${k}`} />
                    </td>
                  ))}
                  <td>
                    <input type="checkbox" disabled={locked} checked={locked || all} onChange={() => setRow(m.id, !all)} aria-label={`${m.title} all`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button type="button" className="secondary" disabled={!dirty} onClick={() => setDraft(JSON.parse(JSON.stringify(stored ?? {})))}>
          Discard changes
        </button>
        <button
          type="button"
          className="primary"
          disabled={!dirty || locked}
          onClick={() => {
            for (const m of MODULES) savePermissions(current, m.id, cell(m.id));
            logActivity("Update", "Permissions", `Permissions updated for role ${role?.name}`);
            toast(`Permissions saved for ${role?.name}`);
          }}
        >
          <Icon name="check" size={14} /> Save permissions
        </button>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- subscription */

export function SubscriptionContent({ mode }: { mode: "plans" | "current" | "change" | "qr" }) {
  const db = useDb();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const [cycle, setCycle] = useState<"Monthly" | "Yearly">((sp.get("cycle") as "Monthly" | "Yearly") ?? "Monthly");
  const [cancel, setCancel] = useState(false);
  if (!db) return null;
  const sub = db.subscription;
  const plan = PLANS.find((p) => p.name === sub.plan) ?? PLANS[1]!;
  const price = (p: (typeof PLANS)[number]) => (cycle === "Yearly" ? p.monthly * 10 : p.monthly);
  const choose = (p: string) => router.push(`/screens/117-bangla-qr-payment?plan=${p}&cycle=${cycle}`);

  if (mode === "qr") return <QrPayment />;

  const cycleToggle = (
    <div className="rx-seg">
      <button type="button" className={cycle === "Monthly" ? "active" : ""} onClick={() => setCycle("Monthly")}>
        Monthly
      </button>
      <button type="button" className={cycle === "Yearly" ? "active" : ""} onClick={() => setCycle("Yearly")}>
        Yearly · 2 months free
      </button>
    </div>
  );

  if (mode === "plans" || mode === "change")
    return (
      <>
        <div className="rx-plan-head">
          <p>
            You are on the <b>{sub.plan}</b> plan ({sub.cycle.toLowerCase()}), renewing {date(sub.nextBilling)}.
          </p>
          {cycleToggle}
        </div>
        <div className="rx-plans">
          {PLANS.map((p) => {
            const isCurrent = p.name === sub.plan;
            const up = p.monthly > plan.monthly;
            return (
              <article key={p.name} className={`panel rx-plan ${isCurrent ? "current" : ""} ${p.name === "Business" ? "popular" : ""}`}>
                {p.name === "Business" && <span className="rx-ribbon">Most popular</span>}
                <h3>{p.name}</h3>
                <strong>
                  {money(price(p))} <small>/ {cycle === "Yearly" ? "year" : "month"}</small>
                </strong>
                <ul>
                  {p.features.map((f) => (
                    <li key={f}>
                      <Icon name="check" size={13} /> {f}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <button type="button" className="secondary full" onClick={() => choose(p.name)}>
                    Renew current plan
                  </button>
                ) : (
                  <button type="button" className="primary full" onClick={() => choose(p.name)}>
                    {mode === "change" ? (up ? "Upgrade" : "Downgrade") : "Choose"} to {p.name}
                  </button>
                )}
                {mode === "change" && !isCurrent && !up && db.collections.vehicles.length > p.vehicles && <small className="rx-error">You have {db.collections.vehicles.length} vehicles — above this plan’s limit.</small>}
              </article>
            );
          })}
        </div>
      </>
    );

  // current
  const usage = [
    { label: "Vehicles", used: db.collections.vehicles.length, limit: plan.vehicles },
    { label: "Staff seats", used: db.collections.users.filter((u) => u.status === "Active").length, limit: plan.users },
    { label: "Storage", used: Math.round(JSON.stringify(db).length / 1024), limit: 5120, unit: "KB" },
  ];
  return (
    <div className="billing-layout">
      <aside className="panel plan-card">
        <div className="plan-status">
          <span>Current plan</span>
          <Status>{sub.status}</Status>
        </div>
        <h2>{sub.plan} plan</h2>
        <strong>
          {money(sub.price)} <small>/ {sub.cycle === "Yearly" ? "year" : "month"}</small>
        </strong>
        <ul>
          {plan.features.map((f) => (
            <li key={f}>
              <span>✓</span>
              {f}
            </li>
          ))}
        </ul>
        <div className="renewal">
          <span>{sub.status === "Active" ? "Next billing date" : "Access until"}</span>
          <b>{date(sub.nextBilling)}</b>
        </div>
        <button type="button" className="primary full" style={{ marginBottom: 10 }} onClick={() => router.push(`/screens/117-bangla-qr-payment?plan=${sub.plan}&cycle=${sub.cycle}`)}>
          Renew with Bangla QR / bKash
        </button>
        <Link className="secondary full rx-block-btn" href="/screens/116-upgrade-and-downgrade-plan">
          Change plan
        </Link>
        {sub.status === "Active" && (
          <button type="button" className="rx-link rx-center" onClick={() => setCancel(true)}>
            Cancel auto-renewal
          </button>
        )}
      </aside>
      <section>
        <article className="panel">
          <div className="panel-title">
            <div>
              <h3>Plan usage</h3>
              <p>Limits of the {sub.plan} plan</p>
            </div>
          </div>
          <div className="rx-usage">
            {usage.map((u) => {
              const p = Math.min(100, Math.round((u.used / u.limit) * 100));
              return (
                <div key={u.label}>
                  <span>
                    <b>{u.label}</b>
                    <small>
                      {u.used.toLocaleString("en-IN")} of {u.limit >= 999 ? "unlimited" : `${u.limit.toLocaleString("en-IN")} ${u.unit ?? ""}`}
                    </small>
                  </span>
                  <span className="rx-meter wide">
                    <i style={{ width: `${u.limit >= 999 ? 5 : p}%`, background: p > 90 ? "var(--red)" : p > 70 ? "var(--yellow)" : "var(--blue)" }} />
                  </span>
                </div>
              );
            })}
          </div>
        </article>
        <div className="rx-section-gap">
          <h3 className="rx-h3">Subscription payments</h3>
          <RecordTable embedded view={{ type: "table", entity: "subscriptionPayments" }} />
        </div>
      </section>
      {cancel && (
        <ConfirmDialog
          title="Cancel auto-renewal?"
          message={`Your ${sub.plan} plan stays active until ${date(sub.nextBilling)} and will not renew automatically.`}
          confirmLabel="Cancel renewal"
          danger
          onClose={() => setCancel(false)}
          onConfirm={() => {
            cancelSubscription();
            toast("Auto-renewal cancelled", "info");
          }}
        />
      )}
    </div>
  );
}

function QrPayment() {
  const db = useDb();
  const toast = useToast();
  const sp = useSearchParams();
  const [planName, setPlanName] = useState(sp.get("plan") ?? db?.subscription.plan ?? "Business");
  const [cycle, setCycle] = useState<"Monthly" | "Yearly">((sp.get("cycle") as "Monthly" | "Yearly") ?? "Monthly");
  const [method, setMethod] = useState("Bangla QR");
  const [ref, setRef] = useState("");
  const [done, setDone] = useState<Rec | null>(null);
  if (!db) return null;
  const plan = PLANS.find((p) => p.name === planName) ?? PLANS[1]!;
  const amount = cycle === "Yearly" ? plan.monthly * 10 : plan.monthly;
  
  if (done)
    return (
      <div className="panel rx-receipt">
        <span className="rx-receipt-ok">
          <Icon name="check" size={26} />
        </span>
        <h2>Payment successful</h2>
        <p>
          {money(done.amount)} received via {String(done.method)}. Your {String(done.plan)} plan is active until {date(db.subscription.nextBilling)}.
        </p>
        <div className="rx-quick rx-center">
          <Link className="rx-btn rx-btn-primary" href={`/records/subscriptionPayments/${done.id}`}>
            View receipt {String(done.code)}
          </Link>
          <Link className="rx-btn" href="/screens/115-current-subscription">
            Go to my plan
          </Link>
        </div>
      </div>
    );

  return (
    <div className="rx-qr-layout">
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>Order summary</h3>
            <p>Choose the plan and billing cycle</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            <span>Plan</span>
            <select value={planName} onChange={(e) => setPlanName(e.target.value)}>
              {PLANS.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Billing cycle</span>
            <select value={cycle} onChange={(e) => setCycle(e.target.value as "Monthly" | "Yearly")}>
              <option>Monthly</option>
              <option>Yearly</option>
            </select>
          </label>
        </div>
        <div className="totals-box rx-mt">
          <div>
            <span>{plan.name} plan · {cycle.toLowerCase()}</span>
            <b>{money(amount)}</b>
          </div>
          {cycle === "Yearly" && (
            <div>
              <span>Yearly saving</span>
              <b className="positive">− {money(plan.monthly * 2)}</b>
            </div>
          )}
          <div className="grand-total">
            <span>Payable now</span>
            <strong>{money(amount)}</strong>
          </div>
        </div>
      </section>
      <section className="panel rx-pay">
        <div className="rx-seg">
          {["Bangla QR", "bKash", "Card"].map((m) => (
            <button type="button" key={m} className={method === m ? "active" : ""} onClick={() => setMethod(m)}>
              {m}
            </button>
          ))}
        </div>
        {method === "Card" ? (
          <p className="rx-muted rx-pad">
            Card payments open the bank’s secure page. In this demo, enter any reference below and confirm to record the payment.
          </p>
        ) : (
          <>
            <div className="rx-qr-wrap">
              <QrArt value={`${planName}|${cycle}|${amount}|${method}`} size={190} />
            </div>
            <p className="rx-muted rx-center">
              Scan with any {method === "bKash" ? "bKash app" : "Bangla QR banking app"} to pay <b>{money(amount)}</b> to Tranzora Technologies.
            </p>
          </>
        )}
        <label className="rx-picker">
          <span>Transaction / reference ID</span>
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. 9KX4TQ27PL" />
        </label>
        <button
          type="button"
          className="primary full"
          disabled={ref.trim().length < 4}
          onClick={() => {
            try {
              const code = changePlan(planName, cycle, method, ref.trim());
              setDone(list("subscriptionPayments").find((p) => p.id === code) ?? null);
              toast("Payment recorded — plan updated");
            } catch (e) {
              toast(e instanceof StoreError ? e.message : "Payment failed", "error");
            }
          }}
        >
          <Icon name="check" size={14} /> I have paid {money(amount)}
        </button>
      </section>
    </div>
  );
}
