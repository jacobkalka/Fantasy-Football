import type { Metadata } from "next";
import { Suspense } from "react";
import { RankingsScreen } from "@/components/players/RankingsScreen";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Rankings" };

export default function RankingsPage() {
  return (
    <>
      <SectionTabs section="/team" current="/players" />
      <PageTitle sub="Season fantasy rankings in your team's scoring. Tap a player for the full profile.">Rankings</PageTitle>
      {/* Filters and sort live in the URL, which needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-96 rounded-[22px]" />}>
        <RankingsScreen />
      </Suspense>
    </>
  );
}
