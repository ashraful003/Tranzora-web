"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ago, dateTime, initials } from "@/lib/db/format";
import { changePassword, currentUser, getRecord, getSettings, logActivity, saveSettings, StoreError, terminateOtherSessions, terminateSession, updateRecord, useDb } from "@/lib/db/store";
import { COMPANY_DEFAULTS } from "./Finance";
import { ConfirmDialog, Icon, QrArt, Status, useToast } from "../ui";

type SField = { key: string; label: string; type: "text" | "number" | "select" | "toggle" | "textarea" | "password" | "email" | "color"; options?: string[]; help?: string; wide?: boolean };
type Section = { slug: string; title: string; intro: string; fields?: SField[]; defaults?: Record<string, unknown> };

const ACCENTS = ["#1769e8", "#16a879", "#7659e9", "#e8590c", "#0f766e", "#be185d"];

export const SECTIONS: Record<string, Section> = {
  company: {
    slug: "130-company-profile",
    title: "Company profile",
    intro: "Shown on invoices, challans and booking confirmations.",
    defaults: { ...COMPANY_DEFAULTS, currency: "BDT (৳)", branches: "Tejgaon Central Depot, Chattogram Port Depot, Bogura Northern Hub, Khulna South Hub, Sylhet East Hub" },
    fields: [
      { key: "name", label: "Company name", type: "text" },
      { key: "tradeLicense", label: "Trade licence number", type: "text" },
      { key: "bin", label: "BIN / VAT registration", type: "text" },
      { key: "phone", label: "Hotline", type: "text" },
      { key: "email", label: "Billing email", type: "email" },
      { key: "currency", label: "Currency", type: "select", options: ["BDT (৳)", "USD ($)"] },
      { key: "address", label: "Head office address", type: "textarea", wide: true },
      { key: "bank", label: "Bank account (for invoices)", type: "text" },
      { key: "bkash", label: "bKash merchant number", type: "text" },
      { key: "branches", label: "Branches / depots (comma separated)", type: "textarea", wide: true },
    ],
  },
  general: {
    slug: "133-general-settings",
    title: "General settings",
    intro: "Regional defaults used across the workspace.",
    defaults: { currency: "BDT (৳)", timezone: "Asia/Dhaka (GMT+6)", dateFormat: "DD MMM YYYY", language: "English", fiscalYear: "July – June", distance: "Kilometres" },
    fields: [
      { key: "currency", label: "Default currency", type: "select", options: ["BDT (৳)", "USD ($)"] },
      { key: "timezone", label: "Time zone", type: "select", options: ["Asia/Dhaka (GMT+6)", "Asia/Kolkata (GMT+5:30)", "UTC"] },
      { key: "dateFormat", label: "Date format", type: "select", options: ["DD MMM YYYY", "DD/MM/YYYY", "YYYY-MM-DD"] },
      { key: "language", label: "Language", type: "select", options: ["English", "বাংলা (Bengali)"] },
      { key: "fiscalYear", label: "Financial year", type: "select", options: ["July – June", "January – December"] },
      { key: "distance", label: "Distance unit", type: "select", options: ["Kilometres", "Miles"] },
    ],
  },
  preferences: {
    slug: "134-system-preferences",
    title: "System preferences",
    intro: "Numbering, defaults and approval rules.",
    defaults: { tripPrefix: "TRP", invoicePrefix: "INV", challanPrefix: "CHL", vat: 5, dueDays: 30, autoChallan: true, requirePod: true, approveExpenses: true, blockExpired: true },
    fields: [
      { key: "tripPrefix", label: "Trip number prefix", type: "text" },
      { key: "invoicePrefix", label: "Invoice prefix", type: "text" },
      { key: "challanPrefix", label: "Challan prefix", type: "text" },
      { key: "vat", label: "Default VAT %", type: "number" },
      { key: "dueDays", label: "Invoice due in (days)", type: "number" },
      { key: "autoChallan", label: "Generate challan when a trip is dispatched", type: "toggle" },
      { key: "requirePod", label: "Require proof of delivery before completing a trip", type: "toggle" },
      { key: "approveExpenses", label: "Expenses need approval before payment", type: "toggle" },
      { key: "blockExpired", label: "Block dispatch of vehicles with expired documents", type: "toggle" },
    ],
  },
  appearance: {
    slug: "135-appearance-settings",
    title: "Appearance",
    intro: "Theme, accent colour and layout density — applied immediately.",
    defaults: { theme: "Light", accent: "#1769e8", compactSidebar: false },
    fields: [
      { key: "theme", label: "Theme", type: "select", options: ["Light", "Dark", "System"] },
      { key: "accent", label: "Accent colour", type: "color" },
      { key: "compactSidebar", label: "Compact sidebar", type: "toggle", help: "Narrower navigation for small screens." },
    ],
  },
  gateway: {
    slug: "136-email-and-sms-settings",
    title: "Email & SMS gateway",
    intro: "Provider credentials for alerts and customer messages.",
    defaults: { smsProvider: "SSL Wireless", smsKey: "", senderId: "TRANZORA", smtpHost: "smtp.gmail.com", smtpPort: 587, smtpUser: "", fromEmail: "no-reply@alamintransport.com", smsEnabled: true, emailEnabled: true },
    fields: [
      { key: "smsProvider", label: "SMS provider", type: "select", options: ["SSL Wireless", "Infobip", "Twilio", "BulkSMSBD"] },
      { key: "smsKey", label: "SMS API key", type: "password" },
      { key: "senderId", label: "Sender ID", type: "text" },
      { key: "smtpHost", label: "SMTP host", type: "text" },
      { key: "smtpPort", label: "SMTP port", type: "number" },
      { key: "smtpUser", label: "SMTP username", type: "email" },
      { key: "fromEmail", label: "From address", type: "email" },
      { key: "smsEnabled", label: "Send SMS alerts", type: "toggle" },
      { key: "emailEnabled", label: "Send email alerts", type: "toggle" },
    ],
  },
  notifications: {
    slug: "129-notification-settings",
    title: "Notification settings",
    intro: "Choose which events alert you and on which channel.",
  },
  security: {
    slug: "138-security-settings",
    title: "Security settings",
    intro: "Password policy and network restrictions.",
    defaults: { minLength: 8, requireNumber: true, requireSymbol: false, expiryDays: 90, ipWhitelist: "", forceHttps: true },
    fields: [
      { key: "minLength", label: "Minimum password length", type: "number" },
      { key: "expiryDays", label: "Password expires after (days)", type: "number" },
      { key: "requireNumber", label: "Require at least one number", type: "toggle" },
      { key: "requireSymbol", label: "Require a symbol", type: "toggle" },
      { key: "forceHttps", label: "Only allow secure (HTTPS) access", type: "toggle" },
      { key: "ipWhitelist", label: "IP allow-list (one per line, empty = any)", type: "textarea", wide: true },
    ],
  },
  twofactor: { slug: "139-two-factor-authentication", title: "Two-factor authentication", intro: "Protect sign-in with a one-time code." },
  login: {
    slug: "144-login-security",
    title: "Login security",
    intro: "Lock out repeated failed attempts and watch for unusual sign-ins.",
    defaults: { maxAttempts: 5, lockMinutes: 15, notifyNewDevice: true, blockTor: false },
    fields: [
      { key: "maxAttempts", label: "Failed attempts before lockout", type: "number" },
      { key: "lockMinutes", label: "Lockout duration (minutes)", type: "number" },
      { key: "notifyNewDevice", label: "Notify me on sign-in from a new device", type: "toggle" },
      { key: "blockTor", label: "Block anonymous proxy / TOR traffic", type: "toggle" },
    ],
  },
  sessions: { slug: "143-session-management", title: "Sessions", intro: "Devices currently signed in to this workspace." },
  password: { slug: "132-change-password", title: "Change password", intro: "Use at least 6 characters; you stay signed in." },
};

const NAV = ["company", "general", "preferences", "appearance", "gateway", "notifications", "security", "twofactor", "login", "sessions", "password"];

export default function SettingsContent({ section }: { section: string }) {
  const meta = SECTIONS[section] ?? SECTIONS.general!;
  return (
    <div className="settings-layout">
      <aside className="settings-nav">
        {NAV.map((k) => (
          <Link key={k} href={`/screens/${SECTIONS[k]!.slug}`} className={k === section ? "active" : ""}>
            {SECTIONS[k]!.title}
          </Link>
        ))}
      </aside>
      <section className="panel settings-form">
        <div className="settings-heading">
          <h3>{meta.title}</h3>
          <p>{meta.intro}</p>
        </div>
        {section === "password" ? <PasswordForm /> : section === "sessions" ? <Sessions /> : section === "twofactor" ? <TwoFactor /> : section === "notifications" ? <NotificationMatrix /> : <GenericSettings section={section} meta={meta} />}
      </section>
    </div>
  );
}

function GenericSettings({ section, meta }: { section: string; meta: Section }) {
  const db = useDb();
  const toast = useToast();
  const stored = db ? getSettings(section, meta.defaults) : meta.defaults ?? {};
  const [values, setValues] = useState<Record<string, unknown>>(stored);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(values) !== JSON.stringify(stored);

  useEffect(() => {
    if (db) setValues(getSettings(section, meta.defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, !!db]);

  const set = (k: string, v: unknown) => {
    setValues((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };
  const save = () => {
    const e: Record<string, string> = {};
    for (const f of meta.fields ?? []) {
      const v = values[f.key];
      if (f.type === "number" && (v === "" || Number.isNaN(Number(v)) || Number(v) < 0)) e[f.key] = "Enter a valid number";
      if (f.type === "email" && v && !/^\S+@\S+\.\S+$/.test(String(v))) e[f.key] = "Enter a valid email";
      if (f.key === "name" && !String(v ?? "").trim()) e[f.key] = "Required";
    }
    setErrors(e);
    if (Object.values(e).some(Boolean)) return toast("Please fix the highlighted fields", "error");
    const clean = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, (meta.fields ?? []).find((f) => f.key === k)?.type === "number" ? Number(v) : v]));
    saveSettings(section, clean, meta.title);
    toast(`${meta.title} saved`);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="form-grid">
        {(meta.fields ?? [])
          .filter((f) => f.type !== "toggle")
          .map((f) => (
            <label key={f.key} className={`${f.wide || f.type === "textarea" ? "wide" : ""} ${errors[f.key] ? "rx-invalid" : ""}`}>
              <span>{f.label}</span>
              {f.type === "select" ? (
                <select value={String(values[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)}>
                  {f.options!.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea value={String(values[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} />
              ) : f.type === "color" ? (
                <div className="rx-swatches">
                  {ACCENTS.map((c) => (
                    <button type="button" key={c} className={values[f.key] === c ? "on" : ""} style={{ background: c }} onClick={() => set(f.key, c)} aria-label={`Accent ${c}`} />
                  ))}
                  <input type="color" value={String(values[f.key] ?? "#1769e8")} onChange={(e) => set(f.key, e.target.value)} aria-label="Custom colour" />
                </div>
              ) : (
                <input type={f.type} value={String(values[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} autoComplete="off" />
              )}
              {errors[f.key] && <small className="rx-error">{errors[f.key]}</small>}
              {f.help && <small className="rx-hint">{f.help}</small>}
            </label>
          ))}
      </div>
      {(meta.fields ?? []).some((f) => f.type === "toggle") && (
        <div className="toggle-section">
          <h4>Options</h4>
          {(meta.fields ?? [])
            .filter((f) => f.type === "toggle")
            .map((f) => (
              <label className="toggle-row" key={f.key}>
                <span>
                  <b>{f.label}</b>
                  <small>{f.help ?? (values[f.key] ? "Enabled" : "Disabled")}</small>
                </span>
                <input type="checkbox" checked={!!values[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
                <i />
              </label>
            ))}
        </div>
      )}
      {section === "gateway" && (
        <div className="rx-quick">
          <span>Test the connection</span>
          <button
            type="button"
            className="rx-btn"
            onClick={() => {
              if (!values.smsKey) return toast("Add the SMS API key first", "error");
              logActivity("Test", "Settings", `Test SMS sent via ${values.smsProvider}`);
              toast(`Test SMS queued via ${values.smsProvider}`);
            }}
          >
            <Icon name="bell" size={13} /> Send test SMS
          </button>
          <button
            type="button"
            className="rx-btn"
            onClick={() => {
              if (!values.smtpUser) return toast("Add the SMTP username first", "error");
              logActivity("Test", "Settings", `Test email sent from ${values.fromEmail}`);
              toast(`Test email sent to ${values.smtpUser}`);
            }}
          >
            <Icon name="document" size={13} /> Send test email
          </button>
        </div>
      )}
      {section === "login" && <FailedLogins />}
      <div className="form-actions">
        <button type="button" className="secondary" onClick={() => setValues({ ...(meta.defaults ?? {}) })}>
          Restore defaults
        </button>
        <button type="button" className="secondary" disabled={!dirty} onClick={() => setValues(stored)}>
          Discard changes
        </button>
        <button className="primary" disabled={!dirty}>
          <Icon name="check" size={14} /> Save changes
        </button>
      </div>
    </form>
  );
}

function FailedLogins() {
  const db = useDb();
  const rows = db?.collections.auditLogs.filter((l) => l.action === "Failed login").slice(0, 5) ?? [];
  return (
    <div className="toggle-section">
      <h4>Recent failed sign-ins</h4>
      {rows.length === 0 && <p className="rx-muted">No failed attempts recorded.</p>}
      {rows.map((l) => (
        <Link key={l.id} href={`/records/auditLogs/${l.id}`} className="toggle-row rx-link-row">
          <span>
            <b>{String(l.message)}</b>
            <small>
              {dateTime(l.createdAt)} · IP {String(l.ip)}
            </small>
          </span>
          <Status>{l.level as string}</Status>
        </Link>
      ))}
    </div>
  );
}

const EVENTS = ["Trip dispatched / delivered", "Trip delay or breakdown", "New booking", "Payment received", "Invoice overdue", "Maintenance due", "Document expiring", "Expense awaiting approval"];
const CHANNELS = ["In-app", "Email", "SMS", "WhatsApp"];

function NotificationMatrix() {
  const db = useDb();
  const toast = useToast();
  const defaults = Object.fromEntries(EVENTS.flatMap((e, i) => CHANNELS.map((c, j) => [`${i}:${j}`, j === 0 || (j === 1 && i % 2 === 0) || (j === 2 && [1, 4, 6].includes(i))])));
  const stored = db ? getSettings("notifications", { ...defaults, recipients: "admin@tranzora.com, ops@tranzora.com" }) : defaults;
  const [v, setV] = useState<Record<string, unknown>>(stored);
  const dirty = JSON.stringify(v) !== JSON.stringify(stored);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveSettings("notifications", v, "Notification settings");
        toast("Notification settings saved");
      }}
    >
      <div className="table-scroll rx-matrix">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              {CHANNELS.map((c, j) => (
                <th key={c}>
                  <button type="button" className="rx-sort" onClick={() => setV((x) => ({ ...x, ...Object.fromEntries(EVENTS.map((_, i) => [`${i}:${j}`, !EVENTS.every((__, k) => x[`${k}:${j}`])])) }))} title="Toggle whole column">
                    {c}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((e, i) => (
              <tr key={e}>
                <td>
                  <b>{e}</b>
                </td>
                {CHANNELS.map((c, j) => (
                  <td key={c}>
                    <input type="checkbox" aria-label={`${e} by ${c}`} checked={!!v[`${i}:${j}`]} onChange={(ev) => setV((x) => ({ ...x, [`${i}:${j}`]: ev.target.checked }))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-grid rx-mt">
        <label className="wide">
          <span>Also send alerts to (comma separated emails)</span>
          <input value={String(v.recipients ?? "")} onChange={(e) => setV((x) => ({ ...x, recipients: e.target.value }))} />
        </label>
      </div>
      <div className="form-actions">
        <button type="button" className="secondary" disabled={!dirty} onClick={() => setV(stored)}>
          Discard changes
        </button>
        <button className="primary" disabled={!dirty}>
          <Icon name="check" size={14} /> Save changes
        </button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const strength = [/.{8,}/, /\d/, /[A-Z]/, /[^A-Za-z0-9]/].filter((r) => r.test(v.next)).length;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.next !== v.confirm) return setError("New passwords do not match");
        try {
          changePassword(v.current, v.next);
          setV({ current: "", next: "", confirm: "" });
          setError("");
          toast("Password changed");
        } catch (err) {
          setError(err instanceof StoreError ? err.message : "Could not change password");
        }
      }}
    >
      <div className="form-grid rx-narrow">
        {(["current", "next", "confirm"] as const).map((k) => (
          <label key={k} className="wide">
            <span>{k === "current" ? "Current password" : k === "next" ? "New password" : "Confirm new password"}</span>
            <input type={show ? "text" : "password"} value={v[k]} onChange={(e) => (setV({ ...v, [k]: e.target.value }), setError(""))} required autoComplete={k === "current" ? "current-password" : "new-password"} />
          </label>
        ))}
        <div className="wide rx-strength">
          <span className={`s${strength}`}>
            <i />
            <i />
            <i />
            <i />
          </span>
          <small>{["Too weak", "Weak", "Fair", "Good", "Strong"][strength]}</small>
          <label className="rx-check-inline">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
          </label>
        </div>
      </div>
      {error && <p className="rx-error rx-error-block">{error}</p>}
      <div className="form-actions">
        <button type="button" className="secondary" onClick={() => setV({ current: "", next: "", confirm: "" })}>
          Clear
        </button>
        <button className="primary" disabled={!v.current || !v.next}>
          <Icon name="lock" size={14} /> Update password
        </button>
      </div>
    </form>
  );
}

function Sessions() {
  const db = useDb();
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  if (!db) return null;
  return (
    <>
      <div className="rx-session-list">
        {db.sessions.map((s) => (
          <div key={s.id} className="toggle-row">
            <span>
              <b>
                {s.device} {s.current && <Status>Current</Status>}
              </b>
              <small>
                {s.location} · IP {s.ip} · active {ago(s.lastActive)}
              </small>
            </span>
            {!s.current && (
              <button
                type="button"
                className="rx-btn rx-btn-danger"
                onClick={() => {
                  terminateSession(s.id);
                  toast(`${s.device} signed out`);
                }}
              >
                Sign out
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="form-actions">
        <button type="button" className="rx-danger" disabled={db.sessions.length < 2} onClick={() => setAsk(true)}>
          <Icon name="logout" size={14} /> Sign out all other devices
        </button>
      </div>
      {ask && (
        <ConfirmDialog
          title="Sign out other devices?"
          message="Everyone signed in on other devices will need to log in again."
          confirmLabel="Sign out all"
          danger
          onClose={() => setAsk(false)}
          onConfirm={() => {
            terminateOtherSessions();
            toast("Other sessions signed out");
          }}
        />
      )}
    </>
  );
}

function TwoFactor() {
  const db = useDb();
  const toast = useToast();
  const s = db ? getSettings("twofactor", { enabled: false, enforce: false, method: "Authenticator app" }) : { enabled: false, enforce: false, method: "Authenticator app" };
  const [step, setStep] = useState<"idle" | "setup">("idle");
  const [code, setCode] = useState("");
  const [method, setMethod] = useState(String(s.method));
  const secret = "TRNZ-4K7Q-M2XP-9WLA";
  return (
    <>
      <div className="toggle-row">
        <span>
          <b>Two-factor sign-in for your account</b>
          <small>{s.enabled ? `Enabled · ${s.method}` : "Not enabled — your password alone protects this account."}</small>
        </span>
        <Status>{s.enabled ? "Active" : "Inactive"}</Status>
      </div>
      {step === "setup" ? (
        <div className="rx-2fa">
          <QrArt value={`otpauth://totp/Tranzora:${String(currentUser()?.email ?? "")}?secret=${secret}`} size={140} />
          <div>
            <label className="rx-picker">
              <span>Method</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option>Authenticator app</option>
                <option>SMS one-time code</option>
              </select>
            </label>
            <p className="rx-muted">
              {method === "Authenticator app" ? (
                <>
                  Scan the code with Google Authenticator, or enter the key <b>{secret}</b>. Then type the 6-digit code it shows.
                </>
              ) : (
                <>A code will be sent to {String(currentUser()?.phone ?? "your phone")}. For this demo any 6 digits work.</>
              )}
            </p>
            <div className="rx-inline-form">
              <input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" aria-label="Verification code" />
              <button
                type="button"
                className="primary"
                disabled={code.length !== 6}
                onClick={() => {
                  saveSettings("twofactor", { enabled: true, method }, "Two-factor authentication");
                  setStep("idle");
                  setCode("");
                  toast("Two-factor authentication enabled");
                }}
              >
                Verify & enable
              </button>
              <button type="button" className="secondary" onClick={() => setStep("idle")}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="form-actions rx-left">
          {s.enabled ? (
            <button
              type="button"
              className="rx-danger"
              onClick={() => {
                saveSettings("twofactor", { enabled: false }, "Two-factor authentication");
                toast("Two-factor authentication turned off", "info");
              }}
            >
              Turn off
            </button>
          ) : (
            <button type="button" className="primary" onClick={() => setStep("setup")}>
              <Icon name="shield" size={14} /> Set up two-factor
            </button>
          )}
        </div>
      )}
      <div className="toggle-section">
        <h4>Workspace policy</h4>
        <label className="toggle-row">
          <span>
            <b>Require two-factor for all administrators</b>
            <small>Admins without 2FA are asked to set it up at next sign-in.</small>
          </span>
          <input
            type="checkbox"
            checked={!!s.enforce}
            onChange={(e) => {
              saveSettings("twofactor", { enforce: e.target.checked }, "Two-factor policy");
              toast(e.target.checked ? "2FA now required for admins" : "2FA requirement removed");
            }}
          />
          <i />
        </label>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- profile */

export function ProfileContent() {
  const db = useDb();
  const toast = useToast();
  const [tab, setTab] = useState<"profile" | "security" | "prefs">("profile");
  const user = db ? currentUser() : undefined;
  const extra = db ? getSettings(`profile:${user?.id}`, { designation: "Fleet Operations Director", department: "Operations & Dispatch", address: "Plot 14, Road 7, Tejgaon Industrial Area, Dhaka", avatar: "", digest: true, sound: true, mobilePush: false }) : {};
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => {
    if (user) setV({ name: String(user.name ?? ""), email: String(user.email ?? ""), phone: String(user.phone ?? ""), designation: String(extra.designation ?? ""), department: String(extra.department ?? ""), address: String(extra.address ?? "") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, !!db]);
  if (!db || !user) return null;
  const role = getRecord("roles", user.roleId as string);
  const actions = db.collections.auditLogs.filter((l) => l.user === user.name);

  const save = () => {
    if (!v.name?.trim() || !/^\S+@\S+\.\S+$/.test(v.email ?? "")) return toast("Name and a valid email are required", "error");
    try {
      updateRecord("users", user.id, { name: v.name, email: v.email, phone: v.phone }, "Profile update");
      saveSettings(`profile:${user.id}`, { designation: v.designation, department: v.department, address: v.address }, "Personal profile");
      toast("Profile saved");
    } catch (e) {
      toast(e instanceof StoreError ? e.message : "Could not save", "error");
    }
  };

  return (
    <div className="profile-layout">
      <aside className="panel profile-card">
        <div className="large-avatar">
          {extra.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={String(extra.avatar)} alt="" />
          ) : (
            initials(user.name)
          )}
          <span className="online" />
        </div>
        <h2>{String(user.name)}</h2>
        <p>
          {String(extra.designation)} · {String(role?.name ?? "")}
        </p>
        <Status>{user.status as string}</Status>
        <div className="profile-stats">
          <span>
            <b>{actions.length}</b>
            <small>Actions logged</small>
          </span>
          <span>
            <b>{db.sessions.length}</b>
            <small>Devices</small>
          </span>
          <span>
            <b>{user.lastLogin ? ago(user.lastLogin) : "—"}</b>
            <small>Last login</small>
          </span>
        </div>
        <label className="secondary full rx-file-btn">
          <Icon name="upload" size={14} /> Change avatar
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 400 * 1024) return toast("Choose an image under 400 KB", "error");
              const r = new FileReader();
              r.onload = () => {
                saveSettings(`profile:${user.id}`, { avatar: String(r.result) }, "Profile photo");
                toast("Avatar updated");
              };
              r.readAsDataURL(f);
            }}
          />
        </label>
        {extra.avatar ? (
          <button type="button" className="rx-link" onClick={() => (saveSettings(`profile:${user.id}`, { avatar: "" }, "Profile photo"), toast("Avatar removed"))}>
            Remove photo
          </button>
        ) : null}
      </aside>
      <section className="panel profile-form">
        <div className="tabs">
          <button type="button" className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>
            Personal profile
          </button>
          <button type="button" className={tab === "security" ? "active" : ""} onClick={() => setTab("security")}>
            Security & login
          </button>
          <button type="button" className={tab === "prefs" ? "active" : ""} onClick={() => setTab("prefs")}>
            Notification preferences
          </button>
        </div>
        {tab === "profile" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="form-grid">
              {[
                ["name", "Full name"],
                ["email", "Work email"],
                ["phone", "Mobile phone"],
                ["designation", "Designation"],
              ].map(([k, label]) => (
                <label key={k}>
                  <span>{label}</span>
                  <input value={v[k!] ?? ""} onChange={(e) => setV({ ...v, [k!]: e.target.value })} type={k === "email" ? "email" : "text"} />
                </label>
              ))}
              <label>
                <span>Department</span>
                <select value={v.department ?? ""} onChange={(e) => setV({ ...v, department: e.target.value })}>
                  {["Operations & Dispatch", "Finance & Accounts", "Fleet & Maintenance", "Management", "Customer Service"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Role</span>
                <input value={String(role?.name ?? "")} readOnly disabled />
              </label>
              <label className="wide">
                <span>Office address</span>
                <textarea value={v.address ?? ""} onChange={(e) => setV({ ...v, address: e.target.value })} />
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => setV({ name: String(user.name ?? ""), email: String(user.email ?? ""), phone: String(user.phone ?? ""), designation: String(extra.designation ?? ""), department: String(extra.department ?? ""), address: String(extra.address ?? "") })}>
                Discard changes
              </button>
              <button className="primary">
                <Icon name="check" size={14} /> Save changes
              </button>
            </div>
          </form>
        )}
        {tab === "security" && (
          <>
            <PasswordForm />
            <div className="rx-quick">
              <span>More security</span>
              <Link className="rx-btn" href="/screens/139-two-factor-authentication">
                <Icon name="shield" size={13} /> Two-factor authentication
              </Link>
              <Link className="rx-btn" href="/screens/143-session-management">
                <Icon name="logout" size={13} /> Manage sessions
              </Link>
            </div>
          </>
        )}
        {tab === "prefs" && (
          <div className="toggle-section">
            {[
              ["digest", "Daily summary email", "A morning digest of trips, payments and alerts."],
              ["sound", "Sound for new alerts", "Play a short sound when a notification arrives."],
              ["mobilePush", "Mobile push notifications", "Send alerts to the Tranzora mobile app."],
            ].map(([k, label, help]) => (
              <label className="toggle-row" key={k}>
                <span>
                  <b>{label}</b>
                  <small>{help}</small>
                </span>
                <input
                  type="checkbox"
                  checked={!!extra[k!]}
                  onChange={(e) => {
                    saveSettings(`profile:${user.id}`, { [k!]: e.target.checked }, "Notification preferences");
                    toast(`${label} ${e.target.checked ? "on" : "off"}`);
                  }}
                />
                <i />
              </label>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
