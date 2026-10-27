"use client";

import { ENTITIES } from "@/lib/db/schema";
import { modules, type Screen } from "@/lib/screens";
import { getView, type View } from "@/lib/views";
import AuthScreen from "./AuthScreen";
import { BackupContent, DatabaseContent, PermissionsContent, ReportsCenter, RolesContent, SubscriptionContent } from "./content/Admin";
import Dashboard from "./content/Dashboard";
import Documents from "./content/Documents";
import { BillGeneration, BookingConfirmation, Cashbook, InvoiceView, Receivables } from "./content/Finance";
import { CalendarContent, MapContent, NotificationsContent } from "./content/Operations";
import SettingsContent, { ProfileContent } from "./content/Settings";
import RecordTable, { newHref } from "./records/RecordTable";
import Shell from "./Shell";
import { EmptyState } from "./ui";

// Add / edit / details screens redirect to /records/… (see app/screens/[slug]/page.tsx).
function Content({ screen, view }: { screen: Screen; view?: View }) {
  if (view) {
    switch (view.type) {
      case "table":
        return <RecordTable view={view} title={screen.title} />;
      case "documents":
        return <Documents ownerType={view.ownerType} title={screen.title} />;
      case "invoice":
        return <InvoiceView mode={view.mode} />;
      case "booking-confirmation":
        return <BookingConfirmation />;
      case "bill-generation":
        return <BillGeneration />;
      case "cashbook":
        return <Cashbook />;
      case "receivables":
        return <Receivables />;
      case "map":
        return <MapContent mode={view.mode} />;
      case "notifications":
        return <NotificationsContent category={view.category} />;
      case "settings":
        return <SettingsContent section={view.section} />;
      case "subscription":
        return <SubscriptionContent mode={view.mode} />;
    }
  }
  switch (screen.kind) {
    case "overview":
      return <Dashboard slug={screen.slug} kind="overview" />;
    case "analytics":
      return <Dashboard slug={screen.slug} kind="analytics" />;
    case "calendar":
      return <CalendarContent />;
    case "profile":
      return <ProfileContent />;
    case "reports-center":
      return <ReportsCenter slug={screen.slug} />;
    case "backup":
      return <BackupContent />;
    case "database":
      return <DatabaseContent />;
    case "permissions":
      return screen.code === "17.4" ? <RolesContent /> : <PermissionsContent />;
    default:
      return <EmptyState title="This screen has no content yet" />;
  }
}

/** Primary "Add" button for a screen: the entity it lists, or the module's create form. */
function addAction(screen: Screen, view?: View): { href: string; label: string } | undefined {
  if (view?.type === "table") {
    if (["auditLogs", "reports", "subscriptionPayments"].includes(view.entity)) return undefined;
    return { href: newHref(view.entity, view.defaults), label: `Add ${ENTITIES[view.entity].singular.toLowerCase()}` };
  }
  if (view?.type === "documents") return undefined;
  if (view && ["form", "settings", "subscription", "invoice", "bill-generation", "notifications"].includes(view.type)) return undefined;
  if (["profile", "backup", "database", "permissions", "reports-center"].includes(screen.kind)) return undefined;
  const mod = modules.find((m) => m.id === screen.moduleId);
  const form = mod?.subModules.find((s) => s.kind === "form");
  if (!form) return screen.moduleId === 2 ? { href: newHref("trips"), label: "New trip" } : undefined;
  const formView = getView(form.slug);
  return { href: formView?.type === "form" ? newHref(formView.entity) : `/screens/${form.slug}`, label: form.title };
}

export default function AppScreen({ screen, onLoginSuccess }: { screen: Screen; onLoginSuccess?: () => void; onLogout?: () => void }) {
  if (screen.kind === "auth") return <AuthScreen screen={screen} onLoginSuccess={onLoginSuccess} />;
  const view = getView(screen.slug);
  const add = addAction(screen, view);
  const showPeriod = view ? ["table", "cashbook"].includes(view.type) : ["overview", "analytics", "reports-center"].includes(screen.kind);
  return (
    <Shell screen={screen} moduleId={screen.moduleId} title={screen.title} code={screen.code} description={screen.description} addHref={add?.href} addLabel={add?.label} hidePeriod={!showPeriod}>
      <Content screen={screen} view={view} />
    </Shell>
  );
}
