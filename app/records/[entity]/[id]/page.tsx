import RecordPage from "@/components/records/RecordPage";

export default async function RecordViewPage({ params, searchParams }: { params: Promise<{ entity: string; id: string }>; searchParams: Promise<{ section?: string | string[] }> }) {
  const { entity, id } = await params;
  const { section } = await searchParams;
  return <RecordPage entity={entity} id={decodeURIComponent(id)} mode="view" section={typeof section === "string" ? section : undefined} />;
}
