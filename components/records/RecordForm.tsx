"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { money } from "@/lib/db/format";
import { docStatus, ENTITIES, type CollectionKey, type Field, type Rec } from "@/lib/db/schema";
import { addDays, createRecord, getRecord, list, num, recordLabel, StoreError, today, updateRecord, useDb } from "@/lib/db/store";
import { Icon, useToast } from "../ui";

type Values = Record<string, string>;

const toStr = (v: unknown) => (v === undefined || v === null ? "" : String(v));

function defaultsFor(entity: CollectionKey): Values {
  const def = ENTITIES[entity];
  const v: Values = {};
  for (const f of def.fields) {
    if (f.key === def.statusField && def.statuses?.length) v[f.key] = entity === "trips" ? "Planned" : def.statuses[0]!;
    else if (f.type === "date" && ["date", "issueDate", "startDate", "pickupDate", "scheduledDate", "billDate", "joinDate"].includes(f.key)) v[f.key] = today();
  }
  if ("dueDate" in Object.fromEntries(def.fields.map((f) => [f.key, 1]))) v.dueDate = addDays(today(), 30);
  if (entity === "invoices") Object.assign(v, { vatPct: "5", discount: "0", extraCharges: "0" });
  if (entity === "fuel") v.rate = "110";
  if (def.fields.some((f) => f.key === "method")) v.method = "Cash";
  if (entity === "users") v.branch = "All branches";
  if (entity === "vehicles") Object.assign(v, { fuelType: "Diesel", ownership: "Own", odometer: "0" });
  if (entity === "subscriptionPayments") v.period = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
  if (entity === "driverPayments") v.month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
  return v;
}

/** When a linked record is picked, copy its useful values into empty fields. */
function autofill(entity: CollectionKey, key: string, value: string, v: Values): Values {
  const next = { ...v, [key]: value };
  const fillEmpty = (k: string, val: unknown) => {
    if (val !== undefined && val !== null && (next[k] === "" || next[k] === undefined || next[k] === "0")) next[k] = String(val);
  };
  const force = (k: string, val: unknown) => {
    if (val !== undefined && val !== null) next[k] = String(val);
  };
  if (!value) return next;
  if (key === "bookingId") {
    const b = getRecord("bookings", value);
    if (b) {
      force("customerId", b.customerId);
      fillEmpty("pickup", b.pickup);
      fillEmpty("dropoff", b.dropoff);
      fillEmpty("goods", b.goods);
      fillEmpty("weight", b.weight);
      fillEmpty("fare", b.quote);
      fillEmpty("startDate", b.pickupDate);
    }
  }
  if (key === "routeId") {
    const r = getRecord("routes", value);
    if (r) {
      fillEmpty("pickup", r.origin);
      fillEmpty("dropoff", r.destination);
      force("distanceKm", r.distanceKm);
      fillEmpty("fare", r.rate);
    }
  }
  if (key === "tripId") {
    const t = getRecord("trips", value);
    if (t) {
      if (["fuel", "expenses"].includes(entity)) force("vehicleId", t.vehicleId);
      if (["fuel", "settlements", "driverAdvances"].includes(entity)) force("driverId", t.driverId);
      if (["invoices", "incomes", "challans"].includes(entity)) force("customerId", t.customerId);
      if (entity === "invoices") fillEmpty("freight", t.fare);
      if (entity === "incomes") fillEmpty("amount", t.fare);
      if (entity === "challans") {
        fillEmpty("goods", t.goods);
        fillEmpty("date", t.startDate);
      }
      if (["settlements", "driverAdvances"].includes(entity)) fillEmpty(entity === "settlements" ? "advance" : "amount", t.advance);
    }
  }
  if (key === "invoiceId" && entity === "payments") {
    const inv = getRecord("invoices", value);
    if (inv) {
      force("customerId", inv.customerId);
      fillEmpty("amount", Math.max(0, num(inv.total) - num(inv.paid)));
    }
  }
  if (key === "vehicleId" && ["fuel", "maintenance"].includes(entity)) {
    const veh = getRecord("vehicles", value);
    if (veh) {
      fillEmpty("odometer", veh.odometer);
      if (entity === "fuel") fillEmpty("driverId", veh.driverId);
    }
  }
  return next;
}

function preview(entity: CollectionKey, v: Values): { label: string; value: string }[] {
  if (entity === "fuel") return [{ label: "Total amount", value: money(num(v.litres) * num(v.rate)) }];
  if (entity === "maintenance") return [{ label: "Total cost", value: money(num(v.partsCost) + num(v.labourCost)) }];
  if (entity === "settlements") {
    const b = num(v.advance) - num(v.actualExpense);
    return [{ label: b >= 0 ? "Driver returns" : "Company pays driver", value: money(Math.abs(b)) }];
  }
  if (entity === "invoices") {
    const sub = num(v.freight) + num(v.extraCharges) - num(v.discount);
    return [
      { label: "Subtotal", value: money(sub) },
      { label: `VAT ${num(v.vatPct)}%`, value: money((sub * num(v.vatPct)) / 100) },
      { label: "Invoice total", value: money(Math.round(sub * (1 + num(v.vatPct) / 100))) },
    ];
  }
  if (entity === "documents") return [{ label: "Expiry status", value: docStatus(v.expiryDate || undefined) }];
  return [];
}

export default function RecordForm({ entity, id, initial, onDone, cancelHref }: { entity: CollectionKey; id?: string; initial?: Values; onDone?: (rec: Rec) => void; cancelHref?: string }) {
  const db = useDb();
  const router = useRouter();
  const toast = useToast();
  const def = ENTITIES[entity];
  const existing = id ? getRecord(entity, id) : undefined;

  const [values, setValues] = useState<Values>(() => {
    if (existing) return Object.fromEntries(def.fields.map((f) => [f.key, toStr(existing[f.key])]));
    let v = { ...defaultsFor(entity), ...(initial ?? {}) };
    for (const [k, val] of Object.entries(initial ?? {})) if (val) v = autofill(entity, k, val, v);
    return v;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [file, setFile] = useState<{ name: string; size: string; data?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const editable = def.fields.filter((f) => !f.readOnly);
  const calc = useMemo(() => preview(entity, values), [entity, values]);

  if (!db) return null;
  if (id && !existing)
    return (
      <div className="panel rx-empty">
        <b>This {def.singular.toLowerCase()} no longer exists.</b>
      </div>
    );

  const set = (f: Field, value: string) => {
    setValues((v) => (f.type === "ref" ? autofill(entity, f.key, value, v) : { ...v, [f.key]: value }));
    if (errors[f.key]) setErrors((e) => ({ ...e, [f.key]: "" }));
  };

  const check = () => {
    const e: Record<string, string> = {};
    for (const f of editable) {
      const val = values[f.key]?.trim() ?? "";
      if (f.required && !val) e[f.key] = `${f.label} is required`;
      else if ((f.type === "number" || f.type === "money") && val && (Number.isNaN(Number(val)) || (f.min !== undefined && Number(val) < f.min))) e[f.key] = `Enter a valid ${f.label.toLowerCase()}`;
      else if (f.type === "email" && val && !/^\S+@\S+\.\S+$/.test(val)) e[f.key] = "Enter a valid email address";
      else if (f.type === "phone" && val && !/^[+\d][\d\s-]{6,}$/.test(val)) e[f.key] = "Enter a valid phone number";
    }
    if (values.endDate && values.startDate && values.endDate < values.startDate) e.endDate = "End date cannot be before the start date";
    if (values.dueDate && values.issueDate && values.dueDate < values.issueDate) e.dueDate = "Due date cannot be before the issue date";
    if (values.expiryDate && values.issueDate && values.expiryDate < values.issueDate) e.expiryDate = "Expiry cannot be before the issue date";
    if (entity === "users" && values.password && values.password.length < 6) e.password = "Password must be at least 6 characters";
    setErrors(e);
    return Object.keys(e).filter((k) => e[k]).length === 0;
  };

  const save = (another: boolean) => {
    if (!check()) {
      toast("Please fix the highlighted fields", "error");
      setTimeout(() => document.querySelector<HTMLElement>(".rx-invalid input, .rx-invalid select, .rx-invalid textarea")?.focus(), 0);
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {};
    for (const f of editable) {
      const raw = values[f.key] ?? "";
      payload[f.key] = f.type === "number" || f.type === "money" ? (raw === "" ? undefined : Number(raw)) : raw === "" ? undefined : raw;
    }
    if (file) Object.assign(payload, { fileName: file.name, fileSize: file.size, fileData: file.data });
    try {
      const rec = existing ? updateRecord(entity, existing.id, payload) : createRecord(entity, payload);
      toast(`${def.singular} ${recordLabel(entity, rec)} ${existing ? "updated" : "created"}`);
      if (another) {
        setValues({ ...defaultsFor(entity), ...(initial ?? {}) });
        setFile(null);
        setSaving(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (onDone) onDone(rec);
      else router.push(`/records/${entity}/${rec.id}`);
    } catch (err) {
      setSaving(false);
      toast(err instanceof StoreError ? err.message : "Could not save", "error");
    }
  };

  const renderInput = (f: Field) => {
    const common = { id: `f-${f.key}`, value: values[f.key] ?? "", "aria-invalid": !!errors[f.key] };
    if (f.type === "select")
      return (
        <select {...common} onChange={(e) => set(f, e.target.value)}>
          {!f.required && <option value="">— Not set —</option>}
          {f.required && !values[f.key] && <option value="">Select {f.label.toLowerCase()}</option>}
          {f.options!.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    if (f.type === "ref") {
      const opts = list(f.ref!);
      return (
        <select {...common} onChange={(e) => set(f, e.target.value)}>
          <option value="">{f.required ? `Select ${f.label.toLowerCase()}` : "— None —"}</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {recordLabel(f.ref!, o)}
              {f.ref === "vehicles" ? ` (${o.type})` : ""}
              {o.status && ["vehicles", "drivers"].includes(f.ref!) ? ` — ${o.status}` : ""}
            </option>
          ))}
        </select>
      );
    }
    if (f.type === "textarea") return <textarea {...common} placeholder={f.placeholder} onChange={(e) => set(f, e.target.value)} />;
    const type = f.type === "money" || f.type === "number" ? "number" : f.type === "phone" ? "tel" : f.type === "datetime" ? "datetime-local" : f.key === "password" ? "password" : f.type;
    return <input {...common} type={type} min={f.min} step={f.type === "money" ? "1" : "any"} placeholder={f.placeholder ?? (f.type === "money" ? "0" : "")} onChange={(e) => set(f, e.target.value)} autoComplete={f.key === "password" ? "new-password" : undefined} />;
  };

  return (
    <section className="panel form-panel rx-form">
      <div className="rx-form-head">
        <div>
          <h3>{existing ? `Edit ${def.singular.toLowerCase()} · ${recordLabel(entity, existing)}` : `New ${def.singular.toLowerCase()}`}</h3>
          <p>Fields marked * are required. Linked fields fill in related details automatically.</p>
        </div>
        <span className="rx-chip">{existing ? String(existing.code ?? existing.id) : `${def.idPrefix}-auto`}</span>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
      >
        <div className="form-grid">
          {editable.map((f) => (
            <label key={f.key} className={`${f.wide ? "wide" : ""} ${errors[f.key] ? "rx-invalid" : ""}`} htmlFor={`f-${f.key}`}>
              <span>
                {f.label}
                {f.required && <em className="rx-req"> *</em>}
              </span>
              {renderInput(f)}
              {errors[f.key] && <small className="rx-error">{errors[f.key]}</small>}
            </label>
          ))}
          {entity === "documents" && (
            <label className="wide" htmlFor="f-file">
              <span>Attach file (PDF or image, up to 1.5 MB is stored on this device)</span>
              <input
                id="f-file"
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => {
                  const fl = e.target.files?.[0];
                  if (!fl) return;
                  const size = `${(fl.size / 1048576).toFixed(1)} MB`;
                  if (fl.size > 1.5 * 1048576) {
                    setFile({ name: fl.name, size });
                    toast("File is large — only its name is kept, not the content", "info");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => setFile({ name: fl.name, size, data: String(reader.result) });
                  reader.readAsDataURL(fl);
                }}
              />
              {(file || Boolean(existing?.fileName)) && <small className="rx-hint">Current file: {file?.name ?? String(existing?.fileName)}</small>}
            </label>
          )}
        </div>
        {calc.length > 0 && (
          <div className="rx-calc">
            {calc.map((c) => (
              <span key={c.label}>
                {c.label}
                <b>{c.value}</b>
              </span>
            ))}
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={() => (cancelHref ? router.push(cancelHref) : router.back())}>
            Cancel
          </button>
          {!existing && (
            <button type="button" className="secondary" disabled={saving} onClick={() => save(true)}>
              Save &amp; add another
            </button>
          )}
          <button type="submit" className="primary" disabled={saving}>
            <Icon name="check" size={14} /> {existing ? "Save changes" : `Create ${def.singular.toLowerCase()}`}
          </button>
        </div>
      </form>
    </section>
  );
}
