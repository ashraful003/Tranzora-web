"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { date, downloadFile, money, toCsv } from "@/lib/db/format";
import type { Rec } from "@/lib/db/schema";
import { generateBills, getRecord, getSettings, list, notify, num, recordLabel, setStatus, StoreError, useDb } from "@/lib/db/store";
import RecordPicker, { usePickedId } from "../records/RecordPicker";
import { newHref } from "../records/RecordTable";
import { inPeriod, useShell } from "../Shell";
import { EmptyState, Icon, Logo, StatGrid, Status, useToast } from "../ui";

export const COMPANY_DEFAULTS = {
  name: "Al Amin Transport Ltd.",
  address: "Central Freight Hub, 14 Tejgaon I/A, Dhaka-1208",
  phone: "+880 1712 345 678",
  email: "billing@alamintransport.com",
  tradeLicense: "TRAD/DNCC/014582/2026",
  bin: "004512789-0101",
  bank: "Dutch-Bangla Bank Ltd. · A/C 114-120-49281",
  bkash: "01712 345 678",
};

function printableHtml(title: string, el: HTMLElement | null) {
  const styles = [...document.querySelectorAll("style,link[rel=stylesheet]")].map((n) => n.outerHTML).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${styles}</head><body style="background:#fff;padding:24px">${el?.outerHTML ?? ""}</body></html>`;
}

/* ------------------------------------------------------------ invoices */

export function InvoiceView({ mode }: { mode: "invoice" | "print" }) {
  const db = useDb();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const [doc, setDoc] = useState<"invoice" | "challan">(sp.has("challan") ? "challan" : "invoice");
  const invoiceId = usePickedId("invoices");
  const challanId = usePickedId("challans", "challan");
  if (!db) return null;
  const company = getSettings("company", COMPANY_DEFAULTS);
  const showChallan = mode === "print" && doc === "challan";
  const inv = getRecord("invoices", invoiceId);
  const ch = getRecord("challans", challanId);
  const rec = showChallan ? ch : inv;
  if (!rec) return <EmptyState title="Nothing to show yet" text="Create an invoice or challan first." action={<Link className="primary" href={newHref("invoices")}>Create invoice</Link>} />;

  const trip = getRecord("trips", rec.tripId as string);
  const customer = getRecord("customers", rec.customerId as string);
  const vehicle = trip ? getRecord("vehicles", trip.vehicleId as string) : undefined;
  const driver = trip ? getRecord("drivers", trip.driverId as string) : undefined;
  const route = trip ? getRecord("routes", trip.routeId as string) : undefined;
  const subtotal = num(inv?.freight) + num(inv?.extraCharges) - num(inv?.discount);
  const vat = Math.round((subtotal * num(inv?.vatPct)) / 100);
  const due = num(inv?.total) - num(inv?.paid);
  const paperId = "rx-print-paper";

  return (
    <div className="invoice-preview-wrap">
      <div className="invoice-toolbar rx-invoice-toolbar">
        <div className="rx-invoice-pick">
          {mode === "print" && (
            <div className="rx-seg">
              <button type="button" className={!showChallan ? "active" : ""} onClick={() => setDoc("invoice")}>
                Tax invoice
              </button>
              <button type="button" className={showChallan ? "active" : ""} onClick={() => setDoc("challan")}>
                Delivery challan
              </button>
            </div>
          )}
          {showChallan ? <RecordPicker entity="challans" value={challanId} param="challan" /> : <RecordPicker entity="invoices" value={invoiceId} />}
        </div>
        <div className="invoice-actions">
          {!showChallan && inv && (
            <>
              <Link className="secondary" href={`/records/invoices/${inv.id}`}>
                <Icon name="eye" size={14} /> Open record
              </Link>
              {["Draft", "Approved"].includes(String(inv.status)) && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    try {
                      setStatus("invoices", inv.id, inv.status === "Draft" ? "Approved" : "Sent");
                      toast(`${inv.code} marked ${inv.status === "Draft" ? "Approved" : "Sent"}`);
                    } catch (e) {
                      toast(e instanceof StoreError ? e.message : "Could not update", "error");
                    }
                  }}
                >
                  <Icon name="check" size={14} /> {inv.status === "Draft" ? "Approve" : "Mark as sent"}
                </button>
              )}
              {due > 0 && (
                <button type="button" className="secondary" onClick={() => router.push(newHref("payments", { invoiceId: inv.id }))}>
                  <Icon name="income" size={14} /> Receive payment
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() => {
              downloadFile(`${rec.code}.html`, printableHtml(String(rec.code), document.getElementById(paperId)), "text/html");
              toast(`${rec.code} downloaded`);
            }}
          >
            <Icon name="download" size={14} /> Download
          </button>
          <button type="button" className="primary" onClick={() => window.print()}>
            <Icon name="print" size={14} /> Print / Save PDF
          </button>
        </div>
      </div>

      <article className="invoice-paper" id={paperId}>
        <div className="invoice-header">
          <div>
            <div className="brand brand-large">
              <Logo />
              <span>{String(company.name)}</span>
            </div>
            <p>
              {String(company.address)}
              <br />
              Hotline: {String(company.phone)} · {String(company.email)}
              <br />
              BIN: {String(company.bin)}
            </p>
          </div>
          <div className="invoice-meta">
            <h2>{showChallan ? "DELIVERY CHALLAN" : "TAX INVOICE"}</h2>
            <b>#{String(rec.code)}</b>
            <span>Date: {date(showChallan ? rec.date : rec.issueDate)}</span>
            {!showChallan && <span>Due date: {date(rec.dueDate)}</span>}
            <Status>{rec.status as string}</Status>
          </div>
        </div>
        <hr className="invoice-divider" />
        <div className="invoice-parties">
          <div>
            <small>BILL TO / CONSIGNOR</small>
            <b>{String(customer?.name ?? "—")}</b>
            <p>
              {String(customer?.address ?? "")}
              <br />
              BIN: {String(customer?.bin ?? "—")} · Contact: {String(customer?.contactPerson ?? "")} {String(customer?.phone ?? "")}
            </p>
          </div>
          <div>
            <small>DELIVERY TO / CONSIGNEE</small>
            <b>{String(trip?.dropoff ?? "—")}</b>
            <p>
              Trip {String(trip?.code ?? "—")} · {route ? String(route.name) : ""}
              <br />
              {showChallan ? `Receiver: ${String(rec.receiver ?? "—")}` : `Vehicle ${String(vehicle?.regNo ?? "—")} · Driver ${String(driver?.name ?? "—")}`}
            </p>
          </div>
        </div>
        <table className="invoice-table">
          <thead>
            <tr>
              <th>SL</th>
              <th>Description</th>
              <th>Vehicle / driver</th>
              <th>{showChallan ? "Packages" : "Weight / qty"}</th>
              {!showChallan && <th>Amount</th>}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>
                <b>{showChallan ? String(rec.goods ?? "Goods") : `Freight transport: ${route ? String(route.name) : String(trip?.pickup ?? "")}`}</b>
                <small>{String(trip?.goods ?? "")}</small>
              </td>
              <td>
                {String(vehicle?.regNo ?? "—")}
                <br />
                <small>{String(driver?.name ?? "")}</small>
              </td>
              <td>{showChallan ? String(rec.packages ?? "—") : String(trip?.weight ?? "1 trip")}</td>
              {!showChallan && <td>{money(inv?.freight)}</td>}
            </tr>
            {!showChallan && num(inv?.extraCharges) > 0 && (
              <tr>
                <td>2</td>
                <td>
                  <b>Toll, loading & other charges</b>
                  <small>As per trip records</small>
                </td>
                <td>—</td>
                <td>—</td>
                <td>{money(inv?.extraCharges)}</td>
              </tr>
            )}
          </tbody>
        </table>
        {!showChallan ? (
          <div className="invoice-totals">
            <div className="payment-note">
              <b>Payment instructions</b>
              <p>
                Bank: {String(company.bank)}
                <br />
                bKash merchant: {String(company.bkash)} (ref {String(rec.code)})
                <br />
                {String(inv?.notes ?? "")}
              </p>
            </div>
            <div className="totals-box">
              <div>
                <span>Subtotal</span>
                <b>{money(subtotal + num(inv?.discount))}</b>
              </div>
              {num(inv?.discount) > 0 && (
                <div>
                  <span>Discount</span>
                  <b>− {money(inv?.discount)}</b>
                </div>
              )}
              <div>
                <span>VAT ({num(inv?.vatPct)}%)</span>
                <b>{money(vat)}</b>
              </div>
              <div>
                <span>Paid</span>
                <b className="positive">− {money(inv?.paid)}</b>
              </div>
              <div className="grand-total">
                <span>Net payable</span>
                <strong>{money(due)}</strong>
              </div>
            </div>
          </div>
        ) : null}
        <div className="invoice-signatures">
          <div>
            <div className="sig-line" />
            <span>Prepared by (accounts)</span>
          </div>
          <div>
            <div className="sig-line" />
            <span>Driver ({String(driver?.name ?? "—")})</span>
          </div>
          <div>
            <div className="sig-line" />
            <span>Receiver signature & seal</span>
          </div>
        </div>
      </article>
    </div>
  );
}

/* --------------------------------------------------- booking confirmation */

export function BookingConfirmation() {
  const db = useDb();
  const toast = useToast();
  const router = useRouter();
  const id = usePickedId("bookings");
  if (!db) return null;
  const b = getRecord("bookings", id);
  if (!b) return <EmptyState title="No bookings yet" action={<Link className="primary" href={newHref("bookings")}>Create booking</Link>} />;
  const company = getSettings("company", COMPANY_DEFAULTS);
  const customer = getRecord("customers", b.customerId as string);
  const trip = list("trips").find((t) => t.bookingId === b.id);
  const change = (s: string) => {
    try {
      setStatus("bookings", b.id, s);
      toast(`${b.code} ${s.toLowerCase()}`);
    } catch (e) {
      toast(e instanceof StoreError ? e.message : "Could not update", "error");
    }
  };
  return (
    <div className="invoice-preview-wrap">
      <div className="invoice-toolbar rx-invoice-toolbar">
        <RecordPicker entity="bookings" value={b.id} />
        <div className="invoice-actions">
          {b.status === "Pending" && (
            <button type="button" className="primary" onClick={() => change("Confirmed")}>
              <Icon name="check" size={14} /> Confirm booking
            </button>
          )}
          {["Pending", "Confirmed"].includes(String(b.status)) && (
            <button type="button" className="secondary" onClick={() => change("Cancelled")}>
              Cancel booking
            </button>
          )}
          {trip ? (
            <Link className="secondary" href={`/records/trips/${trip.id}`}>
              <Icon name="trip" size={14} /> View trip {String(trip.code)}
            </Link>
          ) : (
            ["Confirmed", "Pending"].includes(String(b.status)) && (
              <button type="button" className="secondary" onClick={() => router.push(newHref("trips", { bookingId: b.id }))}>
                <Icon name="trip" size={14} /> Convert to trip
              </button>
            )
          )}
          <button type="button" className="secondary" onClick={() => window.print()}>
            <Icon name="print" size={14} /> Print
          </button>
        </div>
      </div>
      <article className="invoice-paper">
        <div className="invoice-header">
          <div>
            <div className="brand brand-large">
              <Logo />
              <span>{String(company.name)}</span>
            </div>
            <p>
              {String(company.address)}
              <br />
              {String(company.phone)} · {String(company.email)}
            </p>
          </div>
          <div className="invoice-meta">
            <h2>BOOKING CONFIRMATION</h2>
            <b>#{String(b.code)}</b>
            <span>Issued: {date(b.updatedAt)}</span>
            <Status>{b.status as string}</Status>
          </div>
        </div>
        <hr className="invoice-divider" />
        <div className="invoice-parties">
          <div>
            <small>SHIPPER</small>
            <b>{String(customer?.name ?? "—")}</b>
            <p>
              {String(b.contact ?? "")}
              <br />
              {String(customer?.address ?? "")}
            </p>
          </div>
          <div>
            <small>CONSIGNMENT</small>
            <b>{String(b.goods ?? "—")}</b>
            <p>
              {String(b.weight ?? "")} · {String(b.vehicleType ?? "")}
              <br />
              Priority: {String(b.priority ?? "—")}
            </p>
          </div>
        </div>
        <dl className="rx-confirm-grid">
          {[
            ["Pickup", b.pickup],
            ["Pickup date", date(b.pickupDate)],
            ["Drop-off", b.dropoff],
            ["Delivery by", date(b.deliveryDate)],
            ["Quoted rate", money(b.quote)],
            ["Advance received", money(b.advancePaid)],
            ["Balance on delivery", money(num(b.quote) - num(b.advancePaid))],
            ["Assigned trip", trip ? String(trip.code) : "Not yet assigned"],
          ].map(([k, v]) => (
            <div key={String(k)}>
              <dt>{String(k)}</dt>
              <dd>{String(v ?? "—")}</dd>
            </div>
          ))}
        </dl>
        <p className="rx-terms">{String(b.notes ?? "")} Rates include driver allowance; tolls and detention beyond 24 hours are billed at actuals.</p>
        <div className="invoice-signatures">
          <div>
            <div className="sig-line" />
            <span>For {String(company.name)}</span>
          </div>
          <div>
            <div className="sig-line" />
            <span>Shipper acknowledgement</span>
          </div>
        </div>
      </article>
    </div>
  );
}

/* ------------------------------------------------------- bill generation */

export function BillGeneration() {
  const db = useDb();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [vat, setVat] = useState(5);
  const [dueDays, setDueDays] = useState(30);
  const [customer, setCustomer] = useState("");
  const [created, setCreated] = useState<Rec[]>([]);
  const unbilled = useMemo(() => (db ? db.collections.trips.filter((t) => t.status === "Completed" && !db.collections.invoices.some((i) => i.tripId === t.id) && (!customer || t.customerId === customer)) : []), [db, customer]);
  if (!db) return null;
  const total = unbilled.filter((t) => picked.has(t.id)).reduce((s, t) => s + num(t.fare) + num(getRecord("routes", t.routeId as string)?.toll), 0);
  return (
    <>
      <StatGrid
        items={[
          { label: "Completed, not billed", value: String(unbilled.length), note: "trips ready to invoice", icon: "trip" },
          { label: "Selected", value: String(picked.size), note: "trips in this batch", icon: "check" },
          { label: "Batch value (before VAT)", value: money(total), note: "fare + route toll", icon: "income" },
          { label: "Invoices created now", value: String(created.length), note: "this session", icon: "document" },
        ]}
      />
      <section className="panel rx-bill">
        <div className="panel-title">
          <div>
            <h3>Batch billing</h3>
            <p>Pick completed trips and generate one draft invoice per trip.</p>
          </div>
          <div className="rx-tools-right">
            <select className="rx-select" value={customer} onChange={(e) => (setCustomer(e.target.value), setPicked(new Set()))} aria-label="Customer">
              <option value="">All customers</option>
              {list("customers").map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.name)}
                </option>
              ))}
            </select>
            <label className="rx-inline-field">
              VAT %
              <input type="number" min={0} value={vat} onChange={(e) => setVat(Number(e.target.value))} />
            </label>
            <label className="rx-inline-field">
              Due in (days)
              <input type="number" min={0} value={dueDays} onChange={(e) => setDueDays(Number(e.target.value))} />
            </label>
          </div>
        </div>
        {unbilled.length === 0 ? (
          <EmptyState title="Every completed trip is billed" text="New invoices will appear here once trips are completed." />
        ) : (
          <div className="table-scroll">
            <table className="rx-table">
              <thead>
                <tr>
                  <th className="rx-check">
                    <input type="checkbox" aria-label="Select all" checked={picked.size === unbilled.length} onChange={() => setPicked(picked.size === unbilled.length ? new Set() : new Set(unbilled.map((t) => t.id)))} />
                  </th>
                  <th>Trip</th>
                  <th>Customer</th>
                  <th>Route</th>
                  <th>Completed</th>
                  <th>Fare</th>
                </tr>
              </thead>
              <tbody>
                {unbilled.map((t) => (
                  <tr key={t.id} className="rx-row" onClick={() => setPicked((p) => (p.has(t.id) ? new Set([...p].filter((x) => x !== t.id)) : new Set([...p, t.id])))}>
                    <td className="rx-check">
                      <input type="checkbox" readOnly checked={picked.has(t.id)} aria-label={`Select ${t.code}`} />
                    </td>
                    <td>
                      <Link className="primary-cell" href={`/records/trips/${t.id}`} onClick={(e) => e.stopPropagation()}>
                        {String(t.code)}
                      </Link>
                    </td>
                    <td>{recordLabel("customers", getRecord("customers", t.customerId as string))}</td>
                    <td>{String(getRecord("routes", t.routeId as string)?.name ?? "—")}</td>
                    <td>{date(t.endDate ?? t.startDate)}</td>
                    <td className="rx-num">{money(t.fare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={() => setPicked(new Set())} disabled={!picked.size}>
            Clear selection
          </button>
          <button
            type="button"
            className="primary"
            disabled={!picked.size}
            onClick={() => {
              try {
                const made = generateBills([...picked], vat, dueDays);
                setCreated((c) => [...made, ...c]);
                setPicked(new Set());
                toast(`${made.length} draft invoice${made.length > 1 ? "s" : ""} generated`);
              } catch (e) {
                toast(e instanceof StoreError ? e.message : "Could not generate", "error");
              }
            }}
          >
            <Icon name="document" size={14} /> Generate {picked.size || ""} invoice{picked.size === 1 ? "" : "s"}
          </button>
        </div>
        {created.length > 0 && (
          <div className="rx-created">
            <b>Created:</b>
            {created.map((i) => (
              <Link key={i.id} href={`/records/invoices/${i.id}`} className="rx-chip">
                {String(i.code)} · {money(i.total)}
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* --------------------------------------------------------------- cashbook */

type Entry = { id: string; date: string; ref: string; href: string; party: string; head: string; method: string; inflow: number; outflow: number };

export function Cashbook() {
  const db = useDb();
  const toast = useToast();
  const router = useRouter();
  const { period, query } = useShell();
  const [method, setMethod] = useState("");
  const entries = useMemo(() => {
    if (!db) return [];
    const c = db.collections;
    const out: Entry[] = [
      ...c.incomes.filter((i) => i.status === "Received").map((i) => ({ id: i.id, date: String(i.date), ref: String(i.code), href: `/records/incomes/${i.id}`, party: recordLabel("customers", getRecord("customers", i.customerId as string)), head: `Income · ${i.source}`, method: String(i.method ?? "Cash"), inflow: num(i.amount), outflow: 0 })),
      ...c.expenses.filter((e) => ["Approved", "Paid"].includes(String(e.status))).map((e) => ({ id: e.id, date: String(e.date), ref: String(e.code), href: `/records/expenses/${e.id}`, party: String(e.submittedBy ?? "—"), head: `Expense · ${e.description}`, method: String(e.method ?? "Cash"), inflow: 0, outflow: num(e.amount) })),
      ...c.fuel.map((f) => ({ id: f.id, date: String(f.date), ref: String(f.code), href: `/records/fuel/${f.id}`, party: String(f.station ?? "Fuel station"), head: `Fuel · ${f.litres} L`, method: String(f.method ?? "Cash"), inflow: 0, outflow: num(f.amount) })),
      ...c.driverPayments.filter((p) => p.status === "Paid").map((p) => ({ id: p.id, date: String(p.date), ref: String(p.code), href: `/records/driverPayments/${p.id}`, party: String(getRecord("drivers", p.driverId as string)?.name ?? "—"), head: `Driver ${String(p.type).toLowerCase()}`, method: String(p.method ?? "Cash"), inflow: 0, outflow: num(p.amount) })),
    ];
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [db]);
  if (!db) return null;
  const opening = num(getSettings("cashbook", { opening: 250000 }).opening);
  const q = query.trim().toLowerCase();
  let bal = opening;
  const withBal = entries.map((e) => ({ ...e, balance: (bal += e.inflow - e.outflow) }));
  const rows = withBal.filter((e) => inPeriod(e.date, period) && (!method || e.method === method) && (!q || `${e.ref} ${e.party} ${e.head}`.toLowerCase().includes(q))).reverse();
  const inflow = rows.reduce((s, e) => s + e.inflow, 0);
  const outflow = rows.reduce((s, e) => s + e.outflow, 0);
  const methods = [...new Set(entries.map((e) => e.method))];

  return (
    <>
      <StatGrid
        items={[
          { label: "Opening balance", value: money(opening), note: "start of the book", icon: "database" },
          { label: "Cash in", value: money(inflow), note: `${rows.filter((r) => r.inflow).length} receipts`, positive: true, icon: "income" },
          { label: "Cash out", value: money(outflow), note: `${rows.filter((r) => r.outflow).length} payments`, positive: false, icon: "expense", tone: "red" },
          { label: "Closing balance", value: money(bal), note: "all entries to date", icon: "report" },
        ]}
      />
      <div className="table-card">
        <div className="table-tabs rx-table-tools">
          <div className="rx-tabs">
            <button type="button" className={!method ? "active" : ""} onClick={() => setMethod("")}>
              All methods <em>{entries.length}</em>
            </button>
            {methods.map((m) => (
              <button type="button" key={m} className={method === m ? "active" : ""} onClick={() => setMethod(m)}>
                {m} <em>{entries.filter((e) => e.method === m).length}</em>
              </button>
            ))}
          </div>
          <div className="rx-tools-right">
            <Link className="rx-btn" href={newHref("incomes")}>
              <Icon name="plus" size={13} /> Cash in
            </Link>
            <Link className="rx-btn" href={newHref("expenses")}>
              <Icon name="plus" size={13} /> Cash out
            </Link>
            <button
              type="button"
              className="rx-btn"
              onClick={() => {
                downloadFile("cashbook.csv", toCsv(["Date", "Reference", "Head", "Party", "Method", "In", "Out", "Balance"], rows.map((e) => [e.date, e.ref, e.head, e.party, e.method, e.inflow, e.outflow, e.balance])), "text/csv");
                toast("Cashbook exported");
              }}
            >
              <Icon name="download" size={13} /> Export
            </button>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No entries in this range" text="Change the date range or method filter." />
        ) : (
          <div className="table-scroll">
            <table className="rx-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Particulars</th>
                  <th>Party</th>
                  <th>Method</th>
                  <th>Cash in</th>
                  <th>Cash out</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 60).map((e) => (
                  <tr key={e.id} className="rx-row" onClick={() => router.push(e.href)} tabIndex={0} onKeyDown={(ev) => ev.key === "Enter" && router.push(e.href)}>
                    <td>{date(e.date)}</td>
                    <td>
                      <span className="primary-cell rx-nowrap">{e.ref}</span>
                    </td>
                    <td className="rx-cell-text">{e.head}</td>
                    <td className="rx-cell-text">{e.party}</td>
                    <td>{e.method}</td>
                    <td className="rx-num positive">{e.inflow ? money(e.inflow) : ""}</td>
                    <td className="rx-num negative">{e.outflow ? money(e.outflow) : ""}</td>
                    <td className="rx-num">
                      <b>{money(e.balance)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 60 && <div className="pagination"><span>Showing latest 60 of {rows.length} entries — export for the full book.</span></div>}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ receivables */

export function Receivables() {
  const db = useDb();
  const toast = useToast();
  const router = useRouter();
  const { query } = useShell();
  const rows = useMemo(() => {
    if (!db) return [];
    const now = Date.now();
    return db.collections.customers
      .map((c) => {
        const inv = db.collections.invoices.filter((i) => i.customerId === c.id && num(i.total) > num(i.paid));
        const bucket = [0, 0, 0, 0];
        for (const i of inv) {
          const late = Math.max(0, (now - Date.parse(String(i.dueDate))) / 86400000);
          const due = num(i.total) - num(i.paid);
          bucket[late <= 30 ? 0 : late <= 60 ? 1 : late <= 90 ? 2 : 3]! += due;
        }
        const due = bucket.reduce((s, x) => s + x, 0);
        return { c, inv, bucket, due, overdue: inv.filter((i) => Date.parse(String(i.dueDate)) < now).length };
      })
      .filter((r) => r.due > 0 && (!query.trim() || String(r.c.name).toLowerCase().includes(query.trim().toLowerCase())))
      .sort((a, b) => b.due - a.due);
  }, [db, query]);
  if (!db) return null;
  const total = rows.reduce((s, r) => s + r.due, 0);
  const sum = (k: number) => rows.reduce((s, r) => s + r.bucket[k]!, 0);
  return (
    <>
      <StatGrid
        items={[
          { label: "Total receivable", value: money(total), note: `${rows.length} customers owe`, icon: "income" },
          { label: "0–30 days", value: money(sum(0)), note: "current", positive: true, icon: "calendar" },
          { label: "31–90 days", value: money(sum(1) + sum(2)), note: "follow up", icon: "bell", tone: "orange" },
          { label: "Over 90 days", value: money(sum(3)), note: "high risk", positive: false, icon: "shield", tone: "red" },
        ]}
      />
      <div className="table-card">
        <div className="table-tabs rx-table-tools">
          <div className="rx-tabs">
            <span className="rx-tab-title">Aging by customer</span>
          </div>
          <div className="rx-tools-right">
            <button
              type="button"
              className="rx-btn"
              onClick={() => {
                downloadFile("receivables-aging.csv", toCsv(["Customer", "Open invoices", "0-30", "31-60", "61-90", "90+", "Total due", "Credit limit"], rows.map((r) => [String(r.c.name), r.inv.length, ...r.bucket, r.due, num(r.c.creditLimit)])), "text/csv");
                toast("Aging report exported");
              }}
            >
              <Icon name="download" size={13} /> Export
            </button>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No outstanding balances" text="Every customer invoice is fully paid." />
        ) : (
          <div className="table-scroll">
            <table className="rx-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Open invoices</th>
                  <th>0–30</th>
                  <th>31–60</th>
                  <th>61–90</th>
                  <th>90+</th>
                  <th>Total due</th>
                  <th>Credit use</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const use = num(r.c.creditLimit) ? Math.round((r.due / num(r.c.creditLimit)) * 100) : 0;
                  return (
                    <tr key={r.c.id} className="rx-row" onClick={() => router.push(`/records/customers/${r.c.id}`)} tabIndex={0}>
                      <td>
                        <span className="primary-cell">{String(r.c.name)}</span>
                      </td>
                      <td>
                        {r.inv.length} {r.overdue > 0 && <Status>{`${r.overdue} overdue`}</Status>}
                      </td>
                      {r.bucket.map((b, i) => (
                        <td key={i} className={`rx-num ${i === 3 && b ? "negative" : ""}`}>
                          {b ? money(b) : "—"}
                        </td>
                      ))}
                      <td className="rx-num">
                        <b>{money(r.due)}</b>
                      </td>
                      <td>
                        <span className="rx-meter" title={`${use}% of ${money(r.c.creditLimit)}`}>
                          <i style={{ width: `${Math.min(100, use)}%`, background: use > 90 ? "var(--red)" : use > 60 ? "var(--yellow)" : "var(--green)" }} />
                        </span>
                        <small className="rx-meter-label">{use}%</small>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="actions rx-actions-text">
                          <button
                            type="button"
                            onClick={() => {
                              notify("Payment reminder sent", `${String(r.c.name)}: ${money(r.due)} outstanding on ${r.inv.length} invoice(s)`, "Payment", "Info", "customers", r.c.id);
                              toast(`Reminder sent to ${String(r.c.contactPerson ?? r.c.name)}`);
                            }}
                          >
                            Remind
                          </button>
                          <button type="button" onClick={() => router.push(newHref("payments", { customerId: r.c.id, invoiceId: r.inv[0]!.id }))}>
                            Collect
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
