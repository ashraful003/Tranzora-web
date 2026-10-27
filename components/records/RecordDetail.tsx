"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ago, date, dateTime, display, downloadFile, initials, money } from "@/lib/db/format";
import { ENTITIES, relatedKey, type CollectionKey, type Field, type Related, type Rec } from "@/lib/db/schema";
import { deleteRecord, duplicateRecord, getRecord, list, num, recordLabel, setStatus, StoreError, useDb } from "@/lib/db/store";
import { ASSIGNABLE_TRIP_STATUSES, backLinkFor, TRIP_ASSIGN } from "@/lib/views";
import { UploadModal } from "../content/Documents";
import { ConfirmDialog, Dropdown, Icon, iconFor, Modal, Status, useToast } from "../ui";
import RecordTable, { AssignModal, newHref } from "./RecordTable";

/** Documents every vehicle / driver must hold; shown as a compliance panel on its detail page. */
const COMPLIANCE: Partial<Record<CollectionKey, { ownerType: string; field: string; types: string[] }>> = {
  vehicles: { ownerType: "Vehicle", field: "vehicleId", types: ["Registration", "Insurance", "Fitness", "Tax Token", "Route Permit"] },
  drivers: { ownerType: "Driver", field: "driverId", types: ["Driving Licence", "NID"] },
};

type IconName = Parameters<typeof Icon>[0]["name"];

/** Header of the detail page: a one-line summary and the key facts shown as chips. Missing fields are skipped. */
const HERO: Partial<Record<CollectionKey, { sub: string[]; joiner?: string; facts: { key: string; icon: IconName; label?: string }[] }>> = {
  vehicles: {
    sub: ["make", "type", "capacity"],
    facts: [
      { key: "branch", icon: "map", label: "Depot" },
      { key: "driverId", icon: "driver", label: "Driver" },
      { key: "odometer", icon: "route", label: "Odometer (km)" },
      { key: "fuelType", icon: "fuel", label: "Fuel" },
      { key: "ownership", icon: "shield", label: "Ownership" },
    ],
  },
  drivers: { sub: ["phone", "licenseNo"], facts: [{ key: "licenseExpiry", icon: "calendar" }, { key: "branch", icon: "map" }, { key: "salary", icon: "income" }, { key: "joinDate", icon: "calendar" }] },
  trips: { sub: ["pickup", "dropoff"], joiner: " → ", facts: [{ key: "customerId", icon: "customer" }, { key: "vehicleId", icon: "vehicle" }, { key: "driverId", icon: "driver" }, { key: "startDate", icon: "calendar" }] },
  customers: { sub: ["contactPerson", "phone"], facts: [{ key: "email", icon: "external" }, { key: "paymentTerms", icon: "calendar" }, { key: "creditLimit", icon: "income" }] },
  bookings: { sub: ["pickup", "dropoff"], joiner: " → ", facts: [{ key: "customerId", icon: "customer" }, { key: "pickupDate", icon: "calendar" }, { key: "vehicleType", icon: "vehicle" }] },
};

/** Field sections of the information panel; entities without an entry get one section. */
const GROUPS: Partial<Record<CollectionKey, { title: string; keys: string[] }[]>> = {
  vehicles: [
    { title: "Identification", keys: ["regNo", "chassisNo", "engineNo", "ownership"] },
    { title: "Specifications", keys: ["type", "make", "year", "capacity", "fuelType"] },
    { title: "Operations", keys: ["branch", "driverId", "odometer", "status"] },
  ],
};

const KPI_ICONS: [RegExp, IconName, string][] = [
  [/trip/i, "trip", "blue"],
  [/revenue|fare|received|paid|income/i, "income", "green"],
  [/fuel|diesel/i, "fuel", "orange"],
  [/maint/i, "wrench", "violet"],
  [/outstanding|advance|balance|expense/i, "expense", "red"],
  [/billed|invoice/i, "document", "blue"],
  [/due date/i, "calendar", "orange"],
  [/distance/i, "route", "violet"],
  [/completed/i, "check", "green"],
];
const kpiIcon = (label: string) => {
  const hit = KPI_ICONS.find(([re]) => re.test(label));
  return { icon: hit?.[1] ?? ("report" as IconName), tone: hit?.[2] ?? "blue" };
};

const relatedRows = (r: Related, id: string) => list(r.entity).filter((x) => x[r.field] === id && Object.entries(r.match ?? {}).every(([k, v]) => x[k] === v));

const LINEAR: Partial<Record<CollectionKey, string[]>> = {
  trips: ["Draft", "Planned", "Approved", "Dispatched", "In Progress", "Completed"],
  bookings: ["Pending", "Confirmed", "Assigned", "Completed"],
  maintenance: ["Requested", "Scheduled", "In Progress", "Completed"],
  invoices: ["Draft", "Approved", "Sent", "Paid"],
  settlements: ["Pending", "Approved", "Settled"],
  expenses: ["Submitted", "Approved", "Paid"],
};

type Quick = { label: string; href: string; icon: Parameters<typeof Icon>[0]["name"] };

function quickActions(key: CollectionKey, r: Rec): Quick[] {
  const q = (entity: CollectionKey, params: Record<string, unknown>, label: string, icon: Quick["icon"]): Quick => ({
    label,
    icon,
    href: newHref(entity, Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]))),
  });
  switch (key) {
    case "trips":
      return [
        q("invoices", { tripId: r.id }, "Create invoice", "document"),
        q("fuel", { tripId: r.id }, "Add fuel", "fuel"),
        q("expenses", { tripId: r.id }, "Add expense", "expense"),
        q("challans", { tripId: r.id }, "Issue challan", "document"),
        q("settlements", { tripId: r.id }, "Settle trip", "income"),
      ];
    case "vehicles":
      return [q("fuel", { vehicleId: r.id }, "Add fuel", "fuel"), q("maintenance", { vehicleId: r.id }, "Schedule service", "wrench"), q("documents", { vehicleId: r.id, ownerType: "Vehicle" }, "Add document", "document"), q("trips", { vehicleId: r.id, driverId: r.driverId }, "Plan trip", "trip")];
    case "drivers":
      return [q("driverPayments", { driverId: r.id, amount: r.salary }, "Pay salary", "income"), q("driverAdvances", { driverId: r.id }, "Give advance", "expense"), q("documents", { driverId: r.id, ownerType: "Driver", docType: "Driving Licence" }, "Add document", "document")];
    case "customers":
      return [q("bookings", { customerId: r.id }, "New booking", "booking"), q("invoices", { customerId: r.id }, "New invoice", "document"), q("payments", { customerId: r.id }, "Receive payment", "income")];
    case "bookings":
      return [q("trips", { bookingId: r.id }, "Convert to trip", "trip"), { label: "Confirmation", href: `/screens/046-booking-confirmation?id=${r.id}`, icon: "print" }];
    case "invoices":
      return [...(num(r.total) > num(r.paid) ? [q("payments", { invoiceId: r.id }, "Receive payment", "income")] : []), { label: "Print invoice", href: `/screens/086-invoice-details?id=${r.id}`, icon: "print" }];
    case "routes":
      return [q("trips", { routeId: r.id }, "Plan trip on route", "trip")];
    case "expenseCategories":
      return [q("expenses", { categoryId: r.id }, "Add expense", "expense")];
    case "challans":
      return [{ label: "Print challan", href: `/screens/089-pdf-preview-and-print?challan=${r.id}`, icon: "print" }];
    default:
      return [];
  }
}

function summary(key: CollectionKey, r: Rec): { label: string; value: string; tone?: string }[] {
  const sum = (entity: CollectionKey, field: string, test: (x: Rec) => boolean) => list(entity).filter(test).reduce((s, x) => s + num(x[field]), 0);
  if (key === "trips") {
    const fuel = sum("fuel", "amount", (x) => x.tripId === r.id);
    const exp = sum("expenses", "amount", (x) => x.tripId === r.id && x.status !== "Rejected");
    const profit = num(r.fare) - fuel - exp;
    return [
      { label: "Freight fare", value: money(r.fare) },
      { label: "Fuel cost", value: money(fuel) },
      { label: "Trip expenses", value: money(exp) },
      { label: "Trip profit", value: money(profit), tone: profit >= 0 ? "positive" : "negative" },
    ];
  }
  if (key === "vehicles") {
    const trips = list("trips").filter((x) => x.vehicleId === r.id);
    return [
      { label: "Trips", value: String(trips.length) },
      { label: "Revenue", value: money(trips.reduce((s, t) => s + num(t.fare), 0)) },
      { label: "Fuel cost", value: money(sum("fuel", "amount", (x) => x.vehicleId === r.id)) },
      { label: "Maintenance", value: money(sum("maintenance", "cost", (x) => x.vehicleId === r.id)) },
    ];
  }
  if (key === "drivers") {
    const trips = list("trips").filter((x) => x.driverId === r.id);
    const adv = list("driverAdvances").filter((x) => x.driverId === r.id).reduce((s, x) => s + num(x.amount) - num(x.settled), 0);
    return [
      { label: "Trips", value: String(trips.length) },
      { label: "Completed", value: String(trips.filter((t) => t.status === "Completed").length) },
      { label: "Paid this year", value: money(sum("driverPayments", "amount", (x) => x.driverId === r.id && x.status === "Paid")) },
      { label: "Advance outstanding", value: money(adv), tone: adv > 0 ? "negative" : undefined },
    ];
  }
  if (key === "customers") {
    const billed = sum("invoices", "total", (x) => x.customerId === r.id);
    const paid = sum("invoices", "paid", (x) => x.customerId === r.id);
    return [
      { label: "Trips", value: String(list("trips").filter((x) => x.customerId === r.id).length) },
      { label: "Billed", value: money(billed) },
      { label: "Received", value: money(paid) },
      { label: "Outstanding", value: money(billed - paid), tone: billed - paid > num(r.creditLimit) ? "negative" : undefined },
    ];
  }
  if (key === "invoices") {
    const due = num(r.total) - num(r.paid);
    return [
      { label: "Invoice total", value: money(r.total) },
      { label: "Paid", value: money(r.paid) },
      { label: "Balance due", value: money(due), tone: due > 0 ? "negative" : "positive" },
      { label: "Due date", value: date(r.dueDate) },
    ];
  }
  if (key === "routes") {
    const trips = list("trips").filter((x) => x.routeId === r.id);
    return [
      { label: "Trips", value: String(trips.length) },
      { label: "Revenue", value: money(trips.reduce((s, t) => s + num(t.fare), 0)) },
      { label: "Distance", value: `${r.distanceKm ?? "—"} km` },
      { label: "Std. diesel (3.2 km/l)", value: `${Math.round(num(r.distanceKm) / 3.2)} L` },
    ];
  }
  return [];
}

export default function RecordDetail({ entity, id, section }: { entity: CollectionKey; id: string; section?: string }) {
  const db = useDb();
  const router = useRouter();
  const toast = useToast();
  const def = ENTITIES[entity];
  const related = (def.related ?? []).filter((r) => ENTITIES[r.entity]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [relTab, setRelTab] = useState(() => Math.max(0, related.findIndex((r) => relatedKey(r) === section)));
  const [previewDoc, setPreviewDoc] = useState(false);
  const [upload, setUpload] = useState<Record<string, string> | null>(null);
  const [assign, setAssign] = useState<"vehicle" | "driver" | null>(null);
  const relatedRef = useRef<HTMLElement>(null);
  const rec = db ? getRecord(entity, id) : undefined;

  const activity = useMemo(() => (db ? db.collections.auditLogs.filter((l) => l.recordRef === `${entity}/${id}`).slice(0, 8) : []), [db, entity, id]);

  // A `?section=` link (e.g. from an old "Insurance management" URL) jumps straight to that section.
  const hasRec = !!rec;
  useEffect(() => {
    if (section && hasRec) relatedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [section, hasRec]);

  if (!db) return null;
  const back = backLinkFor(entity, rec);
  if (!rec)
    return (
      <div className="panel rx-empty">
        <b>{def.singular} not found</b>
        <p>It may have been deleted or the link is wrong.</p>
        <Link className="primary" href={back?.href ?? "/"}>
          {back?.label ?? "Back to dashboard"}
        </Link>
      </div>
    );

  const openSection = (i: number) => {
    setRelTab(i);
    const key = related[i] ? relatedKey(related[i]!) : "";
    window.history.replaceState(null, "", `${window.location.pathname}?section=${key}`);
  };
  const compliance = COMPLIANCE[entity];
  const uploadFor = (docType?: string) =>
    compliance && setUpload({ ownerType: compliance.ownerType, [compliance.field]: rec.id, ...(docType ? { docType, name: `${docType} — ${recordLabel(entity, rec)}` } : {}) });

  const statusKey = def.statusField ?? "status";
  const status = String(rec[statusKey] ?? "");
  const next = def.transitions?.[status] ?? [];
  const steps = LINEAR[entity];
  const stepIndex = steps ? steps.indexOf(status) : -1;
  const editable = def.fields.some((f) => !f.readOnly);
  const quick = quickActions(entity, rec);
  const kpis = summary(entity, rec);
  const canAssign = entity === "trips" && ASSIGNABLE_TRIP_STATUSES.includes(status);

  const change = (s: string) => {
    try {
      setStatus(entity, rec.id, s);
      toast(`${recordLabel(entity, rec)} marked ${s}`);
    } catch (e) {
      toast(e instanceof StoreError ? e.message : "Could not change status", "error");
    }
  };

  const valueOf = (f: Field) => {
    const v = rec[f.key];
    if (f.key === statusKey) return <Status>{v as string}</Status>;
    if (f.type === "ref" && v)
      return (
        <Link className="rx-ref" href={`/records/${f.ref}/${v}`}>
          {display(entity, f.key, rec)}
        </Link>
      );
    if (f.type === "email" && v)
      return (
        <a className="rx-ref" href={`mailto:${v}`}>
          {String(v)}
        </a>
      );
    if (f.type === "phone" && v)
      return (
        <a className="rx-ref" href={`tel:${String(v).replace(/\s/g, "")}`}>
          {String(v)}
        </a>
      );
    return display(entity, f.key, rec);
  };

  const fieldsByKey = new Map(def.fields.map((f) => [f.key, f]));
  const hero = HERO[entity];
  const subtitle = (hero?.sub ?? []).map((k) => (rec[k] ? display(entity, k, rec) : "")).filter(Boolean).join(hero?.joiner ?? " · ");
  const facts = (hero?.facts ?? []).filter((x) => fieldsByKey.has(x.key) && rec[x.key] !== undefined && rec[x.key] !== "");
  const shownFields = def.fields.filter((f) => f.key !== "notes" && f.key !== "description" && f.type !== "textarea");
  const groups = (GROUPS[entity] ?? [{ title: `${def.singular} information`, keys: shownFields.map((f) => f.key) }])
    .map((g) => ({ ...g, fields: g.keys.map((k) => fieldsByKey.get(k)).filter((f): f is Field => !!f) }))
    .filter((g) => g.fields.length);
  const longFields = def.fields.filter((f) => f.type === "textarea" && rec[f.key]);
  const driver = entity === "vehicles" && rec.driverId ? getRecord("drivers", rec.driverId as string) : undefined;
  const complianceDocs = compliance
    ? compliance.types.map((type) => {
        const doc = list("documents")
          .filter((d) => d[compliance.field] === rec.id && d.docType === type)
          .sort((a, b) => String(b.expiryDate ?? "").localeCompare(String(a.expiryDate ?? "")))[0];
        return { type, doc, st: doc ? String(doc.status) : "Missing" };
      })
    : [];
  const compliant = complianceDocs.filter((c) => c.st === "Valid" || c.st === "No Expiry").length;

  return (
    <>
      <article className="panel rd-hero">
        <div className="rd-hero-top">
          <div className="rd-hero-icon">
            <Icon name={iconFor(def.label)} size={26} />
          </div>
          <div className="rd-hero-copy">
            <span className="rd-eyebrow">
              {def.singular} · {String(rec.code ?? rec.id)}
            </span>
            <div className="rd-hero-title">
              <h2 className={entity === "vehicles" ? "rd-plate" : ""}>{recordLabel(entity, rec)}</h2>
              {status && <Status>{status}</Status>}
            </div>
            {subtitle && <p className="rd-hero-sub">{subtitle}</p>}
          </div>
          <div className="rd-hero-actions">
            {back && (
              <Link className="secondary" href={back.href}>
                <Icon name="back" size={14} /> {back.label}
              </Link>
            )}
            {editable && (
              <Link className="secondary" href={`/records/${entity}/${rec.id}/edit`}>
                <Icon name="edit" size={14} /> Edit
              </Link>
            )}
            {next.length > 0 && (
              <Dropdown
                className="primary"
                label="Change status"
                trigger={
                  <>
                    Change status <Icon name="chev-down" size={13} />
                  </>
                }
              >
                {(close) =>
                  next.map((s) => (
                    <button type="button" key={s} onClick={() => (close(), change(s))}>
                      <Icon name="arrow" size={13} /> Mark as {s}
                    </button>
                  ))
                }
              </Dropdown>
            )}
            <Dropdown trigger={<Icon name="dots" size={16} />} className="rx-icon-btn rx-icon-btn-lg" label="More actions">
              {(close) => (
                <>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        try {
                          const copy = duplicateRecord(entity, rec.id);
                          toast(`Duplicated as ${recordLabel(entity, copy)}`);
                          router.push(`/records/${entity}/${copy.id}`);
                        } catch (e) {
                          toast(e instanceof StoreError ? e.message : "Could not duplicate", "error");
                        }
                      }}
                    >
                      <Icon name="copy" size={13} /> Duplicate
                    </button>
                  )}
                  <button type="button" onClick={() => (close(), window.print())}>
                    <Icon name="print" size={13} /> Print this page
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      downloadFile(`${String(rec.code ?? rec.id)}.json`, JSON.stringify(rec, null, 2), "application/json");
                      toast("Record exported");
                    }}
                  >
                    <Icon name="download" size={13} /> Export record (JSON)
                  </button>
                  <button type="button" className="danger" onClick={() => (close(), setConfirmDelete(true))}>
                    <Icon name="trash" size={13} /> Delete {def.singular.toLowerCase()}
                  </button>
                </>
              )}
            </Dropdown>
          </div>
        </div>
        {facts.length > 0 && (
          <ul className="rd-facts">
            {facts.map((x) => (
              <li key={x.key}>
                <span className="rd-fact-icon">
                  <Icon name={x.icon} size={15} />
                </span>
                <span>
                  <small>{x.label ?? fieldsByKey.get(x.key)!.label}</small>
                  <b>{valueOf(fieldsByKey.get(x.key)!)}</b>
                </span>
              </li>
            ))}
          </ul>
        )}
        <footer className="rd-hero-foot">
          <span>Created {dateTime(rec.createdAt)}</span>
          <span>Last updated {ago(rec.updatedAt)}</span>
        </footer>
      </article>

      {steps && stepIndex >= 0 && (
        <ol className="rx-stepper" aria-label="Workflow progress">
          {steps.map((s, i) => (
            <li key={s} className={i < stepIndex ? "done" : i === stepIndex ? "current" : ""}>
              <span>{i < stepIndex ? <Icon name="check" size={12} /> : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      )}
      {steps && stepIndex < 0 && status && (
        <div className="rx-banner">
          This {def.singular.toLowerCase()} is <b>{status}</b>.
          {next.length > 0 && (
            <button type="button" className="rx-link" onClick={() => change(next[0]!)}>
              Move to {next[0]}
            </button>
          )}
        </div>
      )}

      {kpis.length > 0 && (
        <div className="rd-kpis">
          {kpis.map((k) => (
            <div key={k.label} className="panel rd-kpi">
              <span className={`rd-kpi-icon rd-tone-${kpiIcon(k.label).tone}`}>
                <Icon name={kpiIcon(k.label).icon} size={17} />
              </span>
              <span>
                <small>{k.label}</small>
                <b className={k.tone ?? ""}>{k.value}</b>
              </span>
            </div>
          ))}
        </div>
      )}

      {compliance && (
        <section className="panel rd-section" aria-label="Compliance documents">
          <div className="panel-title">
            <div>
              <h3>Compliance documents</h3>
              <p>
                {compliant} of {complianceDocs.length} valid
                {compliant < complianceDocs.length ? " — renew or upload the rest to stay road-legal" : " — all papers are in order"}
              </p>
            </div>
            <button type="button" className="rx-btn" onClick={() => uploadFor()}>
              <Icon name="upload" size={13} /> Upload document
            </button>
          </div>
          <div className="rx-compliance">
            {complianceDocs.map(({ type, doc, st }) => {
              const tab = related.findIndex((r) => r.entity === "documents" && r.match?.docType === type);
              const allDocs = related.findIndex((r) => r.entity === "documents" && !r.match?.docType);
              return (
                <article key={type} className={`rx-comp rx-comp-${st.toLowerCase().replace(/\s+/g, "-")}`}>
                  <button type="button" className="rx-comp-head" onClick={() => openSection(tab >= 0 ? tab : Math.max(0, allDocs))} title={`Show ${type.toLowerCase()} records`}>
                    <span className="rx-comp-icon">
                      <Icon name={st === "Valid" || st === "No Expiry" ? "check" : "shield"} size={15} />
                    </span>
                    <span>
                      <b>{type}</b>
                      <small>{doc ? String(doc.number ?? doc.name) : "Not on file"}</small>
                    </span>
                  </button>
                  <div className="rx-comp-meta">
                    <span>{doc ? (doc.expiryDate ? `Expires ${date(doc.expiryDate)}` : "No expiry") : "Upload a copy"}</span>
                    <Status>{st}</Status>
                  </div>
                  <div className="rx-comp-actions">
                    {doc && (
                      <Link className="rx-btn" href={`/records/documents/${doc.id}`}>
                        <Icon name="eye" size={12} /> View
                      </Link>
                    )}
                    <button type="button" className={`rx-btn ${!doc || st === "Expired" || st === "Expiring Soon" ? "rx-btn-primary" : ""}`} onClick={() => uploadFor(type)}>
                      <Icon name="upload" size={12} /> {doc ? "Renew" : "Upload"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="rd-layout">
        <div className="rd-main">
          <section className="panel rd-section">
            <div className="panel-title">
              <div>
                <h3>{def.singular} information</h3>
                <p>Everything recorded for this {def.singular.toLowerCase()}</p>
              </div>
              {editable && (
                <Link className="rx-btn" href={`/records/${entity}/${rec.id}/edit`}>
                  <Icon name="edit" size={13} /> Edit details
                </Link>
              )}
            </div>
            {groups.map((g) => (
              <div key={g.title} className="rd-group">
                {groups.length > 1 && <h4>{g.title}</h4>}
                <dl className="rd-fields">
                  {g.fields.map((f) => (
                    <div key={f.key}>
                      <dt>{f.label}</dt>
                      <dd>{valueOf(f)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            {longFields.map((f) => (
              <div key={f.key} className="rd-group">
                <h4>{f.label}</h4>
                <p className="rd-note">{String(rec[f.key])}</p>
              </div>
            ))}
            {entity === "documents" && (
              <div className="rx-doc-file">
                <Icon name="document" size={20} />
                <span>
                  <b>{String(rec.fileName ?? "No file attached")}</b>
                  <small>{String(rec.fileSize ?? "")}</small>
                </span>
                <button type="button" className="secondary" onClick={() => setPreviewDoc(true)}>
                  <Icon name="eye" size={13} /> Preview
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    downloadDocument(rec);
                    toast(`Downloading ${String(rec.fileName ?? rec.name)}`);
                  }}
                >
                  <Icon name="download" size={13} /> Download
                </button>
              </div>
            )}
          </section>
        </div>

        <aside className="rd-side">
          {entity === "vehicles" && (
            <section className="panel rd-section rd-person">
              <div className="panel-title">
                <div>
                  <h3>Assigned driver</h3>
                  <p>{driver ? "Currently responsible for this vehicle" : "No driver assigned yet"}</p>
                </div>
              </div>
              {driver ? (
                <>
                  <div className="rd-person-head">
                    <span className="rd-avatar">{initials(driver.name)}</span>
                    <span>
                      <Link className="rd-person-name" href={`/records/drivers/${driver.id}`}>
                        {String(driver.name)}
                      </Link>
                      <small>{[driver.licenseNo, driver.phone].filter(Boolean).map(String).join(" · ")}</small>
                    </span>
                    <Status>{driver.status as string}</Status>
                  </div>
                  <div className="rd-person-actions">
                    {Boolean(driver.phone) && (
                      <a className="rx-btn" href={`tel:${String(driver.phone).replace(/\s/g, "")}`}>
                        <Icon name="external" size={13} /> Call
                      </a>
                    )}
                    <Link className="rx-btn" href={`/records/drivers/${driver.id}`}>
                      <Icon name="eye" size={13} /> View profile
                    </Link>
                  </div>
                </>
              ) : (
                editable && (
                  <Link className="rx-btn rx-btn-primary" href={`/records/${entity}/${rec.id}/edit`}>
                    <Icon name="plus" size={13} /> Assign a driver
                  </Link>
                )
              )}
            </section>
          )}

          {(quick.length > 0 || canAssign) && (
            <section className="panel rd-section">
              <div className="panel-title">
                <div>
                  <h3>Quick actions</h3>
                  <p>Start related work for this {def.singular.toLowerCase()}</p>
                </div>
              </div>
              <div className="rd-actions">
                {canAssign && (
                  <>
                    <button type="button" onClick={() => setAssign("vehicle")}>
                      <span className="rd-action-icon">
                        <Icon name="vehicle" size={15} />
                      </span>
                      {rec.vehicleId ? "Change vehicle" : "Assign vehicle"}
                      <Icon name="arrow" size={13} />
                    </button>
                    <button type="button" onClick={() => setAssign("driver")}>
                      <span className="rd-action-icon">
                        <Icon name="driver" size={15} />
                      </span>
                      {rec.driverId ? "Change driver" : "Assign driver"}
                      <Icon name="arrow" size={13} />
                    </button>
                  </>
                )}
                {quick.map((a) => (
                  <Link key={a.label} href={a.href}>
                    <span className="rd-action-icon">
                      <Icon name={a.icon} size={15} />
                    </span>
                    {a.label}
                    <Icon name="arrow" size={13} />
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="panel rd-section">
            <div className="panel-title">
              <div>
                <h3>Activity</h3>
                <p>Latest changes to this {def.singular.toLowerCase()}</p>
              </div>
            </div>
            <div className="timeline">
              {activity.map((l) => (
                <div key={l.id}>
                  <i />
                  <p>
                    <b>{String(l.message)}</b>
                    <small>
                      {String(l.user)} · {ago(l.createdAt)}
                    </small>
                  </p>
                </div>
              ))}
              <div>
                <i />
                <p>
                  <b>Record created</b>
                  <small>{dateTime(rec.createdAt)}</small>
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="rx-related" ref={relatedRef}>
          <div className="rx-related-tabs" role="tablist">
            {related.map((r, i) => (
              <button type="button" role="tab" aria-selected={relTab === i} key={r.label} className={relTab === i ? "active" : ""} onClick={() => openSection(i)}>
                {r.label} <em>{relatedRows(r, rec.id).length}</em>
              </button>
            ))}
          </div>
          {related[relTab] &&
            (() => {
              const r = related[relTab]!;
              const hidden = new Set([r.field, ...Object.keys(r.match ?? {})]);
              return (
                <RecordTable
                  key={relatedKey(r)}
                  embedded
                  view={{
                    type: "table",
                    entity: r.entity,
                    filter: (x) => x[r.field] === rec.id && Object.entries(r.match ?? {}).every(([k, v]) => x[k] === v),
                    defaults: { [r.field]: rec.id, ...r.match },
                    columns: ENTITIES[r.entity].columns.filter((c) => !hidden.has(c)).slice(0, 7),
                  }}
                  addAction={r.entity === "documents" && compliance ? { label: "Upload document", onClick: () => uploadFor(r.match?.docType) } : undefined}
                />
              );
            })()}
        </section>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${def.singular.toLowerCase()}?`}
          message={
            <>
              <b>{recordLabel(entity, rec)}</b> will be removed permanently. Linked records keep a reference that will show as “—”.
            </>
          }
          confirmLabel="Delete"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            try {
              deleteRecord(entity, rec.id);
              toast(`${def.singular} deleted`);
              router.push(back?.href ?? "/");
            } catch (e) {
              toast(e instanceof StoreError ? e.message : "Could not delete", "error");
            }
          }}
        />
      )}
      {previewDoc && <DocumentPreview doc={rec} onClose={() => setPreviewDoc(false)} />}
      {upload && <UploadModal ownerType={upload.ownerType} initial={upload} onClose={() => setUpload(null)} />}
      {assign && <AssignModal view={TRIP_ASSIGN[assign]} rec={rec} onClose={() => setAssign(null)} />}
    </>
  );
}

export function downloadDocument(doc: Rec) {
  const name = String(doc.fileName ?? `${doc.code}.txt`);
  if (typeof doc.fileData === "string" && doc.fileData.startsWith("data:")) {
    const a = document.createElement("a");
    a.href = doc.fileData;
    a.download = name;
    a.click();
    return;
  }
  const text = [`${doc.name}`, `Document number: ${doc.number ?? "—"}`, `Type: ${doc.docType}`, `Issued: ${date(doc.issueDate)}`, `Expires: ${date(doc.expiryDate)}`, `Status: ${doc.status}`, "", "Demo placeholder — upload the scanned copy from the document page to replace this file."].join("\n");
  downloadFile(name.replace(/\.pdf$/i, ".txt"), text);
}

export function DocumentPreview({ doc, onClose }: { doc: Rec; onClose: () => void }) {
  const data = typeof doc.fileData === "string" ? doc.fileData : "";
  return (
    <Modal
      title={String(doc.name)}
      subtitle={`${doc.docType} · ${doc.fileName ?? "no file"} · ${doc.fileSize ?? ""}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="primary" onClick={() => downloadDocument(doc)}>
            <Icon name="download" size={14} /> Download
          </button>
        </>
      }
    >
      {data.startsWith("data:image") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="rx-doc-img" src={data} alt={String(doc.name)} />
      ) : data.startsWith("data:application/pdf") ? (
        <iframe className="rx-doc-frame" src={data} title={String(doc.name)} />
      ) : (
        <div className="rx-doc-paper">
          <div className="rx-doc-seal">
            <Icon name="shield" size={22} />
          </div>
          <h4>{String(doc.docType).toUpperCase()}</h4>
          <h3>{String(doc.name)}</h3>
          <dl>
            {[
              ["Document no.", doc.number],
              ["Belongs to", doc.vehicleId ? recordLabel("vehicles", getRecord("vehicles", doc.vehicleId as string)) : doc.driverId ? recordLabel("drivers", getRecord("drivers", doc.driverId as string)) : doc.ownerType],
              ["Issue date", date(doc.issueDate)],
              ["Expiry date", date(doc.expiryDate)],
              ["Responsible", doc.responsible],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt>{String(k)}</dt>
                <dd>{String(v ?? "—")}</dd>
              </div>
            ))}
          </dl>
          <Status>{doc.status as string}</Status>
          <p className="rx-muted">Preview generated from the stored details. Upload a scanned copy to see the original.</p>
        </div>
      )}
    </Modal>
  );
}

