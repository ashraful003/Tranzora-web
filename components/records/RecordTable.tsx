"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { display, exportRecordsCsv, fieldOf, initials, money, sortValue } from "@/lib/db/format";
import { ENTITIES, type CollectionKey, type Rec } from "@/lib/db/schema";
import { deleteMany, deleteRecord, duplicateRecord, list, num, recordLabel, setStatus, StoreError, updateRecord, useDb } from "@/lib/db/store";
import type { TableView } from "@/lib/views";
import { inPeriod, useShell } from "../Shell";
import { ConfirmDialog, Dropdown, EmptyState, Icon, Modal, StatGrid, Status, useToast, type StatItem } from "../ui";

const MONEY_SUM_FIELDS = ["amount", "total", "fare", "cost", "quote", "salary", "balance", "creditLimit", "monthlyLimit"];
const PERSON_FIELDS = ["name"];

export function dateFieldOf(entity: CollectionKey) {
  return ENTITIES[entity].fields.find((f) => f.type === "date")?.key ?? "createdAt";
}

export function newHref(entity: CollectionKey, defaults?: Record<string, string>) {
  const qs = defaults ? `?${new URLSearchParams(defaults).toString()}` : "";
  return `/records/${entity}/new${qs}`;
}

function statsFor(entity: CollectionKey, rows: Rec[]): StatItem[] {
  const def = ENTITIES[entity];
  const statusKey = def.statusField ?? "status";
  const counts = (s: string) => rows.filter((r) => r[statusKey] === s).length;
  const items: StatItem[] = [{ label: `Total ${def.label.toLowerCase()}`, value: rows.length.toLocaleString("en-IN"), note: "in the selected period", icon: "report" }];
  const sumField = def.fields.find((f) => f.type === "money" && MONEY_SUM_FIELDS.includes(f.key));
  const statuses = [...(def.statuses ?? [])].sort((a, b) => counts(b) - counts(a));
  for (const s of statuses.slice(0, sumField ? 2 : 3)) items.push({ label: s, value: counts(s).toLocaleString("en-IN"), note: rows.length ? `${Math.round((counts(s) / rows.length) * 100)}% of records` : "—", icon: "check" });
  if (sumField) items.push({ label: `Total ${sumField.label.toLowerCase()}`, value: money(rows.reduce((t, r) => t + num(r[sumField.key]), 0)), note: "sum of listed records", icon: "income" });
  const icons = ["report", "trip", "vehicle", "income"] as const;
  return items.slice(0, 4).map((s, i) => ({ ...s, icon: s.icon === "check" ? icons[i] : s.icon }));
}

export default function RecordTable({
  view,
  embedded,
  rowsOverride,
  title,
  addAction,
}: {
  view: TableView;
  embedded?: boolean;
  rowsOverride?: Rec[];
  title?: string;
  /** Replaces the embedded "Add" link (e.g. documents open the upload dialog instead of a form). */
  addAction?: { label: string; onClick: () => void };
}) {
  const db = useDb();
  const router = useRouter();
  const toast = useToast();
  const { query, period } = useShell();
  const { entity } = view;
  const def = ENTITIES[entity];
  const statusKey = def.statusField ?? "status";
  const columns = view.columns ?? def.columns;
  const tabs = view.tabs ?? def.statuses ?? [];

  const [tab, setTab] = useState("All");
  const [scope, setScope] = useState("");
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | { ids: string[] }>(null);
  const [assigning, setAssigning] = useState<Rec | null>(null);

  const base = useMemo(() => {
    if (!db) return [];
    const all = rowsOverride ?? db.collections[entity];
    const dateKey = dateFieldOf(entity);
    return all.filter((r) => (!view.filter || view.filter(r)) && (embedded || inPeriod(r[dateKey] ?? r.createdAt, period)) && (!scope || r[view.scopeBy!.field] === scope));
  }, [db, entity, view, period, scope, rowsOverride, embedded]);

  const rows = useMemo(() => {
    const q = embedded ? "" : query.trim().toLowerCase();
    let out = base.filter((r) => tab === "All" || r[statusKey] === tab);
    if (q) out = out.filter((r) => columns.some((c) => display(entity, c, r).toLowerCase().includes(q)) || String(r.code ?? "").toLowerCase().includes(q));
    if (sort) out = [...out].sort((a, b) => {
      const x = sortValue(entity, sort.col, a);
      const y = sortValue(entity, sort.col, b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    return out;
  }, [base, tab, statusKey, query, columns, entity, sort, embedded]);

  useEffect(() => setPage(1), [tab, query, scope, period, pageSize]);
  useEffect(() => setSelected(new Set()), [tab, scope, entity]);

  if (!db) return null;

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * pageSize, current * pageSize);
  const allChecked = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const open = (r: Rec) => router.push(`/records/${entity}/${r.id}`);

  const toggleSort = (col: string) => setSort((s) => (s?.col === col ? (s.dir === 1 ? { col, dir: -1 } : null) : { col, dir: 1 }));
  const tryRun = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      toast(e instanceof StoreError ? e.message : "Something went wrong", "error");
    }
  };

  const pageButtons = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - current) <= 1);

  const renderCell = (r: Rec, col: string, i: number) => {
    const f = fieldOf(entity, col);
    const text = display(entity, col, r);
    if (col === statusKey || (f.type === "select" && ["priority", "level", "severity"].includes(col))) return <Status>{r[col] as string}</Status>;
    if (PERSON_FIELDS.includes(col) && ["drivers", "staff", "users", "customers"].includes(entity))
      return (
        <span className="person-cell">
          <span className={`mini-avatar avatar-${i % 4}`}>{initials(r[col])}</span>
          <b>{text}</b>
        </span>
      );
    if (f.type === "ref" && r[col])
      return (
        <Link className="rx-ref" href={`/records/${f.ref}/${r[col]}`} onClick={(e) => e.stopPropagation()}>
          {text}
        </Link>
      );
    if (col === "code" || col === def.titleField)
      return (
        <span className={`primary-cell ${col === "code" ? "rx-nowrap" : "rx-cell-text"}`} title={text}>
          {text}
        </span>
      );
    if (f.type === "money") return <span className="rx-num">{text}</span>;
    return (
      <span className={`rx-cell-text ${["date", "phone", "number"].includes(f.type) ? "rx-nowrap" : ""}`} title={text}>
        {text}
      </span>
    );
  };

  return (
    <>
      {!embedded && !view.hideStats && <StatGrid items={statsFor(entity, base)} />}
      <div className="table-card">
        <div className="table-tabs rx-table-tools">
          <div className="rx-tabs" role="tablist">
            {["All", ...tabs].map((t) => {
              const count = t === "All" ? base.length : base.filter((r) => r[statusKey] === t).length;
              return (
                <button type="button" role="tab" aria-selected={tab === t} key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                  {t === "All" ? `All ${title ? "" : "records"}`.trim() : t} <em>{count}</em>
                </button>
              );
            })}
          </div>
          <div className="rx-tools-right">
            {view.scopeBy && (
              <select className="rx-select" value={scope} onChange={(e) => setScope(e.target.value)} aria-label={view.scopeBy.label}>
                <option value="">All {view.scopeBy.label.toLowerCase()}s</option>
                {list(view.scopeBy.entity).map((o) => (
                  <option key={o.id} value={o.id}>
                    {recordLabel(view.scopeBy!.entity, o)}
                  </option>
                ))}
              </select>
            )}
            {selected.size > 0 && (
              <button type="button" className="rx-btn rx-btn-danger" onClick={() => setConfirm({ ids: [...selected] })}>
                <Icon name="trash" size={13} /> Delete {selected.size}
              </button>
            )}
            <button
              type="button"
              className="rx-btn"
              onClick={() => {
                exportRecordsCsv(entity, rows, columns);
                toast(`${rows.length} ${(rows.length === 1 ? def.singular : def.label).toLowerCase()} exported to CSV`);
              }}
              disabled={!rows.length}
            >
              <Icon name="download" size={13} /> Export
            </button>
            {embedded &&
              (addAction ? (
                <button type="button" className="rx-btn rx-btn-primary" onClick={addAction.onClick}>
                  <Icon name="plus" size={13} /> {addAction.label}
                </button>
              ) : (
                <Link className="rx-btn rx-btn-primary" href={newHref(entity, view.defaults)}>
                  <Icon name="plus" size={13} /> Add
                </Link>
              ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title={base.length ? "No records match your filters" : `No ${def.label.toLowerCase()} yet`}
            text={base.length ? "Try another tab, clear the search box or change the date range." : `Create the first ${def.singular.toLowerCase()} to see it here.`}
            action={
              base.length ? (
                <button type="button" className="secondary" onClick={() => setTab("All")}>
                  Show all
                </button>
              ) : addAction ? (
                <button type="button" className="primary" onClick={addAction.onClick}>
                  <Icon name="plus" size={14} /> {addAction.label}
                </button>
              ) : (
                <Link className="primary" href={newHref(entity, view.defaults)}>
                  <Icon name="plus" size={14} /> Add {def.singular.toLowerCase()}
                </Link>
              )
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="rx-table">
              <thead>
                <tr>
                  <th className="rx-check">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={allChecked}
                      onChange={() => {
                        const next = new Set(selected);
                        visible.forEach((r) => (allChecked ? next.delete(r.id) : next.add(r.id)));
                        setSelected(next);
                      }}
                    />
                  </th>
                  {columns.map((col) => (
                    <th key={col} aria-sort={sort?.col === col ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                      <button type="button" className="rx-sort" onClick={() => toggleSort(col)}>
                        {fieldOf(entity, col).label}
                        <span className={`sort ${sort?.col === col ? "on" : ""}`}>{sort?.col === col ? (sort.dir === 1 ? "↑" : "↓") : "↕"}</span>
                      </button>
                    </th>
                  ))}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => {
                  const next = def.transitions?.[String(r[statusKey])] ?? [];
                  return (
                    <tr key={r.id} className={`rx-row ${selected.has(r.id) ? "rx-selected" : ""}`} onClick={() => open(r)} onKeyDown={(e) => e.key === "Enter" && open(r)} tabIndex={0}>
                      <td className="rx-check" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${recordLabel(entity, r)}`}
                          checked={selected.has(r.id)}
                          onChange={() => {
                            const s = new Set(selected);
                            if (s.has(r.id)) s.delete(r.id);
                            else s.add(r.id);
                            setSelected(s);
                          }}
                        />
                      </td>
                      {columns.map((c) => (
                        <td key={c}>{renderCell(r, c, i)}</td>
                      ))}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="actions">
                          {view.assign && (
                            <button type="button" className="rx-assign" onClick={() => setAssigning(r)}>
                              {r[view.assign.field] ? "Change" : "Assign"}
                            </button>
                          )}
                          {/* The row opens the record; delete and the rest live in the ⋯ menu to keep the column narrow. */}
                          {def.fields.some((f) => !f.readOnly) && (
                            <button type="button" title="Edit" aria-label="Edit" onClick={() => router.push(`/records/${entity}/${r.id}/edit`)}>
                              <Icon name="edit" size={14} />
                            </button>
                          )}
                          <Dropdown trigger={<Icon name="dots" size={15} />} className="rx-more">
                            {(close) => (
                              <>
                                <button type="button" onClick={() => (close(), open(r))}>
                                  <Icon name="eye" size={13} /> Open details
                                </button>
                                {def.fields.some((f) => !f.readOnly) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      close();
                                      tryRun(() => {
                                        const copy = duplicateRecord(entity, r.id);
                                        toast(`Duplicated as ${recordLabel(entity, copy)}`);
                                      });
                                    }}
                                  >
                                    <Icon name="copy" size={13} /> Duplicate
                                  </button>
                                )}
                                {entity === "invoices" && (
                                  <button type="button" onClick={() => (close(), router.push(`/screens/086-invoice-details?id=${r.id}`))}>
                                    <Icon name="print" size={13} /> Print invoice
                                  </button>
                                )}
                                {entity === "trips" && r.status === "Completed" && (
                                  <button type="button" onClick={() => (close(), router.push(newHref("invoices", { tripId: r.id, customerId: String(r.customerId), freight: String(r.fare) })))}>
                                    <Icon name="document" size={13} /> Create invoice
                                  </button>
                                )}
                                {next.length > 0 && <span className="rx-menu-label">Change status</span>}
                                {next.map((s) => (
                                  <button
                                    type="button"
                                    key={s}
                                    onClick={() => {
                                      close();
                                      tryRun(() => {
                                        setStatus(entity, r.id, s);
                                        toast(`${recordLabel(entity, r)} marked ${s}`);
                                      });
                                    }}
                                  >
                                    <Icon name="arrow" size={13} /> Mark as {s}
                                  </button>
                                ))}
                                <button type="button" className="danger" onClick={() => (close(), setConfirm({ ids: [r.id] }))}>
                                  <Icon name="trash" size={13} /> Delete
                                </button>
                              </>
                            )}
                          </Dropdown>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <div className="pagination">
            <span>
              Showing {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, rows.length)} of {rows.length} results
              <select className="rx-page-size" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows per page">
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </span>
            <div>
              <button type="button" disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Previous page">
                ‹
              </button>
              {pageButtons.map((p, i) => (
                <span key={p} style={{ display: "contents" }}>
                  {i > 0 && p - pageButtons[i - 1]! > 1 && <button disabled>…</button>}
                  <button type="button" className={p === current ? "active" : ""} onClick={() => setPage(p)}>
                    {p}
                  </button>
                </span>
              ))}
              <button type="button" disabled={current === pages} onClick={() => setPage(current + 1)} aria-label="Next page">
                ›
              </button>
            </div>
          </div>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.ids.length > 1 ? `Delete ${confirm.ids.length} ${def.label.toLowerCase()}?` : `Delete ${def.singular.toLowerCase()}?`}
          message={
            <>
              {confirm.ids.length > 1 ? `${confirm.ids.length} records` : <b>{recordLabel(entity, db.collections[entity].find((r) => r.id === confirm.ids[0]))}</b>} will be removed permanently from this workspace. This cannot be
              undone (restore a backup to recover it).
            </>
          }
          confirmLabel="Delete"
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            try {
              if (confirm.ids.length > 1) deleteMany(entity, confirm.ids);
              else deleteRecord(entity, confirm.ids[0]!);
              setSelected(new Set());
              toast(`${confirm.ids.length > 1 ? `${confirm.ids.length} records` : def.singular} deleted`);
            } catch (e) {
              toast(e instanceof StoreError ? e.message : "Could not delete", "error");
            }
          }}
        />
      )}

      {assigning && view.assign && <AssignModal view={view} rec={assigning} onClose={() => setAssigning(null)} />}
    </>
  );
}

export function AssignModal({ view, rec, onClose }: { view: TableView; rec: Rec; onClose: () => void }) {
  const a = view.assign!;
  const toast = useToast();
  const [value, setValue] = useState(String(rec[a.field] ?? ""));
  const candidates = list(a.entity).filter((c) => !a.candidate || a.candidate(c) || c.id === rec[a.field]);
  return (
    <Modal
      title={`${a.label} · ${rec.code}`}
      subtitle={`${recordLabel(view.entity, rec)} — showing ${candidates.length} available ${ENTITIES[a.entity].label.toLowerCase()}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!value}
            onClick={() => {
              try {
                updateRecord(view.entity, rec.id, { [a.field]: value }, "Assignment");
                if (a.entity === "vehicles") updateRecord("vehicles", value, { status: "Assigned" }, "Assignment");
                toast(`${ENTITIES[a.entity].singular} assigned to ${rec.code}`);
                onClose();
              } catch (e) {
                toast(e instanceof StoreError ? e.message : "Could not assign", "error");
              }
            }}
          >
            Save assignment
          </button>
        </>
      }
    >
      <div className="rx-choice-list">
        {candidates.map((c) => (
          <label key={c.id} className={value === c.id ? "on" : ""}>
            <input type="radio" name="assign" checked={value === c.id} onChange={() => setValue(c.id)} />
            <span>
              <b>{recordLabel(a.entity, c)}</b>
              <small>
                {String(c.branch ?? "")} {c.phone ? `· ${c.phone}` : ""}
              </small>
            </span>
            <Status>{c.status as string}</Status>
          </label>
        ))}
        {!candidates.length && <p className="rx-muted">Nothing is available right now. Free up a {ENTITIES[a.entity].singular.toLowerCase()} first.</p>}
      </div>
    </Modal>
  );
}
