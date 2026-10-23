import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { TeamDashboard } from "@/components/team/TeamDashboard";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Lineup" };

export default function LineupPage() {
  return (
    <>
      <SectionTabs section="/team" current="/team" />
      <PageTitle sub="Live points for this week, play by play">Lineup</PageTitle>
      {/* The lineup reads ?week= from the URL, which needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-72 rounded-[20px]" />}>
        <TeamDashboard />
      </Suspense>
    </>
  );
}
