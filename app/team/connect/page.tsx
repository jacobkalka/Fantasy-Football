import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { ConnectLeague } from "@/components/teams/ConnectLeague";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Connect an ESPN league" };

export default function ConnectPage() {
  return (
    <>
      <SectionTabs section="/team" current="/team" />
      <PageTitle sub="Bring in your real league: roster, scoring, matchup, standings">Connect an ESPN league</PageTitle>
      <Suspense fallback={<Skeleton className="h-60 rounded-[22px]" />}>
        <ConnectLeague />
      </Suspense>
    </>
  );
}
