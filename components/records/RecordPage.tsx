"use client";

import { ENTITIES, entityKeys, type CollectionKey } from "@/lib/db/schema";
import { getRecord, recordLabel, useDb } from "@/lib/db/store";
import { listSlugFor } from "@/lib/views";
import Shell from "../Shell";
import { EmptyState } from "../ui";
import RecordDetail from "./RecordDetail";
import RecordForm from "./RecordForm";

/** Stand-alone record pages: /records/[entity]/new, /records/[entity]/[id] and …/[id]/edit. */
export default function RecordPage({ entity, id, mode, initial }: { entity: string; id?: string; mode: "view" | "edit" | "new"; initial?: Record<string, string> }) {
  const db = useDb();
  if (!entityKeys.includes(entity as CollectionKey))
    return (
      <Shell moduleId={2} title="Not found" hidePeriod>
        <EmptyState title="Unknown record type" text={`“${entity}” is not part of this workspace.`} />
      </Shell>
    );
  const key = entity as CollectionKey;
  const def = ENTITIES[key];
  const rec = db && id ? getRecord(key, id) : undefined;
  const listSlug = listSlugFor(key);
  const name = rec ? recordLabel(key, rec) : id ?? "";
  const crumbs = [
    { label: def.label, href: listSlug ? `/screens/${listSlug}` : undefined },
    ...(mode === "new" ? [{ label: `New ${def.singular.toLowerCase()}` }] : mode === "edit" ? [{ label: name, href: `/records/${key}/${id}` }, { label: "Edit" }] : [{ label: name }]),
  ];
  const title = mode === "new" ? `New ${def.singular.toLowerCase()}` : mode === "edit" ? `Edit ${def.singular.toLowerCase()}` : `${def.singular} details`;

  return (
    <Shell moduleId={def.moduleId} title={title} description={mode === "view" ? name : `${def.label} · ${mode === "new" ? "create a new record" : name}`} crumbs={crumbs} hidePeriod>
      {mode === "view" && id && <RecordDetail entity={key} id={id} />}
      {mode === "edit" && id && <RecordForm key={id} entity={key} id={id} cancelHref={`/records/${key}/${id}`} />}
      {mode === "new" && <RecordForm entity={key} initial={initial} />}
    </Shell>
  );
}
