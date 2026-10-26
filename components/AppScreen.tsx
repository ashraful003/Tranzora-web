"use client";

import { useSearchParams } from "next/navigation";
import { ENTITIES, type CollectionKey } from "@/lib/db/schema";
import { modules, type Screen } from "@/lib/screens";
import { getView, type View } from "@/lib/views";
import AuthScreen from "./AuthScreen";
import { BackupContent, DatabaseContent, PermissionsContent, ReportsCenter, RolesContent, SubscriptionContent } from "./content/Admin";
import Dashboard from "./content/Dashboard";
import Documents from "./content/Documents";
import { BillGeneration, BookingConfirmation, Cashbook, InvoiceView, Receivables } from "./content/Finance";
import { CalendarContent, MapContent, NotificationsContent } from "./content/Operations";
import SettingsContent, { ProfileContent } from "./content/Settings";
import RecordDetail from "./records/RecordDetail";
import RecordForm from "./records/RecordForm";
import RecordPicker, { usePickedId } from "./records/RecordPicker";
import RecordTable, { newHref } from "./records/RecordTable";
import Shell from "./Shell";
import { EmptyState } from "./ui";

function SingleRecord({ entity, mode }: { entity: CollectionKey; mode: "detail" | "edit" }) {
  const id = usePickedId(entity);
  if (!id) return <EmptyState title={`No ${ENTITIES[entity].label.toLowerCase()} yet`} text="Create one first." />;
  return (
    <>
      <div className="rx-picker-bar">
        <RecordPicker entity={entity} value={id} label={mode === "edit" ? `${ENTITIES[entity].singular} to edit` : `Showing ${ENTITIES[entity].singular.toLowerCase()}`} />
      </div>
      {mode === "edit" ? <RecordForm key={id} entity={entity} id={id} onDone={() => undefined} /> : <RecordDetail key={id} entity={entity} id={id} compact />}
    </>
  );
}

function NewRecord({ entity }: { entity: CollectionKey }) {
  const sp = useSearchParams();
  const initial = Object.fromEntries([...sp.entries()]);
  return <RecordForm entity={entity} initial={initial} />;
}

function Content({ screen, view }: { screen: Screen; view?: View }) {
  if (view) {
    switch (view.type) {
      case "table":
        return <RecordTable view={view} title={screen.title} />;
      case "form":
        return view.mode === "new" ? <NewRecord entity={view.entity} /> : <SingleRecord entity={view.entity} mode="edit" />;
      case "detail":
        return <SingleRecord entity={view.entity} mode="detail" />;
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
  if (view?.type === "detail") return { href: newHref(view.entity), label: `New ${ENTITIES[view.entity].singular.toLowerCase()}` };
  if (view?.type === "documents") return undefined;
  if (view && ["form", "settings", "subscription", "invoice", "bill-generation", "notifications"].includes(view.type)) return undefined;
  if (["profile", "backup", "database", "permissions", "reports-center"].includes(screen.kind)) return undefined;
  const mod = modules.find((m) => m.id === screen.moduleId);
  const form = mod?.subModules.find((s) => s.kind === "form");
  return form ? { href: `/screens/${form.slug}`, label: form.title } : screen.moduleId === 2 ? { href: newHref("trips"), label: "New trip" } : undefined;
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
