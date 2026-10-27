import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import AppScreen from "@/components/AppScreen";
import { Loading } from "@/components/ui";
import { getScreen, screens } from "@/lib/screens";
import { recordRouteFor } from "@/lib/views";

export function generateStaticParams() {
  return screens.map((screen) => ({ slug: screen.slug }));
}

export default async function ScreenPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const screen = getScreen(slug);
  if (!screen) notFound();
  // Add / edit / details live on the record pages, reached from a list row.
  const sp = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const target = recordRouteFor(slug, sp);
  if (target) redirect(target);
  return (
    <Suspense fallback={<Loading />}>
      <AppScreen screen={screen} />
    </Suspense>
  );
}
