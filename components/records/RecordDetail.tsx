"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ago, date, dateTime, display, downloadFile, money } from "@/lib/db/format";
import { ENTITIES, type CollectionKey, type Rec } from "@/lib/db/schema";
import { deleteRecord, duplicateRecord, getRecord, list, num, recordLabel, setStatus, StoreError, useDb } from "@/lib/db/store";
import { listSlugFor } from "@/lib/views";
import { ConfirmDialog, Dropdown, Icon, iconFor, Modal, Status, useToast } from "../ui";
import RecordTable, { newHref } from "./RecordTable";

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

export default function RecordDetail({ entity, id, compact }: { entity: CollectionKey; id: string; compact?: boolean }) {
  const db = useDb();
  const router = useRouter();
  const toast = useToast();
  const def = ENTITIES[entity];
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [relTab, setRelTab] = useState(0);
  const [previewDoc, setPreviewDoc] = useState(false);
  const rec = db ? getRecord(entity, id) : undefined;

  const activity = useMemo(() => (db ? db.collections.auditLogs.filter((l) => l.recordRef === `${entity}/${id}`).slice(0, 8) : []), [db, entity, id]);

  if (!db) return null;
  if (!rec)
    return (
      <div className="panel rx-empty">
        <b>{def.singular} not found</b>
        <p>It may have been deleted or the link is wrong.</p>
        <Link className="primary" href={listSlugFor(entity) ? `/screens/${listSlugFor(entity)}` : "/"}>
          Back to {def.label.toLowerCase()}
        </Link>
      </div>
    );

  const statusKey = def.statusField ?? "status";
  const status = String(rec[statusKey] ?? "");
  const next = def.transitions?.[status] ?? [];
  const steps = LINEAR[entity];
  const stepIndex = steps ? steps.indexOf(status) : -1;
  const editable = def.fields.some((f) => !f.readOnly);
  const quick = quickActions(entity, rec);
  const kpis = summary(entity, rec);
  const related = (def.related ?? []).filter((r) => ENTITIES[r.entity]);
  const listSlug = listSlugFor(entity);

  const change = (s: string) => {
    try {
      setStatus(entity, rec.id, s);
      toast(`${recordLabel(entity, rec)} marked ${s}`);
    } catch (e) {
      toast(e instanceof StoreError ? e.message : "Could not change status", "error");
    }
  };

  const shownFields = def.fields.filter((f) => f.key !== "notes" && f.key !== "description" && f.type !== "textarea");
  const longFields = def.fields.filter((f) => f.type === "textarea" && rec[f.key]);

  return (
    <>
      <article className="panel detail-hero rx-hero">
        <div className="detail-avatar">
          <Icon name={iconFor(def.label)} size={26} />
        </div>
        <div className="rx-hero-copy">
          <span className="eyebrow">
            {def.singular} · {String(rec.code ?? rec.id)}
          </span>
          <h2>{recordLabel(entity, rec)}</h2>
          <p>
            Created {dateTime(rec.createdAt)} · updated {ago(rec.updatedAt)}
          </p>
        </div>
        {status && <Status>{status}</Status>}
        <div className="rx-hero-actions">
          {!compact && listSlug && (
            <Link className="secondary" href={`/screens/${listSlug}`}>
              <Icon name="back" size={14} /> All {def.label.toLowerCase()}
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
        <div className="rx-kpis">
          {kpis.map((k) => (
            <div key={k.label} className="panel">
              <span>{k.label}</span>
              <b className={k.tone ?? ""}>{k.value}</b>
            </div>
          ))}
        </div>
      )}

      {quick.length > 0 && (
        <div className="rx-quick">
          <span>Quick actions</span>
          {quick.map((a) => (
            <Link key={a.label} href={a.href} className="rx-btn">
              <Icon name={a.icon} size={13} /> {a.label}
            </Link>
          ))}
        </div>
      )}

      <div className="details-grid">
        <section className="panel">
          <div className="panel-title">
            <div>
              <h3>{def.singular} information</h3>
              <p>All recorded details</p>
            </div>
            {editable && (
              <Link href={`/records/${entity}/${rec.id}/edit`}>
                Edit
              </Link>
            )}
          </div>
          <dl className="detail-list rx-detail-list">
            {shownFields.map((f) => {
              const v = rec[f.key];
              return (
                <div key={f.key}>
                  <dt>{f.label}</dt>
                  <dd>
                    {f.key === statusKey ? (
                      <Status>{v as string}</Status>
                    ) : f.type === "ref" && v ? (
                      <Link className="rx-ref" href={`/records/${f.ref}/${v}`}>
                        {display(entity, f.key, rec)}
                      </Link>
                    ) : f.type === "email" && v ? (
                      <a className="rx-ref" href={`mailto:${v}`}>
                        {String(v)}
                      </a>
                    ) : f.type === "phone" && v ? (
                      <a className="rx-ref" href={`tel:${String(v).replace(/\s/g, "")}`}>
                        {String(v)}
                      </a>
                    ) : (
                      display(entity, f.key, rec)
                    )}
                  </dd>
                </div>
              );
            })}
            {longFields.map((f) => (
              <div key={f.key} className="rx-wide-dd">
                <dt>{f.label}</dt>
                <dd>{String(rec[f.key])}</dd>
              </div>
            ))}
          </dl>
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
        <aside className="panel">
          <div className="panel-title">
            <div>
              <h3>Activity</h3>
              <p>Changes recorded for this {def.singular.toLowerCase()}</p>
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
        </aside>
      </div>

      {related.length > 0 && (
        <section className="rx-related">
          <div className="rx-related-tabs" role="tablist">
            {related.map((r, i) => {
              const n = list(r.entity).filter((x) => x[r.field] === rec.id).length;
              return (
                <button type="button" role="tab" aria-selected={relTab === i} key={r.label} className={relTab === i ? "active" : ""} onClick={() => setRelTab(i)}>
                  {r.label} <em>{n}</em>
                </button>
              );
            })}
          </div>
          {related[relTab] && (
            <RecordTable
              key={related[relTab]!.entity}
              embedded
              view={{
                type: "table",
                entity: related[relTab]!.entity,
                filter: (x) => x[related[relTab]!.field] === rec.id,
                defaults: { [related[relTab]!.field]: rec.id },
                columns: ENTITIES[related[relTab]!.entity].columns.filter((c) => c !== related[relTab]!.field).slice(0, 7),
              }}
            />
          )}
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
            deleteRecord(entity, rec.id);
            toast(`${def.singular} deleted`);
            router.push(listSlug ? `/screens/${listSlug}` : "/");
          }}
        />
      )}
      {previewDoc && <DocumentPreview doc={rec} onClose={() => setPreviewDoc(false)} />}
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

