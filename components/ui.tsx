"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { statusClass } from "@/lib/db/format";

export type IconName =
  | "grid" | "trip" | "booking" | "vehicle" | "driver" | "customer" | "wrench" | "fuel" | "expense" | "income" | "report"
  | "users" | "settings" | "search" | "bell" | "plus" | "dots" | "arrow" | "menu" | "close" | "check" | "document"
  | "database" | "shield" | "edit" | "trash" | "eye" | "copy" | "download" | "upload" | "print" | "back" | "refresh"
  | "map" | "calendar" | "logout" | "lock" | "route" | "chev-down" | "chev-left" | "filter" | "external" | "qr";

const iconPaths: Record<IconName, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  trip: <><path d="M4 17h16M6 17l1-8h10l1 8M8 9l2-3h4l2 3" /><circle cx="8" cy="18" r="2" /><circle cx="16" cy="18" r="2" /></>,
  booking: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h2M14 14h2M8 17h2" /></>,
  vehicle: <><path d="M5 17h14l-1.5-7h-11zM3 14h2m14 0h2" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  driver: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-5 4-7 8-7s7 2 8 7" /></>,
  customer: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3 20c1-4 3-6 6-6s5 2 6 6M15 15c3 0 5 2 6 5" /></>,
  wrench: <path d="M14 6a4 4 0 0 0-5 5L3 17l4 4 6-6a4 4 0 0 0 5-5l-3 2-3-3z" />,
  fuel: <><path d="M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h15M8 7h5v4H8z" /><path d="M16 8h2l3 3v7a2 2 0 0 1-4 0v-3" /></>,
  expense: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8M12 8l-4 4 4 4" /></>,
  income: <><circle cx="12" cy="12" r="9" /><path d="M16 12H8m4-4 4 4-4 4" /></>,
  report: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  users: <><circle cx="8" cy="8" r="3" /><circle cx="17" cy="8" r="3" /><path d="M2 20c1-4 3-6 6-6s5 2 6 6M12 20c1-4 3-6 5-6 3 0 5 2 6 6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5L9 6a8 8 0 0 0-1.7 1L5 6 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.3-1a8 8 0 0 0 1.7 1l.5 3h5l.5-3a8 8 0 0 0 1.7-1l2.3 1 2-3.5-2.1-1.5a7 7 0 0 0 .1-1z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  dots: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  arrow: <path d="m9 18 6-6-6-6" />,
  "chev-left": <path d="m15 18-6-6 6-6" />,
  "chev-down": <path d="m6 9 6 6 6-6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12 4 4L19 6" />,
  document: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8" /></>,
  database: <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></>,
  upload: <><path d="M12 21V9M7 14l5-5 5 5M4 3h16" /></>,
  print: <><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
  back: <path d="M19 12H5M12 19l-7-7 7-7" />,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  external: <><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14v2" /></>,
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {iconPaths[name] ?? iconPaths.grid}
    </svg>
  );
}

export const iconFor = (label: string): IconName => {
  const key = label.toLowerCase();
  if (key.includes("dashboard") || key.includes("overview")) return "grid";
  if (key.includes("trip")) return "trip";
  if (key.includes("booking")) return "booking";
  if (key.includes("vehicle") || key.includes("fleet")) return "vehicle";
  if (key.includes("driver") || key.includes("staff")) return "driver";
  if (key.includes("customer")) return "customer";
  if (key.includes("route") || key.includes("track")) return "route";
  if (key.includes("maintenance") || key.includes("repair")) return "wrench";
  if (key.includes("fuel")) return "fuel";
  if (key.includes("expense") || key.includes("cost")) return "expense";
  if (key.includes("income") || key.includes("revenue") || key.includes("profit")) return "income";
  if (key.includes("invoice") || key.includes("bill") || key.includes("challan")) return "document";
  if (key.includes("account") || key.includes("payment")) return "expense";
  if (key.includes("report") || key.includes("analytics")) return "report";
  if (key.includes("document")) return "document";
  if (key.includes("subscription")) return "booking";
  if (key.includes("user") || key.includes("role") || key.includes("permission")) return "users";
  if (key.includes("notification")) return "bell";
  if (key.includes("database")) return "database";
  if (key.includes("security") || key.includes("admin")) return "shield";
  return "settings";
};

export function Logo() {
  return (
    <span className="logo-mark">
      <i />
      <i />
      <i />
    </span>
  );
}

export function Status({ children }: { children: unknown }) {
  if (children === undefined || children === null || children === "") return <span className="muted-dash">—</span>;
  return <span className={statusClass(children)}>{String(children)}</span>;
}

export function Loading({ label = "Loading workspace data…" }: { label?: string }) {
  return (
    <div className="rx-loading" role="status">
      <span className="rx-spinner" />
      {label}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="rx-empty">
      <span>
        <Icon name="search" size={20} />
      </span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/* --------------------------------------------------------------- modal */

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = "md",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="rx-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`rx-modal rx-modal-${size}`} role="dialog" aria-modal aria-label={title} tabIndex={-1} ref={ref}>
        <header>
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="rx-icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="rx-modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? "rx-danger" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
            autoFocus
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="rx-confirm">{message}</div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- toast */

type ToastTone = "success" | "error" | "info";
const ToastCtx = createContext<(message: string, tone?: ToastTone) => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: ToastTone }[]>([]);
  const push = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="rx-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div className={`toast rx-toast-${t.tone}`} key={t.id}>
            <span>
              <Icon name={t.tone === "error" ? "close" : t.tone === "info" ? "bell" : "check"} size={14} />
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* -------------------------------------------------------------- dropdown */

export function Dropdown({
  trigger,
  children,
  align = "right",
  label = "More actions",
  className = "rx-icon-btn",
}: {
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  label?: string;
  className?: string;
}) {
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;
  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    // The menu is fixed-positioned (so scroll containers cannot clip it); close it when anything scrolls.
    const onScroll = (e: Event) => !menuRef.current?.contains(e.target as Node) && close();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  const toggle = (btn: HTMLElement) => {
    if (open) return setPos(null);
    const r = btn.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const style: React.CSSProperties = { position: "fixed" };
    if (below < 260 && r.top > below) style.bottom = window.innerHeight - r.top + 6;
    else style.top = r.bottom + 6;
    if (align === "right") style.right = Math.max(8, window.innerWidth - r.right);
    else style.left = Math.max(8, r.left);
    setPos(style);
  };
  return (
    <div className="rx-dropdown" ref={ref}>
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          toggle(e.currentTarget);
        }}
      >
        {trigger}
      </button>
      {pos && (
        <div ref={menuRef} className="rx-menu" style={pos} role="menu" onClick={(e) => e.stopPropagation()}>
          {children(() => setPos(null))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- charts */

const PALETTE = ["#1769e8", "#16a879", "#f3a526", "#eb5365", "#7659e9", "#0ea5b7", "#94a3b8"];

/** Line/area chart over a numeric series; labels are shown under the chart. */
export function LineChart({ series, labels, color = "#1769e8", compare }: { series: number[]; labels: string[]; color?: string; compare?: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 520;
  const h = 170;
  const max = Math.max(1, ...series, ...(compare ?? []));
  const x = (i: number) => (series.length <= 1 ? w / 2 : (i / (series.length - 1)) * w);
  const y = (v: number) => h - 14 - (v / max) * (h - 34);
  const path = (data: number[]) => data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const gid = `g${color.slice(1)}`;
  return (
    <div className="rx-chart">
      <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Trend chart" onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".2" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1="0" x2={w} y1={y(max * f)} y2={y(max * f)} stroke="#edf1f7" />
        ))}
        {compare && <path d={path(compare)} fill="none" stroke="#c3cad6" strokeWidth="2" strokeDasharray="5 5" />}
        <path d={`${path(series)} L${w} ${h} L0 ${h}Z`} fill={`url(#${gid})`} />
        <path d={path(series)} fill="none" stroke={color} strokeWidth="2.6" />
        {series.map((v, i) => (
          <g key={i}>
            <rect x={x(i) - w / series.length / 2} y="0" width={w / series.length} height={h} fill="transparent" onMouseEnter={() => setHover(i)} />
            <circle cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3} fill="#fff" stroke={color} strokeWidth="2" />
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div className="rx-chart-tip" style={{ left: `${(x(hover) / w) * 100}%` }}>
          <b>{labels[hover]}</b>
          {series[hover]!.toLocaleString("en-IN")}
        </div>
      )}
      <div className="axis-labels">
        {labels.filter((_, i) => labels.length <= 8 || i % Math.ceil(labels.length / 7) === 0).map((l, i) => (
          <span key={`${l}-${i}`}>{l}</span>
        ))}
      </div>
    </div>
  );
}

export function DonutChart({ segments, center, caption }: { segments: { label: string; value: number }[]; center?: string; caption?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  const stops = segments
    .map((s, i) => {
      const from = total ? (acc / total) * 100 : 0;
      acc += s.value;
      const to = total ? (acc / total) * 100 : 0;
      return `${PALETTE[i % PALETTE.length]} ${from}% ${to}%`;
    })
    .join(",");
  return (
    <>
      <div className="donut" style={{ background: total ? `conic-gradient(${stops})` : "#eef2f7" }}>
        <div>
          <strong className={(center ?? "").length > 6 ? "rx-long" : ""}>{center ?? total.toLocaleString("en-IN")}</strong>
          <span>{caption ?? "Total"}</span>
        </div>
      </div>
      <ul className="legend">
        {segments.map((s, i) => (
          <li key={s.label}>
            <i className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />
            {s.label} <b>{total ? Math.round((s.value / total) * 100) : 0}%</b>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Bars({ data, secondary, labels, format = (n: number) => n.toLocaleString("en-IN") }: { data: number[]; secondary?: number[]; labels: string[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...data, ...(secondary ?? []));
  return (
    <div className="bar-chart" aria-label="Bar chart">
      {data.map((v, i) => (
        <div className="bar-pair" key={i} title={`${labels[i]}: ${format(v)}${secondary ? ` / ${format(secondary[i] ?? 0)}` : ""}`}>
          <i style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
          {secondary && <b style={{ height: `${Math.max(2, ((secondary[i] ?? 0) / max) * 100)}%` }} />}
          <span>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

export type StatItem = { label: string; value: string; note?: string; tone?: "blue" | "green" | "violet" | "orange" | "red"; icon?: IconName; href?: string; positive?: boolean };

export function StatGrid({ items, compact = true }: { items: StatItem[]; compact?: boolean }) {
  const tones: StatItem["tone"][] = ["blue", "green", "violet", "orange"];
  return (
    <div className={`stats-grid ${compact ? "compact" : ""}`}>
      {items.map((s, i) => {
        const body = (
          <>
            <div className={`stat-icon ${s.tone ?? tones[i % 4]}`}>
              <Icon name={s.icon ?? (["income", "trip", "vehicle", "booking"] as IconName[])[i % 4]!} />
            </div>
            <div className="stat-copy">
              <span>{s.label}</span>
              <strong>{s.value}</strong>
              {s.note && <small className={s.positive === undefined ? "" : s.positive ? "positive" : "negative"}>{s.note}</small>}
            </div>
          </>
        );
        return s.href ? (
          <Link className="stat-card rx-stat-link" href={s.href} key={s.label}>
            {body}
          </Link>
        ) : (
          <article className="stat-card" key={s.label}>
            {body}
          </article>
        );
      })}
    </div>
  );
}

/** Decorative QR-style code (finder squares + modules hashed from `value`). */
export function QrArt({ value, size = 150 }: { value: string; size?: number }) {
  const n = 25;
  let h = 2166136261;
  for (const ch of value) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const cells: [number, number][] = [];
  const finder = (x: number, y: number) => x < 7 && y < 7;
  const inFinder = (x: number, y: number) => finder(x, y) || finder(n - 1 - x, y) || finder(x, n - 1 - y);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (inFinder(x, y) || (x === 7 || y === 7 || x === n - 8 || y === n - 8)) continue;
      h = Math.imul(h ^ (x * 31 + y), 2246822519) >>> 0;
      if (h % 100 < 47) cells.push([x, y]);
    }
  const box = (x: number, y: number) => (
    <g key={`f${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" fill="#0f1b2d" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" fill="#0f1b2d" />
    </g>
  );
  return (
    <svg className="rx-qr-svg" width={size} height={size} viewBox={`-1 -1 ${n + 2} ${n + 2}`} shapeRendering="crispEdges" role="img" aria-label="QR code">
      <rect x="-1" y="-1" width={n + 2} height={n + 2} fill="#fff" />
      {box(0, 0)}
      {box(n - 7, 0)}
      {box(0, n - 7)}
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0f1b2d" />
      ))}
    </svg>
  );
}
