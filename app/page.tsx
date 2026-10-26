"use client";

import { Suspense, useEffect, useState } from "react";
import AppScreen from "@/components/AppScreen";
import { Loading } from "@/components/ui";
import { isLoggedIn } from "@/lib/db/store";
import { screens } from "@/lib/screens";

export default function Home() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => setLoggedIn(isLoggedIn()), []);

  if (loggedIn === null) return <Loading label="Loading Tranzora…" />;

  const screen = loggedIn ? screens.find((s) => s.code === "2.1")! : screens.find((s) => s.code === "1.1")!;
  return (
    <Suspense fallback={<Loading />}>
      <AppScreen screen={screen} onLoginSuccess={() => setLoggedIn(true)} />
    </Suspense>
  );
}
