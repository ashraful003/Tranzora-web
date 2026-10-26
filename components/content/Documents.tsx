"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { date } from "@/lib/db/format";
import { ENTITIES, type Rec } from "@/lib/db/schema";
import { createRecord, deleteRecord, list, recordLabel, StoreError, today, useDb } from "@/lib/db/store";
import { DocumentPreview, downloadDocument } from "../records/RecordDetail";
import { useShell } from "../Shell";
import { ConfirmDialog, EmptyState, Icon, Modal, StatGrid, Status, useToast } from "../ui";

const STATUSES = ["Valid", "Expiring Soon", "Expired", "No Expiry"];

export default function Documents({ ownerType, title }: { ownerType?: string; title: string }) {
  const db = useDb();
  const router = useRouter();
  const toast = useToast();
  const { query } = useShell();
  const [status, setStatus] = useState("All");
  const [type, setType] = useState("");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Rec | null>(null);
  const [remove, setRemove] = useState<Rec | null>(null);

  const all = useMemo(() => (db ? db.collections.documents.filter((d) => !ownerType || d.ownerType === ownerType || (ownerType === "Finance" && d.ownerType === "Company")) : []), [db, ownerType]);
  const docs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((d) => (status === "All" || d.status === status) && (!type || d.docType === type) && (!q || [d.name, d.number, d.docType, d.fileName].join(" ").toLowerCase().includes(q)));
  }, [all, status, type, query]);
  if (!db) return null;

  const types = [...new Set(all.map((d) => String(d.docType)))].sort();
  const owner = (d: Rec) => (d.vehicleId ? recordLabel("vehicles", list("vehicles").find((v) => v.id === d.vehicleId)) : d.driverId ? String(list("drivers").find((v) => v.id === d.driverId)?.name ?? "—") : String(d.ownerType));

  return (
    <div className="document-layout">
      <StatGrid
        items={[
          { label: "Documents", value: String(all.length), note: ownerType ? `${ownerType.toLowerCase()} documents` : "in the library", icon: "document" },
          { label: "Valid", value: String(all.filter((d) => d.status === "Valid").length), note: "no action needed", positive: true, icon: "check" },
          { label: "Expiring soon", value: String(all.filter((d) => d.status === "Expiring Soon").length), note: "within 30 days", icon: "calendar", tone: "orange" },
          { label: "Expired", value: String(all.filter((d) => d.status === "Expired").length), note: "renew immediately", positive: false, icon: "shield", tone: "red" },
        ]}
      />
      <div className="panel rx-doc-toolbar">
        <div className="rx-tabs">
          {["All", ...STATUSES].map((s) => (
            <button type="button" key={s} className={status === s ? "active" : ""} onClick={() => setStatus(s)}>
              {s} <em>{s === "All" ? all.length : all.filter((d) => d.status === s).length}</em>
            </button>
          ))}
        </div>
        <div className="rx-tools-right">
          <select className="rx-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Document type">
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <button type="button" className="primary" onClick={() => setUploading(true)}>
            <Icon name="upload" size={14} /> Upload document
          </button>
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="panel">
          <EmptyState title={all.length ? "No documents match" : `No ${title.toLowerCase()} yet`} text="Upload a document or change the filters." action={<button type="button" className="primary" onClick={() => setUploading(true)}>Upload document</button>} />
        </div>
      ) : (
        <div className="doc-grid">
          {docs.map((doc) => (
            <article className="panel doc-card rx-doc-card" key={doc.id} onClick={() => router.push(`/records/documents/${doc.id}`)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && router.push(`/records/documents/${doc.id}`)}>
              <div className={`doc-icon rx-doc-${String(doc.status).toLowerCase().replace(/\s+/g, "-")}`}>
                <Icon name="document" size={22} />
              </div>
              <div className="doc-body">
                <b>{String(doc.name)}</b>
                <small>
                  {String(doc.docType)} · {owner(doc)} · {String(doc.fileSize ?? "—")}
                </small>
                <div className="doc-meta">
                  <span>{doc.expiryDate ? `Expires ${date(doc.expiryDate)}` : "No expiry"}</span>
                  <Status>{doc.status as string}</Status>
                </div>
              </div>
              <div className="doc-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="secondary" onClick={() => setPreview(doc)}>
                  <Icon name="eye" size={13} /> Preview
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    downloadDocument(doc);
                    toast(`Downloading ${String(doc.fileName ?? doc.name)}`);
                  }}
                >
                  <Icon name="download" size={13} /> Download
                </button>
                <Link className="rx-icon-btn" href={`/records/documents/${doc.id}/edit`} title="Edit" aria-label="Edit">
                  <Icon name="edit" size={14} />
                </Link>
                <button type="button" className="rx-icon-btn rx-danger-text" title="Delete" aria-label="Delete" onClick={() => setRemove(doc)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {uploading && <UploadModal ownerType={ownerType === "Finance" ? "Finance" : ownerType} onClose={() => setUploading(false)} />}
      {preview && <DocumentPreview doc={preview} onClose={() => setPreview(null)} />}
      {remove && (
        <ConfirmDialog
          title="Delete document?"
          message={
            <>
              <b>{String(remove.name)}</b> and its stored file will be removed.
            </>
          }
          danger
          confirmLabel="Delete"
          onClose={() => setRemove(null)}
          onConfirm={() => {
            deleteRecord("documents", remove.id);
            toast("Document deleted");
          }}
        />
      )}
    </div>
  );
}

function UploadModal({ ownerType, onClose }: { ownerType?: string; onClose: () => void }) {
  const toast = useToast();
  const docTypes = ENTITIES.documents.fields.find((f) => f.key === "docType")!.options!;
  const [v, setV] = useState<Record<string, string>>({ ownerType: ownerType ?? "Vehicle", docType: ownerType === "Driver" ? "Driving Licence" : ownerType === "Finance" ? "Bank Statement" : "Registration", issueDate: today(), name: "", number: "", expiryDate: "", vehicleId: "", driverId: "" });
  const [file, setFile] = useState<{ name: string; size: string; data?: string } | null>(null);
  const [error, setError] = useState("");
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }));

  const save = () => {
    if (!v.name.trim()) return setError("Document name is required");
    if (!file) return setError("Choose a file to upload");
    if (v.ownerType === "Vehicle" && !v.vehicleId) return setError("Select the vehicle this document belongs to");
    if (v.ownerType === "Driver" && !v.driverId) return setError("Select the driver this document belongs to");
    try {
      createRecord("documents", { ...v, vehicleId: v.vehicleId || undefined, driverId: v.driverId || undefined, expiryDate: v.expiryDate || undefined, responsible: "Admin", fileName: file.name, fileSize: file.size, fileData: file.data });
      toast(`${v.name} uploaded`);
      onClose();
    } catch (e) {
      setError(e instanceof StoreError ? e.message : "Upload failed");
    }
  };

  return (
    <Modal
      title="Upload document"
      subtitle="Stored on this device; files up to 1.5 MB keep their content for preview and download."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={save}>
            <Icon name="upload" size={14} /> Upload
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="wide">
          <span>Document name *</span>
          <input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Fitness Certificate — DHA-METRO-TA-11-4321" autoFocus />
        </label>
        <label>
          <span>Document type</span>
          <select value={v.docType} onChange={(e) => set("docType", e.target.value)}>
            {docTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Belongs to</span>
          <select value={v.ownerType} onChange={(e) => set("ownerType", e.target.value)}>
            {["Vehicle", "Driver", "Customer", "Company", "Finance"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        {v.ownerType === "Vehicle" && (
          <label>
            <span>Vehicle *</span>
            <select value={v.vehicleId} onChange={(e) => set("vehicleId", e.target.value)}>
              <option value="">Select vehicle</option>
              {list("vehicles").map((x) => (
                <option key={x.id} value={x.id}>
                  {recordLabel("vehicles", x)}
                </option>
              ))}
            </select>
          </label>
        )}
        {v.ownerType === "Driver" && (
          <label>
            <span>Driver *</span>
            <select value={v.driverId} onChange={(e) => set("driverId", e.target.value)}>
              <option value="">Select driver</option>
              {list("drivers").map((x) => (
                <option key={x.id} value={x.id}>
                  {String(x.name)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>Document number</span>
          <input value={v.number} onChange={(e) => set("number", e.target.value)} />
        </label>
        <label>
          <span>Issue date</span>
          <input type="date" value={v.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
        </label>
        <label>
          <span>Expiry date</span>
          <input type="date" value={v.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} />
        </label>
        <label className="wide">
          <span>File *</span>
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={(e) => {
              const fl = e.target.files?.[0];
              if (!fl) return;
              const size = `${(fl.size / 1048576).toFixed(2)} MB`;
              if (!v.name) set("name", fl.name.replace(/\.[^.]+$/, ""));
              if (fl.size > 1.5 * 1048576) return setFile({ name: fl.name, size });
              const r = new FileReader();
              r.onload = () => setFile({ name: fl.name, size, data: String(r.result) });
              r.readAsDataURL(fl);
            }}
          />
          {file && (
            <small className="rx-hint">
              {file.name} · {file.size}
              {!file.data && " — too large to store, only the name is kept"}
            </small>
          )}
        </label>
      </div>
      {error && <p className="rx-error rx-error-block">{error}</p>}
    </Modal>
  );
}
