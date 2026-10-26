"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ENTITIES, type CollectionKey, type Rec } from "@/lib/db/schema";
import { recordLabel, useDb } from "@/lib/db/store";

/** Selected record for screens that show one record (details, edit, print): `?id=` or the first one. */
export function usePickedId(entity: CollectionKey, param = "id", filter?: (r: Rec) => boolean) {
  const db = useDb();
  const sp = useSearchParams();
  const wanted = sp.get(param);
  const rows = db ? db.collections[entity].filter((r) => !filter || filter(r)) : [];
  return rows.find((r) => r.id === wanted)?.id ?? rows[0]?.id;
}

export default function RecordPicker({ entity, value, param = "id", label, filter }: { entity: CollectionKey; value?: string; param?: string; label?: string; filter?: (r: Rec) => boolean }) {
  const db = useDb();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  if (!db) return null;
  const rows = db.collections[entity].filter((r) => !filter || filter(r));
  return (
    <label className="rx-picker">
      <span>{label ?? `Select ${ENTITIES[entity].singular.toLowerCase()}`}</span>
      <select
        value={value ?? ""}
        onChange={(e) => {
          const next = new URLSearchParams(sp.toString());
          next.set(param, e.target.value);
          router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        }}
      >
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {recordLabel(entity, r)}
            {ENTITIES[entity].statusField ? ` — ${r[ENTITIES[entity].statusField!]}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
