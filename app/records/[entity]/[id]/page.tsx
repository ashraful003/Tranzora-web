import RecordPage from "@/components/records/RecordPage";

export default async function RecordViewPage({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  return <RecordPage entity={entity} id={decodeURIComponent(id)} mode="view" />;
}
