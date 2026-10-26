"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { inPeriod, type Period } from "@/lib/analytics";
import { ago, initials } from "@/lib/db/format";
import { ENTITIES, type CollectionKey } from "@/lib/db/schema";
import { getRecord, isLoggedIn, logout, markAllNotifications, markNotification, recordLabel, useDb } from "@/lib/db/store";
import { modules, screens, type Screen } from "@/lib/screens";
import { Dropdown, Icon, iconFor, Loading, Logo } from "./ui";
import { useAppearance } from "./useAppearance";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "month", label: "This month" },
  { value: "30", label: "Last 30 days" },
  { value: "year", label: "This year" },
];
export { inPeriod };

const ShellCtx = createContext<{ query: string; setQuery: (q: string) => void; period: Period }>({ query: "", setQuery: () => undefined, period: "all" });
export const useShell = () => useContext(ShellCtx);

const SEARCHABLE: CollectionKey[] = ["trips", "vehicles", "drivers", "customers", "bookings", "invoices", "routes", "maintenance", "fuel", "expenses", "payments", "documents", "users"];

export function screenBySlug(slug: string) {
  return screens.find((s) => s.slug === slug);
}

function GlobalSearch({ query, setQuery }: { query: string; setQuery: (q: string) => void }) {
  const db = useDb();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!db || q.length < 2) return [];
    const out: { key: CollectionKey; id: string; label: string; sub: string }[] = [];
    for (const key of SEARCHABLE) {
      for (const r of db.collections[key]) {
        const hay = Object.values(r).join(" ").toLowerCase();
        if (hay.includes(q)) out.push({ key, id: r.id, label: recordLabel(key, r), sub: `${ENTITIES[key].singular} · ${String(r[ENTITIES[key].statusField ?? "status"] ?? "")}` });
        if (out.length >= 40) break;
      }
    }
    out.sort((a, b) => Number(!a.label.toLowerCase().includes(q)) - Number(!b.label.toLowerCase().includes(q)));
    out.splice(9);
    const screenHits = screens.filter((s) => s.kind !== "auth" && s.title.toLowerCase().includes(q)).slice(0, 3);
    return [...screenHits.map((s) => ({ key: "screen" as unknown as CollectionKey, id: s.slug, label: s.title, sub: `Screen ${s.code}` })), ...out];
  }, [db, query]);

  const go = (r: (typeof results)[number]) => {
    setOpen(false);
    router.push((r.key as string) === "screen" ? `/screens/${r.id}` : `/records/${r.key}/${r.id}`);
  };

  return (
    <div className="top-search rx-search" ref={ref}>
      <Icon name="search" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) go(results[0]);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search trips, vehicles, drivers, invoices…"
        aria-label="Search"
      />
      {query ? (
        <button type="button" className="rx-clear" onClick={() => setQuery("")} aria-label="Clear search">
          <Icon name="close" size={13} />
        </button>
      ) : (
        <kbd>Ctrl K</kbd>
      )}
      {open && query.trim().length >= 2 && (
        <div className="rx-search-results">
          {results.length === 0 ? (
            <p className="rx-muted">No records match “{query}”. The current list is filtered too.</p>
          ) : (
            results.map((r) => (
              <button type="button" key={`${r.key}-${r.id}`} onClick={() => go(r)}>
                <span className="rx-search-icon">
                  <Icon name={(r.key as string) === "screen" ? "grid" : iconFor(ENTITIES[r.key]?.label ?? "")} size={14} />
                </span>
                <span>
                  <b>{r.label}</b>
                  <small>{r.sub}</small>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const db = useDb();
  const router = useRouter();
  const items = db?.collections.notifications ?? [];
  const unread = items.filter((n) => !n.read);
  const center = modules.find((m) => m.id === 18)?.defaultSlug ?? "";
  return (
    <Dropdown
      label="Notifications"
      className={`icon-btn ${unread.length ? "has-dot" : ""} rx-bell`}
      trigger={
        <>
          <Icon name="bell" />
          {unread.length > 0 && <span className="rx-bell-count">{unread.length > 9 ? "9+" : unread.length}</span>}
        </>
      }
    >
      {(close) => (
        <div className="rx-notice-pop">
          <header>
            <b>Notifications</b>
            <button type="button" className="rx-link" disabled={!unread.length} onClick={() => markAllNotifications()}>
              Mark all read
            </button>
          </header>
          {items.slice(0, 6).map((n) => (
            <button
              type="button"
              key={n.id}
              className={n.read ? "" : "unread"}
              onClick={() => {
                markNotification(n.id, true);
                close();
                if (n.entity && n.recordId && getRecord(n.entity as CollectionKey, n.recordId as string)) router.push(`/records/${n.entity}/${n.recordId}`);
                else router.push(`/screens/${center}`);
              }}
            >
              <i className={`rx-sev rx-sev-${String(n.severity).toLowerCase()}`} />
              <span>
                <b>{String(n.title)}</b>
                <small>
                  {String(n.body)} · {ago(n.createdAt)}
                </small>
              </span>
            </button>
          ))}
          {!items.length && <p className="rx-muted">You are all caught up.</p>}
          <Link href={`/screens/${center}`} className="rx-notice-all" onClick={close}>
            Open notification center
          </Link>
        </div>
      )}
    </Dropdown>
  );
}

export type ShellProps = {
  screen?: Screen;
  moduleId: number;
  title: string;
  code?: string;
  description?: string;
  crumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  addHref?: string;
  addLabel?: string;
  hidePeriod?: boolean;
  children: React.ReactNode;
};

export default function Shell({ screen, moduleId, title, code, description, crumbs, actions, addHref, addLabel = "Add new", hidePeriod, children }: ShellProps) {
  const router = useRouter();
  const db = useDb();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [authed, setAuthed] = useState<boolean | null>(null);
  useAppearance();

  useEffect(() => {
    const ok = isLoggedIn();
    setAuthed(ok);
    if (!ok) router.replace("/");
    try {
      const saved = sessionStorage.getItem("tranzora_period") as Period | null;
      if (saved && PERIODS.some((p) => p.value === saved)) setPeriod(saved);
    } catch {
      /* ignore */
    }
  }, [router]);

  // Clear the list filter when moving to another screen.
  useEffect(() => setQuery(""), [title]);

  const ctx = useMemo(() => ({ query, setQuery, period }), [query, period]);
  const currentModule = modules.find((m) => m.id === moduleId) ?? modules[1]!;
  const user = db ? getRecord("users", db.currentUserId) : undefined;
  const role = user ? getRecord("roles", user.roleId as string) : undefined;
  const idx = screen ? screens.findIndex((s) => s.slug === screen.slug) : -1;
  const previous = idx > 0 ? screens[idx - 1] : undefined;
  const next = idx >= 0 && idx < screens.length - 1 ? screens[idx + 1] : undefined;
  const profileSlug = screens.find((s) => s.code === "19.2")?.slug;
  const settingsSlug = screens.find((s) => s.code === "19.4")?.slug;
  const passwordSlug = screens.find((s) => s.code === "19.3")?.slug;

  const doLogout = () => {
    logout();
    router.push("/");
    router.refresh();
    if (typeof window !== "undefined" && window.location.pathname === "/") window.location.reload();
  };

  if (authed === null || !db) return <Loading />;
  if (!authed) return <Loading label="Redirecting to sign in…" />;

  return (
    <ShellCtx.Provider value={ctx}>
      <div className="app-shell">
        <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <Icon name="menu" />
        </button>

        <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
          <div className="sidebar-top">
            <Link href="/" className="brand">
              <Logo />
              <span>Tranzora TMS</span>
            </Link>
            <button className="close-menu" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              <Icon name="close" />
            </button>
          </div>
          <nav>
            {modules
              .filter((m) => m.id !== 1)
              .map((mod) => (
                <Link onClick={() => setMenuOpen(false)} className={mod.id === moduleId ? "active" : ""} key={mod.id} href={`/screens/${mod.defaultSlug}`} title={mod.title}>
                  <Icon name={iconFor(mod.title)} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {mod.code}. {mod.title.replace(/ Management| & Business Analytics| Administration & Security/g, "")}
                  </span>
                  <small className="badge">{mod.subModules.length}</small>
                </Link>
              ))}
          </nav>
          <div className="sidebar-foot">
            <Logo />
            <div>
              <b>{String(db.settings.company?.name ?? "Al Amin Transport Ltd.")}</b>
              <span>{db.subscription.plan} plan</span>
            </div>
            <button type="button" className="rx-foot-logout" onClick={doLogout} title="Log out" aria-label="Log out">
              <Icon name="logout" size={14} />
            </button>
          </div>
        </aside>

        <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />

        <main className="main-area">
          <header className="topbar">
            <GlobalSearch query={query} setQuery={setQuery} />
            <div className="header-actions">
              <NotificationBell />
              <Dropdown
                label="Account menu"
                className="user-menu"
                trigger={
                  <>
                    <span className="avatar">{initials(user?.name)}</span>
                    <span>
                      <b>{String(user?.name ?? "Guest")}</b>
                      <small>{String(role?.name ?? "")}</small>
                    </span>
                    <Icon name="chev-down" size={13} />
                  </>
                }
              >
                {(close) => (
                  <div className="rx-account-menu">
                    <div className="user-dropdown-header">
                      <b>{String(user?.name ?? "")}</b>
                      <small>{String(user?.email ?? "")}</small>
                    </div>
                    {profileSlug && (
                      <Link href={`/screens/${profileSlug}`} onClick={close} className="user-dropdown-item">
                        <Icon name="users" size={13} /> <span>Personal profile</span>
                      </Link>
                    )}
                    {settingsSlug && (
                      <Link href={`/screens/${settingsSlug}`} onClick={close} className="user-dropdown-item">
                        <Icon name="settings" size={13} /> <span>General settings</span>
                      </Link>
                    )}
                    {passwordSlug && (
                      <Link href={`/screens/${passwordSlug}`} onClick={close} className="user-dropdown-item">
                        <Icon name="lock" size={13} /> <span>Change password</span>
                      </Link>
                    )}
                    <button type="button" onClick={doLogout} className="user-dropdown-item logout-btn">
                      <Icon name="logout" size={13} /> <span>Log out</span>
                    </button>
                  </div>
                )}
              </Dropdown>
            </div>
          </header>

          <div className="page">
            <div className="page-heading">
              <div>
                <div className="breadcrumb">
                  <Link href="/">Dashboard</Link>
                  <span>/</span>
                  <Link href={`/screens/${currentModule.defaultSlug}`}>
                    Module {currentModule.code}: {currentModule.title}
                  </Link>
                  {(crumbs ?? []).map((c) => (
                    <span key={c.label} className="rx-crumb">
                      <span>/</span>
                      {c.href ? <Link href={c.href}>{c.label}</Link> : <span style={{ color: "var(--ink)", fontWeight: 600 }}>{c.label}</span>}
                    </span>
                  ))}
                  {!crumbs && (
                    <>
                      <span>/</span>
                      <span style={{ color: "var(--ink)", fontWeight: 600 }}>
                        {code} {title}
                      </span>
                    </>
                  )}
                </div>
                <h1>
                  {code ? `${code} ` : ""}
                  {title}
                </h1>
                {description && <p>{description}</p>}
              </div>
              <div className="page-actions">
                {!hidePeriod && (
                  <label className="date-filter">
                    <Icon name="calendar" size={16} />
                    <select
                      value={period}
                      aria-label="Date range"
                      onChange={(e) => {
                        const p = e.target.value as Period;
                        setPeriod(p);
                        try {
                          sessionStorage.setItem("tranzora_period", p);
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      {PERIODS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {actions}
                {addHref && (
                  <Link href={addHref} className="primary">
                    <Icon name="plus" size={16} /> {addLabel}
                  </Link>
                )}
              </div>
            </div>

            {screen && (
              <div className="submodule-tabs-wrap">
                <div className="submodule-tabs-scroll">
                  {currentModule.subModules.map((sub) => (
                    <Link key={sub.code} href={`/screens/${sub.slug}`} className={`submodule-tab ${sub.slug === screen.slug ? "active" : ""}`}>
                      <span className="tab-code">{sub.code}</span>
                      <span className="tab-title">{sub.title}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {children}

            <footer className="page-footer">
              <span>{screen ? `Module ${screen.moduleCode} · Sub-module ${screen.code} · Tranzora TMS 2026` : "Tranzora TMS 2026 · data stored on this device"}</span>
              <div>
                {previous && previous.kind !== "auth" && <Link href={`/screens/${previous.slug}`}>← {previous.title}</Link>}
                {next && <Link href={`/screens/${next.slug}`}>{next.title} →</Link>}
              </div>
            </footer>
          </div>
        </main>
      </div>
    </ShellCtx.Provider>
  );
}
