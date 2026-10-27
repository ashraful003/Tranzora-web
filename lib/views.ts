import { ENTITIES, relatedKey, type CollectionKey, type Rec } from "./db/schema";

/**
 * What each screen shows. Table, form and detail screens are backed by an entity of the local
 * store; the rest name a dedicated view. Screens not listed fall back to their `kind`.
 */

export type TableView = {
  type: "table";
  entity: CollectionKey;
  filter?: (r: Rec) => boolean;
  columns?: string[];
  /** Status tabs; defaults to the entity's statuses. */
  tabs?: string[];
  /** Adds a select that narrows the list to one related record (e.g. one customer). */
  scopeBy?: { field: string; entity: CollectionKey; label: string };
  /** One-click reassignment of a ref field from the row (assignment boards). */
  assign?: { field: string; entity: CollectionKey; label: string; candidate?: (r: Rec) => boolean };
  /** Values pre-filled when "Add" is used from this list. */
  defaults?: Record<string, string>;
  hideStats?: boolean;
};

export type View =
  | TableView
  | { type: "form"; entity: CollectionKey; mode: "new" | "edit" }
  | { type: "detail"; entity: CollectionKey }
  | { type: "documents"; ownerType?: string }
  | { type: "invoice"; mode: "invoice" | "print" }
  | { type: "booking-confirmation" }
  | { type: "bill-generation" }
  | { type: "cashbook" }
  | { type: "receivables" }
  | { type: "map"; mode: "trips" | "vehicles" | "geofences" }
  | { type: "notifications"; category?: string }
  | { type: "settings"; section: string }
  | { type: "subscription"; mode: "plans" | "current" | "change" | "qr" };

/**
 * Screens that only ever showed data for one record (one vehicle's insurance, one customer's
 * payments…). That data now lives in a section of the record's detail page, so these screens are
 * not module tabs any more; old links land on the list, or on the record when `?id=` is given.
 */
export const ITEM_SCREENS: Record<string, { entity: CollectionKey; section?: string }> = {
  "016-vehicle-documents": { entity: "vehicles", section: "documents" },
  "017-registration-management": { entity: "vehicles", section: "registration" },
  "018-insurance-management": { entity: "vehicles", section: "insurance" },
  "019-fitness-certificate-management": { entity: "vehicles", section: "fitness" },
  "020-tax-token-management": { entity: "vehicles", section: "tax-token" },
  "021-vehicle-status-management": { entity: "vehicles" },
  "026-driver-documents": { entity: "drivers", section: "documents" },
  "027-driver-salary-and-payments": { entity: "drivers", section: "payments" },
  "035-vehicle-assignment": { entity: "trips" },
  "036-driver-assignment": { entity: "trips" },
  "038-trip-income": { entity: "trips", section: "income" },
  "039-trip-expenses": { entity: "trips", section: "expenses" },
  "040-trip-settlement": { entity: "trips", section: "settlement" },
  "047-booking-status-management": { entity: "bookings" },
  "048-booking-history": { entity: "bookings" },
  "053-customer-trip-history": { entity: "customers", section: "trips" },
  "054-customer-payment-history": { entity: "customers", section: "payments" },
  "061-route-history": { entity: "routes", section: "trips" },
  "072-maintenance-history": { entity: "vehicles", section: "maintenance" },
  "090-invoice-payment-status": { entity: "invoices", section: "payments-received" },
  "098-payment-history": { entity: "payments" },
};

/** Assigning a vehicle or driver to a trip, offered on the trip detail page. */
export const TRIP_ASSIGN: Record<"vehicle" | "driver", TableView> = {
  vehicle: { type: "table", entity: "trips", assign: { field: "vehicleId", entity: "vehicles", label: "Assign vehicle", candidate: (v) => ["Available", "Assigned"].includes(String(v.status)) } },
  driver: { type: "table", entity: "trips", assign: { field: "driverId", entity: "drivers", label: "Assign driver", candidate: (d) => d.status === "Available" } },
};
export const ASSIGNABLE_TRIP_STATUSES = ["Draft", "Planned", "Approved"];

export const VIEWS: Record<string, View> = {
  "005-company-setup": { type: "settings", section: "company" },

  "012-vehicle-list": { type: "table", entity: "vehicles" },
  "013-add-vehicle": { type: "form", entity: "vehicles", mode: "new" },
  "014-edit-vehicle": { type: "form", entity: "vehicles", mode: "edit" },
  "015-vehicle-details": { type: "detail", entity: "vehicles" },

  "022-driver-list": { type: "table", entity: "drivers" },
  "023-add-driver": { type: "form", entity: "drivers", mode: "new" },
  "024-edit-driver": { type: "form", entity: "drivers", mode: "edit" },
  "025-driver-details": { type: "detail", entity: "drivers" },
  "029-staff-management": { type: "table", entity: "staff" },

  "031-trip-list": { type: "table", entity: "trips" },
  "032-create-trip": { type: "form", entity: "trips", mode: "new" },
  "033-edit-trip": { type: "form", entity: "trips", mode: "edit" },
  "034-trip-details": { type: "detail", entity: "trips" },


  "037-trip-status-and-tracking": { type: "map", mode: "trips" },

  "042-booking-list": { type: "table", entity: "bookings" },
  "043-create-booking": { type: "form", entity: "bookings", mode: "new" },
  "044-booking-details": { type: "detail", entity: "bookings" },
  "045-edit-booking": { type: "form", entity: "bookings", mode: "edit" },
  "046-booking-confirmation": { type: "booking-confirmation" },

  "049-customer-list": { type: "table", entity: "customers" },
  "050-add-customer": { type: "form", entity: "customers", mode: "new" },
  "051-edit-customer": { type: "form", entity: "customers", mode: "edit" },
  "052-customer-details": { type: "detail", entity: "customers" },
  "055-customer-due-management": { type: "receivables" },

  "056-route-management": { type: "table", entity: "routes" },
  "057-create-route": { type: "form", entity: "routes", mode: "new" },
  "058-route-details": { type: "detail", entity: "routes" },
  "059-vehicle-tracking": { type: "map", mode: "vehicles" },
  "060-geofencing": { type: "map", mode: "geofences" },

  "062-fuel-records": { type: "table", entity: "fuel" },
  "063-add-fuel-entry": { type: "form", entity: "fuel", mode: "new" },

  "069-maintenance-list": { type: "table", entity: "maintenance" },
  "070-add-maintenance-request": { type: "form", entity: "maintenance", mode: "new" },
  "073-repair-and-service-records": { type: "table", entity: "maintenance", filter: (r) => r.kind === "Repair", columns: ["code", "vehicleId", "serviceType", "workshop", "partsCost", "labourCost", "cost", "status"], defaults: { kind: "Repair" } },

  "076-add-income": { type: "form", entity: "incomes", mode: "new" },
  "077-income-list": { type: "table", entity: "incomes" },
  "079-add-expense": { type: "form", entity: "expenses", mode: "new" },
  "080-expense-list": { type: "table", entity: "expenses" },
  "081-expense-categories": { type: "table", entity: "expenseCategories" },
  "082-cashbook": { type: "cashbook" },

  "084-invoice-list": { type: "table", entity: "invoices" },
  "085-create-invoice": { type: "form", entity: "invoices", mode: "new" },
  "086-invoice-details": { type: "invoice", mode: "invoice" },
  "087-bill-generation": { type: "bill-generation" },
  "088-challan-management": { type: "table", entity: "challans" },
  "089-pdf-preview-and-print": { type: "invoice", mode: "print" },

  "092-payment-records": { type: "table", entity: "payments" },
  "093-receive-payment": { type: "form", entity: "payments", mode: "new" },
  "094-payment-methods": { type: "table", entity: "paymentMethods", hideStats: true },
  "095-customer-receivables": { type: "receivables" },
  "096-supplier-payables": { type: "table", entity: "supplierBills" },
  "097-driver-advances": { type: "table", entity: "driverAdvances" },

  "109-document-library": { type: "documents" },
  "110-vehicle-documents": { type: "documents", ownerType: "Vehicle" },
  "111-driver-documents": { type: "documents", ownerType: "Driver" },
  "112-financial-documents": { type: "documents", ownerType: "Finance" },
  "113-document-expiry-tracking": { type: "table", entity: "documents", filter: (r) => !!r.expiryDate, tabs: ["Expired", "Expiring Soon", "Valid"], columns: ["name", "docType", "ownerType", "expiryDate", "responsible", "status"] },

  "114-subscription-plans": { type: "subscription", mode: "plans" },
  "115-current-subscription": { type: "subscription", mode: "current" },
  "116-upgrade-and-downgrade-plan": { type: "subscription", mode: "change" },
  "117-bangla-qr-payment": { type: "subscription", mode: "qr" },
  "118-subscription-payment-history": { type: "table", entity: "subscriptionPayments" },

  "119-user-list": { type: "table", entity: "users" },
  "120-add-user": { type: "form", entity: "users", mode: "new" },
  "121-edit-user": { type: "form", entity: "users", mode: "edit" },
  "124-user-activity-logs": { type: "table", entity: "auditLogs", hideStats: true },

  "125-notification-center": { type: "notifications" },
  "126-trip-notifications": { type: "notifications", category: "Trip" },
  "127-payment-notifications": { type: "notifications", category: "Payment" },
  "128-maintenance-alerts": { type: "notifications", category: "Maintenance" },
  "129-notification-settings": { type: "settings", section: "notifications" },

  "130-company-profile": { type: "settings", section: "company" },
  "132-change-password": { type: "settings", section: "password" },
  "133-general-settings": { type: "settings", section: "general" },
  "134-system-preferences": { type: "settings", section: "preferences" },
  "135-appearance-settings": { type: "settings", section: "appearance" },
  "136-email-and-sms-settings": { type: "settings", section: "gateway" },
  "138-security-settings": { type: "settings", section: "security" },
  "139-two-factor-authentication": { type: "settings", section: "twofactor" },
  "140-audit-logs": { type: "table", entity: "auditLogs", hideStats: true },
  "143-session-management": { type: "settings", section: "sessions" },
  "144-login-security": { type: "settings", section: "login" },
};

export const getView = (slug: string): View | undefined => VIEWS[slug];

/**
 * Screens that act on a single record (add / edit / details and per-record printouts). They are
 * opened from a list row or a record page, so they never appear as tabs or in prev / next links.
 */
export function isRecordScreen(slug: string): boolean {
  const v = VIEWS[slug];
  return !!ITEM_SCREENS[slug] || (!!v && ["form", "detail", "invoice", "booking-confirmation"].includes(v.type));
}

/**
 * The /records route that replaces an add / edit / details screen, or undefined for screens that
 * still render themselves. `params` are the screen's query string (`id`, form defaults).
 */
export function recordRouteFor(slug: string, params: Record<string, string>): string | undefined {
  const item = ITEM_SCREENS[slug];
  if (item) {
    if (params.id) return `/records/${item.entity}/${encodeURIComponent(params.id)}${item.section ? `?section=${item.section}` : ""}`;
    const list = listSlugFor(item.entity);
    return list ? `/screens/${list}` : "/";
  }
  const v = VIEWS[slug];
  if (!v || (v.type !== "form" && v.type !== "detail")) return undefined;
  if (v.type === "form" && v.mode === "new") {
    const qs = new URLSearchParams(params).toString();
    return `/records/${v.entity}/new${qs ? `?${qs}` : ""}`;
  }
  if (params.id) return `/records/${v.entity}/${encodeURIComponent(params.id)}${v.type === "form" ? "/edit" : ""}`;
  const list = listSlugFor(v.entity);
  return list ? `/screens/${list}` : "/";
}

/** Screen that lists an entity (used for "back to list" and breadcrumbs). */
export function listSlugFor(entity: CollectionKey): string | undefined {
  for (const [slug, v] of Object.entries(VIEWS)) if (v.type === "table" && v.entity === entity && !v.filter && !v.scopeBy) return slug;
  return undefined;
}

/**
 * Where "back" goes from a record: its list screen, or for records that only live inside a parent
 * (salary payments, settlements) the parent's section that lists them.
 */
export function backLinkFor(entity: CollectionKey, rec?: Rec): { href: string; label: string } | undefined {
  const list = listSlugFor(entity);
  if (list) return { href: `/screens/${list}`, label: `All ${ENTITIES[entity].label.toLowerCase()}` };
  if (!rec) return undefined;
  for (const [key, def] of Object.entries(ENTITIES) as [CollectionKey, (typeof ENTITIES)[CollectionKey]][]) {
    const rel = def.related?.find((r) => r.entity === entity && rec[r.field]);
    if (rel) return { href: `/records/${key}/${rec[rel.field]}?section=${relatedKey(rel)}`, label: `Back to ${def.singular.toLowerCase()}` };
  }
  return undefined;
}
