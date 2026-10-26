"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ago, date } from "@/lib/db/format";
import type { CollectionKey, Rec } from "@/lib/db/schema";
import { deleteRecord, getRecord, markAllNotifications, markNotification, purgeCollection, setStatus, StoreError, updateRecord, useDb } from "@/lib/db/store";
import RecordTable, { newHref } from "../records/RecordTable";
import { useShell } from "../Shell";
import { ConfirmDialog, Dropdown, EmptyState, Icon, StatGrid, Status, useToast } from "../ui";

/* -------------------------------------------------------------------- map */

const CITY: Record<string, [number, number]> = {
  dhaka: [400, 235], gazipur: [408, 200], narayanganj: [425, 250], chattogram: [575, 335], "chattogram port": [585, 345], sylhet: [575, 115], khulna: [255, 330],
  rajshahi: [170, 170], bogura: [255, 135], rangpur: [235, 60], mymensingh: [405, 125], cumilla: [485, 270], "cox's bazar": [615, 420], "mongla port": [270, 380],
  benapole: [190, 295], jashore: [205, 300], pabna: [250, 205], tejgaon: [398, 232], "meghna bridge": [445, 255], "gulshan–banani": [404, 226], uttara: [402, 215],
};

function cityPoint(name: unknown): [number, number] {
  const k = String(name ?? "").toLowerCase();
  const hit = Object.keys(CITY).find((c) => k.includes(c));
  if (hit) return CITY[hit]!;
  let h = 0;
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return [180 + (h % 420), 80 + ((h >> 3) % 300)];
}

const PROGRESS: Record<string, number> = { Dispatched: 0.18, "In Progress": 0.58, Completed: 1, Approved: 0, Planned: 0, Draft: 0 };

function along(a: [number, number], b: [number, number], t: number): [number, number] {
  const cx = (a[0] + b[0]) / 2;
  const cy = Math.min(a[1], b[1]) - 40;
  const x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * cx + t * t * b[0];
  const y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * cy + t * t * b[1];
  return [x, y];
}

export function MapContent({ mode }: { mode: "trips" | "vehicles" | "geofences" }) {
  const db = useDb();
  const toast = useToast();
  const [layer, setLayer] = useState<"fleet" | "routes" | "zones">(mode === "geofences" ? "zones" : "fleet");
  const [zoom, setZoom] = useState(1);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [follow, setFollow] = useState(false);

  const data = useMemo(() => {
    if (!db) return null;
    const c = db.collections;
    const active = c.trips.filter((t) => ["Dispatched", "In Progress"].includes(String(t.status)));
    const markers = active.map((t) => {
      const r = getRecord("routes", t.routeId as string);
      const a = cityPoint(r?.origin ?? t.pickup);
      const b = cityPoint(r?.destination ?? t.dropoff);
      return { trip: t, a, b, pos: along(a, b, PROGRESS[String(t.status)] ?? 0.4) };
    });
    return { active, markers, c };
  }, [db]);
  if (!db || !data) return null;
  const { active, markers, c } = data;
  const q = search.trim().toLowerCase();

  const listItems: { id: string; entity: CollectionKey; title: string; sub: string; status: string; point: [number, number] }[] =
    mode === "geofences"
      ? c.geofences.map((g) => ({ id: g.id, entity: "geofences" as CollectionKey, title: String(g.name), sub: `${g.type} · ${g.radiusM} m · ${g.alertOn}`, status: String(g.status), point: cityPoint(g.location ?? g.name) }))
      : mode === "vehicles"
        ? c.vehicles.map((v) => {
            const m = markers.find((x) => x.trip.vehicleId === v.id);
            return { id: v.id, entity: "vehicles" as CollectionKey, title: String(v.regNo), sub: `${v.type} · ${m ? `on ${m.trip.code}` : String(v.branch)}`, status: String(v.status), point: m?.pos ?? cityPoint(v.branch) };
          })
        : markers.map((m) => ({ id: m.trip.id, entity: "trips" as CollectionKey, title: `${m.trip.code} · ${getRecord("vehicles", m.trip.vehicleId as string)?.regNo ?? ""}`, sub: `${getRecord("drivers", m.trip.driverId as string)?.name ?? ""} · ${m.trip.pickup} → ${m.trip.dropoff}`, status: String(m.trip.status), point: m.pos }));
  const shown = listItems.filter((i) => !q || `${i.title} ${i.sub}`.toLowerCase().includes(q));
  const sel = listItems.find((i) => i.id === selected);
  const center = follow && sel ? sel.point : [400, 230];
  const w = 800 / zoom;
  const h = 460 / zoom;
  const vb = `${Math.max(0, Math.min(800 - w, center[0] - w / 2))} ${Math.max(0, Math.min(460 - h, center[1] - h / 2))} ${w} ${h}`;
  const selRec = sel ? getRecord(sel.entity, sel.id) : undefined;

  return (
    <>
      <StatGrid
        items={
          mode === "geofences"
            ? [
                { label: "Geofences", value: String(c.geofences.length), icon: "map" },
                { label: "Active zones", value: String(c.geofences.filter((g) => g.status === "Active").length), icon: "check", positive: true, note: "alerting" },
                { label: "Restricted zones", value: String(c.geofences.filter((g) => g.type === "Restricted").length), icon: "shield", tone: "red" },
                { label: "Vehicles inside a zone", value: String(c.vehicles.filter((v) => v.status !== "On Trip").length), icon: "vehicle", note: "parked at depots / sites" },
              ]
            : [
                { label: "Vehicles tracked", value: String(c.vehicles.filter((v) => v.status !== "Inactive").length), icon: "vehicle" },
                { label: "On the road", value: String(active.length), icon: "trip", positive: true, note: "dispatched / in progress" },
                { label: "Idle at depot", value: String(c.vehicles.filter((v) => v.status === "Available").length), icon: "grid" },
                { label: "In workshop", value: String(c.vehicles.filter((v) => v.status === "Maintenance").length), icon: "wrench", tone: "orange" },
              ]
        }
      />
      <div className="map-layout">
        <article className="panel map-card">
          <div className="map-toolbar">
            <button type="button" className={layer === "fleet" ? "active" : ""} onClick={() => setLayer("fleet")}>
              Live fleet
            </button>
            <button type="button" className={layer === "routes" ? "active" : ""} onClick={() => setLayer("routes")}>
              Routes
            </button>
            <button type="button" className={layer === "zones" ? "active" : ""} onClick={() => setLayer("zones")}>
              Geofences
            </button>
            <div className="map-search">
              <Icon name="search" size={15} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={mode === "geofences" ? "Search zone…" : "Search vehicle, trip or driver…"} aria-label="Search map" />
            </div>
          </div>
          <div className="map-canvas">
            <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" className="rx-map">
              <rect x="0" y="0" width="800" height="460" fill="#eef4fb" />
              <path className="rx-land" d="M150 40 L330 20 L470 60 L620 70 L640 180 L600 260 L650 440 L560 380 L470 330 L400 360 L300 410 L200 360 L150 280 L120 180Z" />
              <path className="road thin" d="M400 235 L575 335 M400 235 L575 115 M400 235 L255 330 M400 235 L255 135 L235 60 M400 235 L170 170 M400 235 L405 125 M575 335 L615 420 M255 330 L190 295 M255 330 L270 380" />
              {Object.entries(CITY)
                .filter(([k]) => !["tejgaon", "meghna bridge", "gulshan–banani", "uttara", "jashore", "chattogram port"].includes(k))
                .map(([k, [x, y]]) => (
                  <g key={k} className="rx-city">
                    <circle cx={x} cy={y} r="3" />
                    <text x={x + 6} y={y - 5}>
                      {k.replace(/\b\w/g, (m) => m.toUpperCase())}
                    </text>
                  </g>
                ))}
              {layer === "routes" &&
                c.routes
                  .filter((r) => r.status === "Active")
                  .map((r) => {
                    const a = cityPoint(r.origin);
                    const b = cityPoint(r.destination);
                    return <path key={r.id} className="route-line rx-route-all" d={`M${a[0]} ${a[1]} Q${(a[0] + b[0]) / 2} ${Math.min(a[1], b[1]) - 40} ${b[0]} ${b[1]}`} />;
                  })}
              {layer === "zones" &&
                c.geofences.map((g) => {
                  const [x, y] = cityPoint(g.location ?? g.name);
                  return (
                    <g key={g.id} className={`rx-zone ${g.type === "Restricted" ? "restricted" : ""} ${g.status !== "Active" ? "off" : ""} ${selected === g.id ? "sel" : ""}`} onClick={() => setSelected(g.id)}>
                      <circle cx={x} cy={y} r={Math.max(10, Math.min(40, Number(g.radiusM) / 25))} />
                    </g>
                  );
                })}
              {mode !== "geofences" &&
                markers.map((m) => (
                  <g key={m.trip.id}>
                    <path className={`route-line ${selected === m.trip.id || selected === m.trip.vehicleId ? "rx-route-sel" : ""}`} d={`M${m.a[0]} ${m.a[1]} Q${(m.a[0] + m.b[0]) / 2} ${Math.min(m.a[1], m.b[1]) - 40} ${m.b[0]} ${m.b[1]}`} />
                    <circle className="map-pin start" cx={m.a[0]} cy={m.a[1]} r="6" />
                    <circle className="map-pin end" cx={m.b[0]} cy={m.b[1]} r="7" />
                  </g>
                ))}
              {mode !== "geofences" &&
                listItems.map((i) => (
                  <g key={i.id} className={`car-marker rx-marker ${selected === i.id ? "sel" : ""} rx-m-${i.status.toLowerCase().replace(/\s+/g, "-")}`} transform={`translate(${i.point[0]} ${i.point[1]})`} onClick={() => setSelected(i.id)}>
                    <circle r={selected === i.id ? 13 : 9} />
                    <title>{i.title}</title>
                  </g>
                ))}
            </svg>
            <div className="zoom">
              <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.5))} aria-label="Zoom in">
                +
              </button>
              <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Zoom out">
                −
              </button>
              <button type="button" onClick={() => (setZoom(1), setFollow(false))} aria-label="Reset view" title="Reset view">
                ⟲
              </button>
            </div>
            <div className="map-badge">
              <span className="pulse" /> {mode === "geofences" ? `${c.geofences.filter((g) => g.status === "Active").length} zones monitored` : `${active.length} vehicles on the road`}
            </div>
            {sel && selRec && (
              <div className="rx-map-card">
                <div>
                  <b>{sel.title}</b>
                  <small>{sel.sub}</small>
                </div>
                <Status>{sel.status}</Status>
                <div className="rx-map-card-actions">
                  <button type="button" className="rx-btn" onClick={() => (setFollow(true), setZoom(2))}>
                    <Icon name="search" size={12} /> Focus
                  </button>
                  {sel.entity === "trips" && selRec.status === "Dispatched" && (
                    <button type="button" className="rx-btn" onClick={() => tryStatus("trips", sel.id, "In Progress", toast)}>
                      Start trip
                    </button>
                  )}
                  {sel.entity === "trips" && selRec.status === "In Progress" && (
                    <button type="button" className="rx-btn rx-btn-primary" onClick={() => tryStatus("trips", sel.id, "Completed", toast)}>
                      Mark delivered
                    </button>
                  )}
                  {sel.entity === "geofences" && (
                    <button
                      type="button"
                      className="rx-btn"
                      onClick={() => {
                        updateRecord("geofences", sel.id, { status: selRec.status === "Active" ? "Inactive" : "Active" });
                        toast(`${sel.title} ${selRec.status === "Active" ? "disabled" : "enabled"}`);
                      }}
                    >
                      {selRec.status === "Active" ? "Disable alerts" : "Enable alerts"}
                    </button>
                  )}
                  <Link className="rx-btn rx-btn-primary" href={`/records/${sel.entity}/${sel.id}`}>
                    Open
                  </Link>
                </div>
              </div>
            )}
          </div>
        </article>
        <aside className="panel tracking-list">
          <div className="panel-title">
            <div>
              <h3>{mode === "geofences" ? "Zones" : mode === "vehicles" ? "Fleet units" : "Trips on the road"}</h3>
              <p>{shown.length} shown · select to locate</p>
            </div>
            {mode === "geofences" && (
              <Link className="rx-btn" href={newHref("geofences")}>
                <Icon name="plus" size={12} /> Zone
              </Link>
            )}
          </div>
          {shown.length === 0 && <p className="rx-muted">{q ? "No match." : "Nothing on the road right now."}</p>}
          {shown.map((i) => (
            <button type="button" key={i.id} className={selected === i.id ? "selected" : ""} onClick={() => (setSelected(i.id), setFollow(true), setZoom((z) => Math.max(z, 1.5)))}>
              <span className="vehicle-chip">
                <Icon name={mode === "geofences" ? "map" : "vehicle"} size={17} />
              </span>
              <span>
                <b>{i.title}</b>
                <small>{i.sub}</small>
              </span>
              <Status>{i.status}</Status>
            </button>
          ))}
        </aside>
      </div>
      <div className="rx-section-gap">
        {mode === "geofences" ? (
          <RecordTable embedded view={{ type: "table", entity: "geofences" }} />
        ) : (
          <RecordTable embedded view={{ type: "table", entity: "trips", filter: (t) => ["Approved", "Dispatched", "In Progress"].includes(String(t.status)), tabs: ["Approved", "Dispatched", "In Progress"], columns: ["code", "routeId", "vehicleId", "driverId", "startDate", "status"] }} />
        )}
      </div>
    </>
  );
}

function tryStatus(entity: CollectionKey, id: string, s: string, toast: (m: string, t?: "success" | "error" | "info") => void) {
  try {
    setStatus(entity, id, s);
    toast(`Marked ${s}`);
  } catch (e) {
    toast(e instanceof StoreError ? e.message : "Could not update", "error");
  }
}

/* --------------------------------------------------------------- calendar */

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function CalendarContent() {
  const db = useDb();
  const router = useRouter();
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<"month" | "week">("month");
  const [showDocs, setShowDocs] = useState(true);
  if (!db) return null;
  const todayIso = iso(new Date());
  const events = [
    ...db.collections.maintenance.filter((m) => m.status !== "Cancelled").map((m) => ({ id: m.id, entity: "maintenance", day: String(m.scheduledDate), label: `${getRecord("vehicles", m.vehicleId as string)?.regNo ?? ""}: ${m.serviceType}`, tone: m.status === "Completed" ? 1 : m.priority === "Urgent" || m.priority === "High" ? 3 : 0 })),
    ...(showDocs ? db.collections.documents.filter((d) => d.expiryDate).map((d) => ({ id: d.id, entity: "documents", day: String(d.expiryDate), label: `${d.docType} expires`, tone: 2 })) : []),
  ];

  let days: Date[];
  if (view === "month") {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  } else {
    const start = new Date(cursor);
    start.setDate(cursor.getDate() - cursor.getDay());
    days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  const move = (dir: number) => setCursor((c) => (view === "month" ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : new Date(c.getFullYear(), c.getMonth(), c.getDate() + dir * 7)));
  const agenda = events.filter((e) => e.day >= todayIso && e.day <= iso(new Date(Date.now() + 14 * 86400000))).sort((a, b) => a.day.localeCompare(b.day));

  return (
    <div className="calendar-layout">
      <article className="panel calendar">
        <div className="calendar-header">
          <button type="button" onClick={() => move(-1)} aria-label="Previous">
            ‹
          </button>
          <h3>{view === "month" ? cursor.toLocaleString("en-GB", { month: "long", year: "numeric" }) : `Week of ${date(iso(days[0]!))}`}</h3>
          <button type="button" onClick={() => move(1)} aria-label="Next">
            ›
          </button>
          <button type="button" className="rx-btn" onClick={() => setCursor(new Date())}>
            Today
          </button>
          <label className="rx-check-inline">
            <input type="checkbox" checked={showDocs} onChange={(e) => setShowDocs(e.target.checked)} /> Document expiries
          </label>
          <div>
            <button type="button" className={view === "month" ? "active" : ""} onClick={() => setView("month")}>
              Month
            </button>
            <button type="button" className={view === "week" ? "active" : ""} onClick={() => setView("week")}>
              Week
            </button>
          </div>
        </div>
        <div className="weekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <b key={d}>{d}</b>
          ))}
        </div>
        <div className={`days ${view === "week" ? "rx-week" : ""}`}>
          {days.map((d) => {
            const key = iso(d);
            const evs = events.filter((e) => e.day === key);
            return (
              <div
                key={key}
                className={`${view === "month" && d.getMonth() !== cursor.getMonth() ? "outside" : ""} ${key === todayIso ? "today" : ""} rx-day`}
                onClick={() => router.push(newHref("maintenance", { scheduledDate: key }))}
                title="Click an empty area to schedule maintenance on this day"
              >
                <span>{d.getDate()}</span>
                {evs.slice(0, view === "week" ? 8 : 3).map((e) => (
                  <button
                    type="button"
                    key={`${e.entity}-${e.id}`}
                    className={`event event-${e.tone}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      router.push(`/records/${e.entity}/${e.id}`);
                    }}
                  >
                    {e.label}
                  </button>
                ))}
                {evs.length > (view === "week" ? 8 : 3) && <small className="rx-more-ev">+{evs.length - 3} more</small>}
              </div>
            );
          })}
        </div>
      </article>
      <aside className="panel agenda">
        <div className="panel-title">
          <div>
            <h3>Next 14 days</h3>
            <p>{agenda.length} scheduled items</p>
          </div>
          <Link className="rx-btn" href={newHref("maintenance")}>
            <Icon name="plus" size={12} /> Schedule
          </Link>
        </div>
        {agenda.length === 0 && <p className="rx-muted">Nothing scheduled.</p>}
        {agenda.map((e) => (
          <Link key={`${e.entity}-${e.id}`} href={`/records/${e.entity}/${e.id}`} className="rx-agenda-row">
            <span>
              {new Date(e.day).getDate()} <small>{new Date(e.day).toLocaleString("en-GB", { month: "short" })}</small>
            </span>
            <p>
              <b>{e.label}</b>
              <small>{e.entity === "maintenance" ? "Maintenance" : "Compliance"}</small>
            </p>
          </Link>
        ))}
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------- notifications */

const TABS = ["All", "Unread", "Critical", "Warning", "Trip", "Payment", "Maintenance", "Compliance", "Approval"];

export function NotificationsContent({ category }: { category?: string }) {
  const db = useDb();
  const router = useRouter();
  const toast = useToast();
  const { query } = useShell();
  const [tab, setTab] = useState(category ?? "All");
  const [clearing, setClearing] = useState(false);
  if (!db) return null;
  const all = db.collections.notifications.filter((n) => !category || n.category === category || (category === "Maintenance" && n.category === "Compliance"));
  const match = (n: Rec, t: string) => t === "All" || (t === "Unread" ? !n.read : n.severity === t || n.category === t);
  const q = query.trim().toLowerCase();
  const rows = all.filter((n) => match(n, tab) && (!q || `${n.title} ${n.body}`.toLowerCase().includes(q)));
  const tabs = category ? ["All", "Unread", "Critical", "Warning"] : TABS;

  const open = (n: Rec) => {
    markNotification(n.id, true);
    if (n.entity && n.recordId && getRecord(n.entity as CollectionKey, n.recordId as string)) router.push(`/records/${n.entity}/${n.recordId}`);
    else toast("The linked record no longer exists", "info");
  };

  return (
    <div className="panel notification-page">
      <div className="table-tabs rx-table-tools">
        <div className="rx-tabs">
          {tabs.map((t) => (
            <button type="button" key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {t} <em>{all.filter((n) => match(n, t)).length}</em>
            </button>
          ))}
        </div>
        <div className="rx-tools-right">
          <button
            type="button"
            className="rx-btn"
            disabled={!rows.some((n) => !n.read)}
            onClick={() => {
              markAllNotifications(rows.map((n) => n.id));
              toast("Marked as read");
            }}
          >
            <Icon name="check" size={13} /> Mark all read
          </button>
          <button type="button" className="rx-btn" disabled={!all.some((n) => n.read)} onClick={() => setClearing(true)}>
            <Icon name="trash" size={13} /> Clear read
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No notifications here" text="New alerts about trips, payments, maintenance and compliance appear in this list." />
      ) : (
        <div className="notice-list">
          {rows.map((n) => (
            <div key={n.id} className={`rx-notice ${n.read ? "" : "unread"}`} role="button" tabIndex={0} onClick={() => open(n)} onKeyDown={(e) => e.key === "Enter" && open(n)}>
              <span className={`notice-symbol rx-sev-bg-${String(n.severity).toLowerCase()}`}>
                <Icon name={n.category === "Payment" ? "income" : n.category === "Maintenance" ? "wrench" : n.category === "Compliance" ? "shield" : n.category === "Trip" ? "trip" : "bell"} size={16} />
              </span>
              <span>
                <b>{String(n.title)}</b>
                <small>
                  {String(n.body)} · {ago(n.createdAt)}
                </small>
              </span>
              <Status>{n.severity as string}</Status>
              <span onClick={(e) => e.stopPropagation()}>
                <Dropdown trigger={<Icon name="dots" size={15} />} className="rx-more" label="Notification actions">
                  {(close) => (
                    <>
                      <button type="button" onClick={() => (close(), open(n))}>
                        <Icon name="external" size={13} /> Open related record
                      </button>
                      <button type="button" onClick={() => (close(), markNotification(n.id, !n.read))}>
                        <Icon name="check" size={13} /> Mark as {n.read ? "unread" : "read"}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          close();
                          deleteRecord("notifications", n.id);
                          toast("Notification deleted");
                        }}
                      >
                        <Icon name="trash" size={13} /> Delete
                      </button>
                    </>
                  )}
                </Dropdown>
              </span>
            </div>
          ))}
        </div>
      )}
      {clearing && (
        <ConfirmDialog
          title="Clear read notifications?"
          message="All notifications you have already read will be deleted."
          confirmLabel="Clear"
          danger
          onClose={() => setClearing(false)}
          onConfirm={() => {
            const n = purgeCollection("notifications", (x) => !!x.read && (!category || x.category === category), "Read notifications cleared");
            toast(`${n} notifications cleared`);
          }}
        />
      )}
    </div>
  );
}

