import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { StartSitScreen } from "@/components/startsit/StartSitScreen";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Start/Sit" };

export default function StartSitPage() {
  return (
    <>
      <SectionTabs section="/team" current="/start-sit" />
      <PageTitle sub="Who to start this week, how sure we are, and why">Start/Sit</PageTitle>
      {/* The screen reads ?ids= from the URL, which needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-96 rounded-[20px]" />}>
        <StartSitScreen />
      </Suspense>
    </>
  );
}
