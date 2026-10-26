import RecordPage from "@/components/records/RecordPage";

export default async function NewRecordPage({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { entity } = await params;
  const sp = await searchParams;
  const initial = Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  return <RecordPage entity={entity} mode="new" initial={initial} />;
}
