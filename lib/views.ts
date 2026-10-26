import type { CollectionKey, Rec } from "./db/schema";

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

const DOC_TYPE = (t: string) => (r: Rec) => r.docType === t;

export const VIEWS: Record<string, View> = {
  "005-company-setup": { type: "settings", section: "company" },

  "012-vehicle-list": { type: "table", entity: "vehicles" },
  "013-add-vehicle": { type: "form", entity: "vehicles", mode: "new" },
  "014-edit-vehicle": { type: "form", entity: "vehicles", mode: "edit" },
  "015-vehicle-details": { type: "detail", entity: "vehicles" },
  "016-vehicle-documents": { type: "documents", ownerType: "Vehicle" },
  "017-registration-management": { type: "table", entity: "documents", filter: DOC_TYPE("Registration"), columns: ["name", "vehicleId", "number", "issueDate", "expiryDate", "status"], defaults: { docType: "Registration", ownerType: "Vehicle" } },
  "018-insurance-management": { type: "table", entity: "documents", filter: DOC_TYPE("Insurance"), columns: ["name", "vehicleId", "number", "issueDate", "expiryDate", "status"], defaults: { docType: "Insurance", ownerType: "Vehicle" } },
  "019-fitness-certificate-management": { type: "table", entity: "documents", filter: DOC_TYPE("Fitness"), columns: ["name", "vehicleId", "number", "issueDate", "expiryDate", "status"], defaults: { docType: "Fitness", ownerType: "Vehicle" } },
  "020-tax-token-management": { type: "table", entity: "documents", filter: DOC_TYPE("Tax Token"), columns: ["name", "vehicleId", "number", "issueDate", "expiryDate", "status"], defaults: { docType: "Tax Token", ownerType: "Vehicle" } },
  "021-vehicle-status-management": { type: "table", entity: "vehicles", columns: ["regNo", "type", "driverId", "branch", "odometer", "updatedAt", "status"] },

  "022-driver-list": { type: "table", entity: "drivers" },
  "023-add-driver": { type: "form", entity: "drivers", mode: "new" },
  "024-edit-driver": { type: "form", entity: "drivers", mode: "edit" },
  "025-driver-details": { type: "detail", entity: "drivers" },
  "026-driver-documents": { type: "documents", ownerType: "Driver" },
  "027-driver-salary-and-payments": { type: "table", entity: "driverPayments" },
  "029-staff-management": { type: "table", entity: "staff" },

  "031-trip-list": { type: "table", entity: "trips" },
  "032-create-trip": { type: "form", entity: "trips", mode: "new" },
  "033-edit-trip": { type: "form", entity: "trips", mode: "edit" },
  "034-trip-details": { type: "detail", entity: "trips" },
  "035-vehicle-assignment": {
    type: "table",
    entity: "trips",
    filter: (r) => ["Draft", "Planned", "Approved"].includes(String(r.status)),
    tabs: ["Draft", "Planned", "Approved"],
    columns: ["code", "routeId", "customerId", "startDate", "goods", "vehicleId", "status"],
    assign: { field: "vehicleId", entity: "vehicles", label: "Assign vehicle", candidate: (v) => ["Available", "Assigned"].includes(String(v.status)) },
  },
  "036-driver-assignment": {
    type: "table",
    entity: "trips",
    filter: (r) => ["Draft", "Planned", "Approved"].includes(String(r.status)),
    tabs: ["Draft", "Planned", "Approved"],
    columns: ["code", "routeId", "startDate", "vehicleId", "driverId", "status"],
    assign: { field: "driverId", entity: "drivers", label: "Assign driver", candidate: (d) => d.status === "Available" },
  },
  "037-trip-status-and-tracking": { type: "map", mode: "trips" },
  "038-trip-income": { type: "table", entity: "incomes", filter: (r) => !!r.tripId, columns: ["code", "date", "tripId", "customerId", "source", "amount", "status"], defaults: { source: "Trip Fare" } },
  "039-trip-expenses": { type: "table", entity: "expenses", filter: (r) => !!r.tripId, columns: ["code", "date", "tripId", "categoryId", "description", "amount", "status"] },
  "040-trip-settlement": { type: "table", entity: "settlements" },

  "042-booking-list": { type: "table", entity: "bookings" },
  "043-create-booking": { type: "form", entity: "bookings", mode: "new" },
  "044-booking-details": { type: "detail", entity: "bookings" },
  "045-edit-booking": { type: "form", entity: "bookings", mode: "edit" },
  "046-booking-confirmation": { type: "booking-confirmation" },
  "047-booking-status-management": { type: "table", entity: "bookings", columns: ["code", "customerId", "pickupDate", "priority", "vehicleType", "updatedAt", "status"] },
  "048-booking-history": { type: "table", entity: "bookings", filter: (r) => ["Completed", "Cancelled"].includes(String(r.status)), tabs: ["Completed", "Cancelled"] },

  "049-customer-list": { type: "table", entity: "customers" },
  "050-add-customer": { type: "form", entity: "customers", mode: "new" },
  "051-edit-customer": { type: "form", entity: "customers", mode: "edit" },
  "052-customer-details": { type: "detail", entity: "customers" },
  "053-customer-trip-history": { type: "table", entity: "trips", scopeBy: { field: "customerId", entity: "customers", label: "Customer" }, columns: ["code", "customerId", "routeId", "startDate", "goods", "fare", "status"] },
  "054-customer-payment-history": { type: "table", entity: "payments", scopeBy: { field: "customerId", entity: "customers", label: "Customer" } },
  "055-customer-due-management": { type: "receivables" },

  "056-route-management": { type: "table", entity: "routes" },
  "057-create-route": { type: "form", entity: "routes", mode: "new" },
  "058-route-details": { type: "detail", entity: "routes" },
  "059-vehicle-tracking": { type: "map", mode: "vehicles" },
  "060-geofencing": { type: "map", mode: "geofences" },
  "061-route-history": { type: "table", entity: "trips", filter: (r) => r.status === "Completed", tabs: [], scopeBy: { field: "routeId", entity: "routes", label: "Route" }, columns: ["code", "routeId", "vehicleId", "driverId", "startDate", "endDate", "distanceKm", "status"] },

  "062-fuel-records": { type: "table", entity: "fuel" },
  "063-add-fuel-entry": { type: "form", entity: "fuel", mode: "new" },

  "069-maintenance-list": { type: "table", entity: "maintenance" },
  "070-add-maintenance-request": { type: "form", entity: "maintenance", mode: "new" },
  "072-maintenance-history": { type: "table", entity: "maintenance", filter: (r) => r.status === "Completed", tabs: [], scopeBy: { field: "vehicleId", entity: "vehicles", label: "Vehicle" }, columns: ["code", "vehicleId", "serviceType", "completedDate", "workshop", "odometer", "cost", "status"] },
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
  "090-invoice-payment-status": { type: "table", entity: "invoices", columns: ["code", "customerId", "dueDate", "total", "paid", "status"], tabs: ["Sent", "Partially Paid", "Overdue", "Paid"] },

  "092-payment-records": { type: "table", entity: "payments" },
  "093-receive-payment": { type: "form", entity: "payments", mode: "new" },
  "094-payment-methods": { type: "table", entity: "paymentMethods", hideStats: true },
  "095-customer-receivables": { type: "receivables" },
  "096-supplier-payables": { type: "table", entity: "supplierBills" },
  "097-driver-advances": { type: "table", entity: "driverAdvances" },
  "098-payment-history": { type: "table", entity: "payments", filter: (r) => r.status === "Cleared", tabs: [] },

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

/** Screen that lists an entity (used for "back to list" and breadcrumbs). */
export function listSlugFor(entity: CollectionKey): string | undefined {
  for (const [slug, v] of Object.entries(VIEWS)) if (v.type === "table" && v.entity === entity && !v.filter && !v.scopeBy) return slug;
  return undefined;
}
